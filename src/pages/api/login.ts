import type { APIRoute } from "astro";
import { authCookie, checkPassword } from "../../lib/auth";

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");

  if (checkPassword(password)) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin", "Set-Cookie": authCookie() },
    });
  }

  return new Response(null, {
    status: 303,
    headers: { Location: "/admin/login?error=1" },
  });
};
