import type { APIRoute } from "astro";
import { clearCookie, hashPassword, isAuthorized, verifyPassword } from "../../lib/auth";
import { getSettings, saveSettings } from "../../lib/db";

export const POST: APIRoute = async ({ request }) => {
  const settings = await getSettings();
  const hash = settings["password_hash"] || undefined;

  if (!isAuthorized(request.headers.get("cookie"), hash)) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/login" },
    });
  }

  let current = "";
  let next = "";
  try {
    const form = await request.formData();
    current = String(form.get("current") ?? "");
    next = String(form.get("new") ?? "");
  } catch {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/settings?error=password" },
    });
  }

  if (!current || current.length > 256 || !hash || !(await verifyPassword(current, hash))) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/settings?error=password" },
    });
  }

  if (next.length < 8 || next.length > 256) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/settings?error=weak" },
    });
  }

  await saveSettings({ password_hash: await hashPassword(next) });

  const isSecure = new URL(request.url).protocol === "https:" || import.meta.env.PROD;

  return new Response(null, {
    status: 303,
    headers: { Location: "/admin/login?changed=1", "Set-Cookie": clearCookie(isSecure) },
  });
};