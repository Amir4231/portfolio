import crypto from "node:crypto";

function secret(): string {
  return (
    (import.meta.env.SESSION_SECRET as string | undefined) ||
    (import.meta.env.ADMIN_PASSWORD as string | undefined) ||
    "dev-secret"
  );
}

export function adminPassword(): string {
  return (import.meta.env.ADMIN_PASSWORD as string | undefined) || "admin";
}

export function checkPassword(input: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(adminPassword());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function token(): string {
  return crypto
    .createHmac("sha256", secret())
    .update("portfolio-admin")
    .digest("hex");
}

export function authCookie(): string {
  return `auth=${token()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`;
}

export function clearCookie(): string {
  return "auth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

export function isAuthorized(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  const expected = Buffer.from(token());
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key !== "auth") continue;
    const value = Buffer.from(rest.join("="));
    if (value.length !== expected.length) continue;
    if (crypto.timingSafeEqual(value, expected)) return true;
  }
  return false;
}
