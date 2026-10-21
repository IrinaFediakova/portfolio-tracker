import type { AssetType } from "@/lib/portfolio";

/**
 * Categorical palette in OKLCH: equal lightness/chroma, varying hue, so slices
 * read evenly in both light and dark themes.
 */
const HUES = [255, 175, 60, 310, 20, 130, 210, 95] as const;

const color = (hue: number) => `oklch(0.68 0.15 ${hue})`;

/** Fixed colour per asset type so "Stocks" is the same hue everywhere. */
const TYPE_COLORS: Record<AssetType, string> = {
  stock: color(255),
  etf: color(175),
  crypto: color(60),
  bond: color(310),
};

const OTHER_COLOR = "var(--muted-foreground)";

export function assetSliceColor(index: number, key: string): string {
  if (key === "other") return OTHER_COLOR;
  return color(HUES[index % HUES.length]);
}

export function typeSliceColor(key: string): string {
  return key in TYPE_COLORS ? TYPE_COLORS[key as AssetType] : OTHER_COLOR;
}
