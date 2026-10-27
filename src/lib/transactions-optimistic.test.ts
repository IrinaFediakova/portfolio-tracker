import { describe, expect, it } from "vitest";

import {
  applyListChange,
  compareRows,
  matchesFilters,
} from "./transactions-optimistic";
import {
  parseTransactionFilters,
  type TransactionRow,
  type TransactionsPage,
} from "./transactions-query";

function row(
  id: string,
  executedAt: string,
  overrides: Partial<TransactionRow> = {},
): TransactionRow {
  return {
    id,
    assetId: "a1",
    symbol: "AAPL",
    assetName: "Apple Inc.",
    assetType: "stock",
    type: "buy",
    quantity: 1,
    price: 100,
    executedAt,
    ...overrides,
  };
}

function page(
  rows: TransactionRow[],
  overrides: Partial<TransactionsPage> = {},
): TransactionsPage {
  return {
    rows,
    total: rows.length,
    page: 1,
    pageSize: 3,
    pageCount: 1,
    ...overrides,
  };
}

const defaults = parseTransactionFilters({ pageSize: "3" });

describe("matchesFilters", () => {
  it("matches everything with no filters", () => {
    expect(matchesFilters(row("1", "2026-01-01"), defaults)).toBe(true);
  });

  it("applies type, asset, date range and search", () => {
    const r = row("1", "2026-02-01", { type: "sell" });
    expect(matchesFilters(r, { type: "buy" })).toBe(false);
    expect(matchesFilters(r, { type: "sell" })).toBe(true);
    expect(matchesFilters(r, { asset: "other" })).toBe(false);
    expect(matchesFilters(r, { from: "2026-02-02" })).toBe(false);
    expect(matchesFilters(r, { to: "2026-02-01" })).toBe(true);
    expect(matchesFilters(r, { q: "apple" })).toBe(true);
    expect(matchesFilters(r, { q: "bitcoin" })).toBe(false);
  });
});

describe("compareRows", () => {
  it("orders by the chosen column and direction", () => {
    const a = row("a", "2026-01-01", { price: 5 });
    const b = row("b", "2026-01-02", { price: 9 });
    expect(compareRows(a, b, "date", "desc")).toBeGreaterThan(0);
    expect(compareRows(a, b, "price", "asc")).toBeLessThan(0);
  });

  it("breaks ties deterministically", () => {
    const a = row("a", "2026-01-01");
    const b = row("b", "2026-01-01");
    expect(compareRows(a, b, "date", "desc")).toBeLessThan(0);
    expect(
      compareRows({ ...b, pending: true }, a, "date", "desc"),
    ).toBeLessThan(0);
  });
});

describe("applyListChange: create", () => {
  const existing = [
    row("3", "2026-03-01"),
    row("2", "2026-02-01"),
    row("1", "2026-01-01"),
  ];

  it("inserts a new row in sorted position and bumps the total", () => {
    const base = page(existing.slice(0, 2));
    const next = applyListChange(
      base,
      { kind: "create", row: row("n", "2026-02-15", { pending: true }) },
      defaults,
    );
    expect(next.rows.map((r) => r.id)).toEqual(["3", "n", "2"]);
    expect(next.total).toBe(3);
  });

  it("drops the last row when a full page overflows, but counts everything", () => {
    const base = page(existing, { total: 3 });
    const next = applyListChange(
      base,
      { kind: "create", row: row("n", "2026-04-01") },
      defaults,
    );
    expect(next.rows.map((r) => r.id)).toEqual(["n", "3", "2"]);
    expect(next.total).toBe(4);
    expect(next.pageCount).toBe(2);
  });

  it("does not show a row that sorts onto a later page, but counts it", () => {
    const base = page(existing, { total: 9, pageCount: 3 });
    const next = applyListChange(
      base,
      { kind: "create", row: row("n", "2025-01-01") },
      defaults,
    );
    expect(next.rows).toEqual(existing);
    expect(next.total).toBe(10);
    expect(next.pageCount).toBe(4);
  });

  it("does not show a row that sorts onto an earlier page", () => {
    const base = page(existing, { page: 2, total: 9, pageCount: 3 });
    const next = applyListChange(
      base,
      { kind: "create", row: row("n", "2027-01-01") },
      defaults,
    );
    expect(next.rows).toEqual(existing);
    expect(next.total).toBe(10);
  });

  it("ignores rows that do not match the active filters", () => {
    const filters = parseTransactionFilters({ type: "sell", pageSize: "3" });
    const base = page(existing);
    expect(
      applyListChange(
        base,
        { kind: "create", row: row("n", "2026-02-15") },
        filters,
      ),
    ).toBe(base);
  });

  it("appends on a short last page", () => {
    const base = page([row("1", "2026-01-01")]);
    const next = applyListChange(
      base,
      { kind: "create", row: row("n", "2025-06-01") },
      defaults,
    );
    expect(next.rows.map((r) => r.id)).toEqual(["1", "n"]);
  });

  it("works on an empty list", () => {
    const next = applyListChange(
      page([]),
      { kind: "create", row: row("n", "2026-01-01") },
      defaults,
    );
    expect(next.rows).toHaveLength(1);
    expect(next.total).toBe(1);
  });
});

describe("applyListChange: update", () => {
  const rows = [row("3", "2026-03-01"), row("2", "2026-02-01")];

  it("replaces the row and re-sorts", () => {
    const next = applyListChange(
      page(rows),
      { kind: "update", row: row("2", "2026-04-01", { pending: true }) },
      defaults,
    );
    expect(next.rows.map((r) => r.id)).toEqual(["2", "3"]);
    expect(next.rows[0].pending).toBe(true);
    expect(next.total).toBe(2);
  });

  it("removes a row edited out of the filtered view", () => {
    const filters = parseTransactionFilters({ type: "buy", pageSize: "3" });
    const next = applyListChange(
      page(rows),
      { kind: "update", row: row("2", "2026-02-01", { type: "sell" }) },
      filters,
    );
    expect(next.rows.map((r) => r.id)).toEqual(["3"]);
    expect(next.total).toBe(1);
  });

  it("ignores rows that are not on this page", () => {
    const base = page(rows);
    expect(
      applyListChange(
        base,
        { kind: "update", row: row("zzz", "2026-01-01") },
        defaults,
      ),
    ).toBe(base);
  });
});

describe("applyListChange: delete", () => {
  const rows = [row("3", "2026-03-01"), row("2", "2026-02-01")];

  it("removes the row and recomputes total and page count", () => {
    const next = applyListChange(
      page(rows, { total: 4, pageCount: 2 }),
      { kind: "delete", id: "3" },
      defaults,
    );
    expect(next.rows.map((r) => r.id)).toEqual(["2"]);
    expect(next.total).toBe(3);
    expect(next.pageCount).toBe(1);
  });

  it("leaves the page untouched for an unknown id", () => {
    const base = page(rows);
    expect(
      applyListChange(base, { kind: "delete", id: "nope" }, defaults),
    ).toBe(base);
  });

  it("never lets the total go negative", () => {
    const next = applyListChange(
      page([row("1", "2026-01-01")], { total: 0 }),
      { kind: "delete", id: "1" },
      defaults,
    );
    expect(next.total).toBe(0);
  });
});
