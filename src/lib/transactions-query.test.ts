import { describe, expect, it } from "vitest";

import {
  MAX_PAGE,
  MAX_PAGE_SIZE,
  MAX_SEARCH_LENGTH,
  buildTransactionsHref,
  clampPage,
  clearFilters,
  filtersKey,
  filtersToSearchParams,
  findMatchingAssetIds,
  getOrderSpecs,
  getPageCount,
  getPageItems,
  getPageRange,
  hasActiveFilters,
  nextSort,
  parseTransactionFilters,
  updateFilters,
} from "./transactions-query";

const ASSET_ID = "3f2b8c1e-5a4d-4e8f-9b6a-1c2d3e4f5a6b";

const DEFAULTS = {
  type: undefined,
  asset: undefined,
  from: undefined,
  to: undefined,
  q: undefined,
  sort: "date",
  dir: "desc",
  page: 1,
  pageSize: 25,
} as const;

describe("parseTransactionFilters", () => {
  it("returns defaults for an empty URL", () => {
    expect(parseTransactionFilters({})).toEqual(DEFAULTS);
    expect(parseTransactionFilters(undefined)).toEqual(DEFAULTS);
    expect(parseTransactionFilters(new URLSearchParams())).toEqual(DEFAULTS);
  });

  it("parses a fully specified, valid URL", () => {
    const filters = parseTransactionFilters(
      new URLSearchParams(
        `type=sell&asset=${ASSET_ID}&from=2026-01-01&to=2026-03-31&q=apple&sort=price&dir=asc&page=3&pageSize=50`,
      ),
    );
    expect(filters).toEqual({
      type: "sell",
      asset: ASSET_ID,
      from: "2026-01-01",
      to: "2026-03-31",
      q: "apple",
      sort: "price",
      dir: "asc",
      page: 3,
      pageSize: 50,
    });
  });

  it("falls back to defaults for garbage values instead of throwing", () => {
    const filters = parseTransactionFilters({
      type: "hodl",
      asset: "not-a-uuid",
      from: "yesterday",
      to: "2026-02-30",
      sort: "DROP TABLE",
      dir: "sideways",
      page: "abc",
      pageSize: "lots",
    });
    expect(filters).toEqual(DEFAULTS);
  });

  it("clamps page and pageSize into safe ranges", () => {
    expect(parseTransactionFilters({ page: "-5" }).page).toBe(1);
    expect(parseTransactionFilters({ page: "0" }).page).toBe(1);
    expect(parseTransactionFilters({ page: "999999999999" }).page).toBe(
      MAX_PAGE,
    );
    expect(parseTransactionFilters({ pageSize: "100000" }).pageSize).toBe(
      MAX_PAGE_SIZE,
    );
    expect(parseTransactionFilters({ pageSize: "0" }).pageSize).toBe(1);
  });

  it("truncates fractional numbers", () => {
    expect(parseTransactionFilters({ page: "2.9" }).page).toBe(2);
  });

  it("takes the first value of a repeated parameter", () => {
    expect(parseTransactionFilters({ type: ["buy", "sell"] }).type).toBe("buy");
    expect(parseTransactionFilters({ page: ["4", "9"] }).page).toBe(4);
  });

  it("trims and length-limits the search text, treating blank as absent", () => {
    expect(parseTransactionFilters({ q: "  aapl  " }).q).toBe("aapl");
    expect(parseTransactionFilters({ q: "   " }).q).toBeUndefined();
    expect(parseTransactionFilters({ q: "x".repeat(500) }).q).toHaveLength(
      MAX_SEARCH_LENGTH,
    );
  });

  it("swaps an inverted date range", () => {
    const filters = parseTransactionFilters({
      from: "2026-06-01",
      to: "2026-01-01",
    });
    expect(filters.from).toBe("2026-01-01");
    expect(filters.to).toBe("2026-06-01");
  });

  it("accepts numbers (as sent from a Server Action payload)", () => {
    expect(parseTransactionFilters({ page: 2, pageSize: 10 })).toMatchObject({
      page: 2,
      pageSize: 10,
    });
  });

  it("ignores unknown parameters", () => {
    expect(parseTransactionFilters({ utm_source: "x", foo: ["a"] })).toEqual(
      DEFAULTS,
    );
  });
});

describe("filters <-> URL", () => {
  it("omits defaults so URLs stay canonical", () => {
    expect(filtersToSearchParams(parseTransactionFilters({})).toString()).toBe(
      "",
    );
    expect(buildTransactionsHref(parseTransactionFilters({}))).toBe(
      "/transactions",
    );
  });

  it("round-trips through the URL", () => {
    const original = parseTransactionFilters({
      type: "buy",
      q: "bit coin",
      sort: "asset",
      dir: "asc",
      page: "4",
      pageSize: "10",
      from: "2026-01-01",
    });
    const href = buildTransactionsHref(original);
    const reparsed = parseTransactionFilters(
      new URL(href, "http://x").searchParams,
    );
    expect(reparsed).toEqual(original);
  });

  it("produces equal cache keys for equal views", () => {
    const a = parseTransactionFilters({ type: "buy", page: "2" });
    const b = parseTransactionFilters({ page: 2, type: "buy", junk: "1" });
    expect(filtersKey(a)).toBe(filtersKey(b));
  });
});

