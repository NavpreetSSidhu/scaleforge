import type { Course } from '@/types/domain';
import { cfg, node } from './helpers';

/**
 * Load Balancing — from a single server (a bottleneck and single point of
 * failure) to a load balancer spreading traffic across stateless replicas, with
 * health checks and balancing algorithms. Revealed lone server → LB → replicas →
 * health checks → algorithms.
 */
export const loadBalancing: Course = {
  slug: 'load-balancing',
  title: 'Load Balancing',
  summary:
    'Scale beyond one machine and survive failures by spreading traffic across a pool of identical replicas.',
  difficulty: 'Beginner',
  category: 'Scalability',
  graph: {
    nodes: [
      node('lb', 'load_balancer', 'Load Balancer', 320, 0, cfg(2, 4, 2, true)),
      node('api1', 'api_service', 'API Service A', 170, 170, cfg(2, 4, 1, false)),
      node('api2', 'api_service', 'API Service B', 320, 170, cfg(2, 4, 1, false)),
      node('api3', 'api_service', 'API Service C', 470, 170, cfg(2, 4, 1, false)),
      node('db', 'sql_primary', 'SQL Primary', 320, 340, cfg(8, 32, 1, false)),
    ],
    edges: [
      { id: 'e-lb-api1', source: 'lb', target: 'api1' },
      { id: 'e-lb-api2', source: 'lb', target: 'api2' },
      { id: 'e-lb-api3', source: 'lb', target: 'api3' },
      { id: 'e-api1-db', source: 'api1', target: 'db' },
      { id: 'e-api2-db', source: 'api2', target: 'db' },
      { id: 'e-api3-db', source: 'api3', target: 'db' },
    ],
  },
  steps: [
    {
      id: 'problem',
      title: 'The problem: one server',
      body: 'A single application server has two fatal limits at scale:\n\n1. **Capacity** — it can only handle so many requests per second before latency spikes.\n2. **Availability** — if it crashes or you deploy to it, your whole service goes down. It is a **single point of failure**.\n\nVertical scaling (a bigger box) only delays both problems and has a ceiling.',
      revealNodeIds: ['api2', 'db'],
      revealEdgeIds: ['e-api2-db'],
      focusNodeId: 'api2',
      callout: 'One server caps throughput and is a single point of failure.',
    },
    {
      id: 'add-lb',
      title: 'Put a load balancer in front',
      body: 'A **Load Balancer** sits in front of your servers and becomes the single entry point clients talk to. It forwards each incoming request to one of the servers behind it.\n\nClients no longer know or care how many servers exist — the LB hides that detail.',
      revealNodeIds: ['lb', 'api2', 'db'],
      revealEdgeIds: ['e-lb-api2', 'e-api2-db'],
      focusNodeId: 'lb',
      callout: 'The load balancer is the single entry point clients connect to.',
    },
    {
      id: 'scale-out',
      title: 'Scale out with replicas',
      body: 'Now run **multiple identical replicas** of your service. The load balancer spreads requests across all of them, so total capacity grows roughly linearly as you add instances.\n\nThe key requirement: replicas must be **stateless** — no request should depend on landing on a specific instance. Keep session/state in a shared store (Redis, DB) so any replica can serve any request.',
      revealNodeIds: ['lb', 'api1', 'api2', 'api3', 'db'],
      revealEdgeIds: ['e-lb-api1', 'e-lb-api2', 'e-lb-api3', 'e-api1-db', 'e-api2-db', 'e-api3-db'],
      focusNodeId: 'api1',
      callout: 'Add stateless replicas; capacity scales as the LB fans out across them.',
    },
    {
      id: 'health-checks',
      title: 'Health checks & failover',
      body: 'The load balancer continuously **health-checks** each replica (e.g. polling `/health`). When an instance fails or is taken down for deploy, the LB stops routing to it and sends traffic only to healthy nodes.\n\nThis is what turns "a server died" from an outage into a non-event — the survivors absorb the load.',
      revealNodeIds: ['lb', 'api1', 'api2', 'api3', 'db'],
      revealEdgeIds: ['e-lb-api1', 'e-lb-api2', 'e-lb-api3', 'e-api1-db', 'e-api2-db', 'e-api3-db'],
      focusNodeId: 'lb',
      callout: 'Failed instances are pulled from rotation automatically — no outage.',
    },
    {
      id: 'algorithms',
      title: 'Balancing algorithms & recap',
      body: "How does the LB choose a replica? Common strategies:\n\n- **Round robin** — cycle through instances in order (simple, even).\n- **Least connections** — send to the instance with the fewest in-flight requests (better under uneven load).\n- **IP hash** — pin a client to an instance (useful for sticky sessions).\n\nThe pattern: **one entry point, many stateless replicas, health-checked and balanced**. Hit **Try it on canvas** to simulate it and scale the replica count.",
      revealNodeIds: ['lb', 'api1', 'api2', 'api3', 'db'],
      revealEdgeIds: ['e-lb-api1', 'e-lb-api2', 'e-lb-api3', 'e-api1-db', 'e-api2-db', 'e-api3-db'],
    },
  ],
};
