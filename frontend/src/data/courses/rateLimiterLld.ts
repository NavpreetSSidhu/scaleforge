import type { Course } from '@/types/domain';
import { lld, node, py } from './helpers';

/**
 * Rate Limiter (LLD) — the class-level design behind the Rate Limiting
 * system-design course. Implements a per-client token bucket with lazy refill
 * and a lock for thread safety. Diagram: RateLimiter -> per-client bucket store
 * -> TokenBucket.
 */
export const rateLimiterLld: Course = {
  slug: 'rate-limiter-lld',
  title: 'Rate Limiter (Token Bucket)',
  summary:
    'Design a thread-safe, per-client rate limiter using the token-bucket algorithm with lazy refill — the class-level companion to the Rate Limiting system course.',
  difficulty: 'Intermediate',
  category: 'Concurrency',
  kind: 'lld',
  graph: {
    nodes: [
      node('limiter', 'lld_class', 'RateLimiter', 320, 0, lld()),
      node('store', 'lld_index', 'client → bucket', 320, 160, lld()),
      node('bucket', 'lld_bucket', 'TokenBucket', 320, 320, lld()),
    ],
    edges: [
      { id: 'e-limiter-store', source: 'limiter', target: 'store' },
      { id: 'e-store-bucket', source: 'store', target: 'bucket' },
    ],
  },
  steps: [
    {
      id: 'problem',
      title: 'The problem: cap the request rate',
      body:
        'We want to allow at most *N requests per second* per client, while tolerating short **bursts**. The classic answer is the **token bucket**.\n\nImagine a bucket that holds up to `capacity` tokens and refills at a steady rate. Each request removes one token; if the bucket is empty the request is **rejected**. Bursts are absorbed up to the bucket size, and the long-run average is pinned to the refill rate.\n\n> This is the algorithm behind the **Rate Limiting** system-design course — here we build the class itself.',
      revealNodeIds: ['limiter'],
      revealEdgeIds: [],
      focusNodeId: 'limiter',
      callout: 'Allow bursts up to capacity; average pinned to the refill rate.',
    },
    {
      id: 'per-client',
      title: 'One bucket per client',
      body:
        'Limits are *per client* (per API key / IP / user), so the limiter holds a map from client id to that client’s bucket, created lazily on first request:' +
        py(`self.buckets: dict[str, TokenBucket] = {}

bucket = self.buckets.get(client_id)
if bucket is None:
    bucket = TokenBucket(self.capacity, self.refill_per_sec)
    self.buckets[client_id] = bucket`),
      revealNodeIds: ['limiter', 'store'],
      revealEdgeIds: ['e-limiter-store'],
      focusNodeId: 'store',
      callout: 'Lazily create a bucket the first time a client appears.',
    },
    {
      id: 'token-bucket',
      title: 'The TokenBucket: lazy refill',
      body:
        'A naive design spawns a background timer to drip tokens — wasteful and racy. The clean trick is **lazy refill**: store the last-update time and, on each call, add the tokens that *would have* accrued since then:' +
        py(`def allow(self):
    now = time.monotonic()
    elapsed = now - self.updated
    self.tokens = min(self.capacity,
                      self.tokens + elapsed * self.refill_per_sec)
    self.updated = now
    if self.tokens >= 1:
        self.tokens -= 1
        return True
    return False`) +
        'No timers, no background threads — refill happens on demand.',
      revealNodeIds: ['limiter', 'store', 'bucket'],
      revealEdgeIds: ['e-limiter-store', 'e-store-bucket'],
      focusNodeId: 'bucket',
      callout: 'Compute accrued tokens on read — no background timer.',
    },
    {
      id: 'thread-safety',
      title: 'Thread safety',
      body:
        'Under concurrency, two threads could read the same token count and both succeed when only one should. Guard the check-and-decrement so it is **atomic**. A single lock around the per-call critical section is the simplest correct approach:' +
        py(`def allow(self, client_id):
    with self.lock:
        bucket = self.buckets.get(client_id)
        if bucket is None:
            bucket = TokenBucket(self.capacity, self.refill_per_sec)
            self.buckets[client_id] = bucket
        return bucket.allow()`) +
        'For higher throughput you could shard locks per client or use atomic primitives — but correctness first.',
      revealNodeIds: ['limiter', 'store', 'bucket'],
      revealEdgeIds: ['e-limiter-store', 'e-store-bucket'],
      focusNodeId: 'limiter',
      callout: 'Make check-and-decrement atomic, or two callers race.',
    },
    {
      id: 'recap',
      title: 'Recap & extensions',
      body:
        'A **token bucket** per client, **lazy refill** instead of timers, and a **lock** for atomicity — simple, O(1) per request, memory O(active clients).\n\nExtensions to discuss in an interview:\n\n- **Sliding-window log / counter** for stricter fairness.\n- **Distributed** limiting via Redis (`INCR` + TTL, or a Lua token-bucket script) so the limit holds across many servers.\n- **Eviction** of idle client buckets to bound memory.\n\nGrab the full code with **Copy full solution** below.',
      revealNodeIds: ['limiter', 'store', 'bucket'],
      revealEdgeIds: ['e-limiter-store', 'e-store-bucket'],
    },
  ],
  solution: {
    language: 'python',
    code: `import time
import threading


class TokenBucket:
    """Refills at a steady rate up to a capacity; each request costs one token.
    Refill is lazy: tokens accrued since the last call are added on demand."""

    def __init__(self, capacity: int, refill_per_sec: float):
        self.capacity = capacity
        self.tokens = float(capacity)
        self.refill_per_sec = refill_per_sec
        self.updated = time.monotonic()

    def allow(self) -> bool:
        now = time.monotonic()
        elapsed = now - self.updated
        self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_per_sec)
        self.updated = now
        if self.tokens >= 1:
            self.tokens -= 1
            return True
        return False


class RateLimiter:
    """Per-client token-bucket limiter. Example: capacity=10, refill=5/s allows
    bursts of 10 and a steady 5 requests/second thereafter."""

    def __init__(self, capacity: int, refill_per_sec: float):
        self.capacity = capacity
        self.refill_per_sec = refill_per_sec
        self.buckets: dict[str, TokenBucket] = {}
        self.lock = threading.Lock()

    def allow(self, client_id: str) -> bool:
        with self.lock:
            bucket = self.buckets.get(client_id)
            if bucket is None:
                bucket = TokenBucket(self.capacity, self.refill_per_sec)
                self.buckets[client_id] = bucket
            return bucket.allow()


if __name__ == "__main__":
    # capacity 5, refill 1/sec
    limiter = RateLimiter(capacity=5, refill_per_sec=1)
    allowed = sum(limiter.allow("alice") for _ in range(8))
    assert allowed == 5, allowed          # burst of 5, then rejected
    assert limiter.allow("bob") is True   # other clients unaffected
    time.sleep(1.1)
    assert limiter.allow("alice") is True  # ~1 token refilled
    print("RateLimiter OK")`,
  },
};
