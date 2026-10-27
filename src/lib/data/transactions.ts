import "server-only";

import type { AssetInfo } from "@/lib/portfolio";
import { createClient } from "@/lib/supabase/server";
import {
  clampPage,
  emptyPage,
  findMatchingAssetIds,
  getOrderSpecs,
  getPageCount,
  getPageRange,
  type TransactionFilters,
  type TransactionRow,
  type TransactionsPage,
} from "@/lib/transactions-query";

/** PostgREST: the requested range starts beyond the last row. */
const RANGE_NOT_SATISFIABLE = "PGRST103";

const SELECT =
  "id, asset_id, type, quantity, price, executed_at, assets(symbol, name, type)";

interface Fetched {
  rows: TransactionRow[];
  count: number;
}

class RangeNotSatisfiableError extends Error {}

/**
 * Runs ONE filtered, sorted, paginated query. Filtering, ordering and
 * pagination all happen in Postgres; only the requested page is transferred.
 *
 * `assetIds` is the text search already resolved to matching asset ids
 * (null = no text search).
 */
async function fetchPage(
  portfolioId: string,
  filters: TransactionFilters,
  assetIds: string[] | null,
  page: number,
): Promise<Fetched> {
  const supabase = await createClient();

  let query = supabase
    .from("transactions")
    .select(SELECT, { count: "exact" })
    // RLS already limits rows to the user's portfolios; this scopes to the active one.
    .eq("portfolio_id", portfolioId);

  if (filters.type) query = query.eq("type", filters.type);
  if (filters.asset) query = query.eq("asset_id", filters.asset);
  if (assetIds) query = query.in("asset_id", assetIds);
  if (filters.from) query = query.gte("executed_at", filters.from);
  if (filters.to) query = query.lte("executed_at", filters.to);

  for (const { column, ascending } of getOrderSpecs(
    filters.sort,
    filters.dir,
  )) {
    query = query.order(column, { ascending });
  }

  const { from, to } = getPageRange(page, filters.pageSize);
  const { data, error, count } = await query.range(from, to);

  if (error) {
    if (error.code === RANGE_NOT_SATISFIABLE) {
      throw new RangeNotSatisfiableError(error.message);
    }
    throw new Error(`Failed to load transactions: ${error.message}`);
  }

  const rows: TransactionRow[] = data.map((row) => ({
    id: row.id,
    assetId: row.asset_id,
    // The embedded asset is required by the FK; fall back defensively.
    symbol: row.assets?.symbol ?? "?",
    assetName: row.assets?.name ?? "Unknown asset",
    assetType: row.assets?.type ?? "stock",
    type: row.type,
    // numeric columns can arrive as strings depending on the client; coerce.
    quantity: Number(row.quantity),
    price: Number(row.price),
    executedAt: row.executed_at,
  }));

  return { rows, count: count ?? rows.length };
}

/**
 * One page of a portfolio's transactions for the given (already validated)
 * filters. A page beyond the end (stale link, or the last row of the last page
 * was just deleted) is clamped to the last real page instead of failing.
 */
export async function getTransactionsPage(
  portfolioId: string,
  filters: TransactionFilters,
  assets: readonly AssetInfo[],
): Promise<TransactionsPage> {
  let assetIds: string[] | null = null;
  if (filters.q) {
    assetIds = findMatchingAssetIds(assets, filters.q);
    // Nothing matches the search term: skip the round trip entirely.
    if (assetIds.length === 0) return emptyPage(filters);
  }

  let page = filters.page;
  let fetched: Fetched | null = null;
  try {
    fetched = await fetchPage(portfolioId, filters, assetIds, page);
  } catch (error) {
    if (!(error instanceof RangeNotSatisfiableError)) throw error;
  }

  // Beyond the last page (PostgREST either rejects the range or returns no
  // rows): learn the real size from page 1, then fetch the last page.
  if (!fetched || (fetched.rows.length === 0 && page > 1)) {
    const first = await fetchPage(portfolioId, filters, assetIds, 1);
    page = clampPage(page, getPageCount(first.count, filters.pageSize));
    fetched =
      page === 1
        ? first
        : await fetchPage(portfolioId, filters, assetIds, page);
  }

  return {
    rows: fetched.rows,
    total: fetched.count,
    page,
    pageSize: filters.pageSize,
    pageCount: getPageCount(fetched.count, filters.pageSize),
  };
}
