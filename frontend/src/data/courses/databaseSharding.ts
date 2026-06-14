import type { Course } from '@/types/domain';
import { cfg, node } from './helpers';

/**
 * Database Sharding — horizontally partitioning data across independent
 * databases when a single primary hits its write/storage ceiling, routed by a
 * shard key. Revealed single DB → router → shards → shard-key choice →
 * resharding/recap.
 */
export const databaseSharding: Course = {
  slug: 'database-sharding',
  title: 'Database Sharding',
  summary:
    'Break through a single database’s write and storage ceiling by partitioning data across many shards.',
  difficulty: 'Advanced',
  category: 'Data',
  graph: {
    nodes: [
      node('api', 'api_service', 'API Service', 320, 0, cfg(2, 4, 4, true)),
      node('router', 'api_gateway', 'Shard Router', 320, 150, cfg(2, 4, 2, true)),
      node('shard1', 'sql_primary', 'Shard 1 · users A–H', 150, 320, cfg(8, 32, 1, false)),
      node('shard2', 'sql_primary', 'Shard 2 · users I–P', 320, 320, cfg(8, 32, 1, false)),
      node('shard3', 'sql_primary', 'Shard 3 · users Q–Z', 490, 320, cfg(8, 32, 1, false)),
    ],
    edges: [
      { id: 'e-api-router', source: 'api', target: 'router' },
      { id: 'e-router-s1', source: 'router', target: 'shard1' },
      { id: 'e-router-s2', source: 'router', target: 'shard2' },
      { id: 'e-router-s3', source: 'router', target: 'shard3' },
    ],
  },
  steps: [
    {
      id: 'problem',
      title: 'The problem: one database can’t hold it all',
      body: "Replication scales **reads**, but every write still goes through a single primary — and all your data must fit on one machine. Past a certain scale you hit a wall: too many writes per second, or a dataset too big for one disk.\n\nVertical scaling and read replicas can’t fix a **write** or **storage** ceiling. You have to split the data itself.",
      revealNodeIds: ['shard2'],
      revealEdgeIds: [],
      focusNodeId: 'shard2',
      callout: 'A single primary caps total writes and storage — no bigger box escapes it.',
    },
    {
      id: 'router',
      title: 'Partition by a shard key',
      body: '**Sharding** splits one logical database into many independent physical databases (**shards**), each holding a *subset* of the rows. A **shard key** (e.g. `user_id`) decides which shard a given row lives on.\n\nA **Shard Router** sits in front: for each query it computes the shard key and forwards the query to the one shard that owns that data.',
      revealNodeIds: ['api', 'router', 'shard2'],
      revealEdgeIds: ['e-api-router', 'e-router-s2'],
      focusNodeId: 'router',
      callout: 'The router maps each request to the shard that owns its key.',
    },
    {
      id: 'shards',
      title: 'Independent shards',
      body: 'Each shard is a full database that owns its slice of the data — here, ranges of users. They share nothing, so writes and storage now scale **horizontally**: add shards to add capacity.\n\nThe catch: queries that span shards (joins, aggregations across all users) become expensive — you must scatter-gather across shards and merge results in the app.',
      revealNodeIds: ['api', 'router', 'shard1', 'shard2', 'shard3'],
      revealEdgeIds: ['e-api-router', 'e-router-s1', 'e-router-s2', 'e-router-s3'],
      focusNodeId: 'shard1',
      callout: 'Each shard owns a disjoint slice; capacity scales by adding shards.',
    },
    {
      id: 'shard-key',
      title: 'Choosing the shard key',
      body: 'The shard key makes or breaks the design. A good key spreads load **evenly**; a bad one creates **hot shards**.\n\n- Sharding by `user_id` hash → even distribution.\n- Sharding by `country` → one giant shard for your biggest market (a hot spot).\n\nAlso prefer a key that keeps related data together, so common queries hit a single shard rather than fanning out to all of them.',
      revealNodeIds: ['api', 'router', 'shard1', 'shard2', 'shard3'],
      revealEdgeIds: ['e-api-router', 'e-router-s1', 'e-router-s2', 'e-router-s3'],
      focusNodeId: 'router',
      callout: 'Pick a high-cardinality, evenly-distributed key — avoid hot shards.',
    },
    {
      id: 'resharding',
      title: 'Resharding & recap',
      body: "Adding shards later means **rebalancing** data, which is hard. **Consistent hashing** minimizes how much data moves when the shard count changes, and **virtual nodes** smooth out distribution.\n\nThe pattern: **a shard key + a router + many shared-nothing databases**, trading easy cross-shard queries for near-unlimited write and storage scale. Hit **Try it on canvas** to simulate it.",
      revealNodeIds: ['api', 'router', 'shard1', 'shard2', 'shard3'],
      revealEdgeIds: ['e-api-router', 'e-router-s1', 'e-router-s2', 'e-router-s3'],
    },
  ],
};
