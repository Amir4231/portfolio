import type { APIRoute } from "astro";
import { isAuthorized } from "../../lib/auth";
import { createProject, deleteProject, updateProject } from "../../lib/db";

export const POST: APIRoute = async ({ request }) => {
  if (!isAuthorized(request.headers.get("cookie"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const form = await request.formData();
  const action = String(form.get("action") ?? "create");
  const id = String(form.get("id") ?? "");

  if (action === "delete" && id) {
    await deleteProject(id);
    return new Response(null, { status: 303, headers: { Location: "/admin" } });
  }

  const data = {
    title: String(form.get("title") ?? "").trim(),
    description: String(form.get("description") ?? "").trim(),
    pubDate: String(form.get("pubDate") ?? "").trim(),
    tags: String(form.get("tags") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    heroImage: String(form.get("heroImage") ?? "").trim(),
    githubUrl: String(form.get("githubUrl") ?? "").trim(),
    liveUrl: String(form.get("liveUrl") ?? "").trim(),
    featured: form.get("featured") === "on",
    body: String(form.get("body") ?? ""),
  };

  if (!data.title) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin?error=title" },
    });
  }

  if (action === "update" && id) {
    await updateProject(id, data);
  } else {
    await createProject(data);
  }

  return new Response(null, { status: 303, headers: { Location: "/admin" } });
};
