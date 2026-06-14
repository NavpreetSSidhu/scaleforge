import type { Course } from '@/types/domain';
import { cfg, node } from './helpers';

/**
 * Distributed Logging — teaches the log pipeline pattern: many ephemeral
 * services shipping logs into a durable buffer, processed asynchronously, stored
 * for search, and surfaced on dashboards. Revealed source → buffer → processor →
 * store → dashboards.
 */
export const distributedLogging: Course = {
  slug: 'distributed-logging',
  title: 'Distributed Logging',
  summary:
    'Aggregate logs from many services into a durable pipeline you can search, retain, and alert on.',
  difficulty: 'Intermediate',
  category: 'Observability',
  graph: {
    nodes: [
      node('api', 'api_service', 'API Service', 200, 0, cfg(2, 4, 4, true)),
      node('pay', 'microservice', 'Payments Service', 460, 0, cfg(2, 4, 3, true)),
      node('stream', 'event_stream', 'Log Pipeline (Kafka)', 330, 150, cfg(4, 8, 3, false)),
      node('proc', 'worker_pool', 'Log Processor', 330, 290, cfg(2, 4, 3, true)),
      node('store', 'olap_store', 'Log Store & Search', 330, 430, cfg(8, 32, 2, false)),
      node('mon', 'monitoring', 'Dashboards & Alerts', 600, 430, cfg(2, 4, 1, false)),
    ],
    edges: [
      { id: 'e-api-stream', source: 'api', target: 'stream' },
      { id: 'e-pay-stream', source: 'pay', target: 'stream' },
      { id: 'e-stream-proc', source: 'stream', target: 'proc' },
      { id: 'e-proc-store', source: 'proc', target: 'store' },
      { id: 'e-store-mon', source: 'store', target: 'mon' },
    ],
  },
  steps: [
    {
      id: 'problem',
      title: 'The problem: logs everywhere',
      body: 'In a distributed system, logs are scattered across **many service instances** that scale up and down and disappear. SSH-ing into boxes to `grep` files does not work when there are hundreds of ephemeral containers.\n\nWe need to *centralize* logs into one searchable place — without coupling our services to a slow log store.',
      revealNodeIds: ['api', 'pay'],
      revealEdgeIds: [],
      focusNodeId: 'pay',
      callout: 'Each service emits logs locally — but instances are ephemeral and numerous.',
    },
    {
      id: 'buffer',
      title: 'Ship to a durable buffer',
      body: "Have services emit log events to a **durable, partitioned log** like Kafka (an **Event Stream**) instead of writing to a database directly.\n\nWhy a buffer? It **decouples** producers from consumers and absorbs bursts: if the downstream processor or store is slow, logs queue up safely instead of blocking — or dropping — your application requests.",
      revealNodeIds: ['api', 'pay', 'stream'],
      revealEdgeIds: ['e-api-stream', 'e-pay-stream'],
      focusNodeId: 'stream',
      callout: 'A partitioned log decouples producers from consumers and absorbs spikes.',
    },
    {
      id: 'process',
      title: 'Process asynchronously',
      body: 'A **Worker Pool** consumes from the stream and does the heavy lifting **off the request path**: parsing, structuring (JSON), enriching with metadata (service, region, trace id), and dropping noise.\n\nBecause it reads from a partitioned log, you scale workers horizontally — more partitions, more parallel consumers.',
      revealNodeIds: ['api', 'pay', 'stream', 'proc'],
      revealEdgeIds: ['e-api-stream', 'e-pay-stream', 'e-stream-proc'],
      focusNodeId: 'proc',
      callout: 'Workers parse & enrich logs in parallel, off the application request path.',
    },
    {
      id: 'store',
      title: 'Store for search & retention',
      body: 'Processed logs land in a store optimized for **high-ingest, columnar search** (an **OLAP/log store**, e.g. Elasticsearch or ClickHouse).\n\nKey decisions here: an **index** so queries are fast, and a **retention policy** (e.g. hot 7 days, archive to cheap object storage after) so cost stays bounded as volume grows.',
      revealNodeIds: ['api', 'pay', 'stream', 'proc', 'store'],
      revealEdgeIds: ['e-api-stream', 'e-pay-stream', 'e-stream-proc', 'e-proc-store'],
      focusNodeId: 'store',
      callout: 'Indexed, columnar storage with a retention policy keeps search fast and cheap.',
    },
    {
      id: 'observe',
      title: 'Dashboards, alerts & recap',
      body: "Finally, **Monitoring** queries the store for dashboards and fires **alerts** on patterns (error-rate spikes, missing heartbeats).\n\nThe full pattern: **services → durable buffer → async processor → searchable store → dashboards**. Each stage scales independently and a slow stage never takes down your app. Hit **Try it on canvas** to simulate it.",
      revealNodeIds: ['api', 'pay', 'stream', 'proc', 'store', 'mon'],
      revealEdgeIds: [
        'e-api-stream',
        'e-pay-stream',
        'e-stream-proc',
        'e-proc-store',
        'e-store-mon',
      ],
    },
  ],
};
