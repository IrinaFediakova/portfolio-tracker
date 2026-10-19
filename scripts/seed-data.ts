/**
 * Pure, deterministic demo-data generation (no I/O). scripts/seed.ts persists it.
 *
 * Determinism: every random choice comes from a seeded PRNG (mulberry32), keyed
 * by asset symbol or portfolio name. Prices are a geometric random walk
 * anchored to a FIXED calendar date, so the price of a given asset on a given
 * date is identical on every run and on every machine, regardless of "today".
 *
 * All prices are SYNTHETIC. Nothing here is real market data.
 */
import { addDays, daysBetween, eachDay, type ISODate } from "../src/lib/dates";
import type { AssetType, TransactionType } from "../src/lib/portfolio";

// -----------------------------------------------------------------------------
// Seeded randomness
// -----------------------------------------------------------------------------

export type Rng = () => number;

/** FNV-1a: stable 32-bit string hash used to derive per-asset seeds. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** mulberry32: small, fast PRNG returning floats in [0, 1). */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample via the Box-Muller transform. */
function gaussian(rng: Rng): number {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function randomInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

// -----------------------------------------------------------------------------
// Assets
// -----------------------------------------------------------------------------

export interface SeedAsset {
  symbol: string;
  name: string;
  type: AssetType;
  /** Price on PRICE_ANCHOR_DATE. */
  startPrice: number;
  /**
   * Curated PRNG seed. Picked so the demo year tells a believable story (some
   * winners, some losers) instead of whatever the raw random walk produced.
   */
  seed: number;
  /** Annualised expected return. */
  drift: number;
  /** Annualised volatility. */
  volatility: number;
}

export const SEED_ASSETS: readonly SeedAsset[] = [
  // Stocks
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    type: "stock",
    startPrice: 255,
    seed: 5,
    drift: 0.1,
    volatility: 0.28,
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corporation",
    type: "stock",
    startPrice: 520,
    seed: 1,
    drift: 0.12,
    volatility: 0.25,
  },
  {
    symbol: "NVDA",
    name: "NVIDIA Corporation",
    type: "stock",
    startPrice: 185,
    seed: 1,
    drift: 0.3,
    volatility: 0.55,
  },
  {
    symbol: "GOOGL",
    name: "Alphabet Inc.",
    type: "stock",
    startPrice: 245,
    seed: 6,
    drift: 0.12,
    volatility: 0.3,
  },
  {
    symbol: "AMZN",
    name: "Amazon.com, Inc.",
    type: "stock",
    startPrice: 220,
    seed: 3,
    drift: 0.12,
    volatility: 0.32,
  },
  {
    symbol: "TSLA",
    name: "Tesla, Inc.",
    type: "stock",
    startPrice: 430,
    seed: 3,
    drift: 0.08,
    volatility: 0.6,
  },
  {
    symbol: "JPM",
    name: "JPMorgan Chase & Co.",
    type: "stock",
    startPrice: 295,
    seed: 1,
    drift: 0.09,
    volatility: 0.22,
  },
  {
    symbol: "JNJ",
    name: "Johnson & Johnson",
    type: "stock",
    startPrice: 175,
    seed: 4,
    drift: 0.04,
    volatility: 0.16,
  },
  // ETFs
  {
    symbol: "VOO",
    name: "Vanguard S&P 500 ETF",
    type: "etf",
    startPrice: 610,
    seed: 13,
    drift: 0.09,
    volatility: 0.15,
  },
  {
    symbol: "VTI",
    name: "Vanguard Total Stock Market ETF",
    type: "etf",
    startPrice: 330,
    seed: 4,
    drift: 0.09,
    volatility: 0.15,
  },
  {
    symbol: "QQQ",
    name: "Invesco QQQ Trust",
    type: "etf",
    startPrice: 600,
    seed: 1,
    drift: 0.12,
    volatility: 0.21,
  },
  {
    symbol: "VXUS",
    name: "Vanguard Total International Stock ETF",
    type: "etf",
    startPrice: 72,
    seed: 5,
    drift: 0.06,
    volatility: 0.16,
  },
  // Crypto
  {
    symbol: "BTC",
    name: "Bitcoin",
    type: "crypto",
    startPrice: 114000,
    seed: 2,
    drift: 0.25,
    volatility: 0.55,
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    type: "crypto",
    startPrice: 4100,
    seed: 1,
    drift: 0.2,
    volatility: 0.7,
  },
  {
    symbol: "SOL",
    name: "Solana",
    type: "crypto",
    startPrice: 205,
    seed: 4,
    drift: 0.3,
    volatility: 0.85,
  },
  {
    symbol: "ADA",
    name: "Cardano",
    type: "crypto",
    startPrice: 0.82,
    seed: 2,
    drift: 0.1,
    volatility: 0.85,
  },
  // Bonds (quoted per 100 of par)
  {
    symbol: "UST10",
    name: "US Treasury 10Y Note",
    type: "bond",
    startPrice: 97,
    seed: 2,
    drift: 0.03,
    volatility: 0.05,
  },
  {
    symbol: "UST2",
    name: "US Treasury 2Y Note",
    type: "bond",
    startPrice: 99.5,
    seed: 1,
    drift: 0.025,
    volatility: 0.015,
  },
  {
    symbol: "CORPAA",
    name: "Corporate Bond AA 5Y",
    type: "bond",
    startPrice: 101,
    seed: 2,
    drift: 0.04,
    volatility: 0.035,
  },
];

