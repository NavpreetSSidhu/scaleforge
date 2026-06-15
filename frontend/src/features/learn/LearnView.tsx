import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  MoreVertical,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useLearnStore } from '@/store/learnStore';
import { useSnackbar } from '@/store/snackbarStore';
import type { Course } from '@/types/domain';
import { LessonPlayer } from './LessonPlayer';
import { CourseEditor } from './editor/CourseEditor';
import { useCourses } from './useCourses';

const difficultyColor: Record<Course['difficulty'], string> = {
  Beginner: 'text-accent bg-accent/10',
  Intermediate: 'text-amber bg-amber/10',
  Advanced: 'text-danger bg-danger/10',
};

export function LearnView() {
  const editing = useLearnStore((s) => s.editing);
  const activeCourse = useLearnStore((s) => s.activeCourse);
  const { find } = useCourses();
  const course = activeCourse ? find(activeCourse) : undefined;

  if (editing) return <CourseEditor />;
  if (course) return <LessonPlayer course={course} />;
  return <CourseCatalog />;
}

function CourseCatalog() {
  const openCourse = useLearnStore((s) => s.openCourse);
  const openEditor = useLearnStore((s) => s.openEditor);
  const user = useAuthStore((s) => s.user);
  const openAuthPrompt = useAuthStore((s) => s.openAuthPrompt);
  const { all } = useCourses();

  const { data: progressList } = useQuery({
    queryKey: ['tutor-progress'],
    queryFn: api.getProgress,
    enabled: !!user,
    staleTime: 30_000,
  });
  const progressBySlug = useMemo(() => {
    const map = new Map<string, number>();
    progressList?.forEach((p) => map.set(p.courseSlug, p.completedSteps.length));
    return map;
  }, [progressList]);

  // Group the catalog into System Design and Low-Level Design sections.
  const sections: [string, Course[]][] = useMemo(
    () => [
      ['System Design', all.filter((c) => c.kind !== 'lld')],
      ['Low-Level Design', all.filter((c) => c.kind === 'lld')],
    ],
    [all],
  );

  const onCreate = () => {
    if (!user) {
      openAuthPrompt('Sign in to create and save your own courses.');
      return;
    }
    openEditor();
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/15 text-accent">
              <GraduationCap className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-ink">Learn System &amp; Low-Level Design</h1>
              <p className="text-sm text-ink-faint">
                Step through interactive, animated lessons — or build your own, by hand or with AI.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCreate}
            className="btn-primary flex shrink-0 items-center gap-1.5"
          >
            <Plus className="h-4 w-4" /> Create course
          </button>
        </div>

        {sections.map(([heading, list]) =>
          list.length === 0 ? null : (
            <section key={heading} className="mb-10 last:mb-0">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-faint">
                {heading}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((c) => (
                  <CourseCard
                    key={c.id ?? c.slug}
                    course={c}
                    done={progressBySlug.get(c.slug) ?? 0}
                    showProgress={!!user}
                    onOpen={() => openCourse(c.id ?? c.slug)}
                    onEdit={() => c.id && openEditor(c.id)}
                  />
                ))}
              </div>
            </section>
          ),
        )}
      </div>
    </div>
  );
}

function CourseCard({
  course: c,
  done,
  showProgress,
  onOpen,
  onEdit,
}: {
  course: Course;
  done: number;
  showProgress: boolean;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const queryClient = useQueryClient();
  const pushSnack = useSnackbar((s) => s.push);
  const complete = done >= c.steps.length;

  const deleteCourse = useMutation({
    mutationFn: () => api.deleteCourse(c.id as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-courses'] });
      pushSnack(`Deleted "${c.title}"`, 'success');
    },
    onError: (e: Error) => pushSnack(e.message, 'error'),
  });

  return (
    <div className="group relative flex flex-col rounded-2xl border border-white/[0.06] bg-surface-panel/50 p-5 transition hover:border-accent/30 hover:bg-surface-panel">
      {c.isCustom && (
        <div className="absolute right-3 top-3 z-10">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Course actions"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-ghost transition hover:bg-surface-hover hover:text-ink"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-8 w-36 overflow-hidden rounded-lg border border-white/[0.08] bg-surface-panel shadow-panel"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onEdit();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-muted transition hover:bg-surface-hover hover:text-ink"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  if (confirm(`Delete "${c.title}"? This can't be undone.`)) deleteCourse.mutate();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger transition hover:bg-danger/10"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          )}
        </div>
      )}

      <button type="button" onClick={onOpen} className="flex flex-1 flex-col text-left">
        <div className="mb-3 flex items-center gap-2 pr-6">
          <span className={`chip ${difficultyColor[c.difficulty]}`}>{c.difficulty}</span>
          {c.isCustom && (
            <span className="chip flex items-center gap-1 bg-accent/10 text-accent">
              <Sparkles className="h-3 w-3" /> Custom
            </span>
          )}
          <span className="ml-auto text-[11px] uppercase tracking-wider text-ink-ghost">
            {c.category}
          </span>
        </div>
        <h3 className="text-base font-semibold text-ink">{c.title}</h3>
        <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-faint">{c.summary}</p>
        <div className="mt-4 flex items-center justify-between text-xs text-ink-faint">
          <span className="flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5" /> {c.steps.length} steps
          </span>
          {showProgress && complete ? (
            <span className="flex items-center gap-1 text-accent">
              <CheckCircle2 className="h-3.5 w-3.5" /> Completed
            </span>
          ) : showProgress && done > 0 ? (
            <span className="text-accent/70">
              {done}/{c.steps.length} done
            </span>
          ) : (
            <span className="flex items-center gap-1 text-ink-muted transition group-hover:text-accent">
              Start <ArrowRight className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      </button>
    </div>
  );
}
