/**
 * Pure helpers that predict what the server would return for the current view
 * after a create / update / delete, so the UI can update instantly.
 *
 * This is a best-effort PREDICTION, not the source of truth: after every
 * mutation the data is re-fetched and replaces whatever was predicted here.
 * The goal is simply that the row appears / changes / disappears in the right
 * place and that the total and page count stay plausible in the meantime.
 */
import {
  findMatchingAssetIds,
  getPageCount,
  type SortColumn,
  type SortDirection,
  type TransactionFilters,
  type TransactionRow,
  type TransactionsPage,
} from "./transactions-query";

export type ListChange =
  | { kind: "create"; row: TransactionRow }
  | { kind: "update"; row: TransactionRow }
  | { kind: "delete"; id: string };

/** Mirrors the server-side filters (type, asset, date range, text search). */
export function matchesFilters(
  row: TransactionRow,
  filters: Partial<
    Pick<TransactionFilters, "type" | "asset" | "from" | "to" | "q">
  >,
): boolean {
  if (filters.type && row.type !== filters.type) return false;
  if (filters.asset && row.assetId !== filters.asset) return false;
  if (filters.from && row.executedAt < filters.from) return false;
  if (filters.to && row.executedAt > filters.to) return false;
  if (filters.q) {
    const matches = findMatchingAssetIds(
      [{ id: row.assetId, symbol: row.symbol, name: row.assetName }],
      filters.q,
    );
    if (matches.length === 0) return false;
  }
  return true;
}

function compareValues(a: string | number, b: string | number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortValue(row: TransactionRow, sort: SortColumn): string | number {
  switch (sort) {
    case "date":
      return row.executedAt;
    case "asset":
      return row.symbol;
    case "type":
      return row.type;
    case "quantity":
      return row.quantity;
    case "price":
      return row.price;
  }
}

/** Same ordering as `getOrderSpecs`; ties: newest date, pending first, then id. */
export function compareRows(
  a: TransactionRow,
  b: TransactionRow,
  sort: SortColumn,
  dir: SortDirection,
): number {
  const primary = compareValues(sortValue(a, sort), sortValue(b, sort));
  if (primary !== 0) return dir === "asc" ? primary : -primary;

  if (sort !== "date") {
    const byDate = compareValues(b.executedAt, a.executedAt);
    if (byDate !== 0) return byDate;
  }
  if (Boolean(a.pending) !== Boolean(b.pending)) return a.pending ? -1 : 1;
  return compareValues(a.id, b.id);
}

function withTotal(page: TransactionsPage, total: number): TransactionsPage {
  return { ...page, total, pageCount: getPageCount(total, page.pageSize) };
}

export function applyListChange(
  page: TransactionsPage,
  change: ListChange,
  filters: TransactionFilters,
): TransactionsPage {
  switch (change.kind) {
    case "delete": {
      const rows = page.rows.filter((row) => row.id !== change.id);
      if (rows.length === page.rows.length) return page;
      return { ...withTotal(page, Math.max(0, page.total - 1)), rows };
    }

    case "create": {
      if (!matchesFilters(change.row, filters)) return page;
      const next = withTotal(page, page.total + 1);

      // Where would the new row land among the visible rows?
      let index = page.rows.findIndex(
        (row) => compareRows(change.row, row, filters.sort, filters.dir) < 0,
      );
      if (index === -1) index = page.rows.length;

      // Sorts before everything here on a later page: it lives on an earlier page.
      if (index === 0 && page.page > 1) return next;
      // Sorts after a full page: it lives on a later page.
      if (index === page.rows.length && page.rows.length >= page.pageSize) {
        return next;
      }

      const rows = [...page.rows];
      rows.splice(index, 0, change.row);
      return { ...next, rows: rows.slice(0, page.pageSize) };
    }

    case "update": {
      const existing = page.rows.some((row) => row.id === change.row.id);
      if (!existing) return page;

      if (!matchesFilters(change.row, filters)) {
        // Edited out of this view (e.g. type changed while filtering by type).
        return {
          ...withTotal(page, Math.max(0, page.total - 1)),
          rows: page.rows.filter((row) => row.id !== change.row.id),
        };
      }

      const rows = page.rows
        .map((row) => (row.id === change.row.id ? change.row : row))
        .sort((a, b) => compareRows(a, b, filters.sort, filters.dir));
      return { ...page, rows };
    }
  }
}
