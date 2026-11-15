import type { APIRoute } from "astro";
import { authCookie, hashPassword, timingSafeCompare, verifyPassword } from "../../lib/auth";
import { getSettings, saveSettings } from "../../lib/db";

export const POST: APIRoute = async ({ request }) => {
  let password = "";
  try {
    const form = await request.formData();
    password = String(form.get("password") ?? "");
  } catch {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/login?error=1" },
    });
  }

  if (!password || password.length > 256) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/login?error=1" },
    });
  }

  const settings = await getSettings();
  const hash = settings["password_hash"] || undefined;
  const bootstrap = (import.meta.env.ADMIN_PASSWORD as string | undefined) ||
    (process.env.ADMIN_PASSWORD as string | undefined);

  if (!hash && !bootstrap) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/login?error=unconfigured" },
    });
  }

  const ok = hash
    ? await verifyPassword(password, hash)
    : bootstrap
      ? timingSafeCompare(password, bootstrap)
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

  const isSecure = new URL(request.url).protocol === "https:" || import.meta.env.PROD;

  return new Response(null, {
    status: 303,
    headers: { Location: "/admin", "Set-Cookie": authCookie(effectiveHash, isSecure) },
  });
};