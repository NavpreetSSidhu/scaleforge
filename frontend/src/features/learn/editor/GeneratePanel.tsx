import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Sparkles, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useCourseEditorStore } from '@/store/courseEditorStore';
import { useSnackbar } from '@/store/snackbarStore';
import type { CourseDifficulty, CourseKind } from '@/types/domain';
import { useTutorEnabled } from '../TutorDrawer';

/**
 * AI draft generator. Asks the backend for a complete course on a topic, then
 * loads it into the editor for review/editing (it is NOT auto-saved). Reuses the
 * same LLM availability flag as the tutor (same provider key).
 */
export function GeneratePanel({ onClose }: { onClose: () => void }) {
  const enabled = useTutorEnabled();
  const loadFromCourse = useCourseEditorStore((s) => s.loadFromCourse);
  const kind = useCourseEditorStore((s) => s.kind);
  const pushSnack = useSnackbar((s) => s.push);

  const [prompt, setPrompt] = useState('');
  const [genKind, setGenKind] = useState<CourseKind>(kind);
  const [difficulty, setDifficulty] = useState<CourseDifficulty>('Beginner');

  const generate = useMutation({
    mutationFn: () => api.generateCourse({ prompt: prompt.trim(), kind: genKind, difficulty }),
    onSuccess: (course) => {
      loadFromCourse(course);
      pushSnack('Draft generated — review and tweak, then save', 'success');
      onClose();
    },
    onError: (e: Error) => pushSnack(e.message, 'error'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="panel w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Sparkles className="h-4 w-4 text-accent" /> Generate a course with AI
          </h2>
          <button type="button" onClick={onClose} className="text-ink-faint hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!enabled ? (
          <p className="text-sm text-ink-faint">
            AI generation isn&apos;t configured on this server. You can still build a course by hand.
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm text-ink-faint">
              Describe the topic. The AI drafts the diagram, steps, and animation — you review and
              edit everything before saving.
            </p>

            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-medium text-ink-muted">Topic</span>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                autoFocus
                className="input resize-y"
                placeholder="e.g. Consistent hashing for a distributed cache"
              />
            </label>

            <div className="mb-5 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink-muted">Type</span>
                <select
                  value={genKind}
                  onChange={(e) => setGenKind(e.target.value as CourseKind)}
                  className="input"
                >
                  <option value="system-design">System design (HLD)</option>
                  <option value="lld">Low-level design (LLD)</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink-muted">Difficulty</span>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as CourseDifficulty)}
                  className="input"
                >
                  <option>Beginner</option>
                  <option>Intermediate</option>
                  <option>Advanced</option>
                </select>
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="btn-ghost">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => generate.mutate()}
                disabled={!prompt.trim() || generate.isPending}
                className="btn-primary"
              >
                {generate.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Generate
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
