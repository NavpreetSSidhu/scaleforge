// Package pricing models curated, provider-specific cloud pricing.
//
// Rather than calling live AWS/GCP/Azure pricing APIs (which need credentials,
// network access, and break offline/CI and the guest demo), ScaleForge ships
// curated price tables: representative on-demand rates expressed relative to the
// catalog's reference unit cost. The catalog's UnitMonthlyCostUsd is calibrated
// to AWS us-east-1, so AWS uses multipliers of 1.0 and other providers/regions
// scale from there. The Catalog type is the seam where a live API provider could
// be substituted later without touching the cost engine.
package pricing

// ProviderID identifies a cloud provider with curated pricing.
type ProviderID string

const (
	AWS   ProviderID = "aws"
	GCP   ProviderID = "gcp"
	Azure ProviderID = "azure"
)

// DefaultProviderID is used whenever a request omits or sends an unknown
// provider. AWS is the reference the catalog prices are calibrated against.
const DefaultProviderID = AWS

// Region is a priceable location for a provider. Multiplier scales the base
// component cost (1.0 == the provider's cheapest reference region).
type Region struct {
	ID         string  `json:"id"`
	Label      string  `json:"label"`
	Multiplier float64 `json:"multiplier"`
}

// Provider holds one cloud's curated pricing: how each component category is
// priced relative to the catalog baseline, plus per-region multipliers. The
// category multipliers differ per provider, so the cheapest provider depends on
// the architecture's mix (compute-heavy vs data-heavy) — which is exactly what
// the comparison feature surfaces.
type Provider struct {
	ID                  ProviderID         `json:"id"`
	Label               string             `json:"label"`
	DefaultRegion       string             `json:"defaultRegion"`
	CategoryMultipliers map[string]float64 `json:"categoryMultipliers"`
	Regions             []Region           `json:"regions"`
	// Services maps a catalog component type (e.g. "sql_primary") to the
	// provider's real managed-service name (e.g. "Amazon RDS"). Lets the UI show
	// which concrete products an architecture maps to per provider.
	Services map[string]string `json:"services"`
}

func (p Provider) categoryMultiplier(category string) float64 {
	if m, ok := p.CategoryMultipliers[category]; ok {
		return m
	}
	return 1.0
}

// regionMultiplier returns the multiplier for a region id, defaulting to 1.0 for
// the provider's home region or any region not present in its table.
func (p Provider) regionMultiplier(region string) float64 {
	for _, r := range p.Regions {
		if r.ID == region {
			return r.Multiplier
		}
	}
	return 1.0
}

// NodeMonthlyCost prices a single component tier: baseUnit scaled by the
// provider's category and region multipliers, times the replica count.
func (p Provider) NodeMonthlyCost(category, region string, baseUnitUsd float64, replicas int) float64 {
	if replicas <= 0 {
		replicas = 1
	}
	return baseUnitUsd * p.categoryMultiplier(category) * p.regionMultiplier(region) * float64(replicas)
}

// Catalog is the set of providers ScaleForge can price against.
type Catalog struct {
	providers []Provider
	byID      map[ProviderID]Provider
}

// Service-name maps: catalog component type -> the provider's managed product.
// Kept beside the price tables so /pricing can surface "what this maps to".
var (
	awsServices = map[string]string{
		"cdn_edge": "CloudFront", "load_balancer": "Elastic Load Balancing", "api_gateway": "API Gateway",
		"websocket_gateway": "API Gateway (WebSocket)", "api_service": "EC2 / ECS", "microservice": "ECS Fargate",
		"grpc_service": "EKS", "auth_service": "Cognito", "payment_service": "EC2 (PCI)",
		"search_service": "OpenSearch", "worker_pool": "ECS / AWS Batch", "serverless_fn": "Lambda",
		"sql_primary": "Amazon RDS", "read_replica": "RDS Read Replica", "document_db": "DocumentDB",
		"vector_db": "OpenSearch (kNN)", "timeseries_db": "Timestream", "redis_cache": "ElastiCache",
		"object_storage": "S3", "olap_store": "Redshift", "message_queue": "SQS",
		"event_stream": "MSK (Kafka)", "pubsub": "SNS", "waf": "AWS WAF",
		"secrets_manager": "Secrets Manager", "monitoring": "CloudWatch",
		"dns": "Route 53", "container_orchestrator": "EKS", "inference_service": "SageMaker",
		"llm_provider": "Bedrock", "notification_service": "SNS / SES",
	}
	gcpServices = map[string]string{
		"cdn_edge": "Cloud CDN", "load_balancer": "Cloud Load Balancing", "api_gateway": "API Gateway",
		"websocket_gateway": "Cloud Run (WebSocket)", "api_service": "Compute Engine / GKE", "microservice": "Cloud Run",
		"grpc_service": "GKE", "auth_service": "Identity Platform", "payment_service": "Compute Engine",
		"search_service": "Vertex AI Search", "worker_pool": "Cloud Run Jobs", "serverless_fn": "Cloud Functions",
		"sql_primary": "Cloud SQL", "read_replica": "Cloud SQL Replica", "document_db": "Firestore",
		"vector_db": "Vertex AI Vector Search", "timeseries_db": "Bigtable", "redis_cache": "Memorystore",
		"object_storage": "Cloud Storage", "olap_store": "BigQuery", "message_queue": "Cloud Tasks",
		"event_stream": "Managed Kafka", "pubsub": "Pub/Sub", "waf": "Cloud Armor",
		"secrets_manager": "Secret Manager", "monitoring": "Cloud Monitoring",
		"dns": "Cloud DNS", "container_orchestrator": "GKE", "inference_service": "Vertex AI",
		"llm_provider": "Vertex AI (Gemini)", "notification_service": "Firebase Cloud Messaging",
	}
	azureServices = map[string]string{
		"cdn_edge": "Front Door / CDN", "load_balancer": "Load Balancer", "api_gateway": "API Management",
		"websocket_gateway": "Web PubSub", "api_service": "App Service / AKS", "microservice": "Container Apps",
		"grpc_service": "AKS", "auth_service": "Entra ID", "payment_service": "Virtual Machines",
		"search_service": "AI Search", "worker_pool": "Container Apps Jobs", "serverless_fn": "Functions",
		"sql_primary": "Azure SQL", "read_replica": "Azure SQL Replica", "document_db": "Cosmos DB",
		"vector_db": "AI Search (vectors)", "timeseries_db": "Data Explorer", "redis_cache": "Cache for Redis",
		"object_storage": "Blob Storage", "olap_store": "Synapse Analytics", "message_queue": "Service Bus",
		"event_stream": "Event Hubs", "pubsub": "Event Grid", "waf": "Azure WAF",
		"secrets_manager": "Key Vault", "monitoring": "Azure Monitor",
		"dns": "Azure DNS", "container_orchestrator": "AKS", "inference_service": "Azure ML",
		"llm_provider": "Azure OpenAI", "notification_service": "Notification Hubs",
	}
)

