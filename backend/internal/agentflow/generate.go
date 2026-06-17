package agentflow

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

// GenerateDraft asks the LLM to design a complete agentic workflow from a freeform
// description, then normalizes + validates it. On an unparseable/invalid first
// attempt it makes a single repair round-trip echoing the error. The returned
// workflow is NOT saved (no id/slug/user) — the client loads it into the editor
// for review. Mirrors course.GenerateDraft and reuses the same provider seam.
func (s *Service) GenerateDraft(ctx context.Context, in GenerateInput) (Workflow, error) {
	if s.provider == nil {
		return Workflow{}, ErrDisabled
	}
	system := s.generateSystemPrompt()
	user := "Design an agentic workflow for: " + strings.TrimSpace(in.Prompt)

	w, err := s.completeWorkflow(ctx, system, user)
	if err == nil {
		return w, nil
	}
	repair := user + "\n\nYour previous attempt failed with: " + err.Error() +
		"\nReturn a corrected, complete JSON workflow that fixes this."
	return s.completeWorkflow(ctx, system, repair)
}

func (s *Service) completeWorkflow(ctx context.Context, system, user string) (Workflow, error) {
	raw, err := s.provider.Complete(ctx, system, user)
	if err != nil {
		return Workflow{}, err
	}
	var draft Workflow
	if err := json.Unmarshal([]byte(raw), &draft); err != nil {
		if obj := extractJSONObject(raw); obj != "" {
			if err2 := json.Unmarshal([]byte(obj), &draft); err2 != nil {
				return Workflow{}, fmt.Errorf("%w: model returned unparseable JSON", ErrInvalid)
			}
		} else {
			return Workflow{}, fmt.Errorf("%w: model returned unparseable JSON", ErrInvalid)
		}
	}
	// Never trust the model with the persistence envelope.
	draft.ID, draft.UserID, draft.Slug = "", "", ""
	if strings.TrimSpace(draft.Name) == "" {
		draft.Name = "Generated Workflow"
	}
	normalize(&draft, s.catalog)
	if err := validate(&draft, s.catalog); err != nil {
		return Workflow{}, err
	}
	return draft, nil
}

// generateSystemPrompt grounds generation in the real node-type vocabulary and
// the exact JSON contract, so a generated workflow always uses valid types and
// passes the same validation as a hand-built one.
func (s *Service) generateSystemPrompt() string {
	var b strings.Builder
	b.WriteString(`You are ScaleForge's agentic-workflow architect. You design small LLM agent workflows as graphs. Respond with a SINGLE JSON object (no prose, no markdown fences):

{
  "name": string,
  "description": string,
  "graph": {
    "nodes": [ { "id": string, "type": string, "label": string, "config": { ... } } ],
    "edges": [ { "id": string, "source": <node id>, "target": <node id>, "label": string (optional, for router branches) } ]
  }
}

Rules:
- Use ONLY these node types. Start at an "input" and end at an "output".
- Every edge source/target MUST be a node id you defined. Do NOT create cycles with edges — model repetition with a "loop" node instead.
- A "router" node should have 2+ outgoing edges, each with a short "label" naming the branch.
- Keep it focused: 4-8 nodes.
- config fields by type: llm {model, prompt, temperature, maxTokens}; retriever {indexType: flat|ivf|hnsw, quantization: none|scalar|product, topK, dim}; tool {toolName, toolSchema}; router {condition}; loop {maxIterations}. Other types need no config.

Node types:
`)
	for _, k := range s.catalog.All() {
		fmt.Fprintf(&b, "- %s — %s — %s\n", k.Type, k.Group, k.Description)
	}
	return b.String()
}

// extractJSONObject returns the substring spanning the first '{' to the last '}',
// a cheap salvage for models that wrap JSON in stray prose.
func extractJSONObject(s string) string {
	start := strings.IndexByte(s, '{')
	end := strings.LastIndexByte(s, '}')
	if start < 0 || end < 0 || end <= start {
		return ""
	}
	return s[start : end+1]
}
