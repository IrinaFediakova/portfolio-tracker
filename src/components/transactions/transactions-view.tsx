"use client";

import { Plus, ReceiptText, SearchX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOptimistic, useRef, useState, useTransition } from "react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import type { AssetInfo, PortfolioTransaction } from "@/lib/portfolio";
import {
  buildTransactionsHref,
  clearFilters,
  hasActiveFilters,
  nextSort,
  updateFilters,
  type SortColumn,
  type TransactionFilters,
  type TransactionRow,
  type TransactionsPage,
} from "@/lib/transactions-query";
import type { TransactionFormValues } from "@/lib/validation";
import { cn } from "@/lib/utils";

import { DeleteTransactionDialog } from "./delete-transaction-dialog";
import { TransactionFiltersBar } from "./transaction-filters-bar";
import {
  TransactionFormDialog,
  type ServerFormError,
} from "./transaction-form-dialog";
import { TransactionsPagination } from "./transactions-pagination";
import { TransactionsTable } from "./transactions-table";
import { useTransactionMutations } from "./use-transaction-mutations";
import { useTransactionsData } from "./use-transactions-data";

interface TransactionsViewProps {
  portfolio: { id: string; name: string };
  /** Filters parsed from the URL on the server (page already clamped). */
  filters: TransactionFilters;
  initialPage: TransactionsPage;
  initialLedger: PortfolioTransaction[];
  assets: AssetInfo[];
}

type DialogKind = "create" | "edit" | "delete";

interface DialogState {
  kind: DialogKind;
  open: boolean;
  /** Target of edit/delete. Kept after closing so the exit animation is stable. */
  row: TransactionRow | null;
  /** Values to restore after a rejected save. */
  draft?: TransactionFormValues;
  error?: ServerFormError;
}

const SORT_LABELS: Record<SortColumn, string> = {
  date: "date",
  asset: "asset",
  type: "type",
  quantity: "quantity",
  price: "price",
};

/**
 * Client orchestrator for the transactions page.
 *
 * - View state (filters, sort, page) lives in the URL; this component only
 *   navigates. `useOptimistic` makes the controls react instantly while the
 *   server renders the new data.
 * - Data comes from the Server Component (props) and is mirrored in a
 *   TanStack Query cache so mutations can be optimistic.
 */
