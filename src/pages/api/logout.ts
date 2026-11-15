import type { APIRoute } from "astro";
import { clearCookie } from "../../lib/auth";

export const POST: APIRoute = async ({ request }) => {
  const isSecure = new URL(request.url).protocol === "https:" || import.meta.env.PROD;
  return new Response(null, {
    status: 303,
    headers: { Location: "/admin/login", "Set-Cookie": clearCookie(isSecure) },
  });
};
