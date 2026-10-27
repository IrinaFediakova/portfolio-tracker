/**
 * Pure helpers for calendar dates represented as `YYYY-MM-DD` strings.
 *
 * Everything is computed in UTC so results never depend on the machine's time
 * zone (important for SSR vs. browser consistency). ISO date strings also sort
 * correctly with plain string comparison.
 */

/** A calendar date formatted as `YYYY-MM-DD`. */
export type ISODate = string;

const MS_PER_DAY = 86_400_000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parse(date: ISODate): number {
  if (!ISO_DATE_PATTERN.test(date)) {
    throw new Error(`Invalid ISO date "${date}", expected YYYY-MM-DD`);
  }
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid ISO date "${date}"`);
  }
  return ms;
}

function format(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * True only for real calendar dates in `YYYY-MM-DD` form (rejects `2026-02-30`,
 * which a bare regex or `Date.parse` may let through).
 */
export function isValidISODate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(ms) && format(ms) === value;
}

/**
 * The user's LOCAL calendar date. Only for browser-side UI hints (e.g. the
 * `max` of a date input); server-side logic uses UTC via `todayISO`.
 */
export function localTodayISO(now: Date = new Date()): ISODate {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Today's date in UTC. `now` is injectable to keep callers deterministic. */
export function todayISO(now: Date = new Date()): ISODate {
  return format(now.getTime());
}

/** Returns `date` shifted by `days` (may be negative). */
export function addDays(date: ISODate, days: number): ISODate {
  return format(parse(date) + days * MS_PER_DAY);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((parse(to) - parse(from)) / MS_PER_DAY);
}

/** Inclusive list of every date from `from` to `to`. Empty if `to < from`. */
export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const count = daysBetween(from, to);
  if (count < 0) return [];
  return Array.from({ length: count + 1 }, (_, i) => addDays(from, i));
}
