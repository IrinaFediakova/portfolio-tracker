"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate, formatQuantity } from "@/lib/format";
import {
  rowTotal,
  type SortColumn,
  type TransactionFilters,
  type TransactionRow,
} from "@/lib/transactions-query";
import { cn } from "@/lib/utils";

import { TypeBadge } from "./type-badge";

interface ColumnDef {
  column: SortColumn;
  label: string;
  numeric?: boolean;
}

const SORTABLE_COLUMNS: ColumnDef[] = [
  { column: "date", label: "Date" },
  { column: "asset", label: "Asset" },
  { column: "type", label: "Type" },
  { column: "quantity", label: "Quantity", numeric: true },
  { column: "price", label: "Price", numeric: true },
];

interface TransactionsTableProps {
  rows: TransactionRow[];
  filters: TransactionFilters;
  caption: string;
  onSort: (column: SortColumn) => void;
  onEdit: (row: TransactionRow, trigger: HTMLElement) => void;
  onDelete: (row: TransactionRow, trigger: HTMLElement) => void;
}

function ariaSortOf(
  filters: TransactionFilters,
  column: SortColumn,
): "ascending" | "descending" | "none" {
  if (filters.sort !== column) return "none";
  return filters.dir === "asc" ? "ascending" : "descending";
}

function SortIcon({ state }: { state: "ascending" | "descending" | "none" }) {
  if (state === "ascending")
    return <ArrowUp className="size-3.5" aria-hidden />;
  if (state === "descending") {
    return <ArrowDown className="size-3.5" aria-hidden />;
  }
  return (
    <ArrowUpDown className="size-3.5 text-muted-foreground/60" aria-hidden />
  );
}

/**
 * Presentational table. Sort state lives in the URL; the headers are real
 * buttons (inside `th`, with `aria-sort`) so they work with keyboard and
 * screen readers. The table scrolls inside its own container on narrow
 * screens, so the page itself never scrolls sideways.
 */
export function TransactionsTable({
  rows,
  filters,
  caption,
  onSort,
  onEdit,
  onDelete,
}: TransactionsTableProps) {
  return (
    <div className="rounded-xl border">
      <Table className="min-w-[44rem]">
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {SORTABLE_COLUMNS.map(({ column, label, numeric }) => {
              const state = ariaSortOf(filters, column);
              return (
                <TableHead
                  key={column}
                  aria-sort={state}
                  className={cn(numeric && "text-right")}
                >
                  <button
                    type="button"
                    onClick={() => onSort(column)}
                    className={cn(
                      "-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-medium outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                      numeric && "flex-row-reverse",
                      state !== "none" && "text-foreground",
                    )}
                  >
                    {label}
                    <SortIcon state={state} />
                  </button>
                </TableHead>
              );
            })}
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="w-24 text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const label = `${row.type} of ${row.symbol} on ${formatDate(row.executedAt)}`;
            return (
              <TableRow
                key={row.id}
                aria-busy={row.pending ? true : undefined}
                className={cn(row.pending && "opacity-60")}
              >
                <TableCell className="whitespace-nowrap">
                  <time dateTime={row.executedAt}>
                    {formatDate(row.executedAt)}
                  </time>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{row.symbol}</div>
                  <div className="max-w-52 truncate text-xs text-muted-foreground">
                    {row.assetName}
                  </div>
                </TableCell>
                <TableCell>
                  <TypeBadge type={row.type} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatQuantity(row.quantity)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(row.price)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatCurrency(rowTotal(row))}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={row.pending}
                      aria-label={`Edit ${label}`}
                      onClick={(event) => onEdit(row, event.currentTarget)}
                    >
                      <Pencil aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={row.pending}
                      aria-label={`Delete ${label}`}
                      onClick={(event) => onDelete(row, event.currentTarget)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
