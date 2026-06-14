import type { Course } from '@/types/domain';
import { lld, node, py } from './helpers';

/**
 * LRU Cache — the canonical low-level-design question. Teaches the two data
 * structures that together give O(1) get/put with O(1) eviction: a hash map for
 * lookup and a doubly linked list for recency order. Diagram reveals the Cache
 * facade → HashMap → doubly linked list → Node, then the operations.
 */
export const lruCache: Course = {
  slug: 'lru-cache',
  title: 'LRU Cache',
  summary:
    'Design a fixed-capacity cache with O(1) get and put that evicts the least-recently-used key. HashMap + doubly linked list.',
  difficulty: 'Intermediate',
  category: 'Data Structures',
  kind: 'lld',
  graph: {
    nodes: [
      node('cache', 'lld_class', 'LRUCache', 320, 0, lld()),
      node('map', 'lld_index', 'HashMap (key → Node)', 120, 160, lld()),
      node('list', 'lld_list', 'Doubly Linked List', 520, 160, lld()),
      node('node', 'lld_node', 'Node', 520, 320, lld()),
    ],
    edges: [
      { id: 'e-cache-map', source: 'cache', target: 'map' },
      { id: 'e-cache-list', source: 'cache', target: 'list' },
      { id: 'e-list-node', source: 'list', target: 'node' },
      { id: 'e-map-node', source: 'map', target: 'node' },
    ],
  },
  steps: [
    {
      id: 'problem',
      title: 'The problem: a bounded cache',
      body:
        'A cache holds a fixed number of entries. Once it is full, inserting a new key must **evict** an existing one. The **LRU** (Least-Recently-Used) policy evicts the entry that has gone the longest without being touched — recent activity predicts future activity.\n\nThe interview bar is strict: **both** `get` and `put` must run in **O(1)**, *including* finding and removing the victim on eviction. That rules out scanning a list for the oldest item.',
      revealNodeIds: ['cache'],
      revealEdgeIds: [],
      focusNodeId: 'cache',
      callout: 'get and put must be O(1) — eviction included.',
    },
    {
      id: 'hashmap',
      title: 'O(1) lookup: a hash map',
      body:
        'Start with the lookup. A **hash map** from key to its entry gives O(1) `get` and O(1) membership tests:' +
        py(`self.map: dict[int, Node] = {}`) +
        'But a hash map has **no order** — it cannot tell us which key is least-recently-used. We need a second structure to track recency.',
      revealNodeIds: ['cache', 'map'],
      revealEdgeIds: ['e-cache-map'],
      focusNodeId: 'map',
      callout: 'O(1) lookup, but no notion of recency.',
    },
    {
      id: 'dll',
      title: 'O(1) ordering: a doubly linked list',
      body:
        'Keep the entries in a **doubly linked list** ordered most-recent → least-recent. Because each node has both `prev` and `next`, we can **unlink any node in O(1)** and move it to the front in O(1).\n\nA pair of **sentinel** head/tail nodes removes the null-checking at the ends:' +
        py(`class Node:
    def __init__(self, key=0, value=0):
        self.key, self.value = key, value
        self.prev = self.next = None

# head <-> ... <-> tail  (head side = most recent)
self.head, self.tail = Node(), Node()
self.head.next, self.tail.prev = self.tail, self.head`),
      revealNodeIds: ['cache', 'map', 'list'],
      revealEdgeIds: ['e-cache-map', 'e-cache-list'],
      focusNodeId: 'list',
      callout: 'Doubly linked → unlink or move any node in O(1).',
    },
    {
      id: 'wire',
      title: 'Wiring them together',
      body:
        'The trick is that the hash map stores **the list node itself**, not the value. So from a key we reach its node in O(1), and from the node we can splice it within the list in O(1):' +
        py(`def _remove(self, n):
    n.prev.next, n.next.prev = n.next, n.prev

def _add_front(self, n):
    n.prev, n.next = self.head, self.head.next
    self.head.next.prev = self.head.next = n`) +
        'The map answers *"where is this key?"*; the list answers *"what is oldest?"*.',
      revealNodeIds: ['cache', 'map', 'list', 'node'],
      revealEdgeIds: ['e-cache-map', 'e-cache-list', 'e-list-node', 'e-map-node'],
      focusNodeId: 'node',
      callout: 'The map points straight at the list node — both structures share it.',
    },
    {
      id: 'operations',
      title: 'get and put',
      body:
        '**get** — miss returns -1; a hit moves the node to the front (now most-recently-used) and returns its value.\n\n**put** — update-in-place moves to front; a brand-new key is added to the front, and if we are over capacity we drop the node just before the tail sentinel (the LRU) and delete it from the map.' +
        py(`def get(self, key):
    n = self.map.get(key)
    if not n:
        return -1
    self._remove(n); self._add_front(n)
    return n.value

def put(self, key, value):
    if key in self.map:
        self._remove(self.map[key])
    n = Node(key, value)
    self.map[key] = n
    self._add_front(n)
    if len(self.map) > self.capacity:
        lru = self.tail.prev
        self._remove(lru)
        del self.map[lru.key]`),
      revealNodeIds: ['cache', 'map', 'list', 'node'],
      revealEdgeIds: ['e-cache-map', 'e-cache-list', 'e-list-node', 'e-map-node'],
      focusNodeId: 'cache',
      callout: 'Every path is a constant number of pointer swaps.',
    },
    {
      id: 'recap',
      title: 'Recap & follow-ups',
      body:
        'Two structures, one shared node: a **hash map** for O(1) access and a **doubly linked list** for O(1) recency. Space is O(capacity).\n\nCommon follow-ups:\n\n- **Thread safety** — guard `get`/`put` with a lock (see the Rate Limiter course).\n- **TTL** — store an expiry per node and treat expired entries as misses.\n- **LFU** — evict by *frequency* instead of recency (that is the next course).\n\nUse **Copy full solution** below for the complete, runnable implementation.',
      revealNodeIds: ['cache', 'map', 'list', 'node'],
      revealEdgeIds: ['e-cache-map', 'e-cache-list', 'e-list-node', 'e-map-node'],
    },
  ],
  solution: {
    language: 'python',
    code: `class Node:
    """A doubly linked list node holding one cache entry."""

    __slots__ = ("key", "value", "prev", "next")

    def __init__(self, key=0, value=0):
        self.key = key
        self.value = value
        self.prev = None
        self.next = None


class LRUCache:
    """Fixed-capacity cache with O(1) get/put that evicts the
    least-recently-used key. A hash map gives O(1) lookup; a doubly
    linked list (most-recent -> least-recent) gives O(1) reordering."""

    def __init__(self, capacity: int):
        self.capacity = capacity
        self.map: dict[int, Node] = {}
        # Sentinel head/tail avoid null checks at the ends.
        self.head = Node()  # most-recently-used side
        self.tail = Node()  # least-recently-used side
        self.head.next = self.tail
        self.tail.prev = self.head

    def _remove(self, node: Node) -> None:
        node.prev.next = node.next
        node.next.prev = node.prev

    def _add_front(self, node: Node) -> None:
        node.prev = self.head
        node.next = self.head.next
        self.head.next.prev = node
        self.head.next = node

    def get(self, key: int) -> int:
        node = self.map.get(key)
        if node is None:
            return -1
        self._remove(node)
        self._add_front(node)  # mark most-recently-used
        return node.value

    def put(self, key: int, value: int) -> None:
        node = self.map.get(key)
        if node is not None:
            node.value = value
            self._remove(node)
            self._add_front(node)
            return
        if len(self.map) >= self.capacity:
            lru = self.tail.prev
            self._remove(lru)
            del self.map[lru.key]
        node = Node(key, value)
        self.map[key] = node
        self._add_front(node)


if __name__ == "__main__":
    cache = LRUCache(2)
    cache.put(1, 1)
    cache.put(2, 2)
    assert cache.get(1) == 1     # touches 1 -> 2 is now LRU
    cache.put(3, 3)              # evicts key 2
    assert cache.get(2) == -1
    cache.put(4, 4)             # evicts key 1
    assert cache.get(1) == -1
    assert cache.get(3) == 3
    assert cache.get(4) == 4
    print("LRUCache OK")`,
  },
};
