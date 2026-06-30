package sandbox

import (
	"bufio"
	"fmt"
	"net"
	"strconv"
	"sync"
	"time"
)

// redisConn is a tiny, dependency-free Redis client speaking just enough RESP for
// the sandbox's cache-aside path (PING/GET/SET). It is intentionally minimal — we
// don't pull in a full client for three commands. Calls are serialized by a mutex
// because a single connection's request/reply framing isn't concurrency-safe.
type redisConn struct {
	mu   sync.Mutex
	conn net.Conn
	r    *bufio.Reader
}

func dialRedis(addr string, timeout time.Duration) (*redisConn, error) {
	c, err := net.DialTimeout("tcp", addr, timeout)
	if err != nil {
		return nil, err
	}
	return &redisConn{conn: c, r: bufio.NewReader(c)}, nil
}

func (rc *redisConn) close() {
	if rc != nil && rc.conn != nil {
		_ = rc.conn.Close()
	}
}

// command writes a RESP array of bulk strings and reads one reply line/value.
func (rc *redisConn) command(args ...string) (string, error) {
	rc.mu.Lock()
	defer rc.mu.Unlock()

	var b []byte
	b = append(b, '*')
	b = append(b, strconv.Itoa(len(args))...)
	b = append(b, '\r', '\n')
	for _, a := range args {
		b = append(b, '$')
		b = append(b, strconv.Itoa(len(a))...)
		b = append(b, '\r', '\n')
		b = append(b, a...)
		b = append(b, '\r', '\n')
	}
	rc.conn.SetDeadline(time.Now().Add(3 * time.Second))
	if _, err := rc.conn.Write(b); err != nil {
		return "", err
	}
	return rc.readReply()
}

// readReply parses a single RESP reply: simple string (+), error (-), integer (:),
// or bulk string ($). Returns the value (empty for nil bulk).
func (rc *redisConn) readReply() (string, error) {
	line, err := rc.r.ReadString('\n')
	if err != nil {
		return "", err
	}
	if len(line) < 1 {
		return "", fmt.Errorf("empty redis reply")
	}
	body := line[1 : len(line)-2] // strip prefix byte + trailing \r\n
	switch line[0] {
	case '+', ':':
		return body, nil
	case '-':
		return "", fmt.Errorf("redis error: %s", body)
	case '$':
		n, _ := strconv.Atoi(body)
		if n < 0 {
			return "", nil // nil bulk → cache miss
		}
		buf := make([]byte, n+2) // value + \r\n
		for read := 0; read < len(buf); {
			m, err := rc.r.Read(buf[read:])
			if err != nil {
				return "", err
			}
			read += m
		}
		return string(buf[:n]), nil
	default:
		return "", fmt.Errorf("unexpected redis reply type %q", line[0])
	}
}

func (rc *redisConn) ping() error {
	_, err := rc.command("PING")
	return err
}

func (rc *redisConn) get(key string) (string, error) { return rc.command("GET", key) }

func (rc *redisConn) set(key, val string) error {
	_, err := rc.command("SET", key, val)
	return err
}

// redisPool is a fixed-size pool of connections so concurrent load doesn't all
// serialize on one socket (which would make Redis an artificial bottleneck).
type redisPool struct {
	conns chan *redisConn
}

// dialRedisPool opens `size` connections to addr, verifying the first with PING.
func dialRedisPool(addr string, size int, timeout time.Duration) (*redisPool, error) {
	if size < 1 {
		size = 1
	}
	p := &redisPool{conns: make(chan *redisConn, size)}
	for i := 0; i < size; i++ {
		c, err := dialRedis(addr, timeout)
		if err != nil {
			p.close()
			return nil, err
		}
		if i == 0 {
			if err := c.ping(); err != nil {
				c.close()
				p.close()
				return nil, err
			}
		}
		p.conns <- c
	}
	return p, nil
}

// withConn borrows a connection, runs fn, and returns it to the pool.
func (p *redisPool) withConn(fn func(*redisConn) error) error {
	c := <-p.conns
	defer func() { p.conns <- c }()
	return fn(c)
}

func (p *redisPool) close() {
	if p == nil {
		return
	}
	for {
		select {
		case c := <-p.conns:
			c.close()
		default:
			return
		}
	}
}
