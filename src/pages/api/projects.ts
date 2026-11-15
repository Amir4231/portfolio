import type { APIRoute } from "astro";
import { isAuthorized } from "../../lib/auth";
import {
  createProject,
  deleteProject,
  getSettings,
  updateProject,
} from "../../lib/db";
import { boundString, sanitizeSafeUrl } from "../../lib/security";

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
    await deleteProject(id);
    return new Response(null, { status: 303, headers: { Location: "/admin" } });
  }

  const title = boundString(form.get("title"), 120);
  if (!title) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin?error=title" },
    });
  }

  const rawTags = boundString(form.get("tags"), 500);
  const tags = rawTags
    .split(",")
    .map((t) => boundString(t, 40))
    .filter(Boolean)
    .slice(0, 20);

  const rawGithub = boundString(form.get("githubUrl"), 500);
  const rawLive = boundString(form.get("liveUrl"), 500);
  const rawHero = boundString(form.get("heroImage"), 500);

  const data = {
    title,
    description: boundString(form.get("description"), 500),
    pubDate: boundString(form.get("pubDate"), 20),
    tags,
    heroImage: sanitizeSafeUrl(rawHero) || rawHero, // allow local filename or safe URL
    githubUrl: sanitizeSafeUrl(rawGithub),
    liveUrl: sanitizeSafeUrl(rawLive),
    featured: form.get("featured") === "on",
    body: boundString(form.get("body"), 100000), // bound markdown body to 100KB
  };

  if (action === "update" && id) {
    await updateProject(id, data);
  } else {
    await createProject(data);
  }

  return new Response(null, { status: 303, headers: { Location: "/admin" } });
};
