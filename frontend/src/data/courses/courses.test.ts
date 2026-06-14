import { describe, expect, it } from 'vitest';
import { courses, courseBySlug } from './index';

describe('authored courses', () => {
  it('have unique slugs', () => {
    const slugs = courses.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('are resolvable by slug', () => {
    for (const c of courses) {
      expect(courseBySlug(c.slug)).toBe(c);
    }
    expect(courseBySlug('does-not-exist')).toBeUndefined();
  });

  describe.each(courses)('$slug', (course) => {
    const nodeIds = new Set(course.graph.nodes.map((n) => n.id));
    const edgeIds = new Set(course.graph.edges.map((e) => e.id));

    it('has at least one step and node', () => {
      expect(course.steps.length).toBeGreaterThan(0);
      expect(course.graph.nodes.length).toBeGreaterThan(0);
    });

    it('edges reference real nodes', () => {
      for (const e of course.graph.edges) {
        expect(nodeIds.has(e.source)).toBe(true);
        expect(nodeIds.has(e.target)).toBe(true);
      }
    });

    it('every step references only real node/edge ids', () => {
      for (const step of course.steps) {
        for (const id of step.revealNodeIds) expect(nodeIds.has(id)).toBe(true);
        for (const id of step.revealEdgeIds) expect(edgeIds.has(id)).toBe(true);
        if (step.focusNodeId) {
          expect(nodeIds.has(step.focusNodeId)).toBe(true);
          // A focused node must be revealed in its own step.
          expect(step.revealNodeIds).toContain(step.focusNodeId);
        }
      }
    });

    it('reveals are cumulative and end with the full graph', () => {
      const last = course.steps[course.steps.length - 1];
      expect(new Set(last.revealNodeIds)).toEqual(nodeIds);
      expect(new Set(last.revealEdgeIds)).toEqual(edgeIds);
    });
  });
});
