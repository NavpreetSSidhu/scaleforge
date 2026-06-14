import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, CheckCircle2, GraduationCap } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useLearnStore } from '@/store/learnStore';
import { courses, courseBySlug } from '@/data/courses';
import type { Course } from '@/types/domain';
import { LessonPlayer } from './LessonPlayer';

const difficultyColor: Record<Course['difficulty'], string> = {
  Beginner: 'text-accent bg-accent/10',
  Intermediate: 'text-amber bg-amber/10',
  Advanced: 'text-danger bg-danger/10',
};

export function LearnView() {
  const activeCourse = useLearnStore((s) => s.activeCourse);
  const course = activeCourse ? courseBySlug(activeCourse) : undefined;

  if (course) return <LessonPlayer course={course} />;
  return <CourseCatalog />;
}

function CourseCatalog() {
  const openCourse = useLearnStore((s) => s.openCourse);
  const user = useAuthStore((s) => s.user);

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
      ['System Design', courses.filter((c) => c.kind !== 'lld')],
      ['Low-Level Design', courses.filter((c) => c.kind === 'lld')],
    ],
    [],
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/15 text-accent">
            <GraduationCap className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-ink">Learn System &amp; Low-Level Design</h1>
            <p className="text-sm text-ink-faint">
              Step through interactive, animated lessons — system architectures and
              low-level (class &amp; data-structure) designs with copyable code.
            </p>
          </div>
        </div>

        {sections.map(([heading, list]) =>
          list.length === 0 ? null : (
            <section key={heading} className="mb-10 last:mb-0">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-faint">
                {heading}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((c) => {
                  const done = progressBySlug.get(c.slug) ?? 0;
                  const complete = done >= c.steps.length;
                  return (
                    <button
                      key={c.slug}
                      type="button"
                      onClick={() => openCourse(c.slug)}
                      className="group flex flex-col rounded-2xl border border-white/[0.06] bg-surface-panel/50 p-5 text-left transition hover:border-accent/30 hover:bg-surface-panel"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <span className={`chip ${difficultyColor[c.difficulty]}`}>
                          {c.difficulty}
                        </span>
                        <span className="text-[11px] uppercase tracking-wider text-ink-ghost">
                          {c.category}
                        </span>
                      </div>
                      <h3 className="text-base font-semibold text-ink">{c.title}</h3>
                      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-faint">
                        {c.summary}
                      </p>
                      <div className="mt-4 flex items-center justify-between text-xs text-ink-faint">
                        <span className="flex items-center gap-1.5">
                          <BookOpen className="h-3.5 w-3.5" /> {c.steps.length} steps
                        </span>
                        {user && complete ? (
                          <span className="flex items-center gap-1 text-accent">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Completed
                          </span>
                        ) : user && done > 0 ? (
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
                  );
                })}
              </div>
            </section>
          ),
        )}
      </div>
    </div>
  );
}
