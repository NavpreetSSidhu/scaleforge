package lab

import "github.com/scaleforge/scaleforge/internal/dockerx"

// s3Lab teaches object storage against MinIO, driven with the genuine AWS CLI
// pointed at a local endpoint — the same way you'd point an SDK at a local
// emulator. Everything you type is a real S3 API call.
func s3Lab() Lab {
	return Lab{
		ID:         "s3-object-storage",
		Title:      "S3: Buckets, Objects & Versioning",
		Track:      TrackStorage,
		Difficulty: Beginner,
		Minutes:    20,
		Verified:   true,
		Blurb:      "Drive a real S3-compatible store with the real AWS CLI. Create buckets, put objects, turn on versioning, then see why a delete isn't a delete.",
		Concepts:   []string{"Buckets & keys", "Object versioning", "Delete markers", "S3 API vs filesystem"},
		Services: []Service{{
			Name:  "minio",
			Image: "minio/minio:latest",
			Cmd:   []string{"server", "/data", "--console-address", ":9001"},
			Env: []string{
				"MINIO_ROOT_USER=scaleforge",
				"MINIO_ROOT_PASSWORD=scaleforge123",
			},
			Ports: []dockerx.PortMap{
				{Label: "S3 API", Container: "9000", Scheme: "http"},
				{Label: "MinIO Console", Container: "9001", Scheme: "http"},
			},
		}},
		Workstation: Workstation{
			Image:      "amazon/aws-cli:latest",
			Entrypoint: "/bin/sh",
			Env: []string{
				"AWS_ACCESS_KEY_ID=scaleforge",
				"AWS_SECRET_ACCESS_KEY=scaleforge123",
				"AWS_DEFAULT_REGION=us-east-1",
				// aws-cli v2 honours this, so every command in the lab talks to
				// MinIO without an --endpoint-url flag cluttering the lesson.
				"AWS_ENDPOINT_URL=http://minio:9000",
			},
		},
		Ready: "aws s3 ls >/dev/null 2>&1",
		Tasks: []Task{
			{
				ID:    "create-bucket",
				Title: "Create a bucket",
				Brief: "Object storage has no directories — it has **buckets** holding **keys**. Create a bucket named `scaleforge-lab`.",
				Hint:  "aws s3 mb s3://scaleforge-lab",
				Check: "aws s3api head-bucket --bucket scaleforge-lab",
				Pass:  "Bucket `scaleforge-lab` exists.",
				Fail:  "No bucket named `scaleforge-lab` yet.",
			},
			{
				ID:    "put-object",
				Title: "Upload an object under a key with slashes",
				Brief: "Store an object at key `notes/hello.txt`. The slash is part of the key, not a folder — S3 only *renders* it as a hierarchy.",
				Hint:  "echo 'v1' > /tmp/hello.txt && aws s3 cp /tmp/hello.txt s3://scaleforge-lab/notes/hello.txt",
				// Asks whether the key has ever been stored rather than whether it
				// is currently visible: the last objective deletes it, and that
				// must not retroactively un-earn this one.
				Check: "aws s3api list-object-versions --bucket scaleforge-lab --prefix notes/hello.txt --query 'length(Versions)' --output text 2>/dev/null | grep -qE '^[1-9]'",
				Pass:  "Object `notes/hello.txt` is stored.",
				Fail:  "No object at key `notes/hello.txt`.",
			},
			{
				ID:    "enable-versioning",
				Title: "Turn on bucket versioning",
				Brief: "Without versioning, overwriting a key destroys the old bytes. Enable versioning on the bucket so overwrites keep history.",
				Hint:  "aws s3api put-bucket-versioning --bucket scaleforge-lab --versioning-configuration Status=Enabled",
				Check: "aws s3api get-bucket-versioning --bucket scaleforge-lab --output text | grep -q Enabled",
				Pass:  "Versioning is Enabled on the bucket.",
				Fail:  "Versioning is still suspended or unset.",
			},
			{
				ID:    "overwrite-version",
				Title: "Overwrite the object and keep both versions",
				Brief: "Upload different content to the **same key**. With versioning on, the old bytes survive as a previous version rather than being replaced.",
				Hint:  "echo 'v2' > /tmp/hello.txt && aws s3 cp /tmp/hello.txt s3://scaleforge-lab/notes/hello.txt\n# then: aws s3api list-object-versions --bucket scaleforge-lab --prefix notes/",
				Check: "[ \"$(aws s3api list-object-versions --bucket scaleforge-lab --prefix notes/hello.txt --query 'length(Versions)' --output text)\" -ge 2 ]",
				Pass:  "The key now has 2 or more versions.",
				Fail:  "Fewer than 2 versions on `notes/hello.txt` — upload to the same key again.",
			},
			{
				ID:    "delete-marker",
				Title: "Delete the object — and discover it isn't gone",
				Brief: "Delete `notes/hello.txt`. In a versioned bucket this writes a **delete marker** on top of the history instead of erasing anything: the object disappears from `ls` while every version is still retrievable by version ID.",
				Hint:  "aws s3 rm s3://scaleforge-lab/notes/hello.txt\n# then look again: aws s3api list-object-versions --bucket scaleforge-lab --prefix notes/",
				Check: "[ \"$(aws s3api list-object-versions --bucket scaleforge-lab --prefix notes/hello.txt --query 'length(DeleteMarkers)' --output text)\" -ge 1 ]",
				Pass:  "A delete marker exists — the versions underneath are still recoverable.",
				Fail:  "No delete marker found on `notes/hello.txt` yet.",
			},
		},
	}
}

