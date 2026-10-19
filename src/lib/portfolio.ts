/**
 * Pure portfolio calculations (no I/O, no clocks, no framework imports).
 *
 * Conventions
 * - Cost basis uses the AVERAGE-COST method: buys blend into one average price;
 *   a sell realizes (sell price - average cost) per unit and leaves the average
 *   cost of the remaining units unchanged.
 * - Money is plain `number`. Inputs come from Postgres `numeric(18,6)`, and a
 *   demo-scale tracker does not need a decimal library. Quantities are rounded
 *   to 6 decimals after every operation to stop floating-point drift
 *   (0.1 + 0.2 stays 0.3).
 * - Dates are `YYYY-MM-DD` strings, compared lexicographically (see dates.ts).
 * - Nothing here throws on messy data: oversold positions are clamped and
 *   missing prices fall back to cost. Use `findOversells` to REJECT bad input
 *   at the validation boundary instead.
 */
import { addDays, eachDay, type ISODate } from "./dates";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type AssetType = "stock" | "etf" | "crypto" | "bond";
export type TransactionType = "buy" | "sell";

export interface PortfolioTransaction {
  id?: string;
  assetId: string;
  type: TransactionType;
  quantity: number;
  price: number;
  executedAt: ISODate;
}

export interface AssetInfo {
  id: string;
  symbol: string;
  name: string;
  type: AssetType;
}

export interface PricePoint {
  assetId: string;
  date: ISODate;
  price: number;
}

/** Latest known price per asset id. */
export type PriceMap = Readonly<Record<string, number>>;

export interface Holding {
  assetId: string;
  /** Units currently held. 0 for a fully closed position. */
  quantity: number;
  /** Average cost per unit of the units currently held (0 when closed). */
  avgCost: number;
  /** Total cost of the units currently held (`quantity * avgCost`). */
  costBasis: number;
  /** Profit/loss locked in by sells so far. */
  realizedPnL: number;
  /** Sum of every buy (`quantity * price`), the denominator for return %. */
  totalInvested: number;
}

export interface Position {
  assetId: string;
  quantity: number;
  price: number;
  value: number;
  /** True when no price was available and the average cost was used instead. */
  priceMissing: boolean;
}

export interface MarketValue {
  totalValue: number;
  /** Open positions only, in the same order as the input holdings. */
  positions: Position[];
}

export interface AllocationSlice {
  value: number;
  /** Fraction of total value, 0..1. */
  share: number;
}

export interface AssetAllocation extends AllocationSlice {
  assetId: string;
}

export interface TypeAllocation extends AllocationSlice {
  type: AssetType;
}

export interface Allocation {
  totalValue: number;
  /** Sorted by value, descending. */
  byAsset: AssetAllocation[];
  /** Sorted by value, descending. */
  byType: TypeAllocation[];
}

export interface AssetPnL {
  assetId: string;
  marketValue: number;
  costBasis: number;
  unrealized: number;
  realized: number;
  total: number;
  /** `total / totalInvested` as a fraction (0.1 = +10%). 0 if nothing invested. */
  percent: number;
}

export interface PnLSummary {
  marketValue: number;
  costBasis: number;
  unrealized: number;
  realized: number;
  total: number;
  invested: number;
  /** `total / invested` as a fraction (0.1 = +10%). 0 if nothing invested. */
  percent: number;
  byAsset: AssetPnL[];
}

export const SERIES_RANGES = ["1M", "3M", "1Y", "All"] as const;
export type SeriesRange = (typeof SERIES_RANGES)[number];

export interface ValuePoint {
  date: ISODate;
  /** Market value of all holdings at the end of this day. */
  value: number;
  /** Cost basis of the holdings at the end of this day. */
  costBasis: number;
}

export interface Oversell {
  assetId: string;
  executedAt: ISODate;
  requested: number;
  available: number;
  transactionId?: string;
}

