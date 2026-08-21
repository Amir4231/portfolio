import { defineMiddleware } from "astro:middleware";
import { isAuthorized } from "./lib/auth";
import { getSettings } from "./lib/db";

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const settings = await getSettings();
  context.locals.settings = settings;

  const passwordHash = settings["password_hash"] || undefined;
  const authed = isAuthorized(context.request.headers.get("cookie"), passwordHash);

  const isAdminArea = pathname.startsWith("/admin") || pathname.startsWith("/api/");
  const isPublicEntry =
    pathname === "/admin/login" || pathname === "/api/login";

  if (isAdminArea && !isPublicEntry && !authed) {
    return context.redirect("/admin/login");
  }

  return next();
});