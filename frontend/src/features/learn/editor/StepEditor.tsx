import { useCourseEditorStore } from '@/store/courseEditorStore';

/**
 * Right-pane editor for the selected step: prose plus the animation
 * choreography. Reveal checkboxes pick which nodes/edges are visible by this
 * step (cumulative build-up); focus spotlights one revealed node with a callout.
 */
export function StepEditor() {
  const { steps, selectedStepIndex, nodes, edges, updateStep, toggleReveal, setFocus } =
    useCourseEditorStore();
  const step = steps[selectedStepIndex];

  if (!step) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-ink-faint">
        Add a step to begin.
      </div>
    );
  }

  const labelOf = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;
  const revealedNodes = nodes.filter((n) => step.revealNodeIds.includes(n.id));

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
        Step {selectedStepIndex + 1} of {steps.length}
      </p>

      <Field label="Title">
        <input
          value={step.title}
          onChange={(e) => updateStep(selectedStepIndex, { title: e.target.value })}
          className="input"
          placeholder="e.g. Add a cache"
        />
      </Field>

      <Field label="Explanation (markdown)">
        <textarea
          value={step.body}
          onChange={(e) => updateStep(selectedStepIndex, { body: e.target.value })}
          rows={6}
          className="input resize-y font-mono text-xs leading-relaxed"
          placeholder="Explain the why. Use **markdown** and ```code``` fences."
        />
      </Field>

      <Field label="Reveal nodes">
        {nodes.length === 0 ? (
          <p className="text-xs text-ink-ghost">Add nodes on the canvas first.</p>
        ) : (
          <div className="space-y-1">
            {nodes.map((n) => (
              <CheckRow
                key={n.id}
                checked={step.revealNodeIds.includes(n.id)}
                onChange={() => toggleReveal(selectedStepIndex, 'node', n.id)}
                label={n.label}
              />
            ))}
          </div>
        )}
      </Field>

      {edges.length > 0 && (
        <Field label="Reveal edges">
          <div className="space-y-1">
            {edges.map((e) => (
              <CheckRow
                key={e.id}
                checked={step.revealEdgeIds.includes(e.id)}
                onChange={() => toggleReveal(selectedStepIndex, 'edge', e.id)}
                label={`${labelOf(e.source)} → ${labelOf(e.target)}`}
              />
            ))}
          </div>
        </Field>
      )}

      <Field label="Spotlight (focus a revealed node)">
        <select
          value={step.focusNodeId ?? ''}
          onChange={(e) =>
            e.target.value
              ? setFocus(selectedStepIndex, e.target.value)
              : updateStep(selectedStepIndex, { focusNodeId: undefined })
          }
          className="input"
        >
          <option value="">No spotlight</option>
          {revealedNodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label}
            </option>
          ))}
        </select>
      </Field>

      {step.focusNodeId && (
        <Field label="Callout">
          <input
            value={step.callout ?? ''}
            onChange={(e) => updateStep(selectedStepIndex, { callout: e.target.value })}
            className="input"
            placeholder="Short bubble beside the spotlighted node"
          />
        </Field>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1 block text-xs font-medium text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

function CheckRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm text-ink-muted transition hover:bg-surface-hover/60">
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-accent" />
      <span className="truncate">{label}</span>
    </label>
  );
}
