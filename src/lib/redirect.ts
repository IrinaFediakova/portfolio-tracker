export const DEFAULT_REDIRECT_PATH = "/dashboard";

/**
 * Returns `value` only if it is a same-origin relative path; otherwise the
 * fallback. Prevents open-redirect attacks via the `?next=` parameter.
 */
export function safeRedirectPath(
  value: unknown,
  fallback: string = DEFAULT_REDIRECT_PATH,
): string {
  if (typeof value !== "string") return fallback;
  // Must start with a single "/" ("//host" and "/\host" are protocol-relative),
  // and must not contain control characters or backslashes.
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (/[\\\u0000-\u001f]/.test(value)) return fallback;
  return value;
}
