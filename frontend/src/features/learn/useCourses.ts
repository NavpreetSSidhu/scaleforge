import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { courses as builtInCourses } from '@/data/courses';
import type { Course } from '@/types/domain';

/**
 * Merges the static built-in courses with the signed-in user's saved courses
 * into one catalog the rest of the Learn module consumes. find() resolves a
 * course by its user-course id first, then by built-in slug — so the player and
 * catalog treat both kinds identically.
 */
export function useCourses() {
  const user = useAuthStore((s) => s.user);

  const { data: userCourses } = useQuery({
    queryKey: ['my-courses'],
    queryFn: api.listCourses,
    enabled: !!user,
    staleTime: 30_000,
  });

  const all = useMemo<Course[]>(
    () => [...builtInCourses, ...(userCourses ?? [])],
    [userCourses],
  );

  const find = useCallback(
    (key: string): Course | undefined =>
      all.find((c) => c.id === key) ?? all.find((c) => c.slug === key),
    [all],
  );

  return { all, builtIn: builtInCourses, userCourses: userCourses ?? [], find };
}
