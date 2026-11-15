import type { APIRoute } from "astro";
import { clearCookie } from "../../lib/auth";

export const POST: APIRoute = async () => {
  return new Response(null, {
    status: 303,
    headers: { Location: "/admin/login", "Set-Cookie": clearCookie() },
  });
};
