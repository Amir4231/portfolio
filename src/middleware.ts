import { defineMiddleware } from "astro:middleware";
import { isAuthorized } from "./lib/auth";

export const onRequest = defineMiddleware((context, next) => {
  const { pathname } = context.url;
  const authed = isAuthorized(context.request.headers.get("cookie"));

  const isAdminArea =
    pathname.startsWith("/admin") || pathname.startsWith("/api/");
  const isPublicEntry =
    pathname === "/admin/login" || pathname === "/api/login";

  if (isAdminArea && !isPublicEntry && !authed) {
    return context.redirect("/admin/login");
  }

  return next();
});
