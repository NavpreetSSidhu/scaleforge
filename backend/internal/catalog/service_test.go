package catalog

import "testing"

func TestAllContainsEverySpecNodeType(t *testing.T) {
	// The full set of node types offered in the builder (per the product design).
	want := []string{
		"cdn_edge", "load_balancer", "api_gateway", "websocket_gateway",
		"api_service", "microservice", "grpc_service", "auth_service", "payment_service", "search_service", "worker_pool", "serverless_fn",
		"sql_primary", "read_replica", "document_db", "vector_db", "timeseries_db", "redis_cache", "object_storage", "olap_store",
		"message_queue", "event_stream", "pubsub",
		"waf", "secrets_manager",
		"monitoring",
	}

	defs := NewService().Map()
	for _, typ := range want {
		if _, ok := defs[typ]; !ok {
			t.Errorf("catalog is missing node type %q", typ)
		}
	}
}

func TestAllDefinitionsAreWellFormed(t *testing.T) {
	for _, def := range NewService().All() {
		if def.Type == "" || def.Category == "" || def.Label == "" {
			t.Errorf("definition has empty identity fields: %+v", def)
		}
		if def.Group == "" || def.Description == "" {
			t.Errorf("%s is missing group or description", def.Type)
		}
		if def.PerInstanceCapacity <= 0 {
			t.Errorf("%s has non-positive capacity %v", def.Type, def.PerInstanceCapacity)
		}
		if def.BaseLatencyMs < 0 {
			t.Errorf("%s has negative latency %v", def.Type, def.BaseLatencyMs)
		}
		if def.UnitMonthlyCostUsd < 0 {
			t.Errorf("%s has negative cost %v", def.Type, def.UnitMonthlyCostUsd)
		}
	}
}

func TestMapMatchesAll(t *testing.T) {
	svc := NewService()
	all := svc.All()
	m := svc.Map()

	if len(m) != len(all) {
		t.Fatalf("Map has %d entries, All has %d", len(m), len(all))
	}
	for _, def := range all {
		if m[def.Type].Type != def.Type {
			t.Errorf("Map missing or mismatched entry for %q", def.Type)
		}
	}
}

func TestByType(t *testing.T) {
	svc := NewService()

	def, ok := svc.ByType("api_service")
	if !ok {
		t.Fatal("expected api_service to be found")
	}
	if def.Category != CategoryCompute {
		t.Errorf("api_service category = %q, want compute", def.Category)
	}
	if def.Group != GroupCompute {
		t.Errorf("api_service group = %q, want %q", def.Group, GroupCompute)
	}

	if _, ok := svc.ByType("does_not_exist"); ok {
		t.Error("expected unknown type lookup to return false")
	}
}
