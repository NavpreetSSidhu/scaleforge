package lab

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/scaleforge/scaleforge/internal/dockerx"
)

// step is one command a user would type, paired with the objective it should
// complete. Some objectives are satisfied by observing rather than acting, so a
// step may target no task (task == "").
type step struct {
	script string
	task   string
}

// solution describes how to solve a lab from a cold start.
type solution struct {
	labID string
	// budget is how long provisioning may take, including a cold image pull.
	budget time.Duration
	steps  []step
}

// TestLabsEndToEnd provisions each lab for real, solves every objective with the
// commands its own instructions give, and verifies after each step.
//
// Opt-in via LAB_DOCKER_TEST=1: it needs a Docker daemon and starts real
// containers. It is nonetheless the only test that proves the vertical works —
// network wiring, DNS aliases, readiness, the exec environment, and every check
// script running against live state.
func TestLabsEndToEnd(t *testing.T) {
	if os.Getenv("LAB_DOCKER_TEST") != "1" {
		t.Skip("set LAB_DOCKER_TEST=1 to run the container-backed lab tests")
	}
	if !dockerx.Available(context.Background()) {
		t.Skip("docker is not reachable")
	}

	for _, sol := range solutions() {
		sol := sol
		t.Run(sol.labID, func(t *testing.T) {
			t.Parallel()
			runLabSolution(t, sol)
		})
	}
}

