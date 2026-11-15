import type { APIRoute } from "astro";
import { clearCookie, hashPassword, verifyPassword } from "../../lib/auth";
import { getSettings, saveSettings } from "../../lib/db";

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("new") ?? "");

  const settings = await getSettings();
  const hash = settings["password_hash"] || undefined;

  if (!hash || !(await verifyPassword(current, hash))) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/settings?error=password" },
    });
  }

  if (next.length < 8) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/settings?error=weak" },
    });
  }

  await saveSettings({ password_hash: await hashPassword(next) });

  return new Response(null, {
    status: 303,
    headers: { Location: "/admin/login?changed=1", "Set-Cookie": clearCookie() },
  });
};