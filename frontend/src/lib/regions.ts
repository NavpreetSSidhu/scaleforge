export const DEFAULT_REGION = 'us-east-1';

const REGION_PALETTE = ['#4aa3ff', '#2fd39e', '#7c74ff', '#f5b14b', '#f47bd0', '#8fd14f'];

/** Stable accent colour for a region name. */
export function regionAccent(region: string): string {
  let hash = 0;
  for (let i = 0; i < region.length; i++) {
    hash = (hash * 31 + region.charCodeAt(i)) >>> 0;
  }
  return REGION_PALETTE[hash % REGION_PALETTE.length];
}

export function regionOf(region?: string): string {
  return region && region.trim() ? region : DEFAULT_REGION;
}
