// GET /api/auth/github/callback?code=...&state=...
//
// GitHub redirects here after the user authorizes. We:
//   1. Verify the state signature -> trust the embedded serverId
//   2. Exchange the auth code for an access token
//   3. Fetch the authenticated user (login + id)
//   4. Fetch the target repo using the user's token; check push/admin perms
//   5. Insert into `verifications` if they pass
//
// On any failure we redirect to /claimed?status=<reason>&sid=<serverId>
// which is a small landing page that renders the outcome.

import type { APIRoute } from "astro";
import { verifyState } from "../../../../lib/auth";

export const prerender = false;

const UA = "safemcp-verify/1.0 (+https://safemcp.info)";

function bail(
  baseUrl: string,
  status: string,
  sid: string | null,
  extra?: string,
): Response {
  const params = new URLSearchParams({ status });
  if (sid) params.set("sid", sid);
  if (extra) params.set("info", extra);
  return Response.redirect(`${baseUrl}/claimed?${params.toString()}`, 302);
}

export const GET: APIRoute = async ({ url, locals }) => {
  const env = (locals as any)?.runtime?.env;
  const clientId = env?.GITHUB_CLIENT_ID as string | undefined;
  const clientSecret = env?.GITHUB_CLIENT_SECRET as string | undefined;
  const sessionSecret = env?.SESSION_SECRET as string | undefined;
  const db = env?.DB;

  if (!clientId || !clientSecret || !sessionSecret || !db) {
    return new Response("Server misconfigured", { status: 500 });
  }

  const code = url.searchParams.get("code");
  const stateToken = url.searchParams.get("state");
  const ghError = url.searchParams.get("error");

  if (ghError) return bail(url.origin, "denied", null, ghError);
  if (!code || !stateToken) return bail(url.origin, "bad_request", null);

  // 1. Verify state -> extract serverId
  const state = await verifyState(stateToken, sessionSecret);
  if (!state) return bail(url.origin, "expired", null);
  const sid = state.sid;
  const [serverOwner, serverName] = sid.split("/");

  // 2. Exchange code for access token
  let token: string;
  try {
    const tokenRes = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": UA,
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
      },
    );
    if (!tokenRes.ok) return bail(url.origin, "token_exchange_failed", sid);
    const tokenJson: any = await tokenRes.json();
    if (!tokenJson.access_token) {
      return bail(url.origin, "no_token", sid, tokenJson.error || "unknown");
    }
    token = tokenJson.access_token;
  } catch (e: any) {
    return bail(url.origin, "token_exchange_failed", sid, e?.message);
  }

  // 3. Get authenticated user identity
  let ghUser: {
    id: number;
    login: string;
    avatar_url?: string;
  };
  try {
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": UA,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!userRes.ok) return bail(url.origin, "user_fetch_failed", sid);
    ghUser = (await userRes.json()) as any;
    if (!ghUser?.id || !ghUser?.login) {
      return bail(url.origin, "user_fetch_failed", sid);
    }
  } catch (e: any) {
    return bail(url.origin, "user_fetch_failed", sid, e?.message);
  }

  // 4. Check repo ownership. The /repos endpoint returns the authenticated
  //    user's effective permissions, which works for both personal repos AND
  //    org-owned repos where the user has push access via membership.
  let canVerify = false;
  let isFork = false;
  try {
    const repoRes = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(serverOwner)}/${encodeURIComponent(serverName)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": UA,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (repoRes.status === 404) {
      return bail(url.origin, "repo_not_found", sid);
    }
    if (!repoRes.ok) return bail(url.origin, "repo_fetch_failed", sid);
    const repo: any = await repoRes.json();
    const perms = repo?.permissions || {};
    canVerify = perms.admin === true || perms.push === true;
    isFork = repo?.fork === true;
  } catch (e: any) {
    return bail(url.origin, "repo_fetch_failed", sid, e?.message);
  }

  if (isFork) return bail(url.origin, "fork_not_allowed", sid);
  if (!canVerify) return bail(url.origin, "not_owner", sid);

  // 5. Record the verification. INSERT OR REPLACE so re-claiming refreshes
  //    verified_at without erroring on the primary-key collision.
  try {
    await db
      .prepare(
        `INSERT OR REPLACE INTO verifications
           (server_owner, server_name, github_user_id, github_login,
            github_avatar_url, verified_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      )
      .bind(
        serverOwner,
        serverName,
        ghUser.id,
        ghUser.login,
        ghUser.avatar_url || null,
      )
      .run();
  } catch (e: any) {
    return bail(url.origin, "db_write_failed", sid, e?.message);
  }

  return bail(url.origin, "ok", sid);
};
