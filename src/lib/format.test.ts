import { describe, expect, it } from "vitest";

import {
  formatCurrency,
  formatDate,
  formatPercent,
  formatQuantity,
} from "./format";

describe("formatCurrency", () => {
  it("formats USD with grouping and two decimals", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
  });

  it("formats negatives", () => {
    expect(formatCurrency(-99.999)).toBe("-$100.00");
  });

  it("can force a plus sign for gains", () => {
    expect(formatCurrency(12, { signDisplay: "always" })).toBe("+$12.00");
  });

  it("supports compact notation", () => {
    expect(formatCurrency(1_250_000, { compact: true })).toBe("$1.3M");
  });

  it("supports other currencies", () => {
    expect(formatCurrency(10, { currency: "EUR" })).toBe("€10.00");
  });

  it("never renders negative zero", () => {
    expect(formatCurrency(-0)).toBe("$0.00");
  });
});

describe("formatPercent", () => {
  it("formats a fraction as a percentage", () => {
    expect(formatPercent(0.1234)).toBe("12.34%");
  });

  it("supports explicit sign and digits", () => {
    expect(formatPercent(0.05, { signDisplay: "always", digits: 1 })).toBe(
      "+5.0%",
    );
    expect(formatPercent(-0.0321)).toBe("-3.21%");
  });
});

describe("formatQuantity", () => {
  it("drops trailing zeros and keeps up to 6 decimals", () => {
    expect(formatQuantity(0.5)).toBe("0.5");
    expect(formatQuantity(1000)).toBe("1,000");
    expect(formatQuantity(0.123456789)).toBe("0.123457");
  });
});

describe("formatDate", () => {
  it("formats a date-only string without shifting the day", () => {
    expect(formatDate("2026-03-05")).toBe("Mar 5, 2026");
    expect(formatDate("2026-03-05", "short")).toBe("Mar 5");
    expect(formatDate("2026-03-05", "long")).toBe("March 5, 2026");
  });

  it("formats timestamps in UTC", () => {
    expect(formatDate("2026-03-05T23:59:00Z")).toBe("Mar 5, 2026");
  });

  it("returns a fallback for invalid input", () => {
    expect(formatDate("not-a-date")).toBe("Invalid date");
  });
});
