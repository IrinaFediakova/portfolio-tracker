"use client";

import { useMemo } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCurrency, formatDate, formatQuantity } from "@/lib/format";
import type { PortfolioTransaction } from "@/lib/portfolio";
import { checkTransactionChange } from "@/lib/transaction-rules";
import { rowTotal, type TransactionRow } from "@/lib/transactions-query";

interface DeleteTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The transaction to delete. Kept after closing so the exit animation is stable. */
  row: TransactionRow | null;
  ledger: readonly PortfolioTransaction[];
  /** Message from a rejected delete, shown when the dialog reopens. */
  serverError?: string;
  onConfirm: (row: TransactionRow) => void;
  finalFocus: () => HTMLElement | null;
}

/**
 * Confirmation for deleting. Checks the oversell rule up front: if removing
 * this transaction would leave a later sale short, the button is disabled and
 * the reason is shown instead of letting the user hit a server error.
 */
export function DeleteTransactionDialog({
  open,
  onOpenChange,
  row,
  ledger,
  serverError,
  onConfirm,
  finalFocus,
}: DeleteTransactionDialogProps) {
  const blocked = useMemo(() => {
    if (!row) return null;
    const check = checkTransactionChange(
      ledger,
      { kind: "delete", id: row.id },
      () => row.symbol,
    );
    return check.ok ? null : check.message;
  }, [ledger, row]);

  const problem = blocked ?? serverError ?? null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent finalFocus={() => finalFocus() ?? true}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
          <AlertDialogDescription>
            {row
              ? `${row.type === "buy" ? "Buy" : "Sell"} of ${formatQuantity(row.quantity)} ${row.symbol} on ${formatDate(row.executedAt)} (${formatCurrency(rowTotal(row))}). This cannot be undone.`
              : null}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {problem ? (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {problem}
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!row || blocked !== null}
            onClick={() => {
              if (row) onConfirm(row);
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
