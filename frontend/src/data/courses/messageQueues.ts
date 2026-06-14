import type { Course } from '@/types/domain';
import { cfg, node } from './helpers';

/**
 * Message Queues & Async Processing — moving slow work off the request path with
 * a durable queue and workers, gaining decoupling, buffering, and retries.
 * Revealed blocking API → queue → workers → results/fan-out → benefits/recap.
 */
export const messageQueues: Course = {
  slug: 'message-queues',
  title: 'Message Queues',
  summary:
    'Move slow work off the request path with a durable queue and workers — decoupling, buffering, and retries.',
  difficulty: 'Intermediate',
  category: 'Messaging',
  graph: {
    nodes: [
      node('api', 'api_service', 'API Service', 320, 0, cfg(2, 4, 4, true)),
      node('queue', 'message_queue', 'Message Queue', 320, 150, cfg(2, 4, 3, false)),
      node('worker', 'worker_pool', 'Worker Pool', 320, 300, cfg(2, 4, 3, true)),
      node('store', 'object_storage', 'Result Storage', 200, 450, cfg(1, 1, 1, false)),
      node('notify', 'notification_service', 'Notifications', 470, 450, cfg(2, 4, 2, true)),
    ],
    edges: [
      { id: 'e-api-queue', source: 'api', target: 'queue' },
      { id: 'e-queue-worker', source: 'queue', target: 'worker' },
      { id: 'e-worker-store', source: 'worker', target: 'store' },
      { id: 'e-worker-notify', source: 'worker', target: 'notify' },
    ],
  },
  steps: [
    {
      id: 'problem',
      title: 'The problem: slow work blocks requests',
      body: "Some work is slow: encoding a video, generating a report, calling a flaky third-party API, sending a batch of emails. If the **API Service** does it inline, the user waits seconds — and a worker thread is tied up the whole time, so throughput collapses under load.\n\nThe insight: the user doesn't need the result *right now*. They just need to know it was accepted.",
      revealNodeIds: ['api'],
      revealEdgeIds: [],
      focusNodeId: 'api',
      callout: 'Doing slow work inline makes users wait and ties up the server.',
    },
    {
      id: 'enqueue',
      title: 'Drop the job on a queue',
      body: 'Instead of doing the work, the API writes a **message** describing the job to a **Message Queue** and immediately returns `202 Accepted`. The request is fast and the server is freed at once.\n\nThe queue is **durable** — messages survive even if consumers are down — so no work is lost.',
      revealNodeIds: ['api', 'queue'],
      revealEdgeIds: ['e-api-queue'],
      focusNodeId: 'queue',
      callout: 'The API enqueues a job and responds instantly; the queue stores it durably.',
    },
    {
      id: 'workers',
      title: 'Workers process asynchronously',
      body: 'A pool of **Workers** pulls messages off the queue and does the heavy lifting **off the request path**. Each worker takes a message, processes it, and acknowledges (deletes) it when done.\n\nIf a worker crashes mid-job, the message becomes visible again and another worker retries it — at-least-once delivery.',
      revealNodeIds: ['api', 'queue', 'worker'],
      revealEdgeIds: ['e-api-queue', 'e-queue-worker'],
      focusNodeId: 'worker',
      callout: 'Workers pull and process jobs independently; failures are retried.',
    },
    {
      id: 'results',
      title: 'Store results & notify',
      body: 'When a job finishes, the worker writes the result somewhere durable (**Object Storage**, a database) and can **fan out** a completion signal — push a notification, send an email, or update a status the client polls.\n\nThe user got an instant response earlier; now they’re told the work is done.',
      revealNodeIds: ['api', 'queue', 'worker', 'store', 'notify'],
      revealEdgeIds: ['e-api-queue', 'e-queue-worker', 'e-worker-store', 'e-worker-notify'],
      focusNodeId: 'notify',
      callout: 'Workers persist results and fire notifications when the job completes.',
    },
    {
      id: 'benefits',
      title: 'Why this wins & recap',
      body: 'A queue buys you three things:\n\n- **Decoupling** — producers and consumers scale and deploy independently.\n- **Buffering** — a traffic spike fills the queue instead of overwhelming workers; they drain it at their own pace.\n- **Resilience** — retries and dead-letter queues handle transient failures.\n\nWatch for ordering and idempotency: design consumers so processing the same message twice is safe. Hit **Try it on canvas** to simulate it.',
      revealNodeIds: ['api', 'queue', 'worker', 'store', 'notify'],
      revealEdgeIds: ['e-api-queue', 'e-queue-worker', 'e-worker-store', 'e-worker-notify'],
      focusNodeId: 'queue',
      callout: 'Decoupling + buffering + retries — the queue absorbs spikes and failures.',
    },
  ],
};