func solutions() []solution {
	return []solution{
		{
			labID:  "s3-object-storage",
			budget: 5 * time.Minute,
			steps: []step{
				{"aws s3 mb s3://scaleforge-lab", "create-bucket"},
				{"echo v1 > /tmp/h.txt && aws s3 cp /tmp/h.txt s3://scaleforge-lab/notes/hello.txt", "put-object"},
				{"aws s3api put-bucket-versioning --bucket scaleforge-lab --versioning-configuration Status=Enabled", "enable-versioning"},
				{"echo v2 > /tmp/h.txt && aws s3 cp /tmp/h.txt s3://scaleforge-lab/notes/hello.txt", "overwrite-version"},
				{"aws s3 rm s3://scaleforge-lab/notes/hello.txt", "delete-marker"},
				{
					`VID=$(aws s3api list-object-versions --bucket scaleforge-lab --prefix notes/hello.txt --query 'DeleteMarkers[0].VersionId' --output text) && ` +
						`aws s3api delete-object --bucket scaleforge-lab --key notes/hello.txt --version-id "$VID"`,
					"restore-version",
				},
				{"echo report > /tmp/r.txt && aws s3 cp /tmp/r.txt s3://scaleforge-lab/reports/q1.txt", "prefix-listing"},
			},
		},
		{
			labID:  "kubernetes-workloads",
			budget: 8 * time.Minute, // a k3s control plane takes a while to converge
			steps: []step{
				{"kubectl create namespace lab", "namespace"},
				{
					"kubectl -n lab create deployment web --image=nginx --replicas=3 && " +
						"kubectl -n lab rollout status deploy/web --timeout=300s",
					"deployment",
				},
				{
					"kubectl -n lab delete $(kubectl -n lab get pods -o name | head -1) && " +
						"kubectl -n lab rollout status deploy/web --timeout=300s",
					"self-heal",
				},
				{
					"kubectl -n lab expose deployment web --port=80 && " +
						"for i in $(seq 1 30); do kubectl -n lab get endpoints web -o jsonpath='{.subsets[0].addresses[0].ip}' | grep -q . && break; sleep 2; done",
					"service",
				},
				{
					"kubectl -n lab scale deployment web --replicas=5 && " +
						"kubectl -n lab rollout status deploy/web --timeout=300s",
					"scale",
				},
				{
					`kubectl -n lab patch deployment web --type=json ` +
						`-p='[{"op":"add","path":"/spec/template/spec/containers/0/readinessProbe",` +
						`"value":{"httpGet":{"path":"/","port":80},"initialDelaySeconds":1,"periodSeconds":5}}]' && ` +
						"kubectl -n lab rollout status deploy/web --timeout=300s",
					"readiness-probe",
				},
				{
					"kubectl -n lab set image deployment/web nginx=nginx:1.27-alpine && " +
						"kubectl -n lab rollout status deploy/web --timeout=300s",
					"rolling-update",
				},
			},
		},
		{
			labID:  "postgres-indexing",
			budget: 5 * time.Minute,
			steps: []step{
				{"psql -v ON_ERROR_STOP=1 -c 'CREATE INDEX idx_events_user_id ON events (user_id)'", "seq-scan"},
				{"psql -v ON_ERROR_STOP=1 -c 'ANALYZE events'", "index-scan"},
				{"psql -v ON_ERROR_STOP=1 -c 'CREATE INDEX idx_events_user_created ON events (user_id, created_at DESC)'", "composite"},
				{"psql -v ON_ERROR_STOP=1 -c 'ANALYZE events'", "no-sort"},
				{"psql -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM events WHERE user_id = 42'", "index-used"},
				{`psql -v ON_ERROR_STOP=1 -c "CREATE INDEX idx_events_purchases ON events (created_at) WHERE kind = 'purchase'"`, "partial-index"},
				{`psql -v ON_ERROR_STOP=1 -c "UPDATE events SET kind = 'click' WHERE kind = 'click'"`, "bloat-check"},
			},
		},
		{
			labID:  "redis-caching",
			budget: 3 * time.Minute,
			steps: []step{
				{"redis-cli SET session:1 alice EX 120", "ttl"},
				{"redis-cli CONFIG SET maxmemory-policy allkeys-lru", "policy"},
				{"redis-cli CONFIG SET maxmemory 4mb", "maxmemory"},
				{`redis-cli EVAL "for i=1,60000 do redis.call('SET','pad:'..i,string.rep('x',512)) end return 1" 0`, "evict"},
				{"redis-cli HSET user:1000 name ada email ada@example.com plan pro region eu", "hash-packing"},
				{`redis-cli EVAL "for i=1,1000 do redis.call('INCR','counter:hits') end return 1" 0`, "atomic-counter"},
				{"redis-cli CONFIG SET appendonly yes", "durability"},
			},
		},
		{
			labID:  "kafka-partitions",
			budget: 4 * time.Minute,
			steps: []step{
				{"rpk topic create orders -p 3", "create-topic"},
				{`printf 'order-1\norder-2\norder-3\n' | rpk topic produce orders -k cust-42`, "produce-keyed"},
				{"rpk topic consume orders -g workers -n 3 -o start >/dev/null", "consumer-group"},
				{`printf 'order-4\norder-5\norder-6\n' | rpk topic produce orders -k cust-42`, "lag"},
				{"rpk topic add-partitions orders -n 3", "add-partitions"},
			},
		},
		{
			labID:  "dynamodb-modeling",
			budget: 5 * time.Minute,
			steps: []step{
				{
					"aws dynamodb create-table --table-name orders " +
						"--attribute-definitions AttributeName=customerId,AttributeType=S AttributeName=orderedAt,AttributeType=S " +
						"--key-schema AttributeName=customerId,KeyType=HASH AttributeName=orderedAt,KeyType=RANGE " +
						"--billing-mode PAY_PER_REQUEST",
					"create-table",
				},
				{
					`for d in 2026-01-01 2026-01-02 2026-01-03; do ` +
						`aws dynamodb put-item --table-name orders --item ` +
						`"{\"customerId\":{\"S\":\"c-1\"},\"orderedAt\":{\"S\":\"$d\"},\"orderStatus\":{\"S\":\"paid\"}}" || exit 1; done`,
					"put-items",
				},
				{
					`aws dynamodb put-item --table-name orders --item ` +
						`'{"customerId":{"S":"c-1"},"orderedAt":{"S":"2026-02-01"},"orderStatus":{"S":"pending"}}'`,
					"range-query",
				},
				{
					"aws dynamodb update-table --table-name orders " +
						"--attribute-definitions AttributeName=customerId,AttributeType=S AttributeName=orderedAt,AttributeType=S AttributeName=orderStatus,AttributeType=S " +
						`--global-secondary-index-updates '[{"Create":{"IndexName":"byStatus","KeySchema":[{"AttributeName":"orderStatus","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}}}]'`,
					"gsi",
				},
				{
					`aws dynamodb update-item --table-name orders ` +
						`--key '{"customerId":{"S":"c-1"},"orderedAt":{"S":"2026-01-01"}}' ` +
						`--update-expression 'SET version = :new' ` +
						`--condition-expression 'attribute_not_exists(version)' ` +
						`--expression-attribute-values '{":new":{"N":"2"}}'`,
					"conditional-write",
				},
				{
					"aws dynamodb update-time-to-live --table-name orders " +
						"--time-to-live-specification 'Enabled=true,AttributeName=expiresAt'",
					"ttl",
				},
			},
		},
		{
			labID:  "sqs-sns-messaging",
			budget: 5 * time.Minute,
			steps: []step{
				{"aws sqs create-queue --queue-name jobs", "create-queue"},
				{
					`Q=$(aws sqs get-queue-url --queue-name jobs --query QueueUrl --output text) && ` +
						`aws sqs send-message --queue-url "$Q" --message-body resize-image-1`,
					"send-receive",
				},
				{
					`Q=$(aws sqs get-queue-url --queue-name jobs --query QueueUrl --output text) && ` +
						`aws sqs set-queue-attributes --queue-url "$Q" --attributes VisibilityTimeout=5`,
					"visibility-timeout",
				},
				{
					`aws sqs create-queue --queue-name jobs-dlq >/dev/null && ` +
						`DLQ=$(aws sqs get-queue-url --queue-name jobs-dlq --query QueueUrl --output text) && ` +
						`ARN=$(aws sqs get-queue-attributes --queue-url "$DLQ" --attribute-names QueueArn --query Attributes.QueueArn --output text) && ` +
						`Q=$(aws sqs get-queue-url --queue-name jobs --query QueueUrl --output text) && ` +
						`aws sqs set-queue-attributes --queue-url "$Q" --attributes ` +
						`"{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"$ARN\\\",\\\"maxReceiveCount\\\":\\\"2\\\"}\"}"`,
					"dead-letter",
				},
				{
					`TOPIC=$(aws sns create-topic --name order-events --query TopicArn --output text) && ` +
						`aws sqs create-queue --queue-name audit >/dev/null && ` +
						`AQ=$(aws sqs get-queue-url --queue-name audit --query QueueUrl --output text) && ` +
						`AARN=$(aws sqs get-queue-attributes --queue-url "$AQ" --attribute-names QueueArn --query Attributes.QueueArn --output text) && ` +
						`aws sns subscribe --topic-arn "$TOPIC" --protocol sqs --notification-endpoint "$AARN"`,
					"fanout",
				},
			},
		},
	}
}

