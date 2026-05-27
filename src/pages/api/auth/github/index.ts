// GET /api/auth/github?serverId={owner}/{name}
//
// Kicks off the GitHub OAuth flow for verifying ownership of a specific
// server. The serverId is encoded into a signed state token; on callback
// we verify the signature and trust the embedded serverId. No DB needed
// for the OAuth handshake itself.

import type { APIRoute } from "astro";
import { signState, randomNonce } from "../../../../lib/auth";

export const prerender = false;

export const GET: APIRoute = async ({ url, locals, redirect }) => {
  const env = (locals as any)?.runtime?.env;
  const clientId = env?.GITHUB_CLIENT_ID as string | undefined;
  const sessionSecret = env?.SESSION_SECRET as string | undefined;

  if (!clientId || !sessionSecret) {
    return new Response("Server misconfigured: OAuth env vars missing", {
      status: 500,
    });
  }

  const serverId = url.searchParams.get("serverId");
  if (!serverId || !/^[^/]+\/[^/]+$/.test(serverId)) {
    return new Response("Bad request: serverId must be owner/name", {
      status: 400,
    });
  }

  // State token expires in 10 minutes — more than enough for a GitHub
  // OAuth round-trip, short enough that abandoned flows expire quickly.
  const state = await signState(
    {
      sid: serverId,
      n: randomNonce(),
      exp: Math.floor(Date.now() / 1000) + 600,
    },
    sessionSecret,
  );

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${url.origin}/api/auth/github/callback`,
    scope: "read:user",
    state,
    allow_signup: "true",
  });

  return redirect(
    `https://github.com/login/oauth/authorize?${params.toString()}`,
    302,
  );
};
