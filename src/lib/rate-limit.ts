import { db, ensureReady } from "./db";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window rate limiter backed by the database so it works across
 * serverless instances and survives cold starts.
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
    // If the DB is unreachable, fail open rather than lock the user out.
    return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
  }
}
