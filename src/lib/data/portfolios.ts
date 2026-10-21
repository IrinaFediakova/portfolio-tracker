import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/** Cookie that remembers which portfolio the user is currently viewing. */
export const ACTIVE_PORTFOLIO_COOKIE = "active_portfolio";

export interface PortfolioSummary {
  id: string;
  name: string;
  createdAt: string;
}

/** All portfolios of the signed-in user (RLS scopes the query), oldest first. */
export const getPortfolios = cache(async (): Promise<PortfolioSummary[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("portfolios")
    .select("id, name, created_at")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw new Error(`Failed to load portfolios: ${error.message}`);

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  }));
});

/**
 * The portfolio being viewed: the one remembered in the cookie if it still
 * exists, otherwise the oldest. Null when the user has no portfolios.
 *
 * The cookie is only READ here (Server Components cannot write cookies); it is
 * written by the `setActivePortfolio` Server Action. Because we match it
 * against the user's own, RLS-filtered list, a forged or stale id is harmless.
 */
export const getActivePortfolio = cache(
  async (): Promise<PortfolioSummary | null> => {
    const [portfolios, cookieStore] = await Promise.all([
      getPortfolios(),
      cookies(),
    ]);
    const remembered = cookieStore.get(ACTIVE_PORTFOLIO_COOKIE)?.value;
    return (
      portfolios.find((portfolio) => portfolio.id === remembered) ??
      portfolios[0] ??
      null
    );
  },
);
