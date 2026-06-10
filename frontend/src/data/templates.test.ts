import { describe, expect, it } from 'vitest';
import { templates } from './templates';

describe('starter templates', () => {
  it('offers the four company-size stages', () => {
    expect(templates.map((t) => t.id)).toEqual([
      'startup',
      'mid-startup',
      'mid-to-big',
      'big-tech',
    ]);
  });

  it('grow in component count as the company scales', () => {
    const counts = templates.map((t) => t.graph.nodes.length);
    const sorted = [...counts].sort((a, b) => a - b);
    expect(counts).toEqual(sorted);
  });

  for (const t of templates) {
    describe(t.name, () => {
      it('has unique node ids and well-formed config', () => {
        const ids = t.graph.nodes.map((n) => n.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const node of t.graph.nodes) {
          expect(node.type).not.toBe('');
          expect(node.config.replicas).toBeGreaterThanOrEqual(1);
        }
      });

      it('only connects edges between existing nodes', () => {
        const ids = new Set(t.graph.nodes.map((n) => n.id));
        for (const edge of t.graph.edges) {
          expect(ids.has(edge.source)).toBe(true);
          expect(ids.has(edge.target)).toBe(true);
        }
      });

      it('defines a positive traffic profile', () => {
        expect(t.traffic.concurrentUsers).toBeGreaterThan(0);
        expect(t.traffic.requestsPerUserMin).toBeGreaterThan(0);
      });
    });
  }
});
