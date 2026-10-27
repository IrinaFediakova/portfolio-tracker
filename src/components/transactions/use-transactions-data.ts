"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import {
  fetchLedger,
  fetchTransactionsPage,
} from "@/app/(app)/transactions/actions";
import type { PortfolioTransaction } from "@/lib/portfolio";
import {
  filtersKey,
  filtersToSearchParams,
  type TransactionFilters,
  type TransactionsPage,
} from "@/lib/transactions-query";

import { transactionKeys } from "./query-keys";

interface Options {
  portfolioId: string;
  filters: TransactionFilters;
  /** Server-rendered data for the current URL. */
  initialPage: TransactionsPage;
  initialLedger: PortfolioTransaction[];
}

/**
 * Client cache for the transactions view.
 *
 * The Server Component's props are the source of truth: they seed the cache
 * (`initialData`) and, because they change after every `revalidatePath`, are
 * copied into the cache again whenever they change. TanStack Query adds what
 * the server render cannot: instant optimistic updates, rollback and refetch.
 */
export function useTransactionsData({
  portfolioId,
  filters,
  initialPage,
  initialLedger,
}: Options) {
  const queryClient = useQueryClient();
  const viewKey = filtersKey(filters);

  const list = useQuery({
    queryKey: transactionKeys.list(portfolioId, viewKey),
    queryFn: () =>
      fetchTransactionsPage(
        portfolioId,
        Object.fromEntries(filtersToSearchParams(filters)),
      ),
    initialData: initialPage,
  });

  const ledger = useQuery({
    queryKey: transactionKeys.ledger(portfolioId),
    queryFn: () => fetchLedger(portfolioId),
    initialData: initialLedger,
  });

  useEffect(() => {
    queryClient.setQueryData(
      transactionKeys.list(portfolioId, viewKey),
      initialPage,
    );
  }, [queryClient, portfolioId, viewKey, initialPage]);

  useEffect(() => {
    queryClient.setQueryData(
      transactionKeys.ledger(portfolioId),
      initialLedger,
    );
  }, [queryClient, portfolioId, initialLedger]);

  return {
    page: list.data,
    ledger: ledger.data,
    isRefetching: list.isFetching || ledger.isFetching,
  };
}
