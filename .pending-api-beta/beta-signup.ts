import type { APIRoute } from "astro";

export const prerender = false;

const RATE_WINDOW_SECONDS = 3600;
const RATE_MAX = 5;

interface ApplicationPayload {
  email?: string;
  name?: string;
  use_case?: string;
  volume?: string;
  company?: string;
  website?: string;
}

interface StoredApplication {
  id: string;
  email: string;
  name: string;
  use_case: string;
  volume: string;
  company: string;
  ip: string;
  ua: string;
  submitted_at: string;
  status: "pending";
}

const VOLUMES = new Set([
  "under_100",
  "100_1k",
  "1k_10k",
  "10k_100k",
  "over_100k",
]);

function bad(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function randomId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const env: any = (locals as any)?.runtime?.env;
  const kv = env?.API_BETA_SIGNUPS;

  if (!kv) {
    return bad("Service not configured. Try again in a moment.", 503);
  }

  let body: ApplicationPayload;
  try {
    body = (await request.json()) as ApplicationPayload;
  } catch {
    return bad("Invalid JSON.");
  }

  if (body.website && body.website.length > 0) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const email = (body.email || "").trim().toLowerCase();
  const name = (body.name || "").trim();
  const useCase = (body.use_case || "").trim();
  const volume = (body.volume || "").trim();
  const company = (body.company || "").trim();

  if (!email) return bad("Email is required.");
  if (!validEmail(email)) return bad("That email does not look valid.");
  if (!name) return bad("Name is required.");
  if (name.length > 100) return bad("Name is too long.");
  if (!useCase) return bad("Tell us a bit about what you are building.");
  if (useCase.length < 20) {
    return bad("Use case is too short. Be specific about what you are building.");
  }
  if (useCase.length > 2000) return bad("Use case is too long (2000 char limit).");
  if (!VOLUMES.has(volume)) return bad("Pick a daily request volume.");
  if (company.length > 100) return bad("Company name is too long.");

  const ip = clientAddress || request.headers.get("CF-Connecting-IP") || "unknown";
  const rateKey = `rate:${ip}`;
  let count = 0;
  try {
    const existing = await kv.get(rateKey);
    count = existing ? parseInt(existing, 10) : 0;
  } catch {
  }
  if (count >= RATE_MAX) {
    return bad("Too many submissions from this IP. Try again in an hour.", 429);
  }

  const id = randomId();
  const ua = request.headers.get("User-Agent") || "";
  const now = new Date().toISOString();

  const application: StoredApplication = {
    id,
    email,
    name,
    use_case: useCase,
    volume,
    company,
    ip,
    ua: ua.slice(0, 300),
    submitted_at: now,
    status: "pending",
  };

  const appKey = `app:${now}:${id}`;
  try {
    await kv.put(appKey, JSON.stringify(application));
  } catch (e) {
    return bad("Storage error. Try again in a moment.", 503);
  }

  try {
    await kv.put(rateKey, String(count + 1), {
      expirationTtl: RATE_WINDOW_SECONDS,
    });
  } catch {
  }

  try {
    const totalRaw = await kv.get("meta:total");
    const total = totalRaw ? parseInt(totalRaw, 10) : 0;
    await kv.put("meta:total", String(total + 1));
  } catch {
  }

  return new Response(JSON.stringify({ ok: true, id }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const GET: APIRoute = () =>
  new Response("Method Not Allowed", { status: 405 });
