import { describe, expect, it } from "vitest";

import { findOversells, type PortfolioTransaction } from "../src/lib/portfolio";
import {
  PORTFOLIO_PLANS,
  PRICE_ANCHOR_DATE,
  SEED_ASSETS,
  buildPriceLookup,
  generatePriceSeries,
  generateTransactions,
  historyWindowStart,
  type SeedPrice,
} from "./seed-data";

const TODAY = "2026-10-09";

function allSeries(through = TODAY): Map<string, SeedPrice[]> {
  return new Map(
    SEED_ASSETS.map((asset) => [
      asset.symbol,
      generatePriceSeries(asset, through),
    ]),
  );
}

describe("seed assets", () => {
  it("has 15-20 unique assets covering every asset type", () => {
    expect(SEED_ASSETS.length).toBeGreaterThanOrEqual(15);
    expect(SEED_ASSETS.length).toBeLessThanOrEqual(20);
    expect(new Set(SEED_ASSETS.map((a) => a.symbol)).size).toBe(
      SEED_ASSETS.length,
    );
    expect(new Set(SEED_ASSETS.map((a) => a.type))).toEqual(
      new Set(["stock", "etf", "crypto", "bond"]),
    );
  });
});

describe("generatePriceSeries", () => {
  const [asset] = SEED_ASSETS;

  it("is deterministic", () => {
    expect(generatePriceSeries(asset, TODAY)).toEqual(
      generatePriceSeries(asset, TODAY),
    );
  });

  it("is stable when the end date moves (prefix property)", () => {
    const shorter = generatePriceSeries(asset, "2026-01-01");
    const longer = generatePriceSeries(asset, TODAY);
    expect(longer.slice(0, shorter.length)).toEqual(shorter);
  });

  it("differs between assets", () => {
    const [a, b] = [SEED_ASSETS[0], SEED_ASSETS[1]];
    const ra = generatePriceSeries(a, "2025-12-01").map(
      (p) => p.price / a.startPrice,
    );
    const rb = generatePriceSeries(b, "2025-12-01").map(
      (p) => p.price / b.startPrice,
    );
    expect(ra).not.toEqual(rb);
  });

  it("starts at the anchor with the start price and has one point per day", () => {
    const series = generatePriceSeries(asset, "2025-10-10");
    expect(series[0]).toEqual({
      date: PRICE_ANCHOR_DATE,
      price: asset.startPrice,
    });
    expect(series).toHaveLength(10);
  });

  it("covers the whole stored history window", () => {
    expect(historyWindowStart(TODAY) >= PRICE_ANCHOR_DATE).toBe(true);
  });

  it("keeps every price positive and within a sane band of its start price", () => {
    for (const [symbol, series] of allSeries()) {
      const start = SEED_ASSETS.find((a) => a.symbol === symbol)!.startPrice;
      for (const { price } of series) {
        expect(price).toBeGreaterThan(0);
        expect(price).toBeGreaterThan(start * 0.05);
        expect(price).toBeLessThan(start * 20);
      }
    }
  });
});

describe("generateTransactions", () => {
  const lookup = buildPriceLookup(allSeries());
  const byPlan = PORTFOLIO_PLANS.map((plan) => ({
    plan,
    transactions: generateTransactions(plan, lookup, TODAY),
  }));
  const all = byPlan.flatMap((p) => p.transactions);

  it("is deterministic", () => {
    expect(generateTransactions(PORTFOLIO_PLANS[0], lookup, TODAY)).toEqual(
      byPlan[0].transactions,
    );
  });

  it("creates 100+ transactions including both buys and sells", () => {
    expect(all.length).toBeGreaterThanOrEqual(100);
    expect(all.some((t) => t.type === "buy")).toBe(true);
    expect(all.some((t) => t.type === "sell")).toBe(true);
  });

  it("only uses valid quantities, prices and dates inside the history window", () => {
    const start = historyWindowStart(TODAY);
    for (const t of all) {
      expect(t.quantity).toBeGreaterThan(0);
      expect(t.price).toBeGreaterThanOrEqual(0);
      expect(t.executedAt >= start && t.executedAt <= TODAY).toBe(true);
    }
  });

  it("never sells more than is held (validated with the app's own logic)", () => {
    for (const { transactions } of byPlan) {
      const asApp: PortfolioTransaction[] = transactions.map((t) => ({
        assetId: t.symbol,
        type: t.type,
        quantity: t.quantity,
        price: t.price,
        executedAt: t.executedAt,
      }));
      expect(findOversells(asApp)).toEqual([]);
    }
  });

  it("uses a price that exists in the generated history", () => {
    for (const t of all) {
      expect(lookup.get(t.symbol)?.get(t.executedAt)).toBe(t.price);
    }
  });
});
