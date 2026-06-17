import {
  ArrowRightToLine,
  CheckCircle2,
  Sparkles,
  Database,
  Boxes,
  Wrench,
  GitBranch,
  Repeat,
  ShieldCheck,
  Merge,
  Circle,
  type LucideIcon,
} from 'lucide-react';

/** Visual identity per agent node type: an accent colour and an icon. */
export interface NodeStyle {
  accent: string;
  icon: LucideIcon;
}

const styles: Record<string, NodeStyle> = {
  input: { accent: '#2fd39e', icon: ArrowRightToLine },
  output: { accent: '#2fd39e', icon: CheckCircle2 },
  llm: { accent: '#a78bfa', icon: Sparkles },
  retriever: { accent: '#4aa3ff', icon: Database },
  embedder: { accent: '#4aa3ff', icon: Boxes },
  tool: { accent: '#f5b14c', icon: Wrench },
  router: { accent: '#f472b6', icon: GitBranch },
  loop: { accent: '#f5b14c', icon: Repeat },
  guardrail: { accent: '#f87171', icon: ShieldCheck },
  aggregator: { accent: '#34d399', icon: Merge },
};

export function nodeStyle(type: string): NodeStyle {
  return styles[type] ?? { accent: '#6b7480', icon: Circle };
}

/** Format a small USD figure with adaptive precision for the sim/cost panels. */
export function formatUsd(value: number): string {
  if (value === 0) return '$0';
  if (value < 0.01) return `$${value.toFixed(5)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

/** Format milliseconds as ms or s depending on magnitude. */
export function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms >= 10) return `${Math.round(ms)} ms`;
  return `${ms.toFixed(1)} ms`;
}

/** Format a byte count as KB/MB. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}
