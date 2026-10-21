export type Tone = "gain" | "loss" | "neutral";

/** Maps a signed number to a semantic tone (zero is neutral). */
export function toneOf(value: number): Tone {
  if (value > 0) return "gain";
  if (value < 0) return "loss";
  return "neutral";
}

export const TONE_CLASSES: Record<Tone, string> = {
  gain: "text-gain",
  loss: "text-loss",
  neutral: "text-muted-foreground",
};
