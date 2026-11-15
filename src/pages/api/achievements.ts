import type { APIRoute } from "astro";
import { isAuthorized } from "../../lib/auth";
import {
  createAchievement,
  deleteAchievement,
  getAchievement,
  getSettings,
  updateAchievement,
} from "../../lib/db";
import type { AchievementImage } from "../../lib/types";
import { boundString, sanitizeImageUrl, sanitizeSafeUrl } from "../../lib/security";

const CATEGORIES = ["Certification", "Award", "Impact Metric", "Speaking"];
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_UPLOADS = 10;
const MAX_BYTES = 5 * 1024 * 1024;

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
  const action = boundString(form.get("action"), 20) || "create";
  const id = boundString(form.get("id"), 80);

  if (action === "delete" && id) {
    await deleteAchievement(id);
    return new Response(null, { status: 303, headers: { Location: "/admin" } });
  }

  const rawCat = boundString(form.get("category"), 40);
  const category = CATEGORIES.includes(rawCat) ? rawCat : "Certification";
  const title = boundString(form.get("title"), 120);

  if (!title) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin?error=title" },
    });
  }

  const credentialUrl = sanitizeSafeUrl(form.get("credentialUrl"));

  const data = {
    title,
    category,
    date: boundString(form.get("date"), 40),
    issuer: boundString(form.get("issuer"), 120),
    description: boundString(form.get("description"), 500),
    credentialUrl,
    highlightMetric: boundString(form.get("highlightMetric"), 60),
    body: boundString(form.get("body"), 100000),
  };

  const errorTarget =
    action === "update" && id
      ? `/admin/achievements/${id}?error=`
      : `/admin/achievements/new?error=`;

  let images: AchievementImage[] = [];
  if (action === "update" && id) {
    const existing = await getAchievement(id);
    if (existing) {
      images = existing.images.filter(
        (_, i) => String(form.get(`removeImage_${i}`)) !== "1",
      );
    }
  }

  const rawUploads = form
    .getAll("images")
    .filter(
      (entry): entry is File =>
        typeof (entry as File).arrayBuffer === "function" &&
        (entry as File).size > 0,
    );

  if (rawUploads.length > MAX_UPLOADS) {
    return new Response(null, {
      status: 303,
      headers: { Location: `${errorTarget}image-count` },
    });
  }

  try {
    const sharp = (await import("sharp")).default;
    for (const file of rawUploads) {
      if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
        throw new Error("type");
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      if (bytes.length > MAX_BYTES) throw new Error("size");

      const resized = await sharp(bytes)
        .rotate()
        .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
      images.push({
        src: `data:image/jpeg;base64,${resized.toString("base64")}`,
        alt: data.title,
      });
    }
  } catch (err) {
    const msg = (err as Error).message;
    const code = msg === "size" ? "image-size" : "image-invalid";
    return new Response(null, {
      status: 303,
      headers: { Location: `${errorTarget}${code}` },
    });
  }

  const urlLines = boundString(form.get("imageUrls"), 10000)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .map((s) => sanitizeImageUrl(s))
    .filter(Boolean)
    .slice(0, 20);

  for (const url of urlLines) {
    images.push({ src: url, alt: "" });
  }

  // Cap total images per achievement to 30
  images = images.slice(0, 30);

  if (action === "update" && id) {
    await updateAchievement(id, { ...data, images });
  } else {
    await createAchievement({ ...data, images });
  }

  return new Response(null, { status: 303, headers: { Location: "/admin" } });
};
