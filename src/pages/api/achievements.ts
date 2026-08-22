import type { APIRoute } from "astro";
import { isAuthorized } from "../../lib/auth";
import {
  createAchievement,
  deleteAchievement,
  getAchievement,
  updateAchievement,
} from "../../lib/db";
import type { AchievementImage } from "../../lib/types";

const CATEGORIES = ["Certification", "Award", "Impact Metric", "Speaking"];

export const POST: APIRoute = async ({ request }) => {
  if (!isAuthorized(request.headers.get("cookie"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const form = await request.formData();
  const action = String(form.get("action") ?? "create");
  const id = String(form.get("id") ?? "");

  if (action === "delete" && id) {
    await deleteAchievement(id);
    return new Response(null, { status: 303, headers: { Location: "/admin" } });
  }

  const category = String(form.get("category") ?? "Certification");
  const data = {
    title: String(form.get("title") ?? "").trim(),
    category: CATEGORIES.includes(category) ? category : "Certification",
    date: String(form.get("date") ?? "").trim(),
    issuer: String(form.get("issuer") ?? "").trim(),
    description: String(form.get("description") ?? "").trim(),
    credentialUrl: String(form.get("credentialUrl") ?? "").trim(),
    highlightMetric: String(form.get("highlightMetric") ?? "").trim(),
    body: String(form.get("body") ?? ""),
  };

  if (!data.title) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin?error=title" },
    });
  }

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

  const uploads = form
    .getAll("images")
    .filter(
      (entry): entry is File =>
        typeof (entry as File).arrayBuffer === "function" &&
        (entry as File).size > 0,
    );

  const sharp = (await import("sharp")).default;
  const MAX_BYTES = 5 * 1024 * 1024;
  try {
    for (const file of uploads) {
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
    const code = (err as Error).message === "size" ? "image-size" : "image-invalid";
    return new Response(null, {
      status: 303,
      headers: { Location: `${errorTarget}${code}` },
    });
  }

  const urlLines = String(form.get("imageUrls") ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//.test(s));
  for (const url of urlLines) images.push({ src: url, alt: "" });

  if (action === "update" && id) {
    await updateAchievement(id, { ...data, images });
  } else {
    await createAchievement({ ...data, images });
  }

  return new Response(null, { status: 303, headers: { Location: "/admin" } });
};