// NewCatalog builds the curated provider price tables. AWS is the reference
// (all multipliers 1.0 in us-east-1); GCP trends cheaper on compute/storage and
// Azure trends pricier on compute/messaging, so provider ranking shifts with the
// architecture mix.
func NewCatalog() *Catalog {
	providers := []Provider{
		{
			ID:            AWS,
			Label:         "AWS",
			DefaultRegion: "us-east-1",
			Services:      awsServices,
			// Reference provider: the catalog prices already reflect AWS us-east-1.
			CategoryMultipliers: map[string]float64{},
			Regions: []Region{
				{ID: "us-east-1", Label: "N. Virginia", Multiplier: 1.00},
				{ID: "us-west-2", Label: "Oregon", Multiplier: 1.04},
				{ID: "eu-west-1", Label: "Ireland", Multiplier: 1.08},
				{ID: "eu-central-1", Label: "Frankfurt", Multiplier: 1.12},
				{ID: "ap-southeast-1", Label: "Singapore", Multiplier: 1.18},
				{ID: "ap-south-1", Label: "Mumbai", Multiplier: 1.10},
				{ID: "sa-east-1", Label: "São Paulo", Multiplier: 1.32},
			},
		},
		{
			ID:            GCP,
			Label:         "Google Cloud",
			DefaultRegion: "us-central1",
			Services:      gcpServices,
			CategoryMultipliers: map[string]float64{
				"compute":       0.90,
				"database":      0.95,
				"cache":         0.92,
				"storage":       0.82,
				"messaging":     0.94,
				"edge":          0.98,
				"observability": 0.95,
			},
			Regions: []Region{
				{ID: "us-central1", Label: "Iowa", Multiplier: 1.00},
				{ID: "us-east-1", Label: "South Carolina", Multiplier: 1.00},
				{ID: "us-west2", Label: "Los Angeles", Multiplier: 1.06},
				{ID: "europe-west1", Label: "Belgium", Multiplier: 1.07},
				{ID: "europe-west3", Label: "Frankfurt", Multiplier: 1.11},
				{ID: "asia-southeast1", Label: "Singapore", Multiplier: 1.15},
				{ID: "asia-south1", Label: "Mumbai", Multiplier: 1.08},
				{ID: "southamerica-east1", Label: "São Paulo", Multiplier: 1.28},
			},
		},
		{
			ID:            Azure,
			Label:         "Azure",
			DefaultRegion: "eastus",
			Services:      azureServices,
			CategoryMultipliers: map[string]float64{
				"compute":       1.06,
				"database":      0.98,
				"cache":         1.04,
				"storage":       0.94,
				"messaging":     1.07,
				"edge":          1.05,
				"observability": 1.10,
			},
			Regions: []Region{
				{ID: "eastus", Label: "East US", Multiplier: 1.00},
				{ID: "us-east-1", Label: "East US", Multiplier: 1.00},
				{ID: "westus2", Label: "West US 2", Multiplier: 1.05},
				{ID: "westeurope", Label: "West Europe", Multiplier: 1.09},
				{ID: "germanywestcentral", Label: "Germany West", Multiplier: 1.13},
				{ID: "southeastasia", Label: "Southeast Asia", Multiplier: 1.16},
				{ID: "centralindia", Label: "Central India", Multiplier: 1.09},
				{ID: "brazilsouth", Label: "Brazil South", Multiplier: 1.30},
			},
		},
	}

	byID := make(map[ProviderID]Provider, len(providers))
	for _, p := range providers {
		byID[p.ID] = p
	}
	return &Catalog{providers: providers, byID: byID}
}

// All returns the providers in display order.
func (c *Catalog) All() []Provider {
	return c.providers
}

// Provider looks up a provider by id.
func (c *Catalog) Provider(id string) (Provider, bool) {
	p, ok := c.byID[ProviderID(id)]
	return p, ok
}

// ProviderOrDefault resolves an id (possibly empty or unknown) to a provider,
// falling back to the default (AWS).
func (c *Catalog) ProviderOrDefault(id string) Provider {
	if p, ok := c.byID[ProviderID(id)]; ok {
		return p
	}
	return c.byID[DefaultProviderID]
}
