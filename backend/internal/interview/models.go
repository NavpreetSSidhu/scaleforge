package interview

import "github.com/scaleforge/scaleforge/internal/simulation"

// Topic is one curated system-design interview prompt. The bank is static so
// Start is deterministic and needs no LLM call.
type Topic struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Prompt      string   `json:"prompt"`
	Constraints []string `json:"constraints"`
}

// Message is one turn of the interview conversation. Role is "user" (candidate)
// or "interviewer". The client holds the transcript and replays it each turn, so
// sessions are stateless server-side (no persistence needed).
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// StartRequest asks for an interview prompt. Topic is optional; empty picks one.
type StartRequest struct {
	Topic string `json:"topic,omitempty"`
}

// StartResponse is the chosen topic + opening prompt and a client-side session id.
type StartResponse struct {
	SessionID string `json:"sessionId"`
	Topic     Topic  `json:"topic"`
}

// TurnRequest is one exchange: the candidate's message plus the live design they
// are building, so the interviewer's follow-ups reference the actual graph.
type TurnRequest struct {
	SessionID string                    `json:"sessionId"`
	Topic     Topic                     `json:"topic"`
	Graph     simulation.Graph          `json:"graph"`
	Traffic   simulation.TrafficProfile `json:"traffic"`
	Result    *simulation.Result        `json:"result,omitempty"`
	History   []Message                 `json:"history,omitempty"`
	Message   string                    `json:"message" binding:"required,max=2000"`
}

// TurnResponse is the interviewer's reply plus optional suggested follow-up
// directions and a done flag once they're satisfied the design is complete.
type TurnResponse struct {
	Reply     string   `json:"reply"`
	FollowUps []string `json:"followUps"`
	Done      bool     `json:"done"`
}

// GradeRequest asks for a final assessment of the candidate's design.
type GradeRequest struct {
	SessionID string                    `json:"sessionId"`
	Topic     Topic                     `json:"topic"`
	Graph     simulation.Graph          `json:"graph"`
	Traffic   simulation.TrafficProfile `json:"traffic"`
	Result    *simulation.Result        `json:"result,omitempty"`
	History   []Message                 `json:"history,omitempty"`
}

// RubricScore is one dimension of the assessment, scored 0–5 with a comment.
type RubricScore struct {
	Dimension string `json:"dimension"`
	Score     int    `json:"score"`
	Comment   string `json:"comment"`
}

// GradeResponse is the final assessment: per-dimension rubric, an overall 0–100,
// and a short narrative summary.
type GradeResponse struct {
	Summary string        `json:"summary"`
	Overall int           `json:"overall"`
	Rubric  []RubricScore `json:"rubric"`
}
