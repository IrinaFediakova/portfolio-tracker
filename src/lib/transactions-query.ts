/**
 * Everything about the transactions list that is independent of I/O:
 * the URL <-> filters contract, ordering, pagination maths and row types.
 *
 * The URL is the single source of truth for view state. `parseTransactionFilters`
 * is deliberately forgiving: any garbage in a hand-edited or stale link falls
 * back to defaults (or is clamped) instead of throwing.
 */
import { z } from "zod";

import { isValidISODate, type ISODate } from "./dates";
import type { AssetInfo, AssetType, TransactionType } from "./portfolio";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface TransactionRow {
  id: string;
  assetId: string;
  symbol: string;
  assetName: string;
  assetType: AssetType;
  type: TransactionType;
  quantity: number;
  price: number;
  executedAt: ISODate;
  /** True while an optimistic change is still waiting for the server. */
  pending?: boolean;
}

export interface TransactionsPage {
  rows: TransactionRow[];
  /** Rows matching the filters across ALL pages. */
  total: number;
  /** The page actually returned (after clamping). */
  page: number;
  pageSize: number;
  pageCount: number;
}

export function rowTotal(row: Pick<TransactionRow, "quantity" | "price">) {
  return row.quantity * row.price;
}

// -----------------------------------------------------------------------------
// Filters schema
// -----------------------------------------------------------------------------

export const SORT_COLUMNS = [
  "date",
  "asset",
  "type",
  "quantity",
  "price",
] as const;
export type SortColumn = (typeof SORT_COLUMNS)[number];

export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
/** Hard ceiling so `?page=99999999999` cannot produce absurd offsets. */
export const MAX_PAGE = 100_000;
export const MAX_SEARCH_LENGTH = 60;

const DEFAULT_SORT: SortColumn = "date";
const DEFAULT_DIR: SortDirection = "desc";

/** Integer param that falls back (not throws) and clamps into [min, max]. */
function intParam(fallback: number, min: number, max: number) {
  return z
    .unknown()
    .optional()
    .transform((value) => {
      const n =
        typeof value === "number"
          ? value
          : typeof value === "string" && value.trim() !== ""
            ? Number(value)
            : Number.NaN;
      if (!Number.isFinite(n)) return fallback;
      return Math.min(max, Math.max(min, Math.trunc(n)));
    });
}

const dateParam = z.string().refine(isValidISODate).optional().catch(undefined);

export const transactionFiltersSchema = z
  .object({
    type: z.enum(["buy", "sell"]).optional().catch(undefined),
    asset: z.uuid().optional().catch(undefined),
    from: dateParam,
    to: dateParam,
    q: z
      .string()
      .optional()
      .catch(undefined)
      .transform((value) => {
        const trimmed = value?.trim().slice(0, MAX_SEARCH_LENGTH);
        return trimmed ? trimmed : undefined;
      }),
    sort: z.enum(SORT_COLUMNS).catch(DEFAULT_SORT),
    dir: z.enum(SORT_DIRECTIONS).catch(DEFAULT_DIR),
    page: intParam(1, 1, MAX_PAGE),
    pageSize: intParam(DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE),
  })
  .transform((filters) =>
    // An inverted range is almost certainly a typo: swap rather than match nothing.
    filters.from && filters.to && filters.from > filters.to
      ? { ...filters, from: filters.to, to: filters.from }
      : filters,
  );

export type TransactionFilters = z.output<typeof transactionFiltersSchema>;

export type RawSearchParams =
  Readonly<Record<string, unknown>> | URLSearchParams;

/**
 * Parses anything URL-shaped (Next's `searchParams`, a `URLSearchParams`, or a
 * plain filters object sent to a Server Action) into valid filters. Never throws.
 */
export function parseTransactionFilters(
  raw: RawSearchParams | undefined,
): TransactionFilters {
  const record: Record<string, unknown> =
    raw instanceof URLSearchParams
      ? Object.fromEntries(raw.entries())
      : { ...(raw ?? {}) };

  // `?type=buy&type=sell` arrives as an array: use the first value.
  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) record[key] = value[0];
  }

  return transactionFiltersSchema.parse(record);
}

// -----------------------------------------------------------------------------
// Filters -> URL
// -----------------------------------------------------------------------------

export const TRANSACTIONS_PATH = "/transactions";

/** Serialises filters, omitting defaults so shared links stay short and canonical. */
export function filtersToSearchParams(
  filters: TransactionFilters,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.asset) params.set("asset", filters.asset);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.q) params.set("q", filters.q);
  if (filters.sort !== DEFAULT_SORT) params.set("sort", filters.sort);
  if (filters.dir !== DEFAULT_DIR) params.set("dir", filters.dir);
  if (filters.page > 1) params.set("page", String(filters.page));
  if (filters.pageSize !== DEFAULT_PAGE_SIZE) {
    params.set("pageSize", String(filters.pageSize));
  }
  return params;
}

