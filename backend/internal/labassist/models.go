// Package labassist is the AI helper that sits beside a running lab. It does two
// things: explain what is going on, and propose the commands to get where the
// user wants to be.
//
// It never runs anything itself. Commands come back as proposals the user
// accepts in the UI, and are executed through the lab manager's workstation exec
// — the same capability the lab terminal already gives them.
package labassist

// Command is one proposed shell command to run in the lab's workstation.
type Command struct {
	// Run is the command, exactly as it should be executed.
	Run string `json:"run"`
	// Explain is a short reason shown beside the command, so accepting it is an
	// informed choice rather than a leap of faith.
	Explain string `json:"explain,omitempty"`
}

// Message is one turn of conversation. Role is "user" or "assistant".
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ChatRequest is the body of POST /labs/sessions/:id/assist.
type ChatRequest struct {
	Message string `json:"message" binding:"required,max=2000"`
	// Terminal is the tail of what the user has actually seen in their shell. It
	// is what lets "why did that fail?" be answered against the real error rather
	// than a guess.
	Terminal string    `json:"terminal,omitempty"`
	History  []Message `json:"history,omitempty"`
}

// Response is the assistant's reply plus any commands it proposes.
type Response struct {
	Reply    string    `json:"reply"`
	Commands []Command `json:"commands"`
}
