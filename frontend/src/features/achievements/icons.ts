import {
  Award,
  Database,
  Globe,
  PiggyBank,
  Rocket,
  Users,
  UsersRound,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/** Maps the backend's lucide icon names to components, with a safe fallback. */
const ICONS: Record<string, LucideIcon> = {
  rocket: Rocket,
  users: Users,
  'users-round': UsersRound,
  globe: Globe,
  zap: Zap,
  'piggy-bank': PiggyBank,
  database: Database,
};

export function achievementIcon(name: string): LucideIcon {
  return ICONS[name] ?? Award;
}
