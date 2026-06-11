package runtime

import "testing"

func TestGoIsBaseline(t *testing.T) {
	c := NewCatalog()
	rt, ok := c.ByID("go")
	if !ok {
		t.Fatal("expected a 'go' runtime")
	}
	if rt.ThroughputFactor != 1.0 || rt.LatencyFactor != 1.0 || rt.MemoryFactor != 1.0 {
		t.Errorf("go must be the 1.0 baseline, got %+v", rt)
	}
}

func TestOrDefaultFallsBackToGo(t *testing.T) {
	c := NewCatalog()
	if got := c.OrDefault(""); got.ID != DefaultRuntimeID {
		t.Errorf("empty id should fall back to %q, got %q", DefaultRuntimeID, got.ID)
	}
	if got := c.OrDefault("cobol"); got.ID != DefaultRuntimeID {
		t.Errorf("unknown id should fall back to %q, got %q", DefaultRuntimeID, got.ID)
	}
}

func TestRustFasterLeanerThanPython(t *testing.T) {
	c := NewCatalog()
	rust, _ := c.ByID("rust")
	py, _ := c.ByID("python")
	if !(rust.ThroughputFactor > py.ThroughputFactor) {
		t.Error("rust should out-throughput python")
	}
	if !(rust.MemoryFactor < py.MemoryFactor) {
		t.Error("rust should use less memory than python")
	}
}
