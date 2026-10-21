import "server-only";

import type { ISODate } from "@/lib/dates";
import type {
  AssetInfo,
  PortfolioTransaction,
  PricePoint,
} from "@/lib/portfolio";
import { createClient } from "@/lib/supabase/server";

/** PostgREST returns at most this many rows per request (Supabase default). */
const PAGE_SIZE = 1000;

interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
  count: number | null;
}

/**
 * Reads every row of a query that may exceed PostgREST's per-request cap.
 * The first page also returns the exact total, so the remaining pages are
 * fetched in parallel instead of one after another. The query MUST have a
 * deterministic `order` so pages never overlap or skip rows.
 */
async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const first = await fetchPage(0, PAGE_SIZE - 1);
  if (first.error) throw new Error(first.error.message);

  const rows = first.data ?? [];
  const total = first.count ?? rows.length;
  if (total <= PAGE_SIZE) return rows;

  const pageStarts = Array.from(
    { length: Math.ceil(total / PAGE_SIZE) - 1 },
    (_, i) => (i + 1) * PAGE_SIZE,
  );
  const pages = await Promise.all(
    pageStarts.map((from) => fetchPage(from, from + PAGE_SIZE - 1)),
  );

  for (const page of pages) {
    if (page.error) throw new Error(page.error.message);
    rows.push(...(page.data ?? []));
  }
  return rows;
}

/** Every transaction in a portfolio, newest first. */
export async function getPortfolioTransactions(
  portfolioId: string,
): Promise<PortfolioTransaction[]> {
  const supabase = await createClient();
  const rows = await fetchAllRows((from, to) =>
    supabase
      .from("transactions")
      .select("id, asset_id, type, quantity, price, executed_at", {
        count: "exact",
      })
      .eq("portfolio_id", portfolioId)
      .order("executed_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to),
  );

  return rows.map((row) => ({
    id: row.id,
    assetId: row.asset_id,
    type: row.type,
    // numeric columns can arrive as strings depending on the client; coerce.
    quantity: Number(row.quantity),
    price: Number(row.price),
    executedAt: row.executed_at,
  }));
}

export async function getAssetsByIds(
  ids: readonly string[],
): Promise<AssetInfo[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assets")
    .select("id, symbol, name, type")
    .in("id", [...ids]);

  if (error) throw new Error(`Failed to load assets: ${error.message}`);
  return data;
}

/** Daily prices for the given assets from `from` (inclusive) onwards. */
export async function getPriceHistory(
  assetIds: readonly string[],
  from: ISODate,
): Promise<PricePoint[]> {
  if (assetIds.length === 0) return [];
  const supabase = await createClient();
  const rows = await fetchAllRows((start, end) =>
    supabase
      .from("price_history")
      .select("asset_id, date, price", { count: "exact" })
      .in("asset_id", [...assetIds])
      .gte("date", from)
      .order("asset_id", { ascending: true })
      .order("date", { ascending: true })
      .range(start, end),
  );

  return rows.map((row) => ({
    assetId: row.asset_id,
    date: row.date,
    price: Number(row.price),
  }));
}
