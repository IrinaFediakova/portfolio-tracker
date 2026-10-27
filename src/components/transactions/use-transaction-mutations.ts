"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
  type TransactionActionResult,
} from "@/app/(app)/transactions/actions";
import type { AssetInfo, PortfolioTransaction } from "@/lib/portfolio";
import { applyChange } from "@/lib/transaction-rules";
import { applyListChange } from "@/lib/transactions-optimistic";
import {
  filtersKey,
  type TransactionFilters,
  type TransactionRow,
  type TransactionsPage,
} from "@/lib/transactions-query";
import type { TransactionFormValues } from "@/lib/validation";

import { transactionKeys } from "./query-keys";

export type ActionFailure = Extract<TransactionActionResult, { ok: false }>;

/** Thrown inside `mutationFn` so TanStack Query treats a failed action as an error. */
class ActionError extends Error {
  constructor(readonly failure: ActionFailure) {
    super(failure.error);
  }
}

interface Handlers {
  /** Called after the optimistic update has been rolled back. */
  onFailure?: (failure: ActionFailure) => void;
}

/** What `onMutate` saved so `onError` can restore it. */
interface Snapshot {
  list: TransactionsPage | undefined;
  ledger: PortfolioTransaction[] | undefined;
}

interface Options {
  portfolioId: string;
  filters: TransactionFilters;
  assets: readonly AssetInfo[];
}

function toFailure(error: Error): ActionFailure {
  return error instanceof ActionError
    ? error.failure
    : { ok: false, error: "Something went wrong. Please try again." };
}

/**
 * Create / update / delete with optimistic updates.
 *
 * Lifecycle of each mutation:
 *  1. `onMutate`   cancel in-flight reads, snapshot the caches, apply the change
 *                  to BOTH the visible page and the ledger used for validation.
 *  2. server action (the authority: re-validates, may reject).
 *  3. `onError`    restore the snapshots and toast the reason.
 *  4. `onSettled`  invalidate, so the server's data replaces the prediction
 *                  whether the call succeeded or failed.
 */
export function useTransactionMutations({
  portfolioId,
  filters,
  assets,
}: Options) {
  const queryClient = useQueryClient();
  const listKey = transactionKeys.list(portfolioId, filtersKey(filters));
  const ledgerKey = transactionKeys.ledger(portfolioId);

  function toRow(
    id: string,
    values: TransactionFormValues,
    pending: boolean,
  ): TransactionRow {
    const asset = assets.find((candidate) => candidate.id === values.assetId);
    return {
      id,
      assetId: values.assetId,
      symbol: asset?.symbol ?? "?",
      assetName: asset?.name ?? "Unknown asset",
      assetType: asset?.type ?? "stock",
      type: values.type,
      quantity: values.quantity,
      price: values.price,
      executedAt: values.executedAt,
      pending,
    };
  }

  async function begin(): Promise<Snapshot> {
    // An in-flight refetch would overwrite the optimistic data when it lands.
    await queryClient.cancelQueries({
      queryKey: transactionKeys.all(portfolioId),
    });
    return {
      list: queryClient.getQueryData<TransactionsPage>(listKey),
      ledger: queryClient.getQueryData<PortfolioTransaction[]>(ledgerKey),
    };
  }

  function rollback(snapshot: Snapshot | undefined) {
    if (!snapshot) return;
    queryClient.setQueryData(listKey, snapshot.list);
    queryClient.setQueryData(ledgerKey, snapshot.ledger);
  }

  function settle() {
    return queryClient.invalidateQueries({
      queryKey: transactionKeys.all(portfolioId),
    });
  }

  const createMutation = useMutation<
    string,
    Error,
    { values: TransactionFormValues; tempId: string },
    Snapshot
  >({
    mutationFn: async ({ values }) => {
      const result = await createTransaction(portfolioId, values);
      if (!result.ok) throw new ActionError(result);
      return result.id;
    },
    onMutate: async ({ values, tempId }) => {
      const snapshot = await begin();
      queryClient.setQueryData<TransactionsPage>(
        listKey,
        (page) =>
          page &&
          applyListChange(
            page,
            { kind: "create", row: toRow(tempId, values, true) },
            filters,
          ),
      );
      queryClient.setQueryData<PortfolioTransaction[]>(
        ledgerKey,
        (ledger) =>
          ledger &&
          applyChange(ledger, { kind: "create", draft: values }, tempId),
      );
      return snapshot;
    },
    onSuccess: () => toast.success("Transaction added"),
    onError: (error, _vars, snapshot) => {
      rollback(snapshot);
      toast.error(toFailure(error).error);
    },
    onSettled: settle,
  });

  const updateMutation = useMutation<
    string,
    Error,
    { id: string; values: TransactionFormValues },
    Snapshot
  >({
    mutationFn: async ({ id, values }) => {
      const result = await updateTransaction(portfolioId, { id, ...values });
      if (!result.ok) throw new ActionError(result);
      return result.id;
    },
    onMutate: async ({ id, values }) => {
      const snapshot = await begin();
      queryClient.setQueryData<TransactionsPage>(
        listKey,
        (page) =>
          page &&
          applyListChange(
            page,
            { kind: "update", row: toRow(id, values, true) },
            filters,
          ),
      );
      queryClient.setQueryData<PortfolioTransaction[]>(
        ledgerKey,
        (ledger) =>
          ledger && applyChange(ledger, { kind: "update", id, draft: values }),
      );
      return snapshot;
    },
    onSuccess: () => toast.success("Transaction saved"),
    onError: (error, _vars, snapshot) => {
      rollback(snapshot);
      toast.error(toFailure(error).error);
    },
    onSettled: settle,
  });

  const deleteMutation = useMutation<string, Error, { id: string }, Snapshot>({
    mutationFn: async ({ id }) => {
      const result = await deleteTransaction(portfolioId, { id });
      if (!result.ok) throw new ActionError(result);
      return result.id;
    },
    onMutate: async ({ id }) => {
      const snapshot = await begin();
      queryClient.setQueryData<TransactionsPage>(
        listKey,
        (page) =>
          page && applyListChange(page, { kind: "delete", id }, filters),
      );
      queryClient.setQueryData<PortfolioTransaction[]>(
        ledgerKey,
        (ledger) => ledger && applyChange(ledger, { kind: "delete", id }),
      );
      return snapshot;
    },
    onSuccess: () => toast.success("Transaction deleted"),
    onError: (error, _vars, snapshot) => {
      rollback(snapshot);
      toast.error(toFailure(error).error);
    },
    onSettled: settle,
  });

  return {
    create(values: TransactionFormValues, handlers?: Handlers) {
      createMutation.mutate(
        { values, tempId: `pending-${crypto.randomUUID()}` },
        { onError: (error) => handlers?.onFailure?.(toFailure(error)) },
      );
    },
    update(id: string, values: TransactionFormValues, handlers?: Handlers) {
      updateMutation.mutate(
        { id, values },
        { onError: (error) => handlers?.onFailure?.(toFailure(error)) },
      );
    },
    remove(id: string, handlers?: Handlers) {
      deleteMutation.mutate(
        { id },
        { onError: (error) => handlers?.onFailure?.(toFailure(error)) },
      );
    },
  };
}
