import { db, ensureReady } from "./db";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

// In-memory fallback if the database is temporarily unreachable
const memoryFallback = new Map<string, { count: number; resetAt: number }>();

function memoryRateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
): RateLimitResult {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const existing = memoryFallback.get(bucket);

  let resetAt = now + windowMs;
  let count = 1;

  if (existing && existing.resetAt > now) {
    resetAt = existing.resetAt;
    count = existing.count + 1;
  }

  memoryFallback.set(bucket, { count, resetAt });

  // Prevent memory leak by cleaning up old entries if map gets large
  if (memoryFallback.size > 10000) {
    for (const [k, v] of memoryFallback.entries()) {
      if (v.resetAt <= now) memoryFallback.delete(k);
    }
  }

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}

let lastCleanup = 0;

/**
 * Fixed-window rate limiter backed by the database so it works across
 * serverless instances and survives cold starts, with an in-memory fallback.
 *
 * @param bucket unique key, e.g. `login:1.2.3.4` or `api:1.2.3.4`
 * @param limit  max requests allowed within the window
 * @param windowSeconds length of the window
 */
export async function rateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  try {
    await ensureReady();

    // Opportunistically clean up expired rows once every 10 minutes
    if (now - lastCleanup > 10 * 60 * 1000) {
      lastCleanup = now;
      db.execute({
        sql: "DELETE FROM rate_limits WHERE reset_at < ?",
        args: [now],
      }).catch(() => {});
    }

    const existing = await db.execute({
      sql: "SELECT count, reset_at FROM rate_limits WHERE bucket = ?",
      args: [bucket],
    });

    let resetAt: number;
    let count: number;

    if (existing.rows.length === 0) {
      resetAt = now + windowMs;
      count = 1;
      await db.execute({
        sql: "INSERT INTO rate_limits (bucket, count, reset_at) VALUES (?, ?, ?)",
        args: [bucket, count, resetAt],
      });
    } else {
      const row = existing.rows[0] as Record<string, unknown>;
      resetAt = Number(row.reset_at);
      let current = Number(row.count);

      if (resetAt <= now) {
        resetAt = now + windowMs;
        current = 0;
      }

      current += 1;
      count = current;

      await db.execute({
        sql: `INSERT INTO rate_limits (bucket, count, reset_at) VALUES (?, ?, ?)
              ON CONFLICT(bucket) DO UPDATE SET
                count = excluded.count,
                reset_at = excluded.reset_at`,
        args: [bucket, count, resetAt],
      });
    }

    const allowed = count <= limit;
    return {
      allowed,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
    };
  } catch {
    // If the DB is unreachable, enforce in-memory rate limiting so attackers cannot bypass
    return memoryRateLimit(bucket, limit, windowSeconds);
  }
}
