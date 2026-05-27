// HMAC-signed tokens for the OAuth state parameter.
//
// We don't need a DB table for OAuth state: the state itself is a signed
// payload containing { serverId, nonce, exp }. On callback, we verify the
// signature with SESSION_SECRET and trust the embedded data.
//
// Uses Web Crypto (available in Cloudflare Workers runtime).

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? 0 : 4 - (input.length % 4);
  const s = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    ENCODER.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export interface StatePayload {
  /** "{owner}/{name}" of the server being claimed */
  sid: string;
  /** random nonce to prevent reuse */
  n: string;
  /** unix seconds, expiration */
  exp: number;
}

/** Sign an OAuth state payload. Token format: base64url(json).base64url(hmac) */
export async function signState(
  payload: StatePayload,
  secret: string,
): Promise<string> {
  const key = await importKey(secret);
  const body = b64urlEncode(ENCODER.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, ENCODER.encode(body) as BufferSource),
  );
  return `${body}.${b64urlEncode(sig)}`;
}

/** Verify and decode an OAuth state token. Returns null if invalid/expired. */
export async function verifyState(
  token: string,
  secret: string,
): Promise<StatePayload | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sigB64] = parts;

  let valid = false;
  try {
    const key = await importKey(secret);
    valid = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlDecode(sigB64) as BufferSource,
      ENCODER.encode(body) as BufferSource,
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  let payload: StatePayload;
  try {
    payload = JSON.parse(DECODER.decode(b64urlDecode(body)));
  } catch {
    return null;
  }

  if (!payload.sid || !payload.n || !payload.exp) return null;
  if (Date.now() / 1000 > payload.exp) return null;
  return payload;
}

export function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return b64urlEncode(bytes);
}
