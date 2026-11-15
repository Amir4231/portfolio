import type { APIRoute } from "astro";
import { authCookie, hashPassword, verifyPassword } from "../../lib/auth";
import { getSettings, saveSettings } from "../../lib/db";

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const settings = await getSettings();
  const hash = settings["password_hash"] || undefined;

  const bootstrap = import.meta.env.ADMIN_PASSWORD as string | undefined;

  if (!hash && !bootstrap) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/login?error=unconfigured" },
    });
  }

  const ok = hash
    ? await verifyPassword(password, hash)
    : bootstrap
      ? password === bootstrap
      : false;

  if (!ok) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/login?error=1" },
    });
  }

  const effectiveHash = hash ?? (await hashPassword(password));
  if (!hash) {
    await saveSettings({ password_hash: effectiveHash });
  }

  return new Response(null, {
    status: 303,
    headers: { Location: "/admin", "Set-Cookie": authCookie(effectiveHash) },
  });
};