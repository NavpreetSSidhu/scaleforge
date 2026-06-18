package agentflow

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

// Chat action operation identifiers. The frontend's apply layer mirrors these.
// They are the agentic-workflow analog of assist.Op* (which mutate the infra
// graph): the assistant proposes them, the client previews + applies the ones
// the user accepts, and every action is validated server-side first.
const (
	ChatOpAddNode      = "addNode"
	ChatOpRemoveNode   = "removeNode"
	ChatOpAddEdge      = "addEdge"
	ChatOpRemoveEdge   = "removeEdge"
	ChatOpUpdateConfig = "updateConfig"
	ChatOpSetLabel     = "setLabel"
)

// ChatAction is one proposed mutation to the workflow graph. Config carries the
// per-type settings to merge for addNode/updateConfig; only the fields the model
// names are populated (NodeConfig is all-omitempty), so an updateConfig touches
// just those keys when the client merges it.
type ChatAction struct {
	Op string `json:"op"`
	// NodeType is the catalog node type for addNode (e.g. "retriever").
	NodeType string `json:"nodeType,omitempty"`
	// NodeID targets removeNode/updateConfig/setLabel. For addNode it is an
	// optional *proposed* id the model may reference from edges in the same batch;
	// the client remaps it to a real generated id on apply.
	NodeID string `json:"nodeId,omitempty"`
	// Label sets the node label for addNode/setLabel.
	Label string `json:"label,omitempty"`
	// Source/Target are node ids (existing or proposed) for addEdge/removeEdge.
	Source string `json:"source,omitempty"`
	Target string `json:"target,omitempty"`
	// Config carries the fields to merge for addNode/updateConfig.
	Config *NodeConfig `json:"config,omitempty"`
	// Rationale is a short, human-readable reason shown beside the action chip.
	Rationale string `json:"rationale,omitempty"`
}

// ChatMessage is one turn of conversation. Role is "user" or "assistant".
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ChatRequest is the body of POST /agentflow/chat. Graph is the workflow on the
// canvas so the model reasons over exactly what the user sees; Input is the live
// run query (optional context); History carries prior turns for multi-turn chat.
type ChatRequest struct {
	Message string        `json:"message" binding:"required,max=2000"`
	Graph   Graph         `json:"graph"`
	Input   string        `json:"input,omitempty"`
	History []ChatMessage `json:"history,omitempty"`
}

// ChatResponse is what the assistant returns: a natural-language reply plus any
// validated, ready-to-apply workflow actions.
type ChatResponse struct {
	Reply   string       `json:"reply"`
	Actions []ChatAction `json:"actions"`
}

// Chat is the incremental agentic-workflow assistant: it grounds the model in the
// node-type catalog and the current graph, then parses + validates a structured
// {reply, actions[]} response so only safe, applicable edits reach the client.
// It mirrors assist.Service.Chat (the infra assistant) but operates on the
// agentflow graph and node-type vocabulary. Unlike GenerateDraft (one-shot whole
// workflow), Chat proposes granular edits the user previews and applies.
func (s *Service) Chat(ctx context.Context, req ChatRequest) (ChatResponse, error) {
	if s.provider == nil {
		return ChatResponse{}, ErrDisabled
	}

	raw, err := s.provider.Complete(ctx, s.chatSystemPrompt(), s.chatUserPrompt(req))
	if err != nil {
		return ChatResponse{}, err
	}

	var parsed ChatResponse
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		// The model occasionally wraps JSON in prose despite JSON mode; salvage the
		// outermost object before giving up.
		if obj := extractJSONObject(raw); obj != "" {
			if err2 := json.Unmarshal([]byte(obj), &parsed); err2 != nil {
				return ChatResponse{}, fmt.Errorf("%w: assistant returned unparseable response", ErrInvalid)
			}
		} else {
			return ChatResponse{}, fmt.Errorf("%w: assistant returned unparseable response", ErrInvalid)
		}
	}

	parsed.Actions = s.validateChatActions(parsed.Actions, req.Graph)
	return parsed, nil
}

