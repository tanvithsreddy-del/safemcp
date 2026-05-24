// Pure runtime helpers — usable from dynamic pages without pulling in
// build-time data (servers.json etc).

import type { Server } from "./data";

/**
 * Returns a freshness string like "3 mo ago" or null if no date data is available.
 * Tries multiple possible date columns since schema may vary.
 */
export function freshness(server: Server): string | null {
  const candidates = [
    "github_pushed_at",
    "pushed_at",
    "github_updated_at",
    "updated_at",
    "last_commit_at",
    "llm_verified_at",
  ];
  let raw: string | null = null;
  for (const k of candidates) {
    const v = (server as any)[k];
    if (typeof v === "string" && v.length > 0) {
      raw = v;
      break;
    }
  }
  if (!raw) return null;
  const t = Date.parse(raw);
  if (isNaN(t)) return null;
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}
