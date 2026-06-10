package catalog

func defaultConfig(cpu, memory, replicas int, autoscaling bool) NodeConfig {
	return NodeConfig{
		CPU:         cpu,
		Memory:      memory,
		Replicas:    replicas,
		Autoscaling: autoscaling,
		Region:      "us-east-1",
	}
}

type Service struct{}

func NewService() *Service {
	return &Service{}
}

// All returns the catalog of infrastructure components offered in the builder.
// The set, naming, and groupings mirror the ScaleForge product design.
func (s *Service) All() []NodeDefinition {
	return []NodeDefinition{
		// Edge & Network
		{Type: "cdn_edge", Category: CategoryEdge, Group: GroupEdge, Label: "CDN Edge", Description: "Caches & serves static assets at the edge", BaseLatencyMs: 5, PerInstanceCapacity: 100000, UnitMonthlyCostUsd: 20, DefaultConfig: defaultConfig(2, 2, 1, false)},
		{Type: "load_balancer", Category: CategoryEdge, Group: GroupEdge, Label: "Load Balancer", Description: "Distributes traffic across upstreams", BaseLatencyMs: 2, PerInstanceCapacity: 50000, UnitMonthlyCostUsd: 30, DefaultConfig: defaultConfig(2, 4, 2, true)},
		{Type: "api_gateway", Category: CategoryEdge, Group: GroupEdge, Label: "API Gateway", Description: "Routing, rate-limiting, auth offload", BaseLatencyMs: 3, PerInstanceCapacity: 40000, UnitMonthlyCostUsd: 35, DefaultConfig: defaultConfig(2, 4, 2, true)},
		{Type: "websocket_gateway", Category: CategoryEdge, Group: GroupEdge, Label: "WebSocket Gateway", Description: "Persistent realtime connection fan-out", BaseLatencyMs: 4, PerInstanceCapacity: 60000, UnitMonthlyCostUsd: 35, DefaultConfig: defaultConfig(2, 4, 2, true)},

		// Compute
		{Type: "api_service", Category: CategoryCompute, Group: GroupCompute, Label: "API Service", Description: "Core REST/GraphQL application tier", BaseLatencyMs: 15, PerInstanceCapacity: 3000, UnitMonthlyCostUsd: 40, DefaultConfig: defaultConfig(2, 4, 4, true)},
		{Type: "microservice", Category: CategoryCompute, Group: GroupCompute, Label: "Microservice", Description: "Bounded-context domain service", BaseLatencyMs: 12, PerInstanceCapacity: 3500, UnitMonthlyCostUsd: 38, DefaultConfig: defaultConfig(2, 4, 3, true)},
		{Type: "grpc_service", Category: CategoryCompute, Group: GroupCompute, Label: "gRPC Service", Description: "Low-latency binary RPC service", BaseLatencyMs: 8, PerInstanceCapacity: 4500, UnitMonthlyCostUsd: 42, DefaultConfig: defaultConfig(2, 4, 3, true)},
		{Type: "auth_service", Category: CategoryCompute, Group: GroupCompute, Label: "Auth Service", Description: "Identity, tokens, sessions", BaseLatencyMs: 10, PerInstanceCapacity: 4000, UnitMonthlyCostUsd: 35, DefaultConfig: defaultConfig(1, 2, 2, true)},
		{Type: "payment_service", Category: CategoryCompute, Group: GroupCompute, Label: "Payment Service", Description: "PCI checkout & settlement", BaseLatencyMs: 25, PerInstanceCapacity: 1500, UnitMonthlyCostUsd: 50, DefaultConfig: defaultConfig(2, 4, 2, true)},
		{Type: "search_service", Category: CategoryCompute, Group: GroupCompute, Label: "Search Service", Description: "Query parsing & ranking", BaseLatencyMs: 30, PerInstanceCapacity: 1200, UnitMonthlyCostUsd: 55, DefaultConfig: defaultConfig(4, 8, 2, true)},
		{Type: "worker_pool", Category: CategoryCompute, Group: GroupCompute, Label: "Worker Pool", Description: "Async job & batch processing", BaseLatencyMs: 10, PerInstanceCapacity: 5000, UnitMonthlyCostUsd: 30, DefaultConfig: defaultConfig(2, 4, 3, true)},
		{Type: "serverless_fn", Category: CategoryCompute, Group: GroupCompute, Label: "Serverless Fn", Description: "Event-driven functions, scale-to-zero", BaseLatencyMs: 35, PerInstanceCapacity: 2000, UnitMonthlyCostUsd: 15, DefaultConfig: defaultConfig(1, 2, 1, true)},

		// Data Stores
		{Type: "sql_primary", Category: CategoryDatabase, Group: GroupData, Label: "SQL Primary", Description: "Primary OLTP write node", BaseLatencyMs: 8, PerInstanceCapacity: 1500, UnitMonthlyCostUsd: 50, DefaultConfig: defaultConfig(8, 32, 1, false)},
		{Type: "read_replica", Category: CategoryDatabase, Group: GroupData, Label: "Read Replica", Description: "Read-scaling replica set", BaseLatencyMs: 8, PerInstanceCapacity: 3000, UnitMonthlyCostUsd: 45, DefaultConfig: defaultConfig(8, 32, 2, false)},
		{Type: "document_db", Category: CategoryDatabase, Group: GroupData, Label: "Document DB", Description: "NoSQL document store (Mongo-style)", BaseLatencyMs: 6, PerInstanceCapacity: 5000, UnitMonthlyCostUsd: 48, DefaultConfig: defaultConfig(4, 16, 2, false)},
		{Type: "vector_db", Category: CategoryDatabase, Group: GroupData, Label: "Vector DB", Description: "Embeddings & ANN similarity search", BaseLatencyMs: 12, PerInstanceCapacity: 2000, UnitMonthlyCostUsd: 70, DefaultConfig: defaultConfig(4, 16, 2, false)},
		{Type: "timeseries_db", Category: CategoryDatabase, Group: GroupData, Label: "Time-series DB", Description: "High-ingest metrics & events store", BaseLatencyMs: 7, PerInstanceCapacity: 6000, UnitMonthlyCostUsd: 40, DefaultConfig: defaultConfig(4, 8, 2, false)},
		{Type: "redis_cache", Category: CategoryCache, Group: GroupData, Label: "Redis Cache", Description: "In-memory key/value cache", BaseLatencyMs: 1, PerInstanceCapacity: 100000, UnitMonthlyCostUsd: 20, DefaultConfig: defaultConfig(2, 4, 2, false)},
		{Type: "object_storage", Category: CategoryStorage, Group: GroupData, Label: "Object Storage", Description: "Blob & asset storage (S3-style)", BaseLatencyMs: 15, PerInstanceCapacity: 10000, UnitMonthlyCostUsd: 15, DefaultConfig: defaultConfig(1, 1, 1, false)},
		{Type: "olap_store", Category: CategoryDatabase, Group: GroupData, Label: "OLAP Store", Description: "Columnar warehouse for analytics", BaseLatencyMs: 40, PerInstanceCapacity: 800, UnitMonthlyCostUsd: 60, DefaultConfig: defaultConfig(8, 32, 2, false)},

		// Messaging
		{Type: "message_queue", Category: CategoryMessaging, Group: GroupMessaging, Label: "Message Queue", Description: "Durable task queue (SQS-style)", BaseLatencyMs: 6, PerInstanceCapacity: 25000, UnitMonthlyCostUsd: 10, DefaultConfig: defaultConfig(2, 4, 3, false)},
		{Type: "event_stream", Category: CategoryMessaging, Group: GroupMessaging, Label: "Event Stream", Description: "Partitioned log (Kafka-style)", BaseLatencyMs: 4, PerInstanceCapacity: 30000, UnitMonthlyCostUsd: 60, DefaultConfig: defaultConfig(4, 8, 3, false)},
		{Type: "pubsub", Category: CategoryMessaging, Group: GroupMessaging, Label: "Pub/Sub", Description: "Topic-based publish/subscribe fan-out", BaseLatencyMs: 5, PerInstanceCapacity: 50000, UnitMonthlyCostUsd: 25, DefaultConfig: defaultConfig(2, 4, 3, false)},

		// Security
		{Type: "waf", Category: CategorySecurity, Group: GroupSecurity, Label: "WAF", Description: "Web app firewall & bot mitigation", BaseLatencyMs: 3, PerInstanceCapacity: 80000, UnitMonthlyCostUsd: 30, DefaultConfig: defaultConfig(2, 4, 2, true)},
		{Type: "secrets_manager", Category: CategorySecurity, Group: GroupSecurity, Label: "Secrets Manager", Description: "Secrets, keys & rotation", BaseLatencyMs: 2, PerInstanceCapacity: 20000, UnitMonthlyCostUsd: 15, DefaultConfig: defaultConfig(1, 2, 2, false)},

		// Observability
		{Type: "monitoring", Category: CategoryObservability, Group: GroupObservability, Label: "Monitoring", Description: "Metrics, traces & alerting", BaseLatencyMs: 0, PerInstanceCapacity: 100000, UnitMonthlyCostUsd: 25, DefaultConfig: defaultConfig(2, 4, 1, false)},
	}
}

func (s *Service) ByType(nodeType string) (NodeDefinition, bool) {
	for _, def := range s.All() {
		if def.Type == nodeType {
			return def, true
		}
	}
	return NodeDefinition{}, false
}

func (s *Service) Map() map[string]NodeDefinition {
	all := s.All()
	result := make(map[string]NodeDefinition, len(all))
	for _, def := range all {
		result[def.Type] = def
	}
	return result
}

// CategoryOf returns the semantic category for a node type, or "" if unknown.
func (s *Service) CategoryOf(nodeType string) string {
	if def, ok := s.ByType(nodeType); ok {
		return def.Category
	}
	return ""
}