// validateChatActions drops any action that references an unknown node type or a
// node id that doesn't exist, so the client never receives an edit it can't
// safely apply. addNode actions may declare a proposed id that later edges in the
// same batch reference; those proposed ids count as valid endpoints.
func (s *Service) validateChatActions(actions []ChatAction, g Graph) []ChatAction {
	defs := s.catalog.Map()

	valid := make(map[string]bool, len(g.Nodes))
	for _, n := range g.Nodes {
		valid[n.ID] = true
	}
	// First pass: collect proposed ids from addNode so edges can reference them.
	for _, a := range actions {
		if a.Op == ChatOpAddNode && a.NodeID != "" {
			valid[a.NodeID] = true
		}
	}

	kept := make([]ChatAction, 0, len(actions))
	for _, a := range actions {
		switch a.Op {
		case ChatOpAddNode:
			if _, ok := defs[a.NodeType]; !ok {
				continue
			}
		case ChatOpRemoveNode, ChatOpUpdateConfig, ChatOpSetLabel:
			if !valid[a.NodeID] {
				continue
			}
		case ChatOpAddEdge, ChatOpRemoveEdge:
			if !valid[a.Source] || !valid[a.Target] || a.Source == a.Target {
				continue
			}
		default:
			continue
		}
		kept = append(kept, a)
	}
	return kept
}

// chatSystemPrompt embeds the node-type vocabulary and the output contract so the
// model only proposes real node types and returns parseable, applicable actions.
func (s *Service) chatSystemPrompt() string {
	var b strings.Builder
	b.WriteString(`You are ScaleForge's Agent Studio assistant. You help engineers understand and improve agentic LLM workflows they build on a visual canvas (input → retrieval/LLM/tool/router/loop steps → output).

You can do two things:
1. EXPLAIN the current workflow, its likely bottleneck (usually the LLM step), cost/latency trade-offs, and design choices in clear, concise prose.
2. PROPOSE concrete changes to the workflow graph as structured actions the user can preview and apply.

You MUST respond with a single JSON object of this exact shape:
{
  "reply": "<your natural-language explanation / answer>",
  "actions": [ <zero or more action objects> ]
}

Action objects (only use node types from the catalog below):
- {"op":"addNode","nodeType":"<type>","nodeId":"<proposed-id>","label":"<optional>","config":{ ... },"rationale":"<short why>"}
- {"op":"removeNode","nodeId":"<existing-id>","rationale":"..."}
- {"op":"addEdge","source":"<id>","target":"<id>","rationale":"..."}  (source/target may be existing node ids or proposed ids from addNode actions in this same response)
- {"op":"removeEdge","source":"<id>","target":"<id>","rationale":"..."}
- {"op":"updateConfig","nodeId":"<existing-id>","config":{ ... },"rationale":"..."}
- {"op":"setLabel","nodeId":"<existing-id>","label":"<new label>","rationale":"..."}

config fields by type: llm {model, prompt, temperature, maxTokens}; retriever {indexType: flat|ivf|hnsw, quantization: none|scalar|product, topK, dim, corpusSize}; embedder {model, dim}; tool {toolName, toolSchema}; router {condition}; loop {maxIterations}. Other types need no config.

Rules:
- Only include actions when the user asks to change/improve/build something. For pure explanations, return an empty actions array.
- Keep "reply" tight and specific.
- A workflow should start at an "input" node and end at an "output" node. A "router" should have 2+ outgoing edges, each labelled. Never create cycles with edges — use a "loop" node for repetition.
- Never invent node types. Never reference node ids that don't exist unless you created them via addNode in this same response.
- Prefer the smallest set of changes that achieves the goal.

Node types (type — group — description):
`)
	for _, k := range s.catalog.All() {
		fmt.Fprintf(&b, "- %s — %s — %s\n", k.Type, k.Group, k.Description)
	}
	return b.String()
}

// chatUserPrompt serializes the live workflow graph and run input as JSON context,
// followed by prior turns and the new question.
func (s *Service) chatUserPrompt(req ChatRequest) string {
	var b strings.Builder

	graphJSON, _ := json.Marshal(req.Graph)
	b.WriteString("Current workflow graph:\n")
	b.Write(graphJSON)
	if strings.TrimSpace(req.Input) != "" {
		fmt.Fprintf(&b, "\n\nCurrent run input/query: %s", req.Input)
	}

	if len(req.History) > 0 {
		b.WriteString("\n\nConversation so far:\n")
		for _, m := range req.History {
			fmt.Fprintf(&b, "%s: %s\n", m.Role, m.Content)
		}
	}

	b.WriteString("\n\nUser request: ")
	b.WriteString(req.Message)
	return b.String()
}
