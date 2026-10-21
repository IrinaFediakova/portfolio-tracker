/**
 * Pure view-model for the dashboard: raw rows in, plain serializable data out.
 * No I/O and no clock (callers pass `asOf`), so it is trivially unit-testable
 * and its output can cross the server -> client component boundary as props.
 */
import type { ISODate } from "./dates";
import {
  SERIES_RANGES,
  computeAllocation,
  computeHoldings,
  computePnL,
  computeValueSeries,
  getLatestPrices,
  type AssetInfo,
  type AssetType,
  type PortfolioTransaction,
  type PricePoint,
  type SeriesRange,
  type ValuePoint,
} from "./portfolio";

export interface DashboardInput {
  transactions: readonly PortfolioTransaction[];
  assets: readonly AssetInfo[];
  priceHistory: readonly PricePoint[];
  asOf: ISODate;
}

export interface AssetPerformance {
  assetId: string;
  symbol: string;
  name: string;
  /** Total P&L / amount invested, as a fraction (0.1 = +10%). */
  percent: number;
  /** Total (realized + unrealized) P&L in currency. */
  total: number;
}

export interface AllocationSlice {
  key: string;
  label: string;
  value: number;
  /** 0..1 */
  share: number;
}

export interface DashboardModel {
  hasTransactions: boolean;
  asOf: ISODate;
  totalValue: number;
  pnl: {
    total: number;
    unrealized: number;
    realized: number;
    /** Fraction of total amount invested. */
    percent: number;
    invested: number;
  };
  /** Null when there is nothing to rank. */
  best: AssetPerformance | null;
  worst: AssetPerformance | null;
  allocationByAsset: AllocationSlice[];
  allocationByType: AllocationSlice[];
  seriesByRange: Record<SeriesRange, ValuePoint[]>;
}

const TYPE_LABELS: Record<AssetType, string> = {
  stock: "Stocks",
  etf: "ETFs",
  crypto: "Crypto",
  bond: "Bonds",
};

/** Max slices shown individually in the donut; the rest collapse into "Other". */
export const MAX_ASSET_SLICES = 8;

/**
 * Keeps the largest `max - 1` slices and merges the tail into "Other", so the
 * donut and its legend stay readable for portfolios with many positions.
 * Input must already be sorted by value, descending.
 */
export function collapseSlices(
  slices: readonly AllocationSlice[],
  max: number = MAX_ASSET_SLICES,
): AllocationSlice[] {
  if (slices.length <= max) return [...slices];
  const head = slices.slice(0, max - 1);
  const tail = slices.slice(max - 1);
  return [
    ...head,
    {
      key: "other",
      label: `Other (${tail.length})`,
      value: tail.reduce((sum, s) => sum + s.value, 0),
      share: tail.reduce((sum, s) => sum + s.share, 0),
    },
  ];
}

function pickBestWorst(rows: readonly AssetPerformance[]): {
  best: AssetPerformance | null;
  worst: AssetPerformance | null;
} {
  if (rows.length === 0) return { best: null, worst: null };
  const sorted = [...rows].sort((a, b) => b.percent - a.percent);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  // A single asset is both best and worst; show it only once.
  return { best, worst: sorted.length > 1 ? worst : null };
}

export function buildDashboardModel(input: DashboardInput): DashboardModel {
  const { transactions, assets, priceHistory, asOf } = input;

  const holdings = computeHoldings(transactions);
  const latestPrices = getLatestPrices(priceHistory, asOf);
  const pnl = computePnL(holdings, latestPrices);
  const allocation = computeAllocation(holdings, latestPrices, assets);
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));

  const performance: AssetPerformance[] = pnl.byAsset
    // Only assets that were ever bought have a meaningful return.
    .filter((row) => assetById.has(row.assetId))
    .map((row) => {
      const asset = assetById.get(row.assetId)!;
      return {
        assetId: row.assetId,
        symbol: asset.symbol,
        name: asset.name,
        percent: row.percent,
        total: row.total,
      };
    });
  const { best, worst } = pickBestWorst(performance);

  const allocationByAsset = collapseSlices(
    allocation.byAsset.map((slice) => {
      const asset = assetById.get(slice.assetId);
      return {
        key: slice.assetId,
        label: asset?.symbol ?? "Unknown",
        value: slice.value,
        share: slice.share,
      };
    }),
  );

  const allocationByType: AllocationSlice[] = allocation.byType.map(
    (slice) => ({
      key: slice.type,
      label: TYPE_LABELS[slice.type],
      value: slice.value,
      share: slice.share,
    }),
  );

  const seriesByRange = Object.fromEntries(
    SERIES_RANGES.map((range) => [
      range,
      computeValueSeries(transactions, priceHistory, range, asOf),
    ]),
  ) as Record<SeriesRange, ValuePoint[]>;

  return {
    hasTransactions: transactions.length > 0,
    asOf,
    totalValue: allocation.totalValue,
    pnl: {
      total: pnl.total,
      unrealized: pnl.unrealized,
      realized: pnl.realized,
      percent: pnl.percent,
      invested: pnl.invested,
    },
    best,
    worst,
    allocationByAsset,
    allocationByType,
    seriesByRange,
  };
}
