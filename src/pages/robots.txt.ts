import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ url }) => {
  const body = `User-agent: *
Allow: /
Disallow: /admin/

Sitemap: ${url.origin}/sitemap.xml
`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};