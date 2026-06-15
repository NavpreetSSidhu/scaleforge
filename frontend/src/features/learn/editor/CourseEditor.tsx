import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ReactFlowProvider } from 'reactflow';
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  GripVertical,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useCourseEditorStore } from '@/store/courseEditorStore';
import { useLearnStore } from '@/store/learnStore';
import { useSnackbar } from '@/store/snackbarStore';
import type { CourseDifficulty, CourseKind } from '@/types/domain';
import { LessonStage } from '../LessonStage';
import { useCourses } from '../useCourses';
import { CourseDesignCanvas } from './CourseDesignCanvas';
import { EditorPalette } from './EditorPalette';
import { GeneratePanel } from './GeneratePanel';
import { StepEditor } from './StepEditor';

type CenterTab = 'design' | 'preview';

export function CourseEditor() {
  const editingCourseId = useLearnStore((s) => s.editingCourseId);
  const closeEditor = useLearnStore((s) => s.closeEditor);
  const { find } = useCourses();
  const queryClient = useQueryClient();
  const pushSnack = useSnackbar((s) => s.push);

  const editor = useCourseEditorStore();
  const reset = editor.reset;
  const loadFromCourse = editor.loadFromCourse;

  const [tab, setTab] = useState<CenterTab>('design');
  const [showGenerate, setShowGenerate] = useState(false);

  // Load the target course (or a blank draft) exactly once per editing target,
  // so a background refetch of ['my-courses'] never clobbers in-progress edits.
  const loadedRef = useRef<string | null>(null);
  useEffect(() => {
    const key = editingCourseId ?? 'new';
    if (loadedRef.current === key) return;
    if (editingCourseId) {
      const course = find(editingCourseId);
      if (!course) return; // wait until the list query resolves
      loadFromCourse(course);
    } else {
      reset();
    }
    loadedRef.current = key;
  }, [editingCourseId, find, loadFromCourse, reset]);

  const save = useMutation({
    mutationFn: () => {
      const draft = editor.toDraft();
      return editor.editingId
        ? api.updateCourse(editor.editingId, draft)
        : api.createCourse(draft);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-courses'] });
      pushSnack('Course saved', 'success');
      reset();
      closeEditor();
    },
    onError: (e: Error) => pushSnack(e.message, 'error'),
  });

  const onBack = () => {
    reset();
    closeEditor();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Toolbar */}
      <header className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-ink-faint transition hover:text-ink"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> All courses
        </button>
        <h1 className="text-sm font-semibold text-ink">
          {editor.editingId ? 'Edit course' : 'Create a course'}
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowGenerate(true)}
            className="btn-ghost"
          >
            <Sparkles className="h-4 w-4 text-accent" /> Generate with AI
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="btn-primary"
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left: metadata + steps */}
        <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-white/[0.06] bg-surface/40 p-4">
          <MetadataForm />
          <StepList />
          {editor.kind === 'lld' && <SolutionEditor />}
        </aside>

        {/* Center: design / preview */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-1 border-b border-white/[0.06] px-3 py-1.5">
            <TabButton active={tab === 'design'} onClick={() => setTab('design')}>
              Design
            </TabButton>
            <TabButton active={tab === 'preview'} onClick={() => setTab('preview')}>
              Preview
            </TabButton>
          </div>
          <div className="relative min-h-0 flex-1">
            {tab === 'design' ? (
              <div className="flex h-full">
                <EditorPalette />
                <div className="min-w-0 flex-1">
                  <CourseDesignCanvas />
                </div>
              </div>
            ) : (
              <PreviewPane />
            )}
          </div>
        </div>

        {/* Right: selected step */}
        <aside className="w-80 shrink-0 border-l border-white/[0.06] bg-surface/40">
          <StepEditor />
        </aside>
      </div>

      {showGenerate && <GeneratePanel onClose={() => setShowGenerate(false)} />}
    </div>
  );
}

