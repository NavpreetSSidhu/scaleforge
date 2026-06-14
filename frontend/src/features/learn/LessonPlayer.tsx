import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ReactFlowProvider } from 'reactflow';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ClipboardCopy,
  GraduationCap,
  MessageCircleQuestion,
  Play,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useArchitectureStore } from '@/store/architectureStore';
import { useAuthStore } from '@/store/authStore';
import { useLearnStore } from '@/store/learnStore';
import { useSnackbar } from '@/store/snackbarStore';
import type { Course } from '@/types/domain';
import { useTutorEnabled } from './TutorDrawer';
import { LessonStage } from './LessonStage';
import { Markdown } from './Markdown';

export function LessonPlayer({ course }: { course: Course }) {
  const { stepIndex, setStep, closeCourse, openDrawer } = useLearnStore();
  const { setNodes, setEdges, setName, setView } = useArchitectureStore();
  const user = useAuthStore((s) => s.user);
  const openAuthPrompt = useAuthStore((s) => s.openAuthPrompt);
  const pushSnack = useSnackbar((s) => s.push);
  const queryClient = useQueryClient();
  const tutorEnabled = useTutorEnabled();

  const step = course.steps[stepIndex];
  const isLast = stepIndex === course.steps.length - 1;
  const isLld = course.kind === 'lld';

  // Server-backed progress for signed-in users; guests track locally this session.
  const { data: progressList } = useQuery({
    queryKey: ['tutor-progress'],
    queryFn: api.getProgress,
    enabled: !!user,
    staleTime: 30_000,
  });
  const serverCompleted = useMemo(
    () => progressList?.find((p) => p.courseSlug === course.slug)?.completedSteps ?? [],
    [progressList, course.slug],
  );

  const [completed, setCompleted] = useState<Set<number>>(new Set());
  useEffect(() => {
    setCompleted(new Set(serverCompleted));
  }, [serverCompleted]);

  const saveProgress = useMutation({
    mutationFn: (steps: number[]) =>
      api.updateProgress(course.slug, {
        completedSteps: steps,
        completed: steps.length >= course.steps.length,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tutor-progress'] }),
  });

  const markComplete = (index: number) => {
    const next = new Set(completed).add(index);
    setCompleted(next);
    if (user) saveProgress.mutate([...next].sort((a, b) => a - b));
  };

  const goTo = (index: number) => {
    if (index < 0 || index >= course.steps.length) return;
    setStep(index);
  };

  const next = () => {
    markComplete(stepIndex);
    if (!isLast) goTo(stepIndex + 1);
  };

  const tryOnCanvas = () => {
    setName(course.title);
    setNodes(course.graph.nodes);
    setEdges(course.graph.edges);
    setView('builder');
    pushSnack(`Loaded "${course.title}" onto the canvas — hit Run to simulate`, 'success');
  };

  const copySolution = async () => {
    if (!course.solution) return;
    try {
      await navigator.clipboard.writeText(course.solution.code);
      pushSnack('Full solution copied to clipboard', 'success');
    } catch {
      pushSnack('Could not access the clipboard', 'error');
    }
  };

  return (
    <div className="flex min-h-0 flex-1">
      {/* Lesson panel */}
      <aside className="flex w-full max-w-md shrink-0 flex-col border-r border-white/[0.06] bg-surface/40">
        <header className="shrink-0 border-b border-white/[0.06] px-5 py-3">
          <button
            type="button"
            onClick={closeCourse}
            className="mb-2 flex items-center gap-1 text-xs text-ink-faint transition hover:text-ink"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> All courses
          </button>
          <div className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold text-ink">{course.title}</h2>
          </div>
          {/* Progress dots */}
          <div className="mt-3 flex items-center gap-1.5">
            {course.steps.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Go to step ${i + 1}`}
                className={`h-1.5 flex-1 rounded-full transition ${
                  i === stepIndex
                    ? 'bg-accent'
                    : completed.has(i)
                      ? 'bg-accent/40'
                      : 'bg-white/[0.08] hover:bg-white/20'
                }`}
              />
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-ink-ghost">
            Step {stepIndex + 1} of {course.steps.length}
            {!user && ' · sign in to save progress'}
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-ink">
            {completed.has(stepIndex) && <Check className="h-4 w-4 text-accent" />}
            {step.title}
          </h3>
          <Markdown>{step.body}</Markdown>

          {isLld && isLast && course.solution && (
            <div className="mt-4 border-t border-white/[0.06] pt-4">
              <h4 className="mb-1 text-sm font-semibold text-ink">Full implementation</h4>
              <p className="mb-1 text-xs text-ink-faint">
                The complete reference solution — copy it and run it locally.
              </p>
              <Markdown>
                {`\`\`\`${course.solution.language}\n${course.solution.code}\n\`\`\``}
              </Markdown>
            </div>
          )}

          {tutorEnabled && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openDrawer('teacher')}
                className="flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-xs text-accent transition hover:bg-accent/20"
              >
                <Sparkles className="h-3.5 w-3.5" /> Explain more
              </button>
              <button
                type="button"
                onClick={() => openDrawer('qna')}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-surface-panel/60 px-2.5 py-1.5 text-xs text-ink-muted transition hover:text-ink"
              >
                <MessageCircleQuestion className="h-3.5 w-3.5" /> Ask a question
              </button>
            </div>
          )}
        </div>

        <footer className="shrink-0 space-y-2 border-t border-white/[0.06] p-3">
          {isLld ? (
            <button
              type="button"
              onClick={copySolution}
              disabled={!course.solution}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-surface-panel/60 px-3 py-2 text-sm text-ink-muted transition hover:text-ink disabled:opacity-30"
            >
              <ClipboardCopy className="h-4 w-4" /> Copy full solution
            </button>
          ) : (
            <button
              type="button"
              onClick={tryOnCanvas}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-surface-panel/60 px-3 py-2 text-sm text-ink-muted transition hover:text-ink"
            >
              <Play className="h-4 w-4" /> Try it on canvas
            </button>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goTo(stepIndex - 1)}
              disabled={stepIndex === 0}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-2 text-sm text-ink-muted transition hover:text-ink disabled:opacity-30"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            {isLast ? (
              <button
                type="button"
                onClick={() => {
                  markComplete(stepIndex);
                  if (!user) {
                    openAuthPrompt('Sign in to save your course progress.');
                  } else {
                    pushSnack(`Course complete — nice work!`, 'success');
                  }
                }}
                className="btn-primary flex-1 justify-center"
              >
                <Check className="h-4 w-4" /> Finish course
              </button>
            ) : (
              <button type="button" onClick={next} className="btn-primary flex-1 justify-center">
                Next <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </footer>
      </aside>

      {/* Animated stage */}
      <div className="relative min-w-0 flex-1">
        <ReactFlowProvider>
          <LessonStage course={course} stepIndex={stepIndex} />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
