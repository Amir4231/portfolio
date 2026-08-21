import { defineMiddleware } from "astro:middleware";
import { isAuthorized } from "./lib/auth";
import { getSettings } from "./lib/db";
import { rateLimit } from "./lib/rate-limit";

const LOGIN_LIMIT = 10;
const LOGIN_WINDOW = 15 * 60;
const API_LIMIT = 120;
const API_WINDOW = 60;

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const settings = await getSettings();
  context.locals.settings = settings;

  const ip =
    context.clientAddress ??
    context.request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown";

  const passwordHash = settings["password_hash"] || undefined;
  const authed = isAuthorized(context.request.headers.get("cookie"), passwordHash);

  const isAdminArea = pathname.startsWith("/admin") || pathname.startsWith("/api/");
  const isPublicEntry =
    pathname === "/admin/login" || pathname === "/api/login";

  if (isAdminArea && !isPublicEntry && !authed) {
    return context.redirect("/admin/login");
  }

  if (isPublicEntry && pathname === "/api/login" && context.request.method === "POST") {
    const rl = await rateLimit(`login:${ip}`, LOGIN_LIMIT, LOGIN_WINDOW);
    if (!rl.allowed) {
      return new Response("Too many login attempts", {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      });
    }
  }

  if (isAdminArea && context.request.method === "POST" && !isPublicEntry) {
    const rl = await rateLimit(`api:${ip}`, API_LIMIT, API_WINDOW);
    if (!rl.allowed) {
      return new Response("Too many requests", {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      });
    }
  }

  return next();
});