describe("updateFilters / clearFilters / nextSort", () => {
  const base = parseTransactionFilters({ page: "5", type: "buy", q: "a" });

  it("resets to page 1 whenever a filter changes", () => {
    expect(updateFilters(base, { type: "sell" }).page).toBe(1);
    expect(updateFilters(base, { q: "b" }).page).toBe(1);
  });

  it("keeps the explicit page when only paginating", () => {
    expect(updateFilters(base, { page: 7 }).page).toBe(7);
  });

  it("clears filters but keeps sorting and page size", () => {
    const sorted = parseTransactionFilters({
      type: "buy",
      sort: "price",
      dir: "asc",
      pageSize: "50",
      page: "3",
    });
    const cleared = clearFilters(sorted);
    expect(hasActiveFilters(cleared)).toBe(false);
    expect(cleared).toMatchObject({
      sort: "price",
      dir: "asc",
      pageSize: 50,
      page: 1,
    });
  });

  it("reports whether any filter is active", () => {
    expect(hasActiveFilters(parseTransactionFilters({}))).toBe(false);
    expect(hasActiveFilters(parseTransactionFilters({ q: "x" }))).toBe(true);
    // Sorting and paging are not filters.
    expect(
      hasActiveFilters(parseTransactionFilters({ sort: "price", page: "2" })),
    ).toBe(false);
  });

  it("toggles direction when sorting by the same column", () => {
    const next = nextSort(parseTransactionFilters({}), "date");
    expect(next).toMatchObject({ sort: "date", dir: "asc", page: 1 });
  });

  it("starts a new column with a sensible direction", () => {
    const base = parseTransactionFilters({});
    expect(nextSort(base, "asset")).toMatchObject({
      sort: "asset",
      dir: "asc",
    });
    expect(nextSort(base, "price")).toMatchObject({
      sort: "price",
      dir: "desc",
    });
  });
});

describe("getOrderSpecs", () => {
  it("sorts by date with stable tie-breakers", () => {
    expect(getOrderSpecs("date", "desc")).toEqual([
      { column: "executed_at", ascending: false },
      { column: "created_at", ascending: false },
      { column: "id", ascending: true },
    ]);
  });

  it("adds date as secondary key for other columns and ends with the id", () => {
    const specs = getOrderSpecs("price", "asc");
    expect(specs[0]).toEqual({ column: "price", ascending: true });
    expect(specs[1]).toEqual({ column: "executed_at", ascending: false });
    expect(specs.at(-1)).toEqual({ column: "id", ascending: true });
  });

  it("sorts by asset through the related table", () => {
    expect(getOrderSpecs("asset", "asc")[0].column).toBe("assets(symbol)");
  });
});

describe("pagination maths", () => {
  it("computes inclusive ranges", () => {
    expect(getPageRange(1, 25)).toEqual({ from: 0, to: 24 });
    expect(getPageRange(3, 10)).toEqual({ from: 20, to: 29 });
  });

  it("computes page counts (at least one page)", () => {
    expect(getPageCount(0, 25)).toBe(1);
    expect(getPageCount(25, 25)).toBe(1);
    expect(getPageCount(26, 25)).toBe(2);
  });

  it("clamps a page into range", () => {
    expect(clampPage(99, 4)).toBe(4);
    expect(clampPage(0, 4)).toBe(1);
  });

  it("builds compact page lists with ellipses", () => {
    expect(getPageItems(1, 1)).toEqual([1]);
    expect(getPageItems(2, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(getPageItems(1, 20)).toEqual([1, 2, "end-ellipsis", 20]);
    expect(getPageItems(10, 20)).toEqual([
      1,
      "start-ellipsis",
      9,
      10,
      11,
      "end-ellipsis",
      20,
    ]);
    expect(getPageItems(20, 20)).toEqual([1, "start-ellipsis", 19, 20]);
  });
});

describe("findMatchingAssetIds", () => {
  const assets = [
    { id: "1", symbol: "AAPL", name: "Apple Inc." },
    { id: "2", symbol: "BTC", name: "Bitcoin" },
    { id: "3", symbol: "VOO", name: "Vanguard S&P 500 ETF" },
  ];

  it("matches symbol or name case-insensitively", () => {
    expect(findMatchingAssetIds(assets, "aapl")).toEqual(["1"]);
    expect(findMatchingAssetIds(assets, "COIN")).toEqual(["2"]);
    expect(findMatchingAssetIds(assets, "vanguard")).toEqual(["3"]);
  });

  it("returns nothing when there is no match, everything for blank", () => {
    expect(findMatchingAssetIds(assets, "zzz")).toEqual([]);
    expect(findMatchingAssetIds(assets, " ")).toHaveLength(3);
  });
});
