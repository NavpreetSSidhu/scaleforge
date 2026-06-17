package agentflow

import (
	"bytes"
	"encoding/json"
	"strconv"
	"strings"
)

// UnmarshalJSON makes NodeConfig tolerant of the shape variations LLMs emit even
// in JSON mode: numeric fields (temperature, maxTokens, topK, …) arriving as
// quoted strings, and toolSchema arriving as a nested JSON object instead of
// schema text. Without this, a generated "tool" node — e.g. an "escalate to a
// human" function whose schema the model inlines as an object — fails to
// unmarshal and the whole draft is rejected as "unparseable JSON". Canonical
// input from the editor (and round-tripped DB rows) uses the exact field types
// and decodes identically, so this is strictly more lenient, never different.
func (c *NodeConfig) UnmarshalJSON(data []byte) error {
	// rawConfig mirrors NodeConfig but takes the wobbly fields as RawMessage so we
	// can coerce them by hand. The alias type can't be NodeConfig itself or we'd
	// recurse into this method.
	type rawConfig struct {
		Model         string          `json:"model"`
		Prompt        string          `json:"prompt"`
		Temperature   json.RawMessage `json:"temperature"`
		MaxTokens     json.RawMessage `json:"maxTokens"`
		IndexType     string          `json:"indexType"`
		Quantization  string          `json:"quantization"`
		TopK          json.RawMessage `json:"topK"`
		Dim           json.RawMessage `json:"dim"`
		CorpusSize    json.RawMessage `json:"corpusSize"`
		ToolName      string          `json:"toolName"`
		ToolSchema    json.RawMessage `json:"toolSchema"`
		Condition     string          `json:"condition"`
		MaxIterations json.RawMessage `json:"maxIterations"`
	}
	var r rawConfig
	if err := json.Unmarshal(data, &r); err != nil {
		return err
	}
	c.Model = r.Model
	c.Prompt = r.Prompt
	c.Temperature = jsonFloat(r.Temperature)
	c.MaxTokens = jsonInt(r.MaxTokens)
	c.IndexType = r.IndexType
	c.Quantization = r.Quantization
	c.TopK = jsonInt(r.TopK)
	c.Dim = jsonInt(r.Dim)
	c.CorpusSize = jsonInt(r.CorpusSize)
	c.ToolName = r.ToolName
	c.ToolSchema = jsonText(r.ToolSchema)
	c.Condition = r.Condition
	c.MaxIterations = jsonInt(r.MaxIterations)
	return nil
}

// jsonText returns schema/config text whether the model sent a JSON string
// ("{...}") or an inline JSON object/array, which it re-serializes compactly.
func jsonText(raw json.RawMessage) string {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s
	}
	return string(raw)
}

// jsonInt coerces a number, a numeric string, or null into an int.
func jsonInt(raw json.RawMessage) int {
	return int(jsonFloat(raw))
}

// jsonFloat coerces a number, a numeric string, or null into a float64.
func jsonFloat(raw json.RawMessage) float64 {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || string(raw) == "null" {
		return 0
	}
	var f float64
	if err := json.Unmarshal(raw, &f); err == nil {
		return f
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		if v, err := strconv.ParseFloat(strings.TrimSpace(s), 64); err == nil {
			return v
		}
	}
	return 0
}
