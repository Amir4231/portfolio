import type { APIRoute } from "astro";
import { authCookie, hashPassword, verifyPassword } from "../../lib/auth";
import { getSettings, saveSettings } from "../../lib/db";

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const settings = await getSettings();
  let hash = settings["password_hash"] || undefined;

  const ok = hash ? verifyPassword(password, hash) : password === (import.meta.env.ADMIN_PASSWORD as string | undefined) || "admin";

  if (!ok) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/login?error=1" },
    });
  }

  if (!hash) {
    hash = hashPassword(password);
    await saveSettings({ password_hash: hash });
  }

  return new Response(null, {
    status: 303,
    headers: { Location: "/admin", "Set-Cookie": authCookie(hash) },
  });
};