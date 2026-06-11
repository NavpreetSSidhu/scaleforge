import { useQuery } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { categoryStyle, iconFor } from '@/lib/catalog';
import { compact, compactUsd } from '@/lib/format';
import { useRuntimes } from '@/features/shell/useRuntimes';
import { useArchitectureStore } from '@/store/architectureStore';
import type { GraphNode, NodeDefinition } from '@/types/domain';

function nodeCapacity(
  def: NodeDefinition | undefined,
  config: GraphNode['config'],
  runtimeFactor = 1,
): number {
  if (!def) return 0;
  const replicas = config.replicas > 0 ? config.replicas : 1;
  const cpuMultiplier = config.cpu > 0 ? config.cpu / 2 : 1;
  return def.perInstanceCapacityRps * replicas * cpuMultiplier * runtimeFactor;
}

function nodeCost(def: NodeDefinition | undefined, config: GraphNode['config']): number {
  if (!def) return 0;
  return def.unitMonthlyCostUsd * Math.max(config.replicas, 1);
}

export function NodeProperties({ node }: { node: GraphNode }) {
  const { updateNodeConfig, updateNodeLabel, removeNode } = useArchitectureStore();
  const { data: catalog } = useQuery({
    queryKey: ['catalog'],
    queryFn: async () => (await api.getCatalog()).nodes,
  });

  const { data: runtimeCatalog } = useRuntimes();

  const def = catalog?.find((d) => d.type === node.type);
  const category = def?.category ?? 'compute';
  const style = categoryStyle(category);
  const Icon = iconFor(node.type, category);

  // Runtime only meaningfully applies to compute components (the user's code).
  const isCompute = category === 'compute';
  const runtimes = runtimeCatalog?.runtimes ?? [];
  const defaultRuntimeId = runtimeCatalog?.defaultRuntimeId ?? 'go';
  const selectedRuntime = node.config.runtime || defaultRuntimeId;
  const runtimeFactor = isCompute
    ? runtimes.find((r) => r.id === selectedRuntime)?.throughputFactor ?? 1
    : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${style.accent}1f`, color: style.accent }}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="truncate font-semibold text-ink">{node.label}</div>
          <div className="font-mono text-[11px] text-ink-faint">{node.type}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Capacity" value={`${compact(nodeCapacity(def, node.config, runtimeFactor))} rps`} accent={style.accent} />
        <Stat label="Cost" value={`${compactUsd(nodeCost(def, node.config))}/mo`} />
      </div>

      <Field label="Label">
        <input
          type="text"
          value={node.label}
          onChange={(e) => updateNodeLabel(node.id, e.target.value)}
          className="input"
        />
      </Field>

      {isCompute && runtimes.length > 0 && (
        <Field label="Runtime / language">
          <select
            value={selectedRuntime}
            onChange={(e) => updateNodeConfig(node.id, { runtime: e.target.value })}
            className="input"
          >
            {runtimes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="vCPU">
          <input
            type="number"
            min={0}
            value={node.config.cpu}
            onChange={(e) => updateNodeConfig(node.id, { cpu: Number(e.target.value) })}
            className="input"
          />
        </Field>
        <Field label="Memory (GB)">
          <input
            type="number"
            min={0}
            value={node.config.memory}
            onChange={(e) => updateNodeConfig(node.id, { memory: Number(e.target.value) })}
            className="input"
          />
        </Field>
      </div>

      <Field label={`Replicas — ${node.config.replicas}`}>
        <input
          type="range"
          min={1}
          max={12}
          value={node.config.replicas}
          onChange={(e) => updateNodeConfig(node.id, { replicas: Number(e.target.value) })}
          className="w-full accent-accent"
        />
      </Field>

      <label className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-surface-panel/50 px-3 py-2.5 text-sm">
        <span className="text-ink-muted">Autoscaling</span>
        <input
          type="checkbox"
          checked={node.config.autoscaling}
          onChange={(e) => updateNodeConfig(node.id, { autoscaling: e.target.checked })}
          className="h-4 w-4 accent-accent"
        />
      </label>

      <Field label="Region">
        <input
          type="text"
          value={node.config.region ?? ''}
          onChange={(e) => updateNodeConfig(node.id, { region: e.target.value })}
          className="input"
        />
      </Field>

      <button
        type="button"
        onClick={() => removeNode(node.id)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-danger/30 px-3 py-2 text-sm text-danger transition hover:bg-danger/10"
      >
        <Trash2 className="h-4 w-4" /> Remove node
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs text-ink-faint">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-surface-panel/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-ink-faint">{label}</div>
      <div className="font-mono text-sm font-semibold" style={{ color: accent ?? '#eef0f4' }}>
        {value}
      </div>
    </div>
  );
}
