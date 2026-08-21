import crypto from "node:crypto";

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!stored || !stored.startsWith("scrypt:")) return false;
  const [, salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(candidate);
  const b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function secretFor(passwordHash?: string): string {
  return (
    (import.meta.env.SESSION_SECRET as string | undefined) ||
    passwordHash ||
    "dev-secret"
  );
}

function token(passwordHash?: string): string {
  return crypto
    .createHmac("sha256", secretFor(passwordHash))
    .update("portfolio-admin")
    .digest("hex");
}

export function authCookie(passwordHash?: string): string {
  return `auth=${token(passwordHash)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`;
}

export function clearCookie(): string {
  return "auth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

export function isAuthorized(
  cookieHeader: string | null,
  passwordHash?: string,
): boolean {
  if (!cookieHeader) return false;
  const expected = Buffer.from(token(passwordHash));
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key !== "auth") continue;
    const value = Buffer.from(rest.join("="));
    if (value.length !== expected.length) continue;
    if (crypto.timingSafeEqual(value, expected)) return true;
  }
  return false;
}