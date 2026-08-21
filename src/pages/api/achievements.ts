import type { APIRoute } from "astro";
import { isAuthorized } from "../../lib/auth";
import {
  createAchievement,
  deleteAchievement,
  updateAchievement,
} from "../../lib/db";

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

  if (action === "update" && id) {
    await updateAchievement(id, data);
  } else {
    await createAchievement(data);
  }

  return new Response(null, { status: 303, headers: { Location: "/admin" } });
};
