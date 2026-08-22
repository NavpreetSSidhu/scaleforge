package http

import (
	"encoding/json"
	"net/http"
	"net/url"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/scaleforge/scaleforge/internal/lab"
	"github.com/scaleforge/scaleforge/internal/middleware"
)

// LabHandler exposes ScaleForge Labs: real containerised infrastructure you drive
// from a browser terminal, with objectives verified against live state.
//
// Starting a lab pulls images and holds real memory, so it is gated behind
// LABS_ENABLED and rate-limited well below the other endpoints.
type LabHandler struct {
	manager  *lab.Manager
	limiter  *middleware.IPRateLimiter
	upgrader websocket.Upgrader
}

func NewLabHandler(manager *lab.Manager, allowedOrigin string) *LabHandler {
	return &LabHandler{
		manager: manager,
		limiter: middleware.NewIPRateLimiter(10, time.Minute),
		upgrader: websocket.Upgrader{
			ReadBufferSize:  4096,
			WriteBufferSize: 4096,
			CheckOrigin: func(r *http.Request) bool {
				origin := r.Header.Get("Origin")
				// No Origin means a non-browser client (or a same-origin request
				// through a proxy that stripped it). Otherwise accept the
				// configured frontend origin, plus any loopback origin — labs are
				// a local-first feature and the dev server's port varies.
				if origin == "" || origin == allowedOrigin {
					return true
				}
				u, err := url.Parse(origin)
				if err != nil {
					return false
				}
				host := u.Hostname()
				return host == "localhost" || host == "127.0.0.1" || host == "::1"
			},
		},
	}
}

// Status reports whether labs are enabled and whether Docker is actually
// reachable, plus the lab catalog, so the client can render the right empty state.
func (h *LabHandler) Status(c *gin.Context) {
	enabled := h.manager.Enabled()
	c.JSON(http.StatusOK, gin.H{
		"enabled": enabled,
		"docker":  h.manager.DockerReady(c.Request.Context()),
		"labs":    h.manager.Catalog().List(),
	})
}

// ListSessions returns every lab session known to this process.
func (h *LabHandler) ListSessions(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"sessions": h.manager.List()})
}

type startLabRequest struct {
	LabID string `json:"labId" binding:"required"`
}

// StartSession provisions a lab and returns immediately; the environment comes up
// in the background and the client polls GetSession until it reports ready.
func (h *LabHandler) StartSession(c *gin.Context) {
	if !h.manager.Enabled() {
		c.JSON(http.StatusServiceUnavailable, ErrorResponse{Error: "labs are not enabled"})
		return
	}
	if !h.limiter.Allow(c.ClientIP()) {
		c.JSON(http.StatusTooManyRequests, ErrorResponse{Error: "rate limit reached — please wait a moment"})
		return
	}

	var req startLabRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}

	session, err := h.manager.Start(c.Request.Context(), req.LabID)
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, ErrorResponse{Error: err.Error()})
		return
	}
	c.JSON(http.StatusAccepted, session)
}

// GetSession returns the current state of one session.
func (h *LabHandler) GetSession(c *gin.Context) {
	session, ok := h.manager.Get(c.Param("id"))
	if !ok {
		c.JSON(http.StatusNotFound, ErrorResponse{Error: "no such lab session"})
		return
	}
	c.JSON(http.StatusOK, session)
}

// StopSession tears the environment down.
func (h *LabHandler) StopSession(c *gin.Context) {
	if err := h.manager.Stop(c.Param("id")); err != nil {
		c.JSON(http.StatusNotFound, ErrorResponse{Error: err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"stopped": true})
}

// Verify runs every objective's check against the live environment.
func (h *LabHandler) Verify(c *gin.Context) {
	result, err := h.manager.Verify(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, ErrorResponse{Error: err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// Hint reveals one task's hint on demand.
func (h *LabHandler) Hint(c *gin.Context) {
	hint, err := h.manager.Hint(c.Param("id"), c.Query("task"))
	if err != nil {
		c.JSON(http.StatusNotFound, ErrorResponse{Error: err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"hint": hint})
}

// terminalControl is a client control frame, sent as a text message. Keystrokes
// travel as binary frames, which keeps the two unambiguous without framing bytes.
type terminalControl struct {
	Type string `json:"type"`
	Cols uint16 `json:"cols"`
	Rows uint16 `json:"rows"`
}

// Terminal upgrades to a WebSocket and bridges it to a real shell inside the
// lab's workstation container.
func (h *LabHandler) Terminal(c *gin.Context) {
	term, err := h.manager.Attach(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, ErrorResponse{Error: err.Error()})
		return
	}

	conn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		term.Close()
		return // Upgrade already wrote an error response
	}

	defer conn.Close()
	defer term.Close()

	// Shell output → browser. When the shell exits, this goroutine closes the
	// connection, which in turn unblocks the read loop below.
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := term.Read(buf)
			if n > 0 {
				if werr := conn.WriteMessage(websocket.BinaryMessage, buf[:n]); werr != nil {
					break
				}
			}
			if err != nil {
				break
			}
		}
		_ = conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"exit"}`))
		_ = conn.Close()
	}()

	// Browser → shell.
	for {
		msgType, data, err := conn.ReadMessage()
		if err != nil {
			return
		}
		switch msgType {
		case websocket.BinaryMessage:
			if _, err := term.Write(data); err != nil {
				return
			}
		case websocket.TextMessage:
			var ctrl terminalControl
			if json.Unmarshal(data, &ctrl) == nil && ctrl.Type == "resize" {
				_ = term.Resize(ctrl.Cols, ctrl.Rows)
			}
		}
	}
}
