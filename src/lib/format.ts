/**
 * Display formatting built on `Intl`. Pure and locale-pinned.
 *
 * The locale is fixed (not read from the browser) so server-rendered HTML and
 * the client render identical strings, which avoids hydration mismatches.
 * Dates are formatted in UTC for the same reason.
 */

const LOCALE = "en-US";
export const DEFAULT_CURRENCY = "USD";

type SignDisplay = "auto" | "always" | "exceptZero" | "never";

// Intl.NumberFormat construction is comparatively expensive; reuse instances.
const numberFormatCache = new Map<string, Intl.NumberFormat>();

function numberFormat(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options);
  let formatter = numberFormatCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE, options);
    numberFormatCache.set(key, formatter);
  }
  return formatter;
}

/** Avoids rendering "-0" / "-$0.00". */
function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

export interface CurrencyOptions {
  currency?: string;
  /** `$1.2M` style, for chart axes and tight spaces. */
  compact?: boolean;
  /** Use "always"/"exceptZero" to show `+$12.00` for gains. */
  signDisplay?: SignDisplay;
}

/** `1234.5` -> `$1,234.50` */
export function formatCurrency(
  value: number,
  {
    currency = DEFAULT_CURRENCY,
    compact = false,
    signDisplay,
  }: CurrencyOptions = {},
): string {
  return numberFormat({
    style: "currency",
    currency,
    signDisplay,
    ...(compact
      ? { notation: "compact", maximumFractionDigits: 1 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  }).format(normalizeZero(value));
}

export interface PercentOptions {
  /** Digits after the decimal point. Default 2. */
  digits?: number;
  signDisplay?: SignDisplay;
}

/** Takes a FRACTION: `0.1234` -> `12.34%`. */
export function formatPercent(
  fraction: number,
  { digits = 2, signDisplay }: PercentOptions = {},
): string {
  return numberFormat({
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay,
  }).format(normalizeZero(fraction));
}

/** Quantities: up to 6 decimals, no trailing zeros. `0.5` -> `0.5`, `1000` -> `1,000`. */
export function formatQuantity(
  value: number,
  maximumFractionDigits = 6,
): string {
  return numberFormat({ maximumFractionDigits }).format(normalizeZero(value));
}

export type DateStyle = "short" | "medium" | "long";

const DATE_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  short: { month: "short", day: "numeric" },
  medium: { month: "short", day: "numeric", year: "numeric" },
  long: { month: "long", day: "numeric", year: "numeric" },
};

const dateFormatCache = new Map<DateStyle, Intl.DateTimeFormat>();

/**
 * `2026-03-05` -> `Mar 5, 2026`. Accepts a `YYYY-MM-DD` string, an ISO
 * timestamp, or a Date; always rendered in UTC so the calendar day never shifts.
 */
export function formatDate(
  date: string | Date,
  style: DateStyle = "medium",
): string {
  let formatter = dateFormatCache.get(style);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(LOCALE, {
      ...DATE_OPTIONS[style],
      timeZone: "UTC",
    });
    dateFormatCache.set(style, formatter);
  }
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return "Invalid date";
  return formatter.format(value);
}
