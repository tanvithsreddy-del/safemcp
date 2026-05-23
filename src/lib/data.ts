// Data loaders. JSON files come from scripts/export_data.py.
//
// At build time Astro imports these statically — no runtime fetch needed.

import servers from "../data/servers.json";
import categories from "../data/categories.json";
import top from "../data/top.json";

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

export const allServers = servers as unknown as Server[];
export const allCategories = categories as unknown as CategorySummary[];
export const topServers = top as unknown as Server[];

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
