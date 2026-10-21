import { describe, expect, it } from "vitest";

import {
  buildDashboardModel,
  collapseSlices,
  type AllocationSlice,
  type DashboardInput,
} from "./dashboard";
import type { AssetInfo, PricePoint } from "./portfolio";

const assets: AssetInfo[] = [
  { id: "a", symbol: "AAA", name: "Alpha Corp", type: "stock" },
  { id: "b", symbol: "BBB", name: "Beta ETF", type: "etf" },
];

const priceHistory: PricePoint[] = [
  { assetId: "a", date: "2026-01-01", price: 100 },
  { assetId: "a", date: "2026-01-03", price: 120 },
  { assetId: "b", date: "2026-01-01", price: 50 },
  { assetId: "b", date: "2026-01-03", price: 40 },
];

const input: DashboardInput = {
  asOf: "2026-01-03",
  assets,
  priceHistory,
  transactions: [
    {
      assetId: "a",
      type: "buy",
      quantity: 10,
      price: 100,
      executedAt: "2026-01-01",
    },
    {
      assetId: "b",
      type: "buy",
      quantity: 10,
      price: 50,
      executedAt: "2026-01-01",
    },
  ],
};

describe("buildDashboardModel", () => {
  const model = buildDashboardModel(input);

  it("totals value and P&L from the latest prices", () => {
    expect(model.hasTransactions).toBe(true);
    expect(model.totalValue).toBe(1600); // 10*120 + 10*40
    expect(model.pnl.total).toBe(100); // +200 on A, -100 on B
    expect(model.pnl.invested).toBe(1500);
    expect(model.pnl.percent).toBeCloseTo(100 / 1500, 10);
  });

  it("picks the best and worst performing assets by return", () => {
    expect(model.best).toMatchObject({ symbol: "AAA", percent: 0.2 });
    expect(model.worst).toMatchObject({ symbol: "BBB" });
    expect(model.worst?.percent).toBeCloseTo(-0.2, 10);
  });

  it("builds labelled allocation slices by asset and by type", () => {
    expect(model.allocationByAsset.map((s) => s.label)).toEqual(["AAA", "BBB"]);
    expect(model.allocationByType.map((s) => s.label)).toEqual([
      "Stocks",
      "ETFs",
    ]);
    expect(model.allocationByAsset[0].share).toBeCloseTo(0.75, 10);
  });

  it("provides a series for every range, ending at the as-of value", () => {
    for (const range of ["1M", "3M", "1Y", "All"] as const) {
      const series = model.seriesByRange[range];
      expect(series.at(-1)).toMatchObject({ date: "2026-01-03", value: 1600 });
    }
  });

  it("is JSON-serializable so it can cross the server/client boundary", () => {
    expect(JSON.parse(JSON.stringify(model))).toEqual(model);
  });

  it("handles a portfolio with no transactions", () => {
    const empty = buildDashboardModel({ ...input, transactions: [] });
    expect(empty).toMatchObject({
      hasTransactions: false,
      totalValue: 0,
      best: null,
      worst: null,
      allocationByAsset: [],
      allocationByType: [],
    });
    expect(empty.pnl.percent).toBe(0);
    expect(empty.seriesByRange.All).toEqual([]);
  });

  it("does not report the same single asset as both best and worst", () => {
    const single = buildDashboardModel({
      ...input,
      transactions: [input.transactions[0]],
    });
    expect(single.best?.symbol).toBe("AAA");
    expect(single.worst).toBeNull();
  });
});

describe("collapseSlices", () => {
  const slice = (n: number): AllocationSlice => ({
    key: `k${n}`,
    label: `L${n}`,
    value: 100 - n,
    share: (100 - n) / 1000,
  });
  const many = Array.from({ length: 12 }, (_, i) => slice(i));

  it("leaves short lists untouched", () => {
    expect(collapseSlices(many.slice(0, 5), 8)).toHaveLength(5);
  });

  it("merges the tail into an Other slice that preserves totals", () => {
    const result = collapseSlices(many, 8);
    expect(result).toHaveLength(8);
    const other = result[7];
    expect(other.label).toBe("Other (5)");
    expect(other.value).toBe(many.slice(7).reduce((s, x) => s + x.value, 0));
    const totalBefore = many.reduce((s, x) => s + x.share, 0);
    const totalAfter = result.reduce((s, x) => s + x.share, 0);
    expect(totalAfter).toBeCloseTo(totalBefore, 10);
  });
});