function MetadataForm() {
  const { title, summary, category, difficulty, kind, setMeta, setKind } = useCourseEditorStore();
  return (
    <div className="mb-5 space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-muted">Title</span>
        <input
          value={title}
          onChange={(e) => setMeta({ title: e.target.value })}
          className="input"
          placeholder="e.g. Consistent Hashing"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-muted">Summary</span>
        <textarea
          value={summary}
          onChange={(e) => setMeta({ summary: e.target.value })}
          rows={2}
          className="input resize-y"
          placeholder="One or two sentences shown on the card"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-muted">Type</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as CourseKind)}
            className="input"
          >
            <option value="system-design">System design</option>
            <option value="lld">Low-level design</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-muted">Difficulty</span>
          <select
            value={difficulty}
            onChange={(e) => setMeta({ difficulty: e.target.value as CourseDifficulty })}
            className="input"
          >
            <option>Beginner</option>
            <option>Intermediate</option>
            <option>Advanced</option>
          </select>
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-muted">Category</span>
        <input
          value={category}
          onChange={(e) => setMeta({ category: e.target.value })}
          className="input"
          placeholder="e.g. Scaling, Data Structures"
        />
      </label>
    </div>
  );
}

function StepList() {
  const { steps, selectedStepIndex, setSelectedStep, addStep, removeStep } = useCourseEditorStore();
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Steps</span>
        <button
          type="button"
          onClick={addStep}
          className="flex items-center gap-1 text-xs text-accent transition hover:text-accent-bright"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
      <div className="space-y-1">
        {steps.map((s, i) => (
          <div
            key={s.id}
            className={`group flex items-center gap-2 rounded-lg border px-2 py-1.5 transition ${
              i === selectedStepIndex
                ? 'border-accent/40 bg-accent/10'
                : 'border-white/[0.05] hover:bg-surface-hover/60'
            }`}
          >
            <GripVertical className="h-3.5 w-3.5 shrink-0 text-ink-ghost" />
            <button
              type="button"
              onClick={() => setSelectedStep(i)}
              className="min-w-0 flex-1 truncate text-left text-sm text-ink-muted"
            >
              <span className="mr-1.5 text-ink-ghost">{i + 1}.</span>
              {s.title || 'Untitled step'}
            </button>
            {steps.length > 1 && (
              <button
                type="button"
                onClick={() => removeStep(i)}
                aria-label="Remove step"
                className="shrink-0 text-ink-ghost opacity-0 transition hover:text-danger group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SolutionEditor() {
  const { solution, setSolution } = useCourseEditorStore();
  return (
    <div className="mb-2 border-t border-white/[0.06] pt-4">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-ink-faint">
        Reference solution
      </span>
      <label className="mb-2 block">
        <span className="mb-1 block text-xs font-medium text-ink-muted">Language</span>
        <input
          value={solution?.language ?? 'python'}
          onChange={(e) => setSolution({ language: e.target.value })}
          className="input"
          placeholder="python"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-muted">Code</span>
        <textarea
          value={solution?.code ?? ''}
          onChange={(e) => setSolution({ code: e.target.value })}
          rows={8}
          className="input resize-y font-mono text-xs leading-relaxed"
          placeholder="Full runnable implementation, shown on the last step"
        />
      </label>
    </div>
  );
}

function PreviewPane() {
  const { steps, selectedStepIndex, setSelectedStep, toPreviewCourse } = useCourseEditorStore();
  const course = toPreviewCourse();
  return (
    <div className="flex h-full flex-col">
      <div className="relative min-h-0 flex-1">
        <ReactFlowProvider>
          <LessonStage course={course} stepIndex={selectedStepIndex} />
        </ReactFlowProvider>
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-white/[0.06] px-4 py-2">
        <button
          type="button"
          onClick={() => setSelectedStep(Math.max(0, selectedStepIndex - 1))}
          disabled={selectedStepIndex === 0}
          className="btn-ghost disabled:opacity-30"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <span className="text-xs text-ink-faint">
          {steps[selectedStepIndex]?.title || 'Untitled step'} · {selectedStepIndex + 1}/{steps.length}
        </span>
        <button
          type="button"
          onClick={() => setSelectedStep(Math.min(steps.length - 1, selectedStepIndex + 1))}
          disabled={selectedStepIndex >= steps.length - 1}
          className="btn-ghost disabled:opacity-30"
        >
          Next <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1 text-sm transition ${
        active ? 'bg-accent/15 text-accent' : 'text-ink-faint hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
