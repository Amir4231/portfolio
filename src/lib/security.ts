/**
 * Security and sanitization utilities.
 */

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * Validates and sanitizes a URL to prevent javascript: or data: XSS attacks in href attributes.
 * Allows safe absolute URLs (http, https, mailto) and safe relative paths (/path).
 */
export function sanitizeSafeUrl(
  rawUrl: unknown,
  allowedProtocols: Set<string> = SAFE_PROTOCOLS,
): string {
  if (typeof rawUrl !== "string") return "";
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";

  // Protocol-relative URLs (e.g. //attacker.com) can be dangerous if unexpected
  if (trimmed.startsWith("//")) {
    return "";
  }

  // Safe relative paths (e.g. /resume.pdf or /#projects)
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (allowedProtocols.has(parsed.protocol)) {
      return parsed.toString();
    }
  } catch {
    // Invalid URL structure
  }

  return "";
}

/**
 * Validates that an image source is either a safe relative path, an http/https URL,
 * or a safe base64 jpeg/png/webp data URL.
 */
export function sanitizeImageUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== "string") return "";
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  if (
    trimmed.startsWith("data:image/jpeg;base64,") ||
    trimmed.startsWith("data:image/png;base64,") ||
    trimmed.startsWith("data:image/webp;base64,")
  ) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    // Invalid URL
  }

  return "";
}

/**
 * Bounds string length to prevent denial of service through oversized inputs.
 */
export function boundString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}