// kubernetesLab runs a genuine single-node k3s cluster. The terminal attaches to
// the k3s container itself, which already bundles kubectl wired to the cluster.
func kubernetesLab() Lab {
	return Lab{
		ID:         "kubernetes-workloads",
		Title:      "Kubernetes: Deployments & Self-Healing",
		Track:      TrackOrchestration,
		Difficulty: Intermediate,
		Minutes:    30,
		Verified:   true,
		Blurb:      "A real single-node Kubernetes cluster in a container. Run deployments, kill pods and watch the control loop put them back, then expose them behind a Service.",
		Concepts:   []string{"Namespaces", "Deployments & ReplicaSets", "Reconciliation loops", "Services & endpoints", "Scaling"},
		Services: []Service{{
			Name:       "k3s",
			Image:      "rancher/k3s:latest",
			Cmd:        []string{"server", "--disable=traefik", "--disable=metrics-server", "--snapshotter=native"},
			Privileged: true, // k3s runs containerd inside; it needs cgroup + mount control
			Env:        []string{"K3S_KUBECONFIG_MODE=666"},
			Tmpfs:      []string{"/run", "/var/run"},
			Ports:      []dockerx.PortMap{{Label: "Kubernetes API", Container: "6443"}},
		}},
		// kubectl ships inside the k3s image and reads the cluster's own kubeconfig.
		Workstation: Workstation{Service: "k3s"},
		Ready:       "kubectl get nodes 2>/dev/null | grep -q ' Ready '",
		Tasks: []Task{
			{
				ID:    "namespace",
				Title: "Create a namespace",
				Brief: "Namespaces partition a cluster. Create one called `lab` and do the rest of your work inside it.",
				Hint:  "kubectl create namespace lab",
				Check: "kubectl get namespace lab",
				Pass:  "Namespace `lab` exists.",
				Fail:  "No namespace named `lab`.",
			},
			{
				ID:    "deployment",
				Title: "Deploy 3 replicas",
				Brief: "Create a Deployment named `web` running `nginx` with **3 replicas** in the `lab` namespace. You declare the desired state; the controller makes it true.",
				Hint:  "kubectl -n lab create deployment web --image=nginx --replicas=3",
				Check: "[ \"$(kubectl -n lab get deploy web -o jsonpath='{.status.readyReplicas}' 2>/dev/null)\" = \"3\" ]",
				Pass:  "Deployment `web` has 3/3 replicas ready.",
				Fail:  "`web` doesn't have 3 ready replicas yet (pulling nginx can take a moment).",
			},
			{
				ID:    "self-heal",
				Title: "Kill a pod and watch it come back",
				Brief: "Delete one of the three pods, then list pods again. Nothing restarts it by name — the ReplicaSet notices reality drifted from the declared 3 and creates a **new** pod to close the gap. That reconciliation loop is the whole idea of Kubernetes.",
				Hint:  "kubectl -n lab get pods\nkubectl -n lab delete pod <one-pod-name>\nkubectl -n lab get pods",
				Check: "kubectl -n lab get events --field-selector reason=Killing -o name 2>/dev/null | grep -q . && [ \"$(kubectl -n lab get deploy web -o jsonpath='{.status.readyReplicas}')\" = \"3\" ]",
				Pass:  "A pod was killed and the deployment is back to 3/3 on its own.",
				Fail:  "No pod deletion seen yet, or the deployment hasn't recovered to 3 ready.",
			},
			{
				ID:    "service",
				Title: "Expose the deployment behind a Service",
				Brief: "Pods are mortal and their IPs change. Expose `web` on port **80** as a ClusterIP Service so traffic reaches whichever pods currently exist.",
				Hint:  "kubectl -n lab expose deployment web --port=80\n# then check it found backends: kubectl -n lab get endpoints web",
				Check: "[ \"$(kubectl -n lab get svc web -o jsonpath='{.spec.ports[0].port}' 2>/dev/null)\" = \"80\" ] && kubectl -n lab get endpoints web -o jsonpath='{.subsets[0].addresses[0].ip}' 2>/dev/null | grep -q .",
				Pass:  "Service `web` is on port 80 and has live endpoints.",
				Fail:  "Service `web` on port 80 with at least one endpoint wasn't found.",
			},
			{
				ID:    "scale",
				Title: "Scale out to 5",
				Brief: "Scale `web` to **5 replicas** and watch the Service pick up the new pods without any change to the Service itself.",
				Hint:  "kubectl -n lab scale deployment web --replicas=5",
				Check: "[ \"$(kubectl -n lab get deploy web -o jsonpath='{.status.readyReplicas}' 2>/dev/null)\" = \"5\" ]",
				Pass:  "Deployment `web` is running 5/5 replicas.",
				Fail:  "`web` isn't at 5 ready replicas yet.",
			},
		},
	}
}

