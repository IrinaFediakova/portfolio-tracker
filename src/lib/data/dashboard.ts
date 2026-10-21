import "server-only";

import { todayISO } from "@/lib/dates";
import { buildDashboardModel, type DashboardModel } from "@/lib/dashboard";

import {
  getAssetsByIds,
  getPortfolioTransactions,
  getPriceHistory,
} from "./market-data";

/**
 * Loads everything the dashboard needs for one portfolio and reduces it to a
 * plain serializable model. All I/O lives here; the maths is in lib/dashboard.
 */
export async function getDashboardModel(
  portfolioId: string,
): Promise<DashboardModel> {
  const transactions = await getPortfolioTransactions(portfolioId);

  const assetIds = [...new Set(transactions.map((tx) => tx.assetId))];
  // Prices before the first trade never affect value, so don't fetch them.
  const firstTradeDate = transactions.reduce(
    (min, tx) => (tx.executedAt < min ? tx.executedAt : min),
    todayISO(),
  );

  const [assets, priceHistory] = await Promise.all([
    getAssetsByIds(assetIds),
    getPriceHistory(assetIds, firstTradeDate),
  ]);

  return buildDashboardModel({
    transactions,
    assets,
    priceHistory,
    asOf: todayISO(),
  });
}
