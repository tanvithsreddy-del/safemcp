import { topServers, allCategories } from "../lib/data";
import { SITE_URL } from "../lib/flags";
import type { APIRoute } from "astro";

export const GET: APIRoute = () => {
  const urls = [
    `${SITE_URL}/`,
    `${SITE_URL}/browse`,
    `${SITE_URL}/about`,
    `${SITE_URL}/search`,
    ...allCategories.map((c) => `${SITE_URL}/category/${c.slug}/`),
    ...topServers.map(
      (s) => `${SITE_URL}/s/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.name)}/`
    ),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
};