// -----------------------------------------------------------------------------
// Prices
// -----------------------------------------------------------------------------

/** Fixed start of every random walk; keeps prices stable across runs. */
export const PRICE_ANCHOR_DATE: ISODate = "2025-10-01";
/** Days of history written to the database (a year, inclusive of today). */
export const PRICE_HISTORY_DAYS = 366;

const DAYS_PER_YEAR = 365;

export interface SeedPrice {
  date: ISODate;
  price: number;
}

function roundPrice(price: number): number {
  return price >= 100
    ? Math.round(price * 100) / 100
    : Math.round(price * 10_000) / 10_000;
}

/**
 * Daily prices from PRICE_ANCHOR_DATE through `through` (inclusive):
 * log-return = (drift - vol^2 / 2) * dt + vol * sqrt(dt) * N(0, 1).
 */
export function generatePriceSeries(
  asset: SeedAsset,
  through: ISODate,
): SeedPrice[] {
  const rng = createRng(hashString(`${asset.symbol}:${asset.seed}`));
  const dt = 1 / DAYS_PER_YEAR;
  const driftPerStep = (asset.drift - 0.5 * asset.volatility ** 2) * dt;
  const volPerStep = asset.volatility * Math.sqrt(dt);

  let price = asset.startPrice;
  return eachDay(PRICE_ANCHOR_DATE, through).map((date, index) => {
    if (index > 0) price *= Math.exp(driftPerStep + volPerStep * gaussian(rng));
    return { date, price: roundPrice(Math.max(price, 0.0001)) };
  });
}

/** The slice of a series that is actually stored (the last PRICE_HISTORY_DAYS). */
export function historyWindowStart(today: ISODate): ISODate {
  return addDays(today, -(PRICE_HISTORY_DAYS - 1));
}

// -----------------------------------------------------------------------------
// Portfolios and transactions
// -----------------------------------------------------------------------------

interface HoldingPlan {
  symbol: string;
  /** Typical amount (USD) per periodic buy. The first buy is 3x this. */
  monthlyAmount: number;
  /** Probability that a periodic order (after the first quarter) is a sell. */
  sellChance: number;
}

export interface PortfolioPlan {
  name: string;
  holdings: readonly HoldingPlan[];
}

export const PORTFOLIO_PLANS: readonly PortfolioPlan[] = [
  {
    name: "Long-Term Growth",
    holdings: [
      { symbol: "VOO", monthlyAmount: 2500, sellChance: 0.05 },
      { symbol: "VTI", monthlyAmount: 2000, sellChance: 0.05 },
      { symbol: "QQQ", monthlyAmount: 1500, sellChance: 0.1 },
      { symbol: "VXUS", monthlyAmount: 1000, sellChance: 0.1 },
      { symbol: "AAPL", monthlyAmount: 1500, sellChance: 0.15 },
      { symbol: "MSFT", monthlyAmount: 1500, sellChance: 0.15 },
      { symbol: "GOOGL", monthlyAmount: 1200, sellChance: 0.15 },
      { symbol: "JPM", monthlyAmount: 1000, sellChance: 0.15 },
      { symbol: "JNJ", monthlyAmount: 1000, sellChance: 0.1 },
      { symbol: "UST10", monthlyAmount: 3000, sellChance: 0.1 },
      { symbol: "CORPAA", monthlyAmount: 2000, sellChance: 0.1 },
    ],
  },
  {
    name: "Crypto & High Risk",
    holdings: [
      { symbol: "BTC", monthlyAmount: 2000, sellChance: 0.2 },
      { symbol: "ETH", monthlyAmount: 1500, sellChance: 0.2 },
      { symbol: "SOL", monthlyAmount: 800, sellChance: 0.25 },
      { symbol: "ADA", monthlyAmount: 500, sellChance: 0.25 },
      { symbol: "NVDA", monthlyAmount: 1500, sellChance: 0.2 },
      { symbol: "TSLA", monthlyAmount: 1000, sellChance: 0.25 },
      { symbol: "AMZN", monthlyAmount: 1200, sellChance: 0.15 },
      { symbol: "UST2", monthlyAmount: 2000, sellChance: 0.1 },
    ],
  },
];