// -----------------------------------------------------------------------------
// Internals
// -----------------------------------------------------------------------------

const EPSILON = 1e-9;
const RANGE_DAYS: Record<Exclude<SeriesRange, "All">, number> = {
  "1M": 30,
  "3M": 90,
  "1Y": 365,
};

function roundQuantity(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

interface MutableHolding {
  assetId: string;
  quantity: number;
  costBasis: number;
  realizedPnL: number;
  totalInvested: number;
}

function emptyHolding(assetId: string): MutableHolding {
  return {
    assetId,
    quantity: 0,
    costBasis: 0,
    realizedPnL: 0,
    totalInvested: 0,
  };
}

/**
 * Chronological order; on the same day buys come before sells so that
 * "buy and sell the same day" is never mistaken for an oversell.
 * Array.prototype.sort is stable, so equal keys keep input order.
 */
function sortTransactions(
  transactions: readonly PortfolioTransaction[],
): PortfolioTransaction[] {
  const rank = (type: TransactionType) => (type === "buy" ? 0 : 1);
  return [...transactions].sort((a, b) =>
    a.executedAt === b.executedAt
      ? rank(a.type) - rank(b.type)
      : a.executedAt < b.executedAt
        ? -1
        : 1,
  );
}

/**
 * Applies one transaction to a holding in place.
 * @returns the quantity that could NOT be filled (0 unless a sell exceeded
 *          the units held, in which case the sell is clamped).
 */
function applyTransaction(
  holding: MutableHolding,
  tx: PortfolioTransaction,
): number {
  if (tx.type === "buy") {
    holding.quantity = roundQuantity(holding.quantity + tx.quantity);
    holding.costBasis += tx.quantity * tx.price;
    holding.totalInvested += tx.quantity * tx.price;
    return 0;
  }

  const filled = Math.min(tx.quantity, holding.quantity);
  const shortfall = roundQuantity(tx.quantity - filled);

  if (filled > EPSILON) {
    const avgCost = holding.costBasis / holding.quantity;
    holding.realizedPnL += (tx.price - avgCost) * filled;
    holding.costBasis -= avgCost * filled;
    holding.quantity = roundQuantity(holding.quantity - filled);
  }

  if (holding.quantity < EPSILON) {
    // Position closed: clear residue so a later re-buy starts a fresh average.
    holding.quantity = 0;
    holding.costBasis = 0;
  }

  return shortfall > EPSILON ? shortfall : 0;
}

function toHolding(h: MutableHolding): Holding {
  return {
    assetId: h.assetId,
    quantity: h.quantity,
    avgCost: h.quantity > 0 ? h.costBasis / h.quantity : 0,
    costBasis: h.costBasis,
    realizedPnL: h.realizedPnL,
    totalInvested: h.totalInvested,
  };
}

function getOrCreate(
  holdings: Map<string, MutableHolding>,
  assetId: string,
): MutableHolding {
  let holding = holdings.get(assetId);
  if (!holding) {
    holding = emptyHolding(assetId);
    holdings.set(assetId, holding);
  }
  return holding;
}

// -----------------------------------------------------------------------------
// Holdings
// -----------------------------------------------------------------------------

/**
 * Quantity, average cost and realized P&L per asset, replaying transactions in
 * chronological order. Closed positions are kept (quantity 0) so their
 * realized P&L still counts. Oversold sells are clamped to the units held.
 */
export function computeHoldings(
  transactions: readonly PortfolioTransaction[],
): Holding[] {
  const holdings = new Map<string, MutableHolding>();
  for (const tx of sortTransactions(transactions)) {
    applyTransaction(getOrCreate(holdings, tx.assetId), tx);
  }
  return [...holdings.values()].map(toHolding);
}

/**
 * Every sell that exceeds the units held at that point in time.
 *
 * Validation uses this on a HYPOTHETICAL list (existing transactions plus the
 * proposed add/edit, or minus a deleted one), which also catches edits and
 * deletions that would invalidate sells that come later.
 */
export function findOversells(
  transactions: readonly PortfolioTransaction[],
): Oversell[] {
  const holdings = new Map<string, MutableHolding>();
  const oversells: Oversell[] = [];

  for (const tx of sortTransactions(transactions)) {
    const holding = getOrCreate(holdings, tx.assetId);
    const availableBefore = holding.quantity;
    const shortfall = applyTransaction(holding, tx);
    if (shortfall > 0) {
      oversells.push({
        assetId: tx.assetId,
        executedAt: tx.executedAt,
        requested: tx.quantity,
        available: availableBefore,
        transactionId: tx.id,
      });
    }
  }

  return oversells;
}

// -----------------------------------------------------------------------------
// Prices
// -----------------------------------------------------------------------------

/**
 * Last known price per asset on or before `asOf` (all history if omitted).
 * This is the "missing prices use last known price" rule for a single date.
 */
export function getLatestPrices(
  priceHistory: readonly PricePoint[],
  asOf?: ISODate,
): PriceMap {
  const latest = new Map<string, PricePoint>();
  for (const point of priceHistory) {
    if (asOf !== undefined && point.date > asOf) continue;
    const current = latest.get(point.assetId);
    if (!current || point.date > current.date) latest.set(point.assetId, point);
  }
  return Object.fromEntries(
    [...latest].map(([assetId, point]) => [assetId, point.price]),
  );
}

// -----------------------------------------------------------------------------
// Market value, allocation, P&L
// -----------------------------------------------------------------------------

/**
 * Value of open positions at the given prices. An asset with no price at all
 * is valued at its average cost (and flagged) so it neither inflates nor
 * wipes out the total.
 */
export function computeMarketValue(
  holdings: readonly Holding[],
  latestPrices: PriceMap,
): MarketValue {
  const positions: Position[] = [];
  let totalValue = 0;

  for (const holding of holdings) {
    if (holding.quantity <= 0) continue;
    const known = latestPrices[holding.assetId];
    const priceMissing = known === undefined;
    const price = priceMissing ? holding.avgCost : known;
    const value = holding.quantity * price;
    positions.push({
      assetId: holding.assetId,
      quantity: holding.quantity,
      price,
      value,
      priceMissing,
    });
    totalValue += value;
  }

  return { totalValue, positions };
}

/**
 * Share of total value per asset and per asset type.
 * @throws if a held asset is missing from `assets` (a data-integrity bug).
 */
export function computeAllocation(
  holdings: readonly Holding[],
  latestPrices: PriceMap,
  assets: readonly AssetInfo[],
): Allocation {
  const { totalValue, positions } = computeMarketValue(holdings, latestPrices);
  const typeById = new Map(assets.map((asset) => [asset.id, asset.type]));
  const shareOf = (value: number) => (totalValue > 0 ? value / totalValue : 0);

  const byAsset: AssetAllocation[] = positions
    .map((p) => ({
      assetId: p.assetId,
      value: p.value,
      share: shareOf(p.value),
    }))
    .sort((a, b) => b.value - a.value);

  const valueByType = new Map<AssetType, number>();
  for (const position of positions) {
    const type = typeById.get(position.assetId);
    if (!type) {
      throw new Error(`Unknown asset "${position.assetId}" in allocation`);
    }
    valueByType.set(type, (valueByType.get(type) ?? 0) + position.value);
  }

  const byType: TypeAllocation[] = [...valueByType]
    .map(([type, value]) => ({ type, value, share: shareOf(value) }))
    .sort((a, b) => b.value - a.value);

  return { totalValue, byAsset, byType };
}

/**
 * Unrealized, realized and total P&L, overall and per asset.
 * `percent` = total P&L / total amount invested (sum of all buys).
 */
export function computePnL(
  holdings: readonly Holding[],
  latestPrices: PriceMap,
): PnLSummary {
  const byAsset: AssetPnL[] = holdings.map((holding) => {
    const price = latestPrices[holding.assetId] ?? holding.avgCost;
    const marketValue = holding.quantity * price;
    const unrealized = marketValue - holding.costBasis;
    const total = unrealized + holding.realizedPnL;
    return {
      assetId: holding.assetId,
      marketValue,
      costBasis: holding.costBasis,
      unrealized,
      realized: holding.realizedPnL,
      total,
      percent: holding.totalInvested > 0 ? total / holding.totalInvested : 0,
    };
  });

  const sum = (pick: (row: AssetPnL) => number) =>
    byAsset.reduce((acc, row) => acc + pick(row), 0);
  const invested = holdings.reduce((acc, h) => acc + h.totalInvested, 0);
  const total = sum((row) => row.total);

  return {
    marketValue: sum((row) => row.marketValue),
    costBasis: sum((row) => row.costBasis),
    unrealized: sum((row) => row.unrealized),
    realized: sum((row) => row.realized),
    total,
    invested,
    percent: invested > 0 ? total / invested : 0,
    byAsset,
  };
}

// -----------------------------------------------------------------------------
// Value over time
// -----------------------------------------------------------------------------

/**
 * Daily portfolio value from the first transaction (or the start of `range`,
 * whichever is later) up to and including `asOf`.
 *
 * - `1M`/`3M`/`1Y` cover the last 30/90/365 days (inclusive of both ends);
 *   `All` starts at the first transaction.
 * - Transactions dated after `asOf` are ignored.
 * - On days without a price, the last known price is used. If an asset has no
 *   price yet, it is valued at average cost.
 * - `asOf` is a parameter (not `new Date()`) to keep this function pure.
 */
export function computeValueSeries(
  transactions: readonly PortfolioTransaction[],
  priceHistory: readonly PricePoint[],
  range: SeriesRange,
  asOf: ISODate,
): ValuePoint[] {
  const sorted = sortTransactions(
    transactions.filter((tx) => tx.executedAt <= asOf),
  );
  if (sorted.length === 0) return [];

  const firstDate = sorted[0].executedAt;
  const rangeStart =
    range === "All" ? firstDate : addDays(asOf, -RANGE_DAYS[range]);
  const start = rangeStart > firstDate ? rangeStart : firstDate;
  if (start > asOf) return [];

  // Per-asset ascending price lists with a forward-only cursor: O(days + prices)
  // overall instead of a search per day.
  const pricesByAsset = new Map<string, PricePoint[]>();
  for (const point of priceHistory) {
    if (point.date > asOf) continue;
    const list = pricesByAsset.get(point.assetId);
    if (list) list.push(point);
    else pricesByAsset.set(point.assetId, [point]);
  }
  for (const list of pricesByAsset.values()) {
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  const cursors = new Map<string, number>();

  function priceOn(assetId: string, date: ISODate): number | undefined {
    const list = pricesByAsset.get(assetId);
    if (!list) return undefined;
    let index = cursors.get(assetId) ?? -1;
    while (index + 1 < list.length && list[index + 1].date <= date) index++;
    cursors.set(assetId, index);
    return index >= 0 ? list[index].price : undefined;
  }

  const holdings = new Map<string, MutableHolding>();
  const points: ValuePoint[] = [];
  let next = 0;

  for (const date of eachDay(firstDate, asOf)) {
    while (next < sorted.length && sorted[next].executedAt <= date) {
      const tx = sorted[next++];
      applyTransaction(getOrCreate(holdings, tx.assetId), tx);
    }
    if (date < start) continue;

    let value = 0;
    let costBasis = 0;
    for (const holding of holdings.values()) {
      if (holding.quantity <= 0) continue;
      const price =
        priceOn(holding.assetId, date) ?? holding.costBasis / holding.quantity;
      value += holding.quantity * price;
      costBasis += holding.costBasis;
    }
    points.push({ date, value, costBasis });
  }

  return points;
}
