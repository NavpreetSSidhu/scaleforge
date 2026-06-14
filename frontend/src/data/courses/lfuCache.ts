import type { Course } from '@/types/domain';
import { lld, node, py } from './helpers';

/**
 * LFU Cache — the harder companion to LRU. Evicts the least-*frequently*-used
 * key, breaking ties by least-recently-used. Teaches frequency buckets of
 * ordered keys plus a tracked min-frequency to keep both get and put O(1).
 */
export const lfuCache: Course = {
  slug: 'lfu-cache',
  title: 'LFU Cache',
  summary:
    'Design an O(1) cache that evicts the least-frequently-used key, breaking ties by least-recently-used. Frequency buckets + min-freq tracking.',
  difficulty: 'Advanced',
  category: 'Data Structures',
  kind: 'lld',
  graph: {
    nodes: [
      node('cache', 'lld_class', 'LFUCache', 320, 0, lld()),
      node('values', 'lld_index', 'key → value / freq', 120, 160, lld()),
      node('buckets', 'lld_bucket', 'freq → ordered keys', 520, 160, lld()),
      node('minfreq', 'lld_node', 'min_freq', 320, 320, lld()),
    ],
    edges: [
      { id: 'e-cache-values', source: 'cache', target: 'values' },
      { id: 'e-cache-buckets', source: 'cache', target: 'buckets' },
      { id: 'e-buckets-min', source: 'buckets', target: 'minfreq' },
    ],
  },
  steps: [
    {
      id: 'problem',
      title: 'The problem: evict by frequency',
      body:
        'Like LRU, an **LFU** cache is bounded and must evict on overflow — but it evicts the **least-frequently-used** key. When several keys share the lowest frequency, the tie is broken by **least-recently-used** among them.\n\nSo each entry needs a **use count**, and we must find the minimum-count entry — and the oldest within that group — all in **O(1)**.',
      revealNodeIds: ['cache'],
      revealEdgeIds: [],
      focusNodeId: 'cache',
      callout: 'Evict lowest frequency; break ties by oldest.',
    },
    {
      id: 'values',
      title: 'Track value and frequency per key',
      body:
        'Two maps keyed by the cache key: one for the **value**, one for the current **frequency** (use count). Both give O(1) access:' +
        py(`self.values: dict[int, int] = {}   # key -> value
self.freq:   dict[int, int] = {}   # key -> use count`) +
        'Every `get` or update of a key bumps its frequency by one.',
      revealNodeIds: ['cache', 'values'],
      revealEdgeIds: ['e-cache-values'],
      focusNodeId: 'values',
      callout: 'O(1) value and frequency lookups.',
    },
    {
      id: 'buckets',
      title: 'Group keys into frequency buckets',
      body:
        'Invert the frequency map: for each frequency, keep an **ordered collection of the keys at that frequency**. An `OrderedDict` preserves insertion order, so the *first* item in a bucket is the least-recently-used key of that frequency:' +
        py(`from collections import defaultdict, OrderedDict
# freq -> keys at that freq, oldest first
self.buckets = defaultdict(OrderedDict)`) +
        'Promoting a key on access means: remove it from `buckets[f]` and append it to `buckets[f + 1]`.',
      revealNodeIds: ['cache', 'values', 'buckets'],
      revealEdgeIds: ['e-cache-values', 'e-cache-buckets'],
      focusNodeId: 'buckets',
      callout: 'Bucket per frequency; oldest key sits at the front.',
    },
    {
      id: 'minfreq',
      title: 'The key trick: track min_freq',
      body:
        'How do we find the bucket to evict from in O(1)? Maintain a single integer **`min_freq`** — the lowest frequency currently present.\n\n- A brand-new key always enters at frequency 1, so on insert `min_freq = 1`.\n- When promoting a key empties `buckets[min_freq]`, the new minimum is `min_freq + 1`.' +
        py(`if not self.buckets[f]:
    del self.buckets[f]
    if self.min_freq == f:
        self.min_freq += 1`),
      revealNodeIds: ['cache', 'values', 'buckets', 'minfreq'],
      revealEdgeIds: ['e-cache-values', 'e-cache-buckets', 'e-buckets-min'],
      focusNodeId: 'minfreq',
      callout: 'min_freq points at the eviction bucket — no scanning.',
    },
    {
      id: 'operations',
      title: 'get, put, and eviction',
      body:
        '**get** bumps the frequency and returns the value (or -1). **put** updates in place (and bumps), or inserts a new key — first evicting the **front of `buckets[min_freq]`** (lowest freq, oldest) when full:' +
        py(`def put(self, key, value):
    if self.capacity <= 0:
        return
    if key in self.values:
        self.values[key] = value
        self._bump(key)
        return
    if len(self.values) >= self.capacity:
        evict, _ = self.buckets[self.min_freq].popitem(last=False)
        del self.values[evict]; del self.freq[evict]
    self.values[key] = value
    self.freq[key] = 1
    self.buckets[1][key] = None
    self.min_freq = 1`),
      revealNodeIds: ['cache', 'values', 'buckets', 'minfreq'],
      revealEdgeIds: ['e-cache-values', 'e-cache-buckets', 'e-buckets-min'],
      focusNodeId: 'cache',
      callout: 'popitem(last=False) removes the LRU key of the min bucket.',
    },
    {
      id: 'recap',
      title: 'Recap & complexity',
      body:
        'LFU in O(1): per-key **value/freq** maps, **frequency buckets** of insertion-ordered keys, and a tracked **min_freq** so eviction never scans. Space is O(capacity).\n\nNote the LRU tie-break falls out for free from the `OrderedDict` ordering inside each bucket — LFU is essentially "LRU, partitioned by frequency".\n\nGrab the complete implementation with **Copy full solution** below.',
      revealNodeIds: ['cache', 'values', 'buckets', 'minfreq'],
      revealEdgeIds: ['e-cache-values', 'e-cache-buckets', 'e-buckets-min'],
    },
  ],
  solution: {
    language: 'python',
    code: `from collections import defaultdict, OrderedDict


class LFUCache:
    """Fixed-capacity cache with O(1) get/put. Evicts the least-frequently-used
    key, breaking ties by least-recently-used.

    - values:  key -> value
    - freq:    key -> use count
    - buckets: freq -> OrderedDict of keys (oldest first)
    - min_freq: smallest frequency currently present
    """

    def __init__(self, capacity: int):
        self.capacity = capacity
        self.values: dict[int, int] = {}
        self.freq: dict[int, int] = {}
        self.buckets = defaultdict(OrderedDict)
        self.min_freq = 0

    def _bump(self, key: int) -> None:
        f = self.freq[key]
        del self.buckets[f][key]
        if not self.buckets[f]:
            del self.buckets[f]
            if self.min_freq == f:
                self.min_freq += 1
        self.freq[key] = f + 1
        self.buckets[f + 1][key] = None

    def get(self, key: int) -> int:
        if key not in self.values:
            return -1
        self._bump(key)
        return self.values[key]

    def put(self, key: int, value: int) -> None:
        if self.capacity <= 0:
            return
        if key in self.values:
            self.values[key] = value
            self._bump(key)
            return
        if len(self.values) >= self.capacity:
            # Evict the LRU key inside the lowest-frequency bucket.
            evict, _ = self.buckets[self.min_freq].popitem(last=False)
            del self.values[evict]
            del self.freq[evict]
        self.values[key] = value
        self.freq[key] = 1
        self.buckets[1][key] = None
        self.min_freq = 1


if __name__ == "__main__":
    cache = LFUCache(2)
    cache.put(1, 1)
    cache.put(2, 2)
    assert cache.get(1) == 1     # freq: 1->2, 2->1
    cache.put(3, 3)             # evicts key 2 (lowest freq)
    assert cache.get(2) == -1
    assert cache.get(3) == 3     # freq: 1->2, 3->2
    cache.put(4, 4)            # tie at freq 2 -> evict LRU (key 1)
    assert cache.get(1) == -1
    assert cache.get(3) == 3
    assert cache.get(4) == 4
    print("LFUCache OK")`,
  },
};