export function TransactionsView({
  portfolio,
  filters,
  initialPage,
  initialLedger,
  assets,
}: TransactionsViewProps) {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const [shownFilters, setShownFilters] = useOptimistic(filters);

  const { page, ledger } = useTransactionsData({
    portfolioId: portfolio.id,
    filters,
    initialPage,
    initialLedger,
  });
  const mutations = useTransactionMutations({
    portfolioId: portfolio.id,
    filters,
    assets,
  });

  const [dialog, setDialog] = useState<DialogState>({
    kind: "create",
    open: false,
    row: null,
  });
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const addButtonRef = useRef<HTMLButtonElement | null>(null);

  // --- navigation (URL is the source of truth) -----------------------------

  function navigate(
    next: TransactionFilters,
    options: { replace?: boolean; scroll?: boolean } = {},
  ) {
    const href = buildTransactionsHref(next);
    startNavigation(() => {
      setShownFilters(next);
      if (options.replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: options.scroll ?? false });
    });
  }

  // --- dialogs ---------------------------------------------------------------

  function openDialog(
    state: Omit<DialogState, "open">,
    trigger: HTMLElement | null,
  ) {
    returnFocusRef.current = trigger;
    setDialog({ ...state, open: true });
  }

  function closeDialog() {
    setDialog((current) => ({ ...current, open: false }));
  }

  /** Focus target after a dialog closes: the button that opened it, if still usable. */
  function getReturnFocusTarget(): HTMLElement | null {
    const trigger = returnFocusRef.current;
    const usable =
      trigger && trigger.isConnected && !trigger.hasAttribute("disabled");
    return usable ? trigger : addButtonRef.current;
  }

  // The dialog closes as soon as the user submits so the optimistic row is
  // visible immediately; if the server rejects, it reopens with their input.

  function submitCreate(values: TransactionFormValues) {
    closeDialog();
    mutations.create(values, {
      onFailure: (failure) =>
        openDialog(
          {
            kind: "create",
            row: null,
            draft: values,
            error: { message: failure.error, fieldErrors: failure.fieldErrors },
          },
          returnFocusRef.current,
        ),
    });
  }

  function submitEdit(row: TransactionRow, values: TransactionFormValues) {
    closeDialog();
    mutations.update(row.id, values, {
      onFailure: (failure) =>
        openDialog(
          {
            kind: "edit",
            row,
            draft: values,
            error: { message: failure.error, fieldErrors: failure.fieldErrors },
          },
          returnFocusRef.current,
        ),
    });
  }

  function confirmDelete(row: TransactionRow) {
    closeDialog();
    mutations.remove(row.id, {
      onFailure: (failure) =>
        openDialog(
          { kind: "delete", row, error: { message: failure.error } },
          returnFocusRef.current,
        ),
    });
  }

  // --- render ----------------------------------------------------------------

  const hasAnyTransactions = ledger.length > 0;
  const filtered = hasActiveFilters(filters);
  const editing = dialog.kind === "edit" ? dialog.row : null;
  const formDefaults: Partial<TransactionFormValues> =
    dialog.draft ??
    (editing
      ? {
          assetId: editing.assetId,
          type: editing.type,
          quantity: editing.quantity,
          price: editing.price,
          executedAt: editing.executedAt,
        }
      : {});

  const caption = `Transactions sorted by ${SORT_LABELS[filters.sort]}, ${
    filters.dir === "asc" ? "ascending" : "descending"
  }. Page ${page.page} of ${page.pageCount}.`;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Transactions
          </h1>
          <p className="text-sm text-muted-foreground">{portfolio.name}</p>
        </div>
        <Button
          ref={addButtonRef}
          type="button"
          onClick={(event) =>
            openDialog({ kind: "create", row: null }, event.currentTarget)
          }
        >
          <Plus aria-hidden />
          Add transaction
        </Button>
      </div>

      {!hasAnyTransactions && !filtered ? (
        <EmptyState
          icon={<ReceiptText className="size-5" />}
          title="No transactions yet"
          description="Record your first buy to start tracking holdings, value and P&L on the dashboard."
          action={
            <Button
              type="button"
              onClick={(event) =>
                openDialog({ kind: "create", row: null }, event.currentTarget)
              }
            >
              <Plus aria-hidden />
              Add your first transaction
            </Button>
          }
        />
      ) : (
        <>
          <TransactionFiltersBar
            filters={shownFilters}
            assets={assets}
            onChange={(patch) => navigate(updateFilters(shownFilters, patch))}
            onSearchChange={(q) =>
              navigate(updateFilters(shownFilters, { q }), { replace: true })
            }
            onClear={() => navigate(clearFilters(shownFilters))}
          />

          <div
            aria-busy={isNavigating}
            className={cn(
              "grid gap-4 transition-opacity",
              isNavigating && "opacity-60",
            )}
          >
            {page.total === 0 ? (
              <EmptyState
                icon={<SearchX className="size-5" />}
                title="No matching transactions"
                description="Nothing matches the current filters. Try a different search or widen the date range."
                action={
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate(clearFilters(shownFilters))}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : page.rows.length === 0 ? (
              // Every row on this page was just removed; the server is
              // sending the corrected page.
              <p
                role="status"
                className="py-10 text-center text-sm text-muted-foreground"
              >
                Updating…
              </p>
            ) : (
              <>
                <TransactionsTable
                  rows={page.rows}
                  filters={shownFilters}
                  caption={caption}
                  onSort={(column) => navigate(nextSort(shownFilters, column))}
                  onEdit={(row, trigger) =>
                    openDialog({ kind: "edit", row }, trigger)
                  }
                  onDelete={(row, trigger) =>
                    openDialog({ kind: "delete", row }, trigger)
                  }
                />
                <TransactionsPagination
                  filters={shownFilters}
                  page={page}
                  onNavigate={(next) => navigate(next, { scroll: true })}
                />
              </>
            )}
          </div>
        </>
      )}

      <TransactionFormDialog
        open={dialog.open && dialog.kind !== "delete"}
        onOpenChange={(open) => (open ? undefined : closeDialog())}
        mode={dialog.kind === "edit" ? "edit" : "create"}
        editingId={editing?.id}
        defaultValues={formDefaults}
        serverError={dialog.kind === "delete" ? undefined : dialog.error}
        assets={assets}
        ledger={ledger}
        onSubmit={(values) =>
          editing ? submitEdit(editing, values) : submitCreate(values)
        }
        finalFocus={getReturnFocusTarget}
      />

      <DeleteTransactionDialog
        open={dialog.open && dialog.kind === "delete"}
        onOpenChange={(open) => (open ? undefined : closeDialog())}
        row={dialog.kind === "delete" ? dialog.row : null}
        ledger={ledger}
        serverError={
          dialog.kind === "delete" ? dialog.error?.message : undefined
        }
        onConfirm={confirmDelete}
        finalFocus={getReturnFocusTarget}
      />
    </div>
  );
}
