import type { Course } from '@/types/domain';
import { cfg, node } from './helpers';

/**
 * Database Replication & Read Scaling — leader/follower replication to scale
 * reads off the primary, with the replication-lag trade-off. Revealed saturated
 * primary → one replica → read routing → more replicas → lag/recap.
 */
export const databaseReplication: Course = {
  slug: 'database-replication',
  title: 'Database Replication',
  summary:
    'Scale read-heavy workloads with leader/follower replicas — and understand the replication-lag trade-off.',
  difficulty: 'Intermediate',
  category: 'Data',
  graph: {
    nodes: [
      node('api', 'api_service', 'API Service', 320, 0, cfg(2, 4, 4, true)),
      node('primary', 'sql_primary', 'SQL Primary (writes)', 180, 190, cfg(8, 32, 1, false)),
      node('replica1', 'read_replica', 'Read Replica A', 440, 160, cfg(8, 32, 1, false)),
      node('replica2', 'read_replica', 'Read Replica B', 560, 280, cfg(8, 32, 1, false)),
    ],
    edges: [
      { id: 'e-api-primary', source: 'api', target: 'primary' },
      { id: 'e-api-r1', source: 'api', target: 'replica1' },
      { id: 'e-api-r2', source: 'api', target: 'replica2' },
      { id: 'e-primary-r1', source: 'primary', target: 'replica1' },
      { id: 'e-primary-r2', source: 'primary', target: 'replica2' },
    ],
  },
  steps: [
    {
      id: 'problem',
      title: 'The problem: reads dominate',
      body: 'Most applications read far more than they write — often 10:1 or higher. When every query, read or write, hits a single **SQL Primary**, those reads saturate it long before writes do.\n\nYou could buy a bigger machine, but that has a ceiling. We want to scale **reads** horizontally.',
      revealNodeIds: ['api', 'primary'],
      revealEdgeIds: ['e-api-primary'],
      focusNodeId: 'primary',
      callout: 'Reads and writes all hit one primary; reads saturate it first.',
    },
    {
      id: 'add-replica',
      title: 'Add a read replica',
      body: 'Attach a **Read Replica** — a copy of the database that the primary continuously streams its changes to (the replication log). The replica stays in sync, lagging the primary by milliseconds in healthy conditions.\n\nThis is **leader/follower** (a.k.a. primary/replica) replication: one writable leader, one or more read-only followers.',
      revealNodeIds: ['api', 'primary', 'replica1'],
      revealEdgeIds: ['e-api-primary', 'e-primary-r1'],
      focusNodeId: 'replica1',
      callout: 'The replica continuously copies the primary via the replication log.',
    },
    {
      id: 'route-reads',
      title: 'Route reads to the replica',
      body: 'Now split your traffic at the application layer:\n\n- **Writes** (`INSERT`/`UPDATE`/`DELETE`) → the **primary**.\n- **Reads** (`SELECT`) → the **replica(s)**.\n\nThe primary now only handles writes plus replication, freeing huge headroom. Reads are served by replicas you can add independently.',
      revealNodeIds: ['api', 'primary', 'replica1'],
      revealEdgeIds: ['e-api-primary', 'e-primary-r1', 'e-api-r1'],
      focusNodeId: 'api',
      callout: 'Writes → primary, reads → replicas. The split scales reads out.',
    },
    {
      id: 'scale-reads',
      title: 'Scale reads horizontally',
      body: 'Need more read capacity? Add more replicas. Each one subscribes to the primary’s replication stream, and the application (or a proxy) load-balances reads across them.\n\nReads now scale roughly linearly with the number of replicas — independent of write capacity.',
      revealNodeIds: ['api', 'primary', 'replica1', 'replica2'],
      revealEdgeIds: ['e-api-primary', 'e-primary-r1', 'e-api-r1', 'e-primary-r2', 'e-api-r2'],
      focusNodeId: 'replica2',
      callout: 'Add replicas to scale reads; each follows the primary independently.',
    },
    {
      id: 'lag',
      title: 'Replication lag & recap',
      body: "The trade-off: replicas are **eventually consistent**. A read issued right after a write may hit a replica that hasn't received the change yet — the user sees stale data (**replication lag**).\n\nMitigations: read your *own* writes from the primary, or route critical reads to the primary. The pattern: **one writable primary, many read replicas, with read/write splitting** — accepting a little staleness for big read scale. Hit **Try it on canvas** to simulate it.",
      revealNodeIds: ['api', 'primary', 'replica1', 'replica2'],
      revealEdgeIds: ['e-api-primary', 'e-primary-r1', 'e-api-r1', 'e-primary-r2', 'e-api-r2'],
      focusNodeId: 'primary',
      callout: 'Replicas lag the primary — reads can be briefly stale (eventual consistency).',
    },
  ],
};
