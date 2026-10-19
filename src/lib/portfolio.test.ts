import { describe, expect, it } from "vitest";

import {
  computeAllocation,
  computeHoldings,
  computeMarketValue,
  computePnL,
  computeValueSeries,
  findOversells,
  getLatestPrices,
  type AssetInfo,
  type Holding,
  type PortfolioTransaction,
  type PricePoint,
  type TransactionType,
} from "./portfolio";

function tx(
  type: TransactionType,
  quantity: number,
  price: number,
  executedAt: string,
  assetId = "A",
  id?: string,
): PortfolioTransaction {
  return { id, assetId, type, quantity, price, executedAt };
}

function holding(overrides: Partial<Holding> & { assetId: string }): Holding {
  return {
    quantity: 0,
    avgCost: 0,
    costBasis: 0,
    realizedPnL: 0,
    totalInvested: 0,
    ...overrides,
  };
}

function holdingFor(transactions: PortfolioTransaction[], assetId = "A") {
  const found = computeHoldings(transactions).find(
    (h) => h.assetId === assetId,
  );
  if (!found) throw new Error(`No holding for ${assetId}`);
  return found;
}

describe("computeHoldings", () => {
  it("returns no holdings for an empty portfolio", () => {
    expect(computeHoldings([])).toEqual([]);
  });

  it("tracks quantity and cost for a single buy", () => {
    expect(holdingFor([tx("buy", 10, 100, "2026-01-01")])).toEqual({
      assetId: "A",
      quantity: 10,
      avgCost: 100,
      costBasis: 1000,
      realizedPnL: 0,
      totalInvested: 1000,
    });
  });

  it("blends multiple buys into an average cost", () => {
    const h = holdingFor([
      tx("buy", 10, 100, "2026-01-01"),
      tx("buy", 10, 200, "2026-01-02"),
    ]);
    expect(h.quantity).toBe(20);
    expect(h.avgCost).toBe(150);
    expect(h.costBasis).toBe(3000);
  });

  it("realizes a gain on a partial sell and keeps the average cost", () => {
    const h = holdingFor([
      tx("buy", 10, 100, "2026-01-01"),
      tx("buy", 10, 200, "2026-01-02"),
      tx("sell", 5, 180, "2026-01-03"),
    ]);
    expect(h.quantity).toBe(15);
    expect(h.avgCost).toBe(150);
    expect(h.costBasis).toBe(2250);
    expect(h.realizedPnL).toBe(150); // (180 - 150) * 5
  });

  it("realizes a loss when selling below average cost", () => {
    const h = holdingFor([
      tx("buy", 10, 100, "2026-01-01"),
      tx("sell", 5, 80, "2026-01-02"),
    ]);
    expect(h.realizedPnL).toBe(-100); // (80 - 100) * 5
  });

  it("keeps realized P&L when a position closes and starts a fresh average on re-buy", () => {
    const closed = holdingFor([
      tx("buy", 10, 100, "2026-01-01"),
      tx("sell", 10, 130, "2026-01-02"),
    ]);
    expect(closed.quantity).toBe(0);
    expect(closed.avgCost).toBe(0);
    expect(closed.costBasis).toBe(0);
    expect(closed.realizedPnL).toBe(300);

    const reopened = holdingFor([
      tx("buy", 10, 100, "2026-01-01"),
      tx("sell", 10, 130, "2026-01-02"),
      tx("buy", 5, 200, "2026-01-03"),
    ]);
    expect(reopened.avgCost).toBe(200);
    expect(reopened.realizedPnL).toBe(300);
  });

  it("clamps a sell larger than the position instead of going negative", () => {
    const h = holdingFor([
      tx("buy", 10, 100, "2026-01-01"),
      tx("sell", 15, 110, "2026-01-02"),
    ]);
    expect(h.quantity).toBe(0);
    expect(h.realizedPnL).toBe(100); // only the 10 owned units are realized
  });

  it("does not depend on input order", () => {
    const ordered = [
      tx("buy", 10, 100, "2026-01-01"),
      tx("sell", 4, 150, "2026-01-02"),
      tx("buy", 6, 120, "2026-01-03"),
    ];
    const shuffled = [ordered[2], ordered[0], ordered[1]];
    expect(computeHoldings(shuffled)).toEqual(computeHoldings(ordered));
  });

  it("processes a same-day buy before a same-day sell", () => {
    const h = holdingFor([
      tx("sell", 10, 110, "2026-01-01"),
      tx("buy", 10, 100, "2026-01-01"),
    ]);
    expect(h.quantity).toBe(0);
    expect(h.realizedPnL).toBe(100);
  });

  it("keeps assets independent", () => {
    const holdings = computeHoldings([
      tx("buy", 10, 100, "2026-01-01", "A"),
      tx("buy", 2, 500, "2026-01-01", "B"),
      tx("sell", 1, 600, "2026-01-02", "B"),
    ]);
    expect(holdings.find((h) => h.assetId === "A")?.quantity).toBe(10);
    expect(holdings.find((h) => h.assetId === "B")?.quantity).toBe(1);
    expect(holdings.find((h) => h.assetId === "B")?.realizedPnL).toBe(100);
  });

  it("avoids floating-point drift in fractional quantities", () => {
    const h = holdingFor([
      tx("buy", 0.1, 50000, "2026-01-01"),
      tx("buy", 0.2, 50000, "2026-01-02"),
    ]);
    expect(h.quantity).toBe(0.3);
  });
});

