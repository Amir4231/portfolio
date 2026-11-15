import crypto from "node:crypto";

const scryptAsync = (password: string, salt: string, keylen: number) =>
  new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = (await scryptAsync(password, salt, 64)).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  if (!stored || !stored.startsWith("scrypt:")) return false;
  const parts = stored.split(":");
  if (parts.length !== 3) return false;
  const [, salt, hash] = parts;
  if (!salt || !hash) return false;
  const candidate = await scryptAsync(password, salt, 64);
  const a = Buffer.from(candidate);
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Constant-time comparison between two strings.
 * Hashes both strings with SHA-256 before timingSafeEqual
 * to avoid leaking string length via early exit.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const hashA = crypto.createHash("sha256").update(a).digest();
  const hashB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

// Memory-resident random fallback secret if SESSION_SECRET is not configured in env.
// Generated once per server process so external attackers cannot predict it.
const processRandomSecret = crypto.randomBytes(32).toString("hex");

function getSecretKey(passwordHash?: string): string {
  const envSecret =
    (process.env.SESSION_SECRET as string | undefined) ||
    (import.meta.env?.SESSION_SECRET as string | undefined);

  if (envSecret && envSecret.trim().length >= 16) {
    return envSecret.trim();
  }

  // If SESSION_SECRET isn't set, bind to the stored password hash + process secret
  return `${passwordHash || "none"}:${processRandomSecret}`;
}

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * Generates a signed, timestamped, tamper-proof session token.
 * Token structure: v1.<timestampMs>.<nonce>.<signature>
 * Where signature = HMAC-SHA256(secretKey, `v1.${timestampMs}.${nonce}.${passwordHash}`)
 */
export function createSessionToken(passwordHash?: string): string {
  const now = Date.now();
  const nonce = crypto.randomBytes(12).toString("hex");
  const payload = `v1.${now}.${nonce}.${passwordHash || "none"}`;
  const sig = crypto
    .createHmac("sha256", getSecretKey(passwordHash))
    .update(payload)
    .digest("hex");
  return `v1.${now}.${nonce}.${sig}`;
}

export function authCookie(
  passwordHash?: string,
  isSecure: boolean = Boolean(import.meta.env?.PROD || process.env.NODE_ENV === "production"),
): string {
  const token = createSessionToken(passwordHash);
  const secureFlag = isSecure ? "; Secure" : "";
  return `auth=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${secureFlag}`;
}

export function clearCookie(
  isSecure: boolean = Boolean(import.meta.env?.PROD || process.env.NODE_ENV === "production"),
): string {
  const secureFlag = isSecure ? "; Secure" : "";
  return `auth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`;
}

export function isAuthorized(
  cookieHeader: string | null,
  passwordHash?: string,
): boolean {
  if (!cookieHeader) return false;

  let rawToken: string | null = null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === "auth") {
      rawToken = rest.join("=").trim();
      break;
    }
  }

  if (!rawToken) return false;

  // Modern v1 token format: v1.<timestampMs>.<nonce>.<sig>
  if (rawToken.startsWith("v1.")) {
    const parts = rawToken.split(".");
    if (parts.length !== 4) return false;
    const [, timestampStr, nonce, sig] = parts;
    const issuedAt = Number(timestampStr);
    if (!Number.isFinite(issuedAt) || issuedAt <= 0) return false;

    const now = Date.now();
    // Verify token age: cannot be older than SESSION_MAX_AGE_SECONDS and not in the future (>60s skew)
    if (now - issuedAt > SESSION_MAX_AGE_SECONDS * 1000) return false;
    if (issuedAt - now > 60000) return false;

    const expectedPayload = `v1.${timestampStr}.${nonce}.${passwordHash || "none"}`;
    const expectedSig = crypto
      .createHmac("sha256", getSecretKey(passwordHash))
      .update(expectedPayload)
      .digest("hex");

    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  return false;
}