func runLabSolution(t *testing.T, sol solution) {
	t.Helper()
	ctx := context.Background()

	m := NewManager(true, NewCatalog())
	defer m.Shutdown()

	view, err := m.Start(ctx, sol.labID)
	if err != nil {
		t.Fatalf("start lab: %v", err)
	}
	ready := waitForStatus(t, m, view.ID, StatusReady, sol.budget)

	labDef, _ := m.Catalog().Get(sol.labID)
	if len(sol.steps) != len(labDef.Tasks) {
		t.Fatalf("solution covers %d steps but the lab has %d objectives",
			len(sol.steps), len(labDef.Tasks))
	}
	if len(ready.Endpoints) == 0 {
		t.Error("expected the lab to publish at least one endpoint")
	}

	// No objective may be satisfied by the lab's own setup. One that is can never
	// be earned, so the user is handed a tick they didn't do anything for.
	before, err := m.Verify(ctx, view.ID)
	if err != nil {
		t.Fatalf("verify before: %v", err)
	}
	for _, ts := range before.Tasks {
		if ts.Done {
			t.Errorf("objective %q is already complete before the user does anything "+
				"— its check is satisfied by the lab's own setup", ts.ID)
		}
	}

	for i, st := range sol.steps {
		sess := mustSession(t, m, view.ID)
		res, err := dockerx.Exec(ctx, sess.workstation, dockerx.ExecOptions{
			Script:  st.script,
			Env:     sess.execEnv,
			Timeout: 6 * time.Minute,
		})
		if err != nil {
			t.Fatalf("step %d (%s): %v", i+1, st.script, err)
		}
		if !res.Ok() {
			t.Fatalf("step %d exited %d: %s\nscript: %s\nstdout: %s",
				i+1, res.ExitCode, res.Stderr, st.script, res.Stdout)
		}

		got, err := m.Verify(ctx, view.ID)
		if err != nil {
			t.Fatalf("verify after step %d: %v", i+1, err)
		}
		if st.task != "" && !taskDone(got.Tasks, st.task) {
			t.Errorf("after step %d, objective %q is still incomplete: %s\nscript: %s",
				i+1, st.task, taskMessage(got.Tasks, st.task), st.script)
		}
		// Every objective earned earlier must have stayed earned.
		for _, earlier := range sol.steps[:i] {
			if earlier.task != "" && !taskDone(got.Tasks, earlier.task) {
				t.Errorf("step %d (%s) un-earned the earlier objective %q",
					i+1, st.script, earlier.task)
			}
		}
	}

	final, err := m.Verify(ctx, view.ID)
	if err != nil {
		t.Fatalf("final verify: %v", err)
	}
	if final.Completed != final.Total {
		for _, ts := range final.Tasks {
			if !ts.Done {
				t.Errorf("objective %q never completed: %s", ts.ID, ts.Message)
			}
		}
	}

	// A shell must actually open in the workstation.
	term, err := m.Attach(view.ID)
	if err != nil {
		t.Fatalf("attach terminal: %v", err)
	}
	term.Close()

	if err := m.Stop(view.ID); err != nil {
		t.Fatalf("stop: %v", err)
	}
	if got := mustView(t, m, view.ID).Status; got != StatusStopped {
		t.Errorf("status after stop = %q, want stopped", got)
	}
}

