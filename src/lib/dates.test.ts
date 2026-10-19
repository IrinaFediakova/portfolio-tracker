import { describe, expect, it } from "vitest";

import { addDays, daysBetween, eachDay, todayISO } from "./dates";

describe("dates", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("handles leap years", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("computes the difference in days", () => {
    expect(daysBetween("2026-01-01", "2026-01-31")).toBe(30);
    expect(daysBetween("2026-01-31", "2026-01-01")).toBe(-30);
  });

  it("lists every day inclusively and returns [] for a reversed range", () => {
    expect(eachDay("2026-01-30", "2026-02-01")).toEqual([
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
    ]);
    expect(eachDay("2026-02-01", "2026-01-30")).toEqual([]);
  });

  it("rejects malformed dates", () => {
    expect(() => addDays("01/02/2026", 1)).toThrow(/Invalid ISO date/);
    expect(() => addDays("2026-13-45", 1)).toThrow(/Invalid ISO date/);
  });

  it("formats a Date as a UTC calendar date", () => {
    expect(todayISO(new Date("2026-03-05T23:30:00Z"))).toBe("2026-03-05");
  });
});
