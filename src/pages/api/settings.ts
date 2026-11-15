import type { APIRoute } from "astro";
import { isAuthorized } from "../../lib/auth";
import { getSettings, saveSettings } from "../../lib/db";
import { boundString, sanitizeSafeUrl } from "../../lib/security";

const URL_KEYS = new Set(["github", "linkedin", "twitter", "whatsapp", "resume"]);
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export const POST: APIRoute = async ({ request }) => {
  const settings = await getSettings();
  const hash = settings["password_hash"] || undefined;
  if (!isAuthorized(request.headers.get("cookie"), hash)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const form = await request.formData();
  const values: Record<string, string> = {};
  for (const key of [
    "name",
    "nickname",
    "role",
    "location",
    "email",
    "github",
    "linkedin",
    "twitter",
    "whatsapp",
    "resume",
    "tagline",
    "builtWith",
  ]) {
    const raw = boundString(form.get(key), key === "tagline" ? 2000 : 300);
    if (URL_KEYS.has(key)) {
      values[key] = sanitizeSafeUrl(raw);
    } else {
      values[key] = raw;
    }
  }

  const avatarFile = form.get("avatar");
  if (
    avatarFile &&
    typeof (avatarFile as File).arrayBuffer === "function" &&
    (avatarFile as File).size > 0
  ) {
    const file = avatarFile as File;
    if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/admin/settings?error=avatar-invalid" },
      });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > MAX_AVATAR_BYTES) {
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