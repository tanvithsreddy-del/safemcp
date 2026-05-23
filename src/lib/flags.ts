// Feature flags resolved at build time.
// All read from PUBLIC_-prefixed env vars so they're available in browser bundles too.

export const SHOW_SPONSORS: boolean =
  (import.meta.env.PUBLIC_SHOW_SPONSORS ?? "false").toString().toLowerCase() === "true";

export const SITE_URL: string =
  import.meta.env.PUBLIC_SITE_URL ?? "https://safemcp.info";
