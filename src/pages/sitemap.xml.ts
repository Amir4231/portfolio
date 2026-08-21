import type { APIRoute } from "astro";
import { listProjects } from "../lib/db";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const GET: APIRoute = async ({ url }) => {
  const origin = url.origin;
  let projects: { id: string }[] = [];
  try {
    projects = await listProjects();
  } catch {
    projects = [];
  }

  const pages = [
    { loc: `${origin}/`, priority: "1.0" },
    { loc: `${origin}/projects/`, priority: "0.8" },
    ...projects.map((p) => ({
      loc: `${origin}/projects/${p.id}/`,
      priority: "0.7",
    })),
  ];

  const urls = pages
    .map(
      (p) =>
        `  <url>\n    <loc>${esc(p.loc)}</loc>\n    <priority>${p.priority}</priority>\n  </url>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};