export interface SeedTransaction {
  portfolioName: string;
  symbol: string;
  type: TransactionType;
  quantity: number;
  price: number;
  executedAt: ISODate;
}

/** date -> price lookup per symbol. */
export type PriceLookup = ReadonlyMap<string, ReadonlyMap<ISODate, number>>;

export function buildPriceLookup(
  seriesBySymbol: ReadonlyMap<string, readonly SeedPrice[]>,
): PriceLookup {
  return new Map(
    [...seriesBySymbol].map(([symbol, series]) => [
      symbol,
      new Map(series.map((p) => [p.date, p.price])),
    ]),
  );
}

/** Crypto trades in fractional units; everything else in whole units. */
function quantize(
  type: AssetType,
  raw: number,
  direction: "round" | "floor",
): number {
  if (type === "crypto") {
    const scaled = raw * 10_000;
    return (
      (direction === "floor" ? Math.floor(scaled) : Math.round(scaled)) / 10_000
    );
  }
  return direction === "floor" ? Math.floor(raw) : Math.max(1, Math.round(raw));
}

/**
 * Builds a year of buys and occasional sells for one portfolio.
 * Sells are always sized from the units currently held, so the history can
 * never oversell (verified in seed-data.test.ts via `findOversells`).
 */
export function generateTransactions(
  plan: PortfolioPlan,
  prices: PriceLookup,
  today: ISODate,
): SeedTransaction[] {
  const windowStart = historyWindowStart(today);
  const transactions: SeedTransaction[] = [];

  for (const holdingPlan of plan.holdings) {
    const asset = SEED_ASSETS.find((a) => a.symbol === holdingPlan.symbol);
    const priceByDate = prices.get(holdingPlan.symbol);
    if (!asset || !priceByDate) {
      throw new Error(`No asset/price data for ${holdingPlan.symbol}`);
    }

    // One independent stream per (portfolio, asset): editing one plan entry
    // never reshuffles the others.
    const rng = createRng(hashString(`${plan.name}:${holdingPlan.symbol}`));
    let date = addDays(windowStart, randomInt(rng, 0, 20));
    let held = 0;
    let isFirst = true;

    while (date <= today) {
      const price = priceByDate.get(date);
      if (price === undefined)
        throw new Error(`Missing price ${holdingPlan.symbol} ${date}`);

      const daysIn = daysBetween(windowStart, date);
      const wantsSell =
        !isFirst && daysIn > 90 && rng() < holdingPlan.sellChance;

      let sold = false;
      if (wantsSell) {
        const fraction = 0.15 + rng() * 0.35;
        const quantity = quantize(asset.type, held * fraction, "floor");
        if (quantity > 0 && quantity <= held) {
          transactions.push({
            portfolioName: plan.name,
            symbol: asset.symbol,
            type: "sell",
            quantity,
            price,
            executedAt: date,
          });
          held = Math.round((held - quantity) * 1e6) / 1e6;
          sold = true;
        }
      }

      if (!sold) {
        const amount =
          holdingPlan.monthlyAmount * (isFirst ? 3 : 1) * (0.6 + rng() * 0.8);
        const quantity = quantize(asset.type, amount / price, "round");
        transactions.push({
          portfolioName: plan.name,
          symbol: asset.symbol,
          type: "buy",
          quantity,
          price,
          executedAt: date,
        });
        held = Math.round((held + quantity) * 1e6) / 1e6;
      }

      isFirst = false;
      date = addDays(date, randomInt(rng, 30, 60));
    }
  }

  return transactions.sort((a, b) =>
    a.executedAt === b.executedAt
      ? a.symbol.localeCompare(b.symbol)
      : a.executedAt < b.executedAt
        ? -1
        : 1,
  );
}
