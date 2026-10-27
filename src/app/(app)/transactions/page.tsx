import { Briefcase } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { TransactionsView } from "@/components/transactions/transactions-view";
import { buttonVariants } from "@/components/ui/button";
import { getAllAssets } from "@/lib/data/assets";
import { getPortfolioTransactions } from "@/lib/data/market-data";
import { getActivePortfolio } from "@/lib/data/portfolios";
import { getTransactionsPage } from "@/lib/data/transactions";
import { parseTransactionFilters } from "@/lib/transactions-query";

export const metadata: Metadata = { title: "Transactions" };

/**
 * Server Component. The URL is the whole view state: `searchParams` are parsed
 * (never trusted) into filters, and filtering, sorting and pagination run in
 * Postgres, scoped to the active portfolio (RLS applies on top).
 */
export default async function TransactionsPage({
  searchParams,
}: PageProps<"/transactions">) {
  const portfolio = await getActivePortfolio();

  if (!portfolio) {
    return (
      <EmptyState
        icon={<Briefcase className="size-5" />}
        title="Create your first portfolio"
        description="Transactions belong to a portfolio. Create one, then record your buys and sells here."
        action={
          <Link href="/portfolios" className={buttonVariants()}>
            Create a portfolio
          </Link>
        }
      />
    );
  }

  const filters = parseTransactionFilters(await searchParams);
  const assets = await getAllAssets();

  const [page, ledger] = await Promise.all([
    getTransactionsPage(portfolio.id, filters, assets),
    // Full ledger: lets the form check "would this oversell?" instantly.
    getPortfolioTransactions(portfolio.id),
  ]);

  return (
    <TransactionsView
      portfolio={{ id: portfolio.id, name: portfolio.name }}
      // A page past the end was clamped by the query: reflect the real one.
      filters={{ ...filters, page: page.page }}
      initialPage={page}
      initialLedger={ledger}
      assets={assets}
    />
  );
}
