import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Download, Copy, Check, FileCode2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/Spinner';
import { useSnackbar } from '@/store/snackbarStore';
import { useStudioStore } from '@/store/studioStore';
import type { ExportTarget } from '@/types/agentflow';

const ALL_TARGETS: { id: ExportTarget; label: string }[] = [
  { id: 'langgraph', label: 'LangGraph (Python)' },
  { id: 'langchain', label: 'LangChain (Python)' },
  { id: 'go', label: 'Go (runnable)' },
  { id: 'portable', label: 'JSON + Mermaid + Prompts' },
];

/** Generates runnable scaffolds + a portable spec for the current workflow and
 *  lets the user copy or download each file. */
export function ExportPanel() {
  const { name, description, graph } = useStudioStore();
  const [targets, setTargets] = useState<ExportTarget[]>(['langgraph', 'go', 'portable']);
  const [activeFile, setActiveFile] = useState(0);
  const [copied, setCopied] = useState(false);
  const pushSnack = useSnackbar((s) => s.push);

  const exporter = useMutation({
    mutationFn: () => api.exportWorkflow({ name, description, graph: graph(), targets }),
    onSuccess: () => setActiveFile(0),
  });
  const files = exporter.data?.files ?? [];
  const file = files[activeFile];

  const toggle = (t: ExportTarget) =>
    setTargets((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const copy = async () => {
    if (!file) return;
    await navigator.clipboard.writeText(file.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    if (!file) return;
    const blob = new Blob([file.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
    pushSnack(`Downloaded ${file.name}`, 'success');
  };

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex flex-wrap gap-1.5">
        {ALL_TARGETS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => toggle(t.id)}
            className={`chip cursor-pointer ${targets.includes(t.id) ? 'bg-accent/15 text-accent' : 'bg-surface-panel/60 text-ink-faint'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => exporter.mutate()}
        disabled={exporter.isPending || targets.length === 0}
        className="btn-primary w-full justify-center"
      >
        {exporter.isPending ? <Spinner className="h-4 w-4" /> : <FileCode2 className="h-4 w-4" />}
        Generate code
      </button>

      {exporter.isError && <p className="text-xs text-danger">{(exporter.error as Error).message}</p>}

      {files.length > 0 && (
        <>
          <div className="flex flex-wrap gap-1">
            {files.map((f, i) => (
              <button
                key={f.name}
                type="button"
                onClick={() => setActiveFile(i)}
                className={`rounded-md px-2 py-1 font-mono text-[11px] transition ${
                  i === activeFile ? 'bg-surface-panel text-ink ring-1 ring-white/[0.08]' : 'text-ink-faint hover:text-ink-muted'
                }`}
              >
                {f.name}
              </button>
            ))}
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-white/[0.06] bg-[#0b0d12]">
            <div className="absolute right-2 top-2 z-10 flex gap-1">
              <IconBtn onClick={copy} label="Copy">{copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}</IconBtn>
              <IconBtn onClick={download} label="Download"><Download className="h-3.5 w-3.5" /></IconBtn>
            </div>
            <pre className="h-full overflow-auto p-3 text-[11px] leading-relaxed text-ink-muted">
              <code>{file?.content}</code>
            </pre>
          </div>
        </>
      )}
    </div>
  );
}

function IconBtn({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-md border border-white/[0.08] bg-surface-panel/80 p-1.5 text-ink-faint transition hover:text-ink"
    >
      {children}
    </button>
  );
}
