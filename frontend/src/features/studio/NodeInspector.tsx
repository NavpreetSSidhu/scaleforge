import { Trash2 } from 'lucide-react';
import { nodeStyle } from '@/lib/agentflow';
import { useStudioStore } from '@/store/studioStore';
import type { AgentNodeConfig } from '@/types/agentflow';

/** Right-rail editor for the selected node's label + per-type configuration. */
export function NodeInspector() {
  const { nodes, selectedNodeId, setNodeLabel, updateNodeConfig, removeNode } = useStudioStore();
  const node = nodes.find((n) => n.id === selectedNodeId);

  if (!node) {
    return (
      <div className="px-4 py-6 text-center text-xs text-ink-faint">
        Select a step to edit its settings.
      </div>
    );
  }

  const { accent, icon: Icon } = nodeStyle(node.type);
  const cfg = node.config;
  const set = (patch: Partial<AgentNodeConfig>) => updateNodeConfig(node.id, patch);

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: `${accent}22`, color: accent }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wide text-ink-ghost">{node.type}</div>
        </div>
        <button
          type="button"
          onClick={() => removeNode(node.id)}
          aria-label="Delete step"
          className="rounded-lg border border-white/[0.06] p-1.5 text-ink-faint transition hover:border-danger/40 hover:text-danger"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <Field label="Label">
        <input className="input" value={node.label} onChange={(e) => setNodeLabel(node.id, e.target.value)} />
      </Field>

      {node.type === 'llm' && (
        <>
          <Field label="Model">
            <input className="input" value={cfg.model ?? ''} onChange={(e) => set({ model: e.target.value })} />
          </Field>
          <Field label="System prompt">
            <textarea
              className="input min-h-[96px] resize-y"
              value={cfg.prompt ?? ''}
              onChange={(e) => set({ prompt: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Temperature · ${(cfg.temperature ?? 0).toFixed(1)}`}>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={cfg.temperature ?? 0.3}
                onChange={(e) => set({ temperature: Number(e.target.value) })}
                className="w-full accent-accent"
              />
            </Field>
            <NumberField label="Max tokens" value={cfg.maxTokens} onChange={(v) => set({ maxTokens: v })} />
          </div>
        </>
      )}

      {node.type === 'retriever' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Index">
              <select className="input" value={cfg.indexType ?? 'hnsw'} onChange={(e) => set({ indexType: e.target.value as AgentNodeConfig['indexType'] })}>
                <option value="flat">Flat (exact)</option>
                <option value="ivf">IVF</option>
                <option value="hnsw">HNSW</option>
              </select>
            </Field>
            <Field label="Quantization">
              <select className="input" value={cfg.quantization ?? 'none'} onChange={(e) => set({ quantization: e.target.value as AgentNodeConfig['quantization'] })}>
                <option value="none">None</option>
                <option value="scalar">Scalar</option>
                <option value="product">Product</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <NumberField label="top-k" value={cfg.topK} onChange={(v) => set({ topK: v })} />
            <NumberField label="dim" value={cfg.dim} onChange={(v) => set({ dim: v })} />
            <NumberField label="corpus" value={cfg.corpusSize} onChange={(v) => set({ corpusSize: v })} />
          </div>
        </>
      )}

      {node.type === 'embedder' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Model">
            <input className="input" value={cfg.model ?? ''} onChange={(e) => set({ model: e.target.value })} />
          </Field>
          <NumberField label="dim" value={cfg.dim} onChange={(v) => set({ dim: v })} />
        </div>
      )}

      {node.type === 'tool' && (
        <>
          <Field label="Tool name">
            <input className="input" value={cfg.toolName ?? ''} onChange={(e) => set({ toolName: e.target.value })} />
          </Field>
          <Field label="Args schema (JSON)">
            <textarea
              className="input min-h-[80px] resize-y font-mono text-xs"
              value={cfg.toolSchema ?? ''}
              onChange={(e) => set({ toolSchema: e.target.value })}
            />
          </Field>
        </>
      )}

      {node.type === 'router' && (
        <Field label="Condition">
          <input className="input" value={cfg.condition ?? ''} onChange={(e) => set({ condition: e.target.value })} />
        </Field>
      )}

      {node.type === 'loop' && (
        <NumberField label="Max iterations" value={cfg.maxIterations} onChange={(v) => set({ maxIterations: v })} />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-ghost">{label}</span>
      {children}
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value?: number; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      <input
        type="number"
        className="input"
        value={value ?? 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Field>
  );
}
