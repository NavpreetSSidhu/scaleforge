package pricing

import (
	"testing"

	"github.com/scaleforge/scaleforge/internal/catalog"
)

func TestEveryProviderNamesEveryCatalogComponent(t *testing.T) {
	c := NewCatalog()
	types := catalog.NewService().All()

	for _, p := range c.All() {
		if len(p.Services) == 0 {
			t.Fatalf("provider %q has no service map", p.ID)
		}
		for _, def := range types {
			if name, ok := p.Services[def.Type]; !ok || name == "" {
				t.Errorf("provider %q is missing a service name for component %q", p.ID, def.Type)
			}
		}
	}
}

func TestProviderOrDefaultFallsBackToAWS(t *testing.T) {
	c := NewCatalog()

	if got := c.ProviderOrDefault(""); got.ID != AWS {
		t.Errorf("empty id resolved to %q, want aws", got.ID)
	}
	if got := c.ProviderOrDefault("nonsense"); got.ID != AWS {
		t.Errorf("unknown id resolved to %q, want aws", got.ID)
	}
	if got := c.ProviderOrDefault("gcp"); got.ID != GCP {
		t.Errorf("gcp resolved to %q, want gcp", got.ID)
	}
}

func TestAllProvidersPresent(t *testing.T) {
	c := NewCatalog()
	if len(c.All()) != 3 {
		t.Fatalf("expected 3 providers, got %d", len(c.All()))
	}
	for _, id := range []ProviderID{AWS, GCP, Azure} {
		if _, ok := c.Provider(string(id)); !ok {
			t.Errorf("provider %q missing from catalog", id)
		}
	}
}

func TestAWSBaselineIsUnscaled(t *testing.T) {
	c := NewCatalog()
	aws, _ := c.Provider("aws")

	// AWS us-east-1 must equal the raw baseline so existing cost expectations hold.
	got := aws.NodeMonthlyCost("compute", "us-east-1", 40, 3)
	if got != 120 {
		t.Errorf("AWS us-east-1 compute cost = %v, want 120", got)
	}

	// Unknown region falls back to a 1.0 multiplier.
	if got := aws.NodeMonthlyCost("database", "atlantis-1", 50, 1); got != 50 {
		t.Errorf("unknown region cost = %v, want 50 (1.0 fallback)", got)
	}
}

func TestRegionMultiplierApplies(t *testing.T) {
	c := NewCatalog()
	aws, _ := c.Provider("aws")

	// sa-east-1 carries a 1.32 multiplier in the curated table.
	got := aws.NodeMonthlyCost("compute", "sa-east-1", 100, 1)
	if got != 132 {
		t.Errorf("sa-east-1 cost = %v, want 132", got)
	}
}

func TestProviderCategoryMultipliersDiffer(t *testing.T) {
	c := NewCatalog()
	aws, _ := c.Provider("aws")
	gcp, _ := c.Provider("gcp")
	azure, _ := c.Provider("azure")

	base := 100.0
	awsCompute := aws.NodeMonthlyCost("compute", "us-east-1", base, 1)
	gcpCompute := gcp.NodeMonthlyCost("compute", "us-east-1", base, 1)
	azureCompute := azure.NodeMonthlyCost("compute", "us-east-1", base, 1)

	// GCP is cheaper than AWS on compute; Azure is pricier.
	if !(gcpCompute < awsCompute && awsCompute < azureCompute) {
		t.Errorf("compute pricing order wrong: gcp=%v aws=%v azure=%v", gcpCompute, awsCompute, azureCompute)
	}
}

func TestZeroReplicasBilledAsOne(t *testing.T) {
	c := NewCatalog()
	aws, _ := c.Provider("aws")
	if got := aws.NodeMonthlyCost("compute", "us-east-1", 40, 0); got != 40 {
		t.Errorf("zero replicas cost = %v, want 40", got)
	}
}
