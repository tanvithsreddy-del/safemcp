import type { APIRoute } from "astro";
export const prerender = false;
export const GET: APIRoute = async ({ locals }) => {
  const env = (locals as any)?.runtime?.env || {};
  const keys = Object.keys(env);
  const seen: Record<string, string> = {};
  for (const k of keys) {
    const v = env[k];
    seen[k] = typeof v === "string"
      ? (v ? `string(${v.length} chars)` : "empty string")
      : typeof v === "object" ? "binding/object" : typeof v;
  }
  return new Response(JSON.stringify({ keys, seen }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
};
