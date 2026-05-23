// Score tier mapping and live breakdown computation.
// Components are computed from raw fields so display always matches the formula.

import type { Server } from "./data";

export type ScoreTier = "high" | "mid" | "low" | "base";

export function scoreTier(score: number | null | undefined): ScoreTier {
  const s = score ?? 0;
  if (s >= 80) return "high";
  if (s >= 60) return "mid";
  if (s >= 40) return "low";
  return "base";
}

export function scoreTierClass(score: number | null | undefined): string {
  return `score score-${scoreTier(score)}`;
}

export type BreakdownComponent = {
  label: string;
  value: number;
  max: number;
  help: string;
};

const VAGUE_CATEGORIES = new Set([
  "mcp_proxy",
  "mcp_inspector",
  "mcp_testing_tool",
  "mcp_template",
]);

/**
 * Compute the five score components for a server from raw fields.
 * Mirrors the Python scoring/recommended.py formula.
 */
export function computeScoreBreakdown(server: Server): BreakdownComponent[] {
  const confidence = server.mcp_confidence ?? 0;
  const stars = server.stars ?? 0;
  const sourcesArr = (server.sources || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const desc = (server.description || "").trim();
  const forks = server.forks ?? 0;
  const cat = (server.mcp_category || "unknown").toLowerCase();

  // Confidence: (mcp_confidence / 10) * 25
  const confidencePts = Math.round((confidence / 10) * 25);

  // Popularity: log10(stars + 1) * 6.25, capped at 25
  const popularityPts = Math.min(
    25,
    Math.round(Math.log10(stars + 1) * 6.25)
  );

  // Sources: count * 5, max 15
  const sourcesPts = Math.min(15, sourcesArr.length * 5);

  // Discoverability: 5 (desc) + 5 (forks>=1) + 5 (forks>=10)
  let discoverabilityPts = 0;
  if (desc.length > 20) discoverabilityPts += 5;
  if (forks >= 1) discoverabilityPts += 5;
  if (forks >= 10) discoverabilityPts += 5;

  // Category clarity
  let categoryPts: number;
  if (cat === "other" || cat === "unknown") categoryPts = 5;
  else if (VAGUE_CATEGORIES.has(cat)) categoryPts = 15;
  else categoryPts = 20;

  return [
    { label: "Verification confidence", value: confidencePts,      max: 25, help: "At our discretion" },
    { label: "Repository popularity",   value: popularityPts,      max: 25, help: "GitHub stars (logarithmic)" },
    { label: "Multi-source presence",   value: sourcesPts,         max: 15, help: "Appears in multiple aggregators" },
    { label: "Discoverability",         value: discoverabilityPts, max: 15, help: "Description quality and fork count" },
    { label: "Category clarity",        value: categoryPts,        max: 20, help: "Specific category vs. generic 'other'" },
  ];
}
