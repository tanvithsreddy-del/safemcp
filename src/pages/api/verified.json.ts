// GET /api/verified.json
//
// Returns { verified: ["owner/name", ...] } for every server with at least
// one verification. Rows are hydrated client-side from this list, so a
// rebuild isn't required when someone claims their server.
//
// Cached at the edge for 60s — enough to absorb listing-page bursts, short
// enough that newly verified servers appear quickly.

import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const db = (locals as any)?.runtime?.env?.DB;
  if (!db) {
    return new Response(JSON.stringify({ verified: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { results } = await db
      .prepare(
        `SELECT DISTINCT server_owner, server_name FROM verifications`,
      )
      .all();
    const verified = (results || []).map(
      (r: any) => `${r.server_owner}/${r.server_name}`,
    );
    return new Response(JSON.stringify({ verified }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control":
          "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ verified: [], error: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
};
