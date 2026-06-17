import { describe, expect, it } from 'vitest';
import { formatBytes, formatMs, formatUsd, nodeStyle } from './agentflow';

describe('agentflow formatters', () => {
  it('formats latency as ms or s', () => {
    expect(formatMs(5.4)).toBe('5.4 ms');
    expect(formatMs(250)).toBe('250 ms');
    expect(formatMs(1750)).toBe('1.75 s');
  });

  it('formats cost with adaptive precision', () => {
    expect(formatUsd(0)).toBe('$0');
    expect(formatUsd(0.0007)).toBe('$0.00070');
    expect(formatUsd(0.42)).toBe('$0.420');
    expect(formatUsd(12.5)).toBe('$12.50');
  });

  it('formats bytes as KB/MB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.00 MB');
  });

  it('gives a distinct style per known type and a fallback', () => {
    expect(nodeStyle('llm').accent).not.toBe(nodeStyle('retriever').accent);
    expect(nodeStyle('unknown-type').accent).toBe('#6b7480');
  });
});