describe("findOversells", () => {
  it("returns nothing for a valid history", () => {
    expect(
      findOversells([
        tx("buy", 10, 100, "2026-01-01"),
        tx("sell", 10, 110, "2026-01-02"),
      ]),
    ).toEqual([]);
  });

  it("flags a sell larger than the units held", () => {
    const result = findOversells([
      tx("buy", 5, 100, "2026-01-01"),
      tx("sell", 8, 110, "2026-01-02", "A", "sell-1"),
    ]);
    expect(result).toEqual([
      {
        assetId: "A",
        executedAt: "2026-01-02",
        requested: 8,
        available: 5,
        transactionId: "sell-1",
      },
    ]);
  });

  it("flags a sell dated before any buy", () => {
    const result = findOversells([
      tx("sell", 1, 110, "2026-01-01"),
      tx("buy", 10, 100, "2026-01-02"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].available).toBe(0);
  });

  it("catches a deletion that would strand a later sell", () => {
    const history = [
      tx("buy", 10, 100, "2026-01-01", "A", "buy-1"),
      tx("sell", 10, 110, "2026-01-02", "A", "sell-1"),
    ];
    const withoutBuy = history.filter((t) => t.id !== "buy-1");
    expect(findOversells(history)).toEqual([]);
    expect(findOversells(withoutBuy).map((o) => o.transactionId)).toEqual([
      "sell-1",
    ]);
  });
});

describe("getLatestPrices", () => {
  const history: PricePoint[] = [
    { assetId: "A", date: "2026-01-01", price: 10 },
    { assetId: "A", date: "2026-01-03", price: 12 },
    { assetId: "A", date: "2026-01-10", price: 99 },
    { assetId: "B", date: "2026-01-02", price: 5 },
  ];

  it("returns the most recent price per asset", () => {
    expect(getLatestPrices(history)).toEqual({ A: 99, B: 5 });
  });

  it("ignores prices after the as-of date (last known price)", () => {
    expect(getLatestPrices(history, "2026-01-05")).toEqual({ A: 12, B: 5 });
  });
});

describe("computeMarketValue", () => {
  it("values open positions and skips closed ones", () => {
    const result = computeMarketValue(
      [
        holding({ assetId: "A", quantity: 10, avgCost: 100, costBasis: 1000 }),
        holding({ assetId: "B", quantity: 0, realizedPnL: 50 }),
      ],
      { A: 120, B: 7 },
    );
    expect(result.totalValue).toBe(1200);
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]).toMatchObject({ assetId: "A", value: 1200 });
  });

  it("falls back to average cost, flagged, when no price exists", () => {
    const result = computeMarketValue(
      [holding({ assetId: "A", quantity: 10, avgCost: 100, costBasis: 1000 })],
      {},
    );
    expect(result.totalValue).toBe(1000);
    expect(result.positions[0].priceMissing).toBe(true);
  });
});

