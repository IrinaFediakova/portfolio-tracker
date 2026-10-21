import {
  ArrowDownRight,
  ArrowUpRight,
  Briefcase,
  ReceiptText,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { AllocationChart } from "@/components/dashboard/allocation-chart";
import { StatCard } from "@/components/dashboard/stat-card";
import { toneOf } from "@/components/dashboard/tone";
import { ValueChart } from "@/components/dashboard/value-chart";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { getDashboardModel } from "@/lib/data/dashboard";
import { getActivePortfolio } from "@/lib/data/portfolios";
import type { AssetPerformance } from "@/lib/dashboard";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Server Component: all data is fetched and reduced to plain objects on the
 * server. The chart components below are Client Components that only receive
 * those serializable props; they never talk to the database.
 */
export default async function DashboardPage() {
  const portfolio = await getActivePortfolio();

  if (!portfolio) {
    return (
      <EmptyState
        icon={<Briefcase className="size-5" />}
        title="Create your first portfolio"
        description="A portfolio groups the buys and sells you want to track together. Create one to see your value, P&L and allocation."
        action={
          <Link href="/portfolios" className={buttonVariants()}>
            Create a portfolio
          </Link>
        }
      />
    );
  }

  const model = await getDashboardModel(portfolio.id);

  if (!model.hasTransactions) {
    return (
      <EmptyState
        icon={<ReceiptText className="size-5" />}
        title={`No transactions in ${portfolio.name}`}
        description="Add your first buy to start building the dashboard."
        action={
          <Link href="/transactions" className={buttonVariants()}>
            Go to transactions
          </Link>
        }
      />
    );
  }

  const { pnl, best, worst } = model;
  const pnlTone = toneOf(pnl.total);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {portfolio.name} · prices as of {formatDate(model.asOf)}
        </p>
      </div>

      <section
        aria-label="Summary"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          title="Total value"
          value={formatCurrency(model.totalValue)}
          icon={<Wallet className="size-4" />}
          detail={`Invested ${formatCurrency(pnl.invested)}`}
        />
        <StatCard
          title="Total P&L"
          value={formatCurrency(pnl.total, { signDisplay: "exceptZero" })}
          tone={pnlTone}
          icon={
            pnl.total < 0 ? (
              <TrendingDown className="size-4" />
            ) : (
              <TrendingUp className="size-4" />
            )
          }
          detail={
            <>
              <span className="font-medium text-foreground">
                {formatPercent(pnl.percent, { signDisplay: "exceptZero" })}
              </span>{" "}
              · unrealized{" "}
              {formatCurrency(pnl.unrealized, { signDisplay: "exceptZero" })},
              realized{" "}
              {formatCurrency(pnl.realized, { signDisplay: "exceptZero" })}
            </>
          }
        />
        <PerformerCard
          title="Best performer"
          performer={best}
          icon={<ArrowUpRight className="size-4" />}
        />
        <PerformerCard
          title="Worst performer"
          performer={worst}
          icon={<ArrowDownRight className="size-4" />}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ValueChart seriesByRange={model.seriesByRange} />
        <AllocationChart
          byAsset={model.allocationByAsset}
          byType={model.allocationByType}
          totalValue={model.totalValue}
        />
      </div>
    </div>
  );
}

function PerformerCard({
  title,
  performer,
  icon,
}: {
  title: string;
  performer: AssetPerformance | null;
  icon: ReactNode;
}) {
  if (!performer) {
    return (
      <StatCard
        title={title}
        value="—"
        icon={icon}
        detail="Needs at least two assets"
      />
    );
  }

  return (
    <StatCard
      title={title}
      value={performer.symbol}
      tone={toneOf(performer.percent)}
      icon={icon}
      detail={
        <>
          <span className="font-medium text-foreground">
            {formatPercent(performer.percent, { signDisplay: "exceptZero" })}
          </span>{" "}
          · {performer.name}
        </>
      }
    />
  );
}
