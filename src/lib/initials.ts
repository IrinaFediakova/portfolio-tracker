/**
 * Up-to-two-letter initials derived from an email's local part, or null when
 * nothing usable exists (callers then fall back to an icon).
 *
 *   jane.doe@x.com -> "JD"   demo@x.com -> "DE"   a@x.com -> "A"
 */
export function getInitials(email: string | null | undefined): string | null {
  const localPart = email?.split("@")[0] ?? "";
  const words = localPart.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length === 0) return null;

  const letters =
    words.length >= 2
      ? `${firstChar(words[0])}${firstChar(words[1])}`
      : Array.from(words[0]).slice(0, 2).join("");

  return letters.toUpperCase();
}

function firstChar(word: string): string {
  return Array.from(word)[0] ?? "";
}
