import type { Graph, TrafficProfile } from '@/types/domain';

export interface ArchitectureSnapshot {
  name: string;
  graph: Graph;
  traffic: TrafficProfile;
}

/** Pretty JSON for an architecture export. */
export function toExportJson(snapshot: ArchitectureSnapshot): string {
  return JSON.stringify({ version: 1, ...snapshot }, null, 2);
}

/** Trigger a client-side download of the architecture as a `.json` file. */
export function downloadArchitecture(snapshot: ArchitectureSnapshot) {
  const blob = new Blob([toExportJson(snapshot)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug(snapshot.name)}.scaleforge.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function slug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'architecture';
}

const HASH_PREFIX = '#a=';

/** Base64-encode an architecture into a shareable URL (state lives in the hash). */
export function buildShareLink(snapshot: ArchitectureSnapshot): string {
  const json = JSON.stringify(snapshot);
  const encoded = base64UrlEncode(json);
  return `${window.location.origin}${window.location.pathname}${HASH_PREFIX}${encoded}`;
}

/** Decode an architecture from the current URL hash, if present. */
export function readShareLink(): ArchitectureSnapshot | null {
  const hash = window.location.hash;
  if (!hash.startsWith(HASH_PREFIX)) return null;
  try {
    const json = base64UrlDecode(hash.slice(HASH_PREFIX.length));
    const parsed = JSON.parse(json) as ArchitectureSnapshot;
    if (parsed?.graph?.nodes && parsed.traffic) return parsed;
  } catch {
    /* ignore malformed share links */
  }
  return null;
}

function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): string {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
