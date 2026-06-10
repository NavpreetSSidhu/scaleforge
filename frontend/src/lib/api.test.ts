import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import type { SimulateRequest } from '@/types/domain';

function mockFetch(response: unknown, init?: { ok?: boolean; status?: number }) {
  const ok = init?.ok ?? true;
  const status = init?.status ?? 200;
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: 'error',
    json: async () => response,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const simulateBody: SimulateRequest = {
  name: 'Test',
  graph: { nodes: [], edges: [] },
  traffic: {
    dailyActiveUsers: 1,
    monthlyActiveUsers: 1,
    concurrentUsers: 1,
    requestsPerUserMin: 1,
    peakTrafficMultiplier: 1,
  },
};

describe('api client', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.restoreAllMocks());

  it('GET /catalog hits the catalog endpoint and returns parsed json', async () => {
    const fetchMock = mockFetch({ nodes: [{ type: 'redis' }] });

    const result = await api.getCatalog();

    expect(result.nodes[0].type).toBe('redis');
    expect(fetchMock).toHaveBeenCalledWith('/api/catalog', expect.any(Object));
  });

  it('POST /simulate sends the body as JSON with the correct method', async () => {
    const fetchMock = mockFetch({ id: 'sim-1' });

    await api.simulate(simulateBody);

    const [path, options] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/simulate');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toMatchObject({ name: 'Test' });
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  it('throws with the server-provided error message on a failed response', async () => {
    mockFetch({ error: 'database unavailable' }, { ok: false, status: 503 });

    await expect(api.getCatalog()).rejects.toThrow('database unavailable');
  });

  it('returns undefined for 204 No Content (delete)', async () => {
    mockFetch(null, { ok: true, status: 204 });

    await expect(api.deleteArchitecture('arch-1')).resolves.toBeUndefined();
  });
});
