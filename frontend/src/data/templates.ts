import type { Graph, GraphNode, TrafficProfile } from '@/types/domain';

export interface Template {
  id: string;
  /** Company-size label shown as the title. */
  name: string;
  /** One-line summary of the topology. */
  description: string;
  /** Short scale hint, e.g. "~800 users · 60 rps". */
  load: string;
  graph: Graph;
  traffic: TrafficProfile;
}

const n = (
  id: string,
  type: string,
  label: string,
  x: number,
  y: number,
  cpu: number,
  memory: number,
  replicas: number,
  autoscaling: boolean,
  region = 'us-east-1',
): GraphNode => ({
  id,
  type,
  label,
  position: { x, y },
  config: { cpu, memory, replicas, autoscaling, region },
});

const e = (source: string, target: string): Graph['edges'][number] => ({
  id: `e-${source}-${target}`,
  source,
  target,
});

const traffic = (concurrentUsers: number, requestsPerUserMin: number): TrafficProfile => ({
  dailyActiveUsers: concurrentUsers * 10,
  monthlyActiveUsers: concurrentUsers * 30,
  concurrentUsers,
  requestsPerUserMin,
  peakTrafficMultiplier: 1.5,
});

/**
 * Starter architectures sized by company stage. Each step adds the components a
 * team typically reaches for as traffic grows — a caching tier, async workers,
 * read replicas, microservices, multi-region data and observability — so the
 * simulator can show how the bottleneck moves as you scale up the load.
 */