// postgresLab seeds a real table large enough that the query planner's choices
// actually change, so indexes are learned by reading plans rather than by faith.
func postgresLab() Lab {
	return Lab{
		ID:         "postgres-indexing",
		Title:      "Postgres: Indexes & Query Plans",
		Track:      TrackData,
		Difficulty: Intermediate,
		Minutes:    25,
		Verified:   true,
		Blurb:      "A real Postgres with 200k seeded rows. Read EXPLAIN output, add the index that changes the plan, and prove the planner switched.",
		Concepts:   []string{"Sequential vs index scans", "EXPLAIN ANALYZE", "Composite indexes", "Planner statistics"},
		Services: []Service{{
			Name:  "postgres",
			Image: "postgres:16-alpine",
			Env: []string{
				"POSTGRES_PASSWORD=scaleforge",
				"POSTGRES_USER=scaleforge",
				"POSTGRES_DB=lab",
			},
			Ports: []dockerx.PortMap{{Label: "Postgres", Container: "5432"}},
		}},
		// The postgres image ships psql, so the terminal attaches to it directly.
		Workstation: Workstation{
			Service: "postgres",
			Env:     []string{"PGUSER=scaleforge", "PGDATABASE=lab", "PGPASSWORD=scaleforge"},
		},
		Ready:     "pg_isready -q -U scaleforge -d lab",
		SetupNote: "Seeding 200,000 rows so the planner has something to think about…",
		Setup: []string{
			`psql -v ON_ERROR_STOP=1 -c "CREATE TABLE IF NOT EXISTS events (id bigserial primary key, user_id int not null, kind text not null, created_at timestamptz not null default now())"`,
			`psql -v ON_ERROR_STOP=1 -c "INSERT INTO events (user_id, kind, created_at) SELECT (random()*5000)::int, (ARRAY['click','view','purchase','signup'])[1+(random()*3)::int], now() - (random()*90) * interval '1 day' FROM generate_series(1,200000)"`,
			`psql -v ON_ERROR_STOP=1 -c "ANALYZE events"`,
		},
		Tasks: []Task{
			{
				ID:    "seq-scan",
				Title: "See the sequential scan",
				Brief: "Run `EXPLAIN ANALYZE SELECT * FROM events WHERE user_id = 42;`. With no index, Postgres reads all 200k rows. Note the **Seq Scan** line and the actual time — that's your baseline.\n\nWhen you've read the plan, drop an index on `user_id` to move on.",
				Hint:  "psql -c 'EXPLAIN ANALYZE SELECT * FROM events WHERE user_id = 42'\npsql -c 'CREATE INDEX idx_events_user_id ON events (user_id)'",
				Check: "psql -tAc \"select 1 from pg_indexes where tablename='events' and indexdef ilike '%(user_id)%'\" | grep -q 1",
				Pass:  "An index on `user_id` exists.",
				Fail:  "No index on `events(user_id)` yet.",
			},
			{
				ID:    "index-scan",
				Title: "Prove the plan changed",
				Brief: "Re-run the same EXPLAIN. The plan should now show an **Index Scan** instead of a Seq Scan. The query didn't change — only what the planner had available.",
				Hint:  "psql -c 'EXPLAIN ANALYZE SELECT * FROM events WHERE user_id = 42'",
				Check: "psql -tAc 'EXPLAIN SELECT * FROM events WHERE user_id = 42' | grep -qi 'Index Scan'",
				Pass:  "The planner now chooses an Index Scan.",
				Fail:  "The plan still isn't using an index scan — try ANALYZE events.",
			},
			{
				ID:    "composite",
				Title: "Add a composite index for filter + sort",
				Brief: "This query filters *and* orders: `SELECT * FROM events WHERE user_id = 42 ORDER BY created_at DESC LIMIT 10`. A single-column index still has to sort. Create a composite index on `(user_id, created_at)` so the index supplies the ordering too.",
				Hint:  "psql -c 'CREATE INDEX idx_events_user_created ON events (user_id, created_at DESC)'",
				Check: "psql -tAc \"select 1 from pg_indexes where tablename='events' and indexdef ilike '%user_id%' and indexdef ilike '%created_at%'\" | grep -q 1",
				Pass:  "A composite index covering `user_id` and `created_at` exists.",
				Fail:  "No index covering both `user_id` and `created_at`.",
			},
			{
				ID:    "no-sort",
				Title: "Confirm the sort disappeared",
				Brief: "EXPLAIN the ordered query again. A well-matched composite index removes the explicit **Sort** node entirely — the rows come back already in order.",
				Hint:  "psql -c 'EXPLAIN SELECT * FROM events WHERE user_id = 42 ORDER BY created_at DESC LIMIT 10'",
				Check: "! psql -tAc 'EXPLAIN SELECT * FROM events WHERE user_id = 42 ORDER BY created_at DESC LIMIT 10' | grep -qi 'Sort Key'",
				Pass:  "No Sort node left — the index is providing the ordering.",
				Fail:  "The plan still contains a Sort — check the column order and direction of your index.",
			},
			{
				ID:    "index-used",
				Title: "Prove the index has actually served a query",
				Brief: "`EXPLAIN` shows what the planner *would* do. `pg_stat_user_indexes` shows what actually happened — `idx_scan` counts the times each index really was read.\n\nRun the query for real (not just `EXPLAIN`), then look up `idx_scan` for `idx_events_user_id`. An index with `idx_scan = 0` in production is pure write overhead, and this is how you find them.",
				Hint:  "psql -c 'SELECT count(*) FROM events WHERE user_id = 42'\npsql -c \"SELECT indexrelname, idx_scan FROM pg_stat_user_indexes WHERE relname = 'events'\"",
				Check: "[ \"$(psql -tAc \"select coalesce(sum(idx_scan),0) from pg_stat_user_indexes where relname='events'\" | tr -d ' ')\" -gt 0 ]",
				Pass:  "An index on `events` has served at least one real query.",
				Fail:  "No index scans recorded yet — run the query itself, not just EXPLAIN.",
			},
		},
	}
}

