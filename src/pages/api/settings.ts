import type { APIRoute } from "astro";
import { isAuthorized } from "../../lib/auth";
import { getSettings, saveSettings } from "../../lib/db";

export const POST: APIRoute = async ({ request }) => {
  const settings = await getSettings();
  const hash = settings["password_hash"] || undefined;
  if (!isAuthorized(request.headers.get("cookie"), hash)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const form = await request.formData();
  const values: Record<string, string> = {};
  for (const key of [
    "name",
    "role",
    "location",
    "email",
    "github",
    "linkedin",
    "twitter",
    "resume",
    "tagline",
    "builtWith",
  ]) {
    values[key] = String(form.get(key) ?? "").trim();
  }

  const avatarFile = form.get("avatar");
  if (avatarFile && typeof (avatarFile as File).arrayBuffer === "function" && (avatarFile as File).size > 0) {
    const file = avatarFile as File;
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > 5 * 1024 * 1024) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/admin/settings?error=avatar-size" },
      });
    }
    try {
      const sharp = (await import("sharp")).default;
      const resized = await sharp(bytes)
        .resize(512, 512, { fit: "cover" })
        .jpeg({ quality: 82 })
        .toBuffer();
      values["avatar"] = `data:image/jpeg;base64,${resized.toString("base64")}`;
    } catch {
      return new Response(null, {
        status: 303,
        headers: { Location: "/admin/settings?error=avatar-invalid" },
      });
    }
  }

  await saveSettings(values);
  return new Response(null, {
    status: 303,
    headers: { Location: "/admin/settings?saved=1" },
  });
};