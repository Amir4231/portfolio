import { defineMiddleware } from "astro:middleware";
import { isAuthorized } from "./lib/auth";
import { getSettings } from "./lib/db";
import { rateLimit } from "./lib/rate-limit";

const LOGIN_LIMIT = 10;
const LOGIN_WINDOW = 15 * 60; // 15 minutes
const PASSWORD_LIMIT = 5;
const PASSWORD_WINDOW = 15 * 60; // 15 minutes
const API_LIMIT = 60;
const API_WINDOW = 60; // 1 minute

// Block attempts to read dotfiles and sensitive source/configuration files
const SENSITIVE_PATH_PATTERN =
  /(?:^\/\.|\.(?:env|git|db|sqlite|log|bak|config|mjs|ts|json)(?:$|\?))/i;

function getClientIp(context: {
  clientAddress?: string;
  request: Request;
}): string {
  if (context.clientAddress) return context.clientAddress;
  const headers = context.request.headers;
  const xRealIp = headers.get("x-real-ip");
  if (xRealIp) return xRealIp.trim();
  const cfConnectingIp = headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp.trim();
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  return "unknown";
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // 1. Block directory traversal or sensitive configuration / database queries
  if (
    pathname !== "/tsconfig.json" && // tsconfig isn't sensitive, but block .env, local.db, .git etc.
    SENSITIVE_PATH_PATTERN.test(pathname) &&
    !pathname.startsWith("/.well-known/")
  ) {
    return new Response("Not Found", { status: 404 });
  }

  // 2. Fetch site settings for template rendering & auth verification
  const settings = await getSettings();
  context.locals.settings = settings;

  const ip = getClientIp(context);
  const passwordHash = settings["password_hash"] || undefined;
  const authed = isAuthorized(context.request.headers.get("cookie"), passwordHash);

  const isAdminArea = pathname.startsWith("/admin");
  const isApiArea = pathname.startsWith("/api/");
  const isPublicEntry =
    pathname === "/admin/login" || pathname === "/api/login";

  // 3. CSRF Protection on mutating requests (POST, PUT, DELETE, PATCH)
  const method = context.request.method.toUpperCase();
  const isMutating = ["POST", "PUT", "DELETE", "PATCH"].includes(method);
  if (isMutating && (isAdminArea || isApiArea)) {
    const origin = context.request.headers.get("origin");
    const referer = context.request.headers.get("referer");
    const currentOrigin = context.url.origin;

    if (origin) {
      if (origin !== currentOrigin) {
        return new Response(
          JSON.stringify({ error: "Cross-origin request blocked" }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    } else if (referer) {
      try {
        const refererOrigin = new URL(referer).origin;
        if (refererOrigin !== currentOrigin) {
          return new Response(
            JSON.stringify({ error: "Cross-origin request blocked" }),
            {
              status: 403,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid referer header" }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }
  }

  // 4. Route Authorization
  if (!isPublicEntry && !authed) {
    if (isApiArea) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (isAdminArea) {
      return context.redirect("/admin/login");
    }
  }

  // 5. Rate Limiting for Login
  if (pathname === "/api/login" && method === "POST") {
    const rl = await rateLimit(`login:${ip}`, LOGIN_LIMIT, LOGIN_WINDOW);
    if (!rl.allowed) {
      return new Response("Too many login attempts. Please try again later.", {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfterSeconds),
          "Content-Type": "text/plain",
        },
      });
    }
  }

  // 6. Rate Limiting for Password Change
  if (pathname === "/api/password" && method === "POST") {
    const rl = await rateLimit(`pwd:${ip}`, PASSWORD_LIMIT, PASSWORD_WINDOW);
    if (!rl.allowed) {
      return new Response(
        "Too many password change attempts. Please try again later.",
        {
          status: 429,
          headers: {
            "Retry-After": String(rl.retryAfterSeconds),
            "Content-Type": "text/plain",
          },
        },
      );
    }
  }

  // 7. General mutating API Rate Limiting
  if (isApiArea && isMutating && !isPublicEntry) {
    const rl = await rateLimit(`api:${ip}`, API_LIMIT, API_WINDOW);
    if (!rl.allowed) {
      return new Response("Too many requests. Please slow down.", {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfterSeconds),
          "Content-Type": "text/plain",
        },
      });
    }
  }

  // 8. Execute request and attach Security Headers to all responses
  const response = await next();

  // Clone headers so we can set secure response headers
  const headers = new Headers(response.headers);

  // Content Security Policy
  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; "),
  );

  // Clickjacking protection
  headers.set("X-Frame-Options", "DENY");

  // MIME-sniffing protection
  headers.set("X-Content-Type-Options", "nosniff");

  // Referrer Policy
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions Policy
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );

  // Cross-Origin Isolation
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");

  // Strict-Transport-Security (HTTPS)
  headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload",
  );

  // Disable old buggy XSS filters that introduced vulnerabilities
  headers.set("X-XSS-Protection", "0");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});