func waitForStatus(t *testing.T, m *Manager, id string, want Status, budget time.Duration) SessionView {
	t.Helper()
	deadline := time.Now().Add(budget)
	var last SessionView
	for time.Now().Before(deadline) {
		last = mustView(t, m, id)
		switch last.Status {
		case want:
			return last
		case StatusFailed:
			t.Fatalf("lab failed to provision: %s", last.Error)
		}
		time.Sleep(2 * time.Second)
	}
	t.Fatalf("lab never reached %q (stuck at %q: %s)", want, last.Status, last.Phase)
	return last
}

func mustView(t *testing.T, m *Manager, id string) SessionView {
	t.Helper()
	v, ok := m.Get(id)
	if !ok {
		t.Fatalf("session %s disappeared", id)
	}
	return v
}

func taskDone(states []TaskState, id string) bool {
	for _, ts := range states {
		if ts.ID == id {
			return ts.Done
		}
	}
	return false
}

func taskMessage(states []TaskState, id string) string {
	for _, ts := range states {
		if ts.ID == id {
			return ts.Message
		}
	}
	return "no such task"
}

func mustSession(t *testing.T, m *Manager, id string) *Session {
	t.Helper()
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.sessions[id]
	if !ok {
		t.Fatalf("session %s missing", id)
	}
	return s
}
