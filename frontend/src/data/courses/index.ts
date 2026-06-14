import type { Course } from '@/types/domain';
import { rateLimiting } from './rateLimiting';
import { caching } from './caching';
import { loadBalancing } from './loadBalancing';
import { databaseReplication } from './databaseReplication';
import { databaseSharding } from './databaseSharding';
import { messageQueues } from './messageQueues';
import { distributedLogging } from './distributedLogging';

/** Authored system-design courses, in catalog display order (roughly easy → hard). */
export const courses: Course[] = [
  loadBalancing,
  caching,
  rateLimiting,
  databaseReplication,
  messageQueues,
  databaseSharding,
  distributedLogging,
];

export const courseBySlug = (slug: string): Course | undefined =>
  courses.find((c) => c.slug === slug);
