import type { Course } from '@/types/domain';
import { cfg, node } from './helpers';

/**
 * Caching — teaches layered caching: an application cache (cache-aside with
 * Redis) to spare the database, an edge cache (CDN) to spare the origin, and the
 * hard part — invalidation. Revealed DB pressure → Redis cache-aside → CDN edge
 * → invalidation → recap.
 */
export const caching: Course = {
  slug: 'caching',
  title: 'Caching',
  summary:
    'Cut latency and database load with layered caches — and learn the trade-offs of keeping them fresh.',
  difficulty: 'Beginner',
  category: 'Performance',
  graph: {
    nodes: [
      node('cdn', 'cdn_edge', 'CDN Edge', 320, 0, cfg(2, 2, 1, false)),
      node('lb', 'load_balancer', 'Load Balancer', 320, 140, cfg(2, 4, 2, true)),
      node('api', 'api_service', 'API Service', 320, 280, cfg(2, 4, 4, true)),
      node('redis', 'redis_cache', 'Redis Cache', 580, 280, cfg(2, 4, 2, false)),
      node('db', 'sql_primary', 'SQL Primary', 320, 420, cfg(8, 32, 1, false)),
    ],
    edges: [
      { id: 'e-cdn-lb', source: 'cdn', target: 'lb' },
      { id: 'e-lb-api', source: 'lb', target: 'api' },
      { id: 'e-api-redis', source: 'api', target: 'redis' },
      { id: 'e-api-db', source: 'api', target: 'db' },
    ],
  },
  steps: [
    {
      id: 'problem',
      title: 'The problem: the database is doing all the work',
      body: 'Reads usually outnumber writes by a wide margin, and many of them ask for the **same data** over and over. If every read hits the **SQL Primary**, the database becomes the bottleneck and tail latency suffers.\n\nCaching stores the answer closer to the request, so repeated reads are cheap.',
      revealNodeIds: ['api', 'db'],
      revealEdgeIds: ['e-api-db'],
      focusNodeId: 'db',
      callout: 'Every read hits the primary — even when the data rarely changes.',
    },
    {
      id: 'cache-aside',
      title: 'Application cache (cache-aside)',
      body: 'Add an in-memory **Redis** cache. The common pattern is **cache-aside**:\n\n1. On read, check Redis first.\n2. **Hit** → return it (sub-millisecond, no DB touch).\n3. **Miss** → read the DB, write the value into Redis with a **TTL**, then return it.\n\nWith a good hit rate, the database load drops dramatically and reads get much faster.',
      revealNodeIds: ['api', 'db', 'redis'],
      revealEdgeIds: ['e-api-db', 'e-api-redis'],
      focusNodeId: 'redis',
      callout: 'Check Redis first; on a miss, read the DB and populate the cache with a TTL.',
    },
    {
      id: 'edge-cache',
      title: 'Edge caching with a CDN',
      body: 'Some responses — static assets, and even cacheable API responses — never need to reach your origin at all. A **CDN** caches them at **edge locations** near users.\n\nThis is the cheapest, fastest cache layer: a cache hit is served from a nearby city, shaving round-trip latency and offloading your load balancer and API entirely.',
      revealNodeIds: ['cdn', 'lb', 'api', 'db', 'redis'],
      revealEdgeIds: ['e-cdn-lb', 'e-lb-api', 'e-api-db', 'e-api-redis'],
      focusNodeId: 'cdn',
      callout: 'The CDN serves cacheable content from the edge — requests never reach the origin.',
    },
    {
      id: 'invalidation',
      title: 'The hard part: invalidation',
      body: '"There are only two hard things in computer science: cache invalidation and naming things."\n\nA cache trades **freshness** for speed. Strategies to manage staleness:\n\n- **TTL** — expire entries after N seconds (simple; tolerates some staleness).\n- **Write-through / explicit invalidation** — update or delete the cache key when the underlying data changes.\n\nChoose based on how stale the data is allowed to be. Getting this wrong shows up as users seeing old data.',
      revealNodeIds: ['cdn', 'lb', 'api', 'db', 'redis'],
      revealEdgeIds: ['e-cdn-lb', 'e-lb-api', 'e-api-db', 'e-api-redis'],
      focusNodeId: 'redis',
      callout: 'TTL vs explicit invalidation — pick based on tolerable staleness.',
    },
    {
      id: 'recap',
      title: 'Putting it together',
      body: "You now have **layered caching**: a **CDN** at the edge, an **application cache** in front of the database, and a deliberate **invalidation** strategy. Each layer absorbs load so the one behind it does less work.\n\nHit **Try it on canvas** to load the design and simulate it — then raise traffic and watch the cache hold the line.",
      revealNodeIds: ['cdn', 'lb', 'api', 'db', 'redis'],
      revealEdgeIds: ['e-cdn-lb', 'e-lb-api', 'e-api-db', 'e-api-redis'],
    },
  ],
};