describe("computeAllocation", () => {
  const assets: AssetInfo[] = [
    { id: "A", symbol: "AAA", name: "Alpha", type: "stock" },
    { id: "B", symbol: "BBB", name: "Beta ETF", type: "etf" },
    { id: "C", symbol: "CCC", name: "Gamma", type: "stock" },
  ];
  const holdings = [
    holding({ assetId: "A", quantity: 10, avgCost: 90, costBasis: 900 }),
    holding({ assetId: "B", quantity: 5, avgCost: 90, costBasis: 450 }),
    holding({ assetId: "C", quantity: 10, avgCost: 40, costBasis: 400 }),
  ];
  const prices = { A: 100, B: 100, C: 50 };

  it("computes value share per asset and per asset type", () => {
    const result = computeAllocation(holdings, prices, assets);
    expect(result.totalValue).toBe(2000);
    expect(result.byAsset.map((s) => [s.assetId, s.share])).toEqual([
      ["A", 0.5],
      ["B", 0.25],
      ["C", 0.25],
    ]);
    expect(result.byType).toEqual([
      { type: "stock", value: 1500, share: 0.75 },
      { type: "etf", value: 500, share: 0.25 },
    ]);
  });

  it("has shares that sum to 1", () => {
    const result = computeAllocation(holdings, prices, assets);
    const sum = result.byAsset.reduce((acc, s) => acc + s.share, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it("returns empty allocation for an empty portfolio", () => {
    expect(computeAllocation([], {}, assets)).toEqual({
      totalValue: 0,
      byAsset: [],
      byType: [],
    });
  });

  it("throws when a held asset has no metadata", () => {
    expect(() => computeAllocation(holdings, prices, [assets[0]])).toThrow(
      /Unknown asset/,
    );
  });
});

describe("computePnL", () => {
  it("reports unrealized P&L for an open position", () => {
    const pnl = computePnL(
      computeHoldings([tx("buy", 10, 100, "2026-01-01")]),
      {
        A: 120,
      },
    );
    expect(pnl).toMatchObject({
      marketValue: 1200,
      costBasis: 1000,
      unrealized: 200,
      realized: 0,
      total: 200,
      invested: 1000,
      percent: 0.2,
    });
  });

  it("combines realized and unrealized P&L after a partial sell", () => {
    const holdings = computeHoldings([
      tx("buy", 10, 100, "2026-01-01"),
      tx("sell", 4, 150, "2026-01-02"),
    ]);
    const pnl = computePnL(holdings, { A: 120 });
    expect(pnl.realized).toBe(200); // (150 - 100) * 4
    expect(pnl.unrealized).toBe(120); // 6 units * (120 - 100)
    expect(pnl.total).toBe(320);
    expect(pnl.percent).toBeCloseTo(0.32, 10); // 320 / 1000 invested
  });

  it("counts realized P&L from fully closed positions", () => {
    const holdings = computeHoldings([
      tx("buy", 10, 100, "2026-01-01"),
      tx("sell", 10, 110, "2026-01-02"),
    ]);
    const pnl = computePnL(holdings, {});
    expect(pnl.marketValue).toBe(0);
    expect(pnl.total).toBe(100);
    expect(pnl.percent).toBeCloseTo(0.1, 10);
  });

  it("shows zero unrealized P&L when the price is unknown", () => {
    const pnl = computePnL(
      computeHoldings([tx("buy", 10, 100, "2026-01-01")]),
      {},
    );
    expect(pnl.unrealized).toBe(0);
    expect(pnl.marketValue).toBe(1000);
  });

  it("returns zeros (not NaN) for an empty portfolio", () => {
    expect(computePnL([], {})).toEqual({
      marketValue: 0,
      costBasis: 0,
      unrealized: 0,
      realized: 0,
      total: 0,
      invested: 0,
      percent: 0,
      byAsset: [],
    });
  });

  it("breaks P&L down per asset", () => {
    const holdings = computeHoldings([
      tx("buy", 10, 100, "2026-01-01", "A"),
      tx("buy", 10, 50, "2026-01-01", "B"),
    ]);
    const pnl = computePnL(holdings, { A: 110, B: 40 });
    const byId = Object.fromEntries(pnl.byAsset.map((a) => [a.assetId, a]));
    expect(byId.A.total).toBe(100);
    expect(byId.A.percent).toBeCloseTo(0.1, 10);
    expect(byId.B.total).toBe(-100);
    expect(byId.B.percent).toBeCloseTo(-0.2, 10);
    expect(pnl.total).toBe(0);
  });
});

describe("computeValueSeries", () => {
  const prices: PricePoint[] = [
    { assetId: "A", date: "2026-01-01", price: 100 },
    { assetId: "A", date: "2026-01-03", price: 110 },
  ];

  it("returns an empty series for an empty portfolio", () => {
    expect(computeValueSeries([], prices, "All", "2026-01-04")).toEqual([]);
  });

  it("starts at the first transaction and carries the last known price over gaps", () => {
    const series = computeValueSeries(
      [tx("buy", 10, 100, "2026-01-01")],
      prices,
      "All",
      "2026-01-04",
    );
    expect(series.map((p) => [p.date, p.value])).toEqual([
      ["2026-01-01", 1000],
      ["2026-01-02", 1000], // no price today: last known (100)
      ["2026-01-03", 1100],
      ["2026-01-04", 1100], // no price today: last known (110)
    ]);
    expect(series.every((p) => p.costBasis === 1000)).toBe(true);
  });

  it("values at cost until the first price is available", () => {
    const series = computeValueSeries(
      [tx("buy", 10, 100, "2026-01-01")],
      [{ assetId: "A", date: "2026-01-03", price: 110 }],
      "All",
      "2026-01-03",
    );
    expect(series.map((p) => p.value)).toEqual([1000, 1000, 1100]);
  });

  it("reduces value after a sell", () => {
    const series = computeValueSeries(
      [tx("buy", 10, 100, "2026-01-01"), tx("sell", 4, 120, "2026-01-03")],
      [{ assetId: "A", date: "2026-01-01", price: 100 }],
      "All",
      "2026-01-03",
    );
    expect(series.map((p) => p.value)).toEqual([1000, 1000, 600]);
    expect(series[2].costBasis).toBe(600);
  });

  it("limits a 1M range to the last 30 days inclusive but keeps earlier holdings", () => {
    const series = computeValueSeries(
      [tx("buy", 10, 100, "2025-01-01")],
      [{ assetId: "A", date: "2025-01-01", price: 100 }],
      "1M",
      "2026-01-31",
    );
    expect(series).toHaveLength(31);
    expect(series[0].date).toBe("2026-01-01");
    expect(series[30].date).toBe("2026-01-31");
    expect(series[0].value).toBe(1000);
  });

  it("does not start before the first transaction when the range is wider", () => {
    const series = computeValueSeries(
      [tx("buy", 10, 100, "2026-01-21")],
      [{ assetId: "A", date: "2026-01-21", price: 100 }],
      "1Y",
      "2026-01-31",
    );
    expect(series).toHaveLength(11);
    expect(series[0].date).toBe("2026-01-21");
  });

  it("ignores transactions after the as-of date", () => {
    const series = computeValueSeries(
      [tx("buy", 10, 100, "2026-01-01"), tx("buy", 10, 100, "2026-02-01")],
      prices,
      "All",
      "2026-01-02",
    );
    expect(series).toHaveLength(2);
    expect(series[1].value).toBe(1000);
  });
});
