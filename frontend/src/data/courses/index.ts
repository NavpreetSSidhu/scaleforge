import type { Course } from '@/types/domain';
import { rateLimiting } from './rateLimiting';
import { caching } from './caching';
import { loadBalancing } from './loadBalancing';
import { databaseReplication } from './databaseReplication';
import { databaseSharding } from './databaseSharding';
import { messageQueues } from './messageQueues';
import { distributedLogging } from './distributedLogging';
import { lruCache } from './lruCache';
import { lfuCache } from './lfuCache';
import { rateLimiterLld } from './rateLimiterLld';
import { parkingLot } from './parkingLot';

/**
 * Authored courses, in catalog display order. System-design courses teach an
 * infra graph; low-level-design (kind: 'lld') courses teach a class /
 * data-structure diagram + copyable code. LearnView groups them by kind.
 */
export const courses: Course[] = [
  // System design
  loadBalancing,
  caching,
  rateLimiting,
  databaseReplication,
  messageQueues,
  databaseSharding,
  distributedLogging,
  // Low-level design
  lruCache,
  lfuCache,
  rateLimiterLld,
  parkingLot,
];

export const courseBySlug = (slug: string): Course | undefined =>
  courses.find((c) => c.slug === slug);