export const templates: Template[] = [
  {
    id: 'startup',
    name: 'Startup',
    description: 'Monolith API on a single primary DB — no cache yet',
    load: '~800 users · 60 rps',
    traffic: traffic(800, 3),
    graph: {
      nodes: [
        n('cdn', 'cdn_edge', 'CDN Edge', 320, 0, 2, 2, 1, false),
        n('api', 'api_service', 'Monolith API', 320, 140, 2, 4, 2, true),
        n('sql', 'sql_primary', 'SQL Primary', 320, 290, 4, 16, 1, false),
      ],
      edges: [e('cdn', 'api'), e('api', 'sql')],
    },
  },
  {
    id: 'mid-startup',
    name: 'Mid-size Startup',
    description: 'LB → gateway → API with Redis cache + async workers',
    load: '~5k users · 500 rps',
    traffic: traffic(5000, 4),
    graph: {
      nodes: [
        n('cdn', 'cdn_edge', 'CDN Edge', 320, 0, 2, 2, 1, false),
        n('lb', 'load_balancer', 'Load Balancer', 320, 120, 2, 4, 2, true),
        n('gw', 'api_gateway', 'API Gateway', 320, 240, 2, 4, 2, true),
        n('api', 'api_service', 'API Service', 320, 370, 2, 4, 3, true),
        n('redis', 'redis_cache', 'Redis Cache', 120, 500, 2, 4, 1, false),
        n('queue', 'message_queue', 'Task Queue', 540, 500, 2, 4, 2, false),
        n('worker', 'worker_pool', 'Worker Pool', 540, 630, 2, 4, 2, true),
        n('sql', 'sql_primary', 'SQL Primary', 320, 630, 8, 32, 1, false),
      ],
      edges: [
        e('cdn', 'lb'),
        e('lb', 'gw'),
        e('gw', 'api'),
        e('api', 'redis'),
        e('api', 'sql'),
        e('api', 'queue'),
        e('queue', 'worker'),
        e('worker', 'sql'),
      ],
    },
  },
  {
    id: 'mid-to-big',
    name: 'Mid-to-Big',
    description: 'Microservices, search, read replica, multi-region data',
    load: '~25k users · 3.1k rps',
    traffic: traffic(25000, 5),
    graph: {
      nodes: [
        n('waf', 'waf', 'WAF', 360, 0, 2, 4, 2, true),
        n('cdn', 'cdn_edge', 'CDN Edge', 360, 110, 2, 2, 2, false),
        n('lb', 'load_balancer', 'Load Balancer', 360, 220, 4, 8, 2, true),
        n('gw', 'api_gateway', 'API Gateway', 360, 330, 4, 8, 3, true),
        n('auth', 'auth_service', 'Auth Service', 100, 460, 2, 4, 2, true),
        n('api', 'microservice', 'Core Service', 360, 460, 4, 8, 4, true),
        n('search', 'search_service', 'Search Service', 620, 460, 4, 8, 2, true),
        n('redis', 'redis_cache', 'Redis Cache', 200, 590, 2, 8, 2, false),
        n('queue', 'message_queue', 'Event Queue', 520, 590, 2, 4, 3, false),
        n('worker', 'worker_pool', 'Worker Pool', 520, 710, 2, 4, 3, true),
        n('sql', 'sql_primary', 'SQL Primary', 200, 710, 8, 32, 1, false),
        n('replica', 'read_replica', 'Read Replica', 200, 830, 8, 32, 2, false, 'eu-west-1'),
        n('mon', 'monitoring', 'Monitoring', 700, 710, 2, 4, 1, false),
      ],
      edges: [
        e('waf', 'cdn'),
        e('cdn', 'lb'),
        e('lb', 'gw'),
        e('gw', 'auth'),
        e('gw', 'api'),
        e('gw', 'search'),
        e('api', 'redis'),
        e('api', 'sql'),
        e('api', 'replica'),
        e('api', 'queue'),
        e('queue', 'worker'),
        e('worker', 'sql'),
      ],
    },
  },
  {
    id: 'big-tech',
    name: 'Big Tech',
    description: 'Full mesh: streaming, OLAP, multi-region, observability',
    load: '~150k users · 22k rps',
    traffic: traffic(150000, 6),
    graph: {
      nodes: [
        n('waf', 'waf', 'WAF', 420, 0, 4, 8, 3, true),
        n('cdn', 'cdn_edge', 'CDN Edge', 420, 100, 4, 4, 4, true),
        n('lb', 'load_balancer', 'Global LB', 420, 200, 8, 16, 4, true),
        n('gw', 'api_gateway', 'API Gateway', 420, 300, 8, 16, 6, true),
        n('auth', 'auth_service', 'Auth Service', 60, 420, 4, 8, 4, true),
        n('api', 'microservice', 'Core Service', 300, 420, 8, 16, 8, true),
        n('pay', 'payment_service', 'Payments', 540, 420, 4, 8, 4, true),
        n('search', 'search_service', 'Search', 780, 420, 8, 16, 4, true),
        n('grpc', 'grpc_service', 'Internal gRPC', 300, 540, 4, 8, 6, true),
        n('redis', 'redis_cache', 'Redis Cluster', 60, 660, 4, 16, 4, false),
        n('stream', 'event_stream', 'Event Stream', 540, 660, 8, 16, 4, false),
        n('worker', 'worker_pool', 'Worker Pool', 540, 780, 4, 8, 6, true),
        n('sql', 'sql_primary', 'SQL Primary', 60, 800, 16, 64, 1, false),
        n('replica', 'read_replica', 'Read Replicas', 240, 800, 16, 64, 4, false, 'eu-west-1'),
        n('doc', 'document_db', 'Document DB', 420, 920, 8, 32, 3, false, 'ap-south-1'),
        n('olap', 'olap_store', 'OLAP Warehouse', 700, 920, 16, 64, 2, false),
        n('mon', 'monitoring', 'Observability', 860, 660, 4, 8, 2, false),
      ],
      edges: [
        e('waf', 'cdn'),
        e('cdn', 'lb'),
        e('lb', 'gw'),
        e('gw', 'auth'),
        e('gw', 'api'),
        e('gw', 'pay'),
        e('gw', 'search'),
        e('api', 'grpc'),
        e('api', 'redis'),
        e('api', 'sql'),
        e('api', 'replica'),
        e('grpc', 'stream'),
        e('stream', 'worker'),
        e('worker', 'doc'),
        e('worker', 'olap'),
        e('pay', 'sql'),
      ],
    },
  },
];