/** Stable cache key for a view (equal filters give an equal key). */
export function filtersKey(filters: TransactionFilters): string {
  return filtersToSearchParams(filters).toString();
}

export function buildTransactionsHref(filters: TransactionFilters): string {
  const query = filtersToSearchParams(filters).toString();
  return query ? `${TRANSACTIONS_PATH}?${query}` : TRANSACTIONS_PATH;
}

/**
 * Applies a change to the filters. Anything other than a page change resets the
 * page to 1, otherwise a narrower filter could leave you on a page that no
 * longer exists.
 */
export function updateFilters(
  filters: TransactionFilters,
  patch: Partial<TransactionFilters>,
): TransactionFilters {
  return {
    ...filters,
    ...patch,
    page: "page" in patch ? (patch.page ?? 1) : 1,
  };
}

export function hasActiveFilters(filters: TransactionFilters): boolean {
  return Boolean(
    filters.type || filters.asset || filters.from || filters.to || filters.q,
  );
}

export function clearFilters(filters: TransactionFilters): TransactionFilters {
  return updateFilters(filters, {
    type: undefined,
    asset: undefined,
    from: undefined,
    to: undefined,
    q: undefined,
  });
}

/** Clicking a header: flip the direction if already sorted by it, else sort by it. */
export function nextSort(
  filters: TransactionFilters,
  column: SortColumn,
): TransactionFilters {
  if (filters.sort === column) {
    return updateFilters(filters, {
      dir: filters.dir === "asc" ? "desc" : "asc",
    });
  }
  // Dates and amounts are most useful newest/largest first; names A-Z.
  const dir: SortDirection =
    column === "asset" || column === "type" ? "asc" : "desc";
  return updateFilters(filters, { sort: column, dir });
}

// -----------------------------------------------------------------------------
// Query building (pure; the data layer applies these to the Supabase builder)
// -----------------------------------------------------------------------------

export interface OrderSpec {
  column: string;
  ascending: boolean;
}

const SORT_COLUMN_SQL: Record<SortColumn, string> = {
  date: "executed_at",
  asset: "assets(symbol)", // ordering by a to-one relation (PostgREST)
  type: "type",
  quantity: "quantity",
  price: "price",
};

/**
 * Primary sort plus tie-breakers, so equal values always come back in the same
 * order and rows never shuffle or repeat between pages.
 */
export function getOrderSpecs(
  sort: SortColumn,
  dir: SortDirection,
): OrderSpec[] {
  const specs: OrderSpec[] = [
    { column: SORT_COLUMN_SQL[sort], ascending: dir === "asc" },
  ];
  if (sort !== "date") specs.push({ column: "executed_at", ascending: false });
  specs.push({ column: "created_at", ascending: false });
  specs.push({ column: "id", ascending: true });
  return specs;
}

/** Inclusive zero-based row range for `Query.range(from, to)`. */
export function getPageRange(
  page: number,
  pageSize: number,
): { from: number; to: number } {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

export function getPageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function clampPage(page: number, pageCount: number): number {
  return Math.min(Math.max(1, page), pageCount);
}

/** Ids of assets whose symbol or name contains `query` (case-insensitive). */
export function findMatchingAssetIds(
  assets: readonly Pick<AssetInfo, "id" | "symbol" | "name">[],
  query: string,
): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return assets.map((asset) => asset.id);
  return assets
    .filter(
      (asset) =>
        asset.symbol.toLowerCase().includes(needle) ||
        asset.name.toLowerCase().includes(needle),
    )
    .map((asset) => asset.id);
}

export function emptyPage(filters: TransactionFilters): TransactionsPage {
  return {
    rows: [],
    total: 0,
    page: 1,
    pageSize: filters.pageSize,
    pageCount: 1,
  };
}

// -----------------------------------------------------------------------------
// Pagination UI
// -----------------------------------------------------------------------------

export type PageItem = number | "start-ellipsis" | "end-ellipsis";

/**
 * Page numbers to render, e.g. `[1, "start-ellipsis", 4, 5, 6, "end-ellipsis", 20]`.
 * Always shows first, last, the current page and its neighbours.
 */
export function getPageItems(current: number, pageCount: number): PageItem[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }

  const items: PageItem[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(pageCount - 1, current + 1);

  if (start > 2) items.push("start-ellipsis");
  for (let page = start; page <= end; page++) items.push(page);
  if (end < pageCount - 1) items.push("end-ellipsis");

  items.push(pageCount);
  return items;
}
