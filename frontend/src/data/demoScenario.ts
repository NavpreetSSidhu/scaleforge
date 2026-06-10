import type { Graph, GraphNode, TrafficProfile } from '@/types/domain';

export const demoTraffic: TrafficProfile = {
  dailyActiveUsers: 50000,
  monthlyActiveUsers: 150000,
  concurrentUsers: 5000,
  requestsPerUserMin: 2,
  peakTrafficMultiplier: 1.5,
};

const node = (
  id: string,
  type: string,
  label: string,
  x: number,
  y: number,
  config: GraphNode['config'],
): GraphNode => ({ id, type, label, position: { x, y }, config });

const cfg = (
  cpu: number,
  memory: number,
  replicas: number,
  autoscaling: boolean,
  region = 'us-east-1',
) => ({
  cpu,
  memory,
  replicas,
  autoscaling,
  region,
});

/**
 * "Blended Reference Architecture" — an edge → gateway → services → data tier
 * topology whose SQL primary becomes the bottleneck under load, matching the
 * spec's interview demo narrative.
 */
export const demoGraph: Graph = {
  nodes: [
    node('cdn', 'cdn_edge', 'CDN Edge', 360, 0, cfg(2, 2, 1, false)),
    node('lb', 'load_balancer', 'Load Balancer', 360, 120, cfg(2, 4, 2, true)),
    node('gw', 'api_gateway', 'API Gateway', 360, 240, cfg(2, 4, 2, true)),
    node('auth', 'auth_service', 'Auth Service', 120, 370, cfg(1, 2, 2, true)),
    node('api', 'api_service', 'API Service', 360, 370, cfg(2, 4, 4, true)),
    node('search', 'search_service', 'Search Service', 600, 370, cfg(4, 8, 2, true)),
    node('redis', 'redis_cache', 'Redis Cache', 360, 500, cfg(2, 4, 2, false)),
    node('sql', 'sql_primary', 'SQL Primary', 220, 630, cfg(8, 32, 1, false)),
    node('replica', 'read_replica', 'Read Replica', 500, 630, cfg(8, 32, 2, false, 'eu-west-1')),
  ],
  edges: [
    { id: 'e-cdn-lb', source: 'cdn', target: 'lb' },
    { id: 'e-lb-gw', source: 'lb', target: 'gw' },
    { id: 'e-gw-auth', source: 'gw', target: 'auth' },
    { id: 'e-gw-api', source: 'gw', target: 'api' },
    { id: 'e-gw-search', source: 'gw', target: 'search' },
    { id: 'e-api-redis', source: 'api', target: 'redis' },
    { id: 'e-redis-sql', source: 'redis', target: 'sql' },
    { id: 'e-api-replica', source: 'api', target: 'replica' },
  ],
};