// redisLab makes eviction observable: the lab pushes the instance past a small
// maxmemory so the policy has visible consequences.
func redisLab() Lab {
	return Lab{
		ID:         "redis-caching",
		Title:      "Redis: TTLs, Eviction & Hit Rate",
		Track:      TrackData,
		Difficulty: Beginner,
		Minutes:    20,
		Verified:   true,
		Blurb:      "A real Redis you can push past its memory limit. Set TTLs, choose an eviction policy, then fill the cache until keys actually get evicted.",
		Concepts:   []string{"TTL & expiry", "maxmemory policies", "LRU eviction", "Cache hit ratio"},
		Services: []Service{{
			Name:  "redis",
			Image: "redis:7-alpine",
			Ports: []dockerx.PortMap{{Label: "Redis", Container: "6379"}},
		}},
		// The redis image ships redis-cli, so the terminal attaches to it directly.
		Workstation: Workstation{Service: "redis"},
		Ready:       "redis-cli ping | grep -q PONG",
		Tasks: []Task{
			{
				ID:    "ttl",
				Title: "Store a key that expires",
				Brief: "Set `session:1` with a TTL of at least 60 seconds. A cache entry without an expiry is just a slow database.",
				Hint:  "redis-cli SET session:1 alice EX 120",
				Check: "[ \"$(redis-cli ttl session:1)\" -gt 0 ]",
				Pass:  "`session:1` exists with a live TTL.",
				Fail:  "`session:1` is missing or has no expiry set.",
			},
			{
				ID:    "policy",
				Title: "Choose an eviction policy",
				Brief: "By default Redis refuses writes when full (`noeviction`) — fine for a database, wrong for a cache. Switch the policy to **allkeys-lru** so the least recently used keys make room.",
				Hint:  "redis-cli CONFIG SET maxmemory-policy allkeys-lru",
				Check: "redis-cli config get maxmemory-policy | grep -q allkeys-lru",
				Pass:  "Eviction policy is `allkeys-lru`.",
				Fail:  "`maxmemory-policy` isn't set to allkeys-lru.",
			},
			{
				ID:    "maxmemory",
				Title: "Cap the memory",
				Brief: "A policy only matters once there's a limit. Set `maxmemory` to a small value — **4mb** — so you can reach it by hand.",
				Hint:  "redis-cli CONFIG SET maxmemory 4mb",
				Check: "[ \"$(redis-cli config get maxmemory | tail -1)\" -gt 0 ]",
				Pass:  "A maxmemory limit is set.",
				Fail:  "`maxmemory` is still 0 (unlimited).",
			},
			{
				ID:    "evict",
				Title: "Fill it until keys are evicted",
				Brief: "Write enough data to cross 4mb and force real evictions, then read `evicted_keys` from INFO. This is the number most cache outages are hiding behind.",
				// Written as a single server-side EVAL rather than a shell loop:
				// 20k `redis-cli` invocations take minutes, and DEBUG POPULATE is
				// disabled by default in Redis 7 (and redis-cli exits 0 even when
				// the server replies with an error, so that failure is silent).
				Hint:  "redis-cli EVAL \"for i=1,60000 do redis.call('SET','pad:'..i,string.rep('x',512)) end return redis.call('dbsize')\" 0\nredis-cli INFO stats | grep evicted_keys",
				Check: "[ \"$(redis-cli info stats | grep -o 'evicted_keys:[0-9]*' | cut -d: -f2 | tr -d '\\r')\" -gt 0 ]",
				Pass:  "Redis has evicted keys under memory pressure.",
				Fail:  "`evicted_keys` is still 0 — write more data to cross the limit.",
			},
			{
				ID:    "hash-packing",
				Title: "Store a record as one hash, not five keys",
				Brief: "Each Redis key carries its own overhead, so `user:1000:name`, `user:1000:email`, … is far more expensive than one hash holding the same fields. Small hashes are also encoded compactly (`listpack`) rather than as a full hash table.\n\nStore at least **4 fields** for user 1000 in a single hash at `user:1000`, then compare `MEMORY USAGE` against the same data as separate keys.",
				Hint:  "redis-cli HSET user:1000 name ada email ada@example.com plan pro region eu\nredis-cli MEMORY USAGE user:1000\nredis-cli OBJECT ENCODING user:1000",
				Check: "[ \"$(redis-cli type user:1000)\" = \"hash\" ] && [ \"$(redis-cli hlen user:1000)\" -ge 4 ]",
				Pass:  "`user:1000` is a single hash holding the record's fields.",
				Fail:  "No hash at `user:1000` with at least 4 fields yet.",
			},
		},
	}
}
