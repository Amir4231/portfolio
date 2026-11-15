import type { APIRoute } from "astro";
import { isAuthorized } from "../../lib/auth";
import { getSettings, sanitizeSkills, saveSettings } from "../../lib/db";

export const POST: APIRoute = async ({ request }) => {
  const settings = await getSettings();
  const hash = settings["password_hash"] || undefined;
  if (!isAuthorized(request.headers.get("cookie"), hash)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const form = await request.formData();
  const raw = String(form.get("skills") ?? "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/stack?error=invalid" },
    });
  }
  const cleaned = sanitizeSkills(parsed);
  if (!cleaned) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/stack?error=invalid" },
    });
  }
  await saveSettings({ skills: JSON.stringify(cleaned) });
  return new Response(null, {
    status: 303,
    headers: { Location: "/admin/stack?saved=1" },
  });
};
