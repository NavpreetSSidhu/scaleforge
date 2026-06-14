import type { Course } from '@/types/domain';
import { cfg, node } from './helpers';

/**
 * Rate Limiting — teaches why a shared choke point + distributed counter beats
 * letting spikes hit your API/DB directly. The design is revealed step by step:
 * API+DB under pressure → a gateway in front → the token-bucket idea → a Redis
 * counter for distributed state → the complete picture.
 */
export const rateLimiting: Course = {
  slug: 'rate-limiting',
  title: 'Rate Limiting',
  summary:
    'Protect your services from traffic spikes and abuse with a gateway choke point and a distributed token bucket.',
  difficulty: 'Beginner',
  category: 'Resiliency',
  graph: {
    nodes: [
      node('lb', 'load_balancer', 'Load Balancer', 320, 0, cfg(2, 4, 2, true)),
      node('gw', 'api_gateway', 'API Gateway', 320, 140, cfg(2, 4, 2, true)),
      node('api', 'api_service', 'API Service', 320, 290, cfg(2, 4, 4, true)),
      node('redis', 'redis_cache', 'Redis (counters)', 580, 215, cfg(2, 4, 2, false)),
      node('db', 'sql_primary', 'SQL Primary', 320, 440, cfg(8, 32, 1, false)),
    ],
    edges: [
      { id: 'e-lb-gw', source: 'lb', target: 'gw' },
      { id: 'e-gw-api', source: 'gw', target: 'api' },
      { id: 'e-gw-redis', source: 'gw', target: 'redis' },
      { id: 'e-api-db', source: 'api', target: 'db' },
    ],
  },
  steps: [
    {
      id: 'problem',
      title: 'The problem: unbounded traffic',
      body: 'When every request flows straight to your **API Service** and **database**, a traffic spike — a viral moment, a retry storm, or a scraper — can saturate them. Latency climbs, the database becomes the bottleneck, and *legitimate* users get errors too.\n\nWe need a way to cap how fast requests are admitted.',
      revealNodeIds: ['api', 'db'],
      revealEdgeIds: ['e-api-db'],
      focusNodeId: 'api',
      callout: 'Every request hits the API and DB directly — nothing throttles a spike.',
    },
    {
      id: 'choke-point',
      title: 'A single choke point',
      body: "Put an **API Gateway** in front of your services. Because *all* traffic passes through it, it's the natural place to enforce limits — before requests ever reach your expensive compute and data tiers.\n\nThis is the core idea: rate limiting belongs at a shared edge, not scattered across every service.",
      revealNodeIds: ['lb', 'gw', 'api', 'db'],
      revealEdgeIds: ['e-lb-gw', 'e-gw-api', 'e-api-db'],
      focusNodeId: 'gw',
      callout: 'The gateway sees all traffic, so it can throttle before the API is touched.',
    },
    {
      id: 'token-bucket',
      title: 'The token-bucket algorithm',
      body: 'A common limiter is the **token bucket**: a bucket holds up to *N* tokens and refills at a steady rate (say 100/sec). Each request removes a token; if the bucket is empty, the request is rejected with **429 Too Many Requests**.\n\nThis allows short bursts (up to the bucket size) while enforcing a steady average rate — a good fit for real-world traffic.',
      revealNodeIds: ['lb', 'gw', 'api', 'db'],
      revealEdgeIds: ['e-lb-gw', 'e-gw-api', 'e-api-db'],
      focusNodeId: 'gw',
      callout: 'Tokens refill at a fixed rate; an empty bucket → 429.',
    },
    {
      id: 'distributed-counter',
      title: 'Distributed state with Redis',
      body: "With more than one gateway instance, an in-memory counter per instance lets users exceed the global limit. The fix: keep the counters in a **shared, fast store** like **Redis**.\n\nRedis is in-memory (sub-millisecond) and supports atomic operations (`INCR`, Lua scripts), so every gateway reads and updates the *same* bucket — the limit holds no matter which instance you hit.",
      revealNodeIds: ['lb', 'gw', 'api', 'db', 'redis'],
      revealEdgeIds: ['e-lb-gw', 'e-gw-api', 'e-api-db', 'e-gw-redis'],
      focusNodeId: 'redis',
      callout: 'One shared bucket in Redis keeps the limit consistent across gateway replicas.',
    },
    {
      id: 'recap',
      title: 'Putting it together',
      body: "You now have a resilient front door: a **gateway** enforces a **token-bucket** limit backed by a **shared Redis counter**, so spikes are shed at the edge and your API and database stay healthy.\n\nUse **Try it on canvas** to load this design into the builder and run a simulation — then push the traffic dial up and watch where it holds.",
      revealNodeIds: ['lb', 'gw', 'api', 'db', 'redis'],
      revealEdgeIds: ['e-lb-gw', 'e-gw-api', 'e-api-db', 'e-gw-redis'],
    },
  ],
};
