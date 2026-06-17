import { useMutation } from '@tanstack/react-query';
import { Database } from 'lucide-react';
import { api } from '@/lib/api';
import { formatBytes } from '@/lib/agentflow';
import { Spinner } from '@/components/Spinner';
import type { VectorVariant } from '@/types/agentflow';

/** Benchmarks the pure-Go vector engine and shows the real recall ↔ latency ↔
 *  memory trade-off across index families and quantizations. */
export function VectorBenchPanel() {
  const bench = useMutation({
    mutationFn: () => api.vectorBench({ corpusSize: 8000, dim: 128, k: 10, queries: 60 }),
  });
  const r = bench.data;

  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-xs text-ink-faint">
        Builds Flat / IVF / HNSW indexes with scalar &amp; product quantization over a synthetic corpus and measures
        each variant for real.
      </p>
      <button type="button" onClick={() => bench.mutate()} disabled={bench.isPending} className="btn-primary w-full justify-center">
        {bench.isPending ? <Spinner className="h-4 w-4" /> : <Database className="h-4 w-4" />}
        {bench.isPending ? 'Benchmarking…' : 'Run vector benchmark'}
      </button>

      {bench.isError && <p className="text-xs text-danger">{(bench.error as Error).message}</p>}

      {r && (
        <>
          <p className="text-[11px] text-ink-ghost">
            corpus {r.corpusSize.toLocaleString()} · dim {r.dim} · k {r.k} · {r.queries} queries
          </p>
          <div className="overflow-hidden rounded-lg border border-white/[0.06]">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-panel/60 text-ink-ghost">
                <tr>
                  <th className="px-2.5 py-1.5 font-medium">Index</th>
                  <th className="px-2 py-1.5 text-right font-medium">recall@k</th>
                  <th className="px-2 py-1.5 text-right font-medium">p50</th>
                  <th className="px-2.5 py-1.5 text-right font-medium">memory</th>
                </tr>
              </thead>
              <tbody>
                {r.variants.map((v, i) => (
                  <Row key={`${v.name}-${i}`} v={v} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-ink-ghost">
            Higher recall + lower latency + lower memory is better — usually a trade-off. HNSW gets near-exact recall
            fast; product quantization shrinks memory most.
          </p>
        </>
      )}
    </div>
  );
}

function Row({ v }: { v: VectorVariant }) {
  const recallColor = v.recallAtK >= 0.9 ? 'text-accent' : v.recallAtK >= 0.6 ? 'text-amber-300' : 'text-danger';
  return (
    <tr className="border-t border-white/[0.05]">
      <td className="px-2.5 py-1.5 font-mono text-ink">{v.name}</td>
      <td className={`px-2 py-1.5 text-right font-mono ${recallColor}`}>{v.recallAtK.toFixed(3)}</td>
      <td className="px-2 py-1.5 text-right font-mono text-ink-muted">{v.queryP50Ms.toFixed(2)}ms</td>
      <td className="px-2.5 py-1.5 text-right font-mono text-ink-muted">{formatBytes(v.memoryBytes)}</td>
    </tr>
  );
}
