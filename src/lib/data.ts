// Data loaders. JSON files come from scripts/export_data.py.
//
// At build time Astro imports these statically — no runtime fetch needed.

import servers from "../data/servers.json";
import categories from "../data/categories.json";
import top from "../data/top.json";
import manualSubmissions from "../data/manual_submissions.json";

export type Server = {
  id?: number;
  name: string;
  owner: string;
  repo_url: string;
  description: string | null;
  stars: number | null;
  forks: number | null;
  runtime: string | null;
  sources: string | null;
  is_mcp_server: boolean;
  mcp_confidence: number | null;
  mcp_category: string | null;
  mcp_tags: string | null;
  primary_function: string | null;
  is_list_or_tutorial: boolean;
  is_sdk_or_framework: boolean;
  requires_api_key: boolean | null;
  recommended_score: number | null;
  // Optional component breakdown if your DB stores them
  _confidence_pts?: number | null;
  _popularity_pts?: number | null;
  _sources_pts?: number | null;
  _discoverability_pts?: number | null;
  _category_pts?: number | null;
  llm_verified_at?: string | null;
  [k: string]: unknown;
};

export type CategorySummary = {
  slug: string;
  name: string;
  count: number;
  avg_score: number;
  top5: Array<{ name: string; owner: string; score: number; stars: number }>;
};

const generatedServers = servers as unknown as Server[];
const manualServers = manualSubmissions as unknown as Server[];
const manualKeys = new Set(manualServers.map((s) => `${s.owner}/${s.name}`.toLowerCase()));

export const allServers = [
  ...generatedServers.filter((s) => !manualKeys.has(`${s.owner}/${s.name}`.toLowerCase())),
  ...manualServers,
];
export const allCategories = categories as unknown as CategorySummary[];
export const topServers = top as unknown as Server[];

// Categories sorted alphabetically, but "other" and "unknown" pushed to the end.
// This is what the homepage and browse page should use.
export const categoriesAlphabetical: CategorySummary[] = (() => {
  const main: CategorySummary[] = [];
  const tail: CategorySummary[] = [];
  for (const c of allCategories) {
    const slug = c.slug.toLowerCase();
    if (slug === "other" || slug === "unknown") tail.push(c);
    else main.push(c);
  }
  main.sort((a, b) => a.name.localeCompare(b.name));
  tail.sort((a, b) => a.name.localeCompare(b.name));
  return [...main, ...tail];
})();

export function serversByCategory(slug: string): Server[] {
  return allServers.filter((s) => (s.mcp_category || "unknown") === slug);
}

export function findServer(owner: string, name: string): Server | undefined {
  return allServers.find((s) => s.owner === owner && s.name === name);
}

export function similarServers(server: Server, limit = 5): Server[] {
  const cat = server.mcp_category || "unknown";
  return allServers
    .filter((s) => s.mcp_category === cat && !(s.owner === server.owner && s.name === server.name))
    .slice(0, limit);
}

export function totalCount(): number {
  return allServers.length;
}

/**
 * Compute the score distribution across the entire corpus.
 * Used for the score distribution chart on the home page.
 */
export function scoreDistribution(): { bucket: string; count: number; pct: number }[] {
  const buckets = [
    { lo: 80, hi: 100, bucket: "80-100" },
    { lo: 60, hi: 79,  bucket: "60-79" },
    { lo: 40, hi: 59,  bucket: "40-59" },
    { lo: 20, hi: 39,  bucket: "20-39" },
    { lo: 0,  hi: 19,  bucket: "0-19" },
  ];
  const total = allServers.length || 1;
  return buckets.map(b => {
    const count = allServers.filter(s => {
      const v = s.recommended_score ?? 0;
      return v >= b.lo && v <= b.hi;
    }).length;
    return { bucket: b.bucket, count, pct: Math.round((count / total) * 1000) / 10 };
  });
}

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
    if (typeof v === "string" && v.length > 0) { raw = v; break; }
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

/**
 * Counts of servers per runtime, for filter UI.
 */
export function runtimeCounts(): { runtime: string; count: number }[] {
  const m = new Map<string, number>();
  for (const s of allServers) {
    const r = (s.runtime || "unknown").toLowerCase();
    m.set(r, (m.get(r) || 0) + 1);
  }
  return Array.from(m.entries())
    .map(([runtime, count]) => ({ runtime, count }))
    .sort((a, b) => b.count - a.count);
}
