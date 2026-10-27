/**
 * TanStack Query keys for the transactions feature.
 *
 *   ["transactions", portfolioId]                      prefix: everything
 *   ["transactions", portfolioId, "list", viewKey]     one filtered/sorted page
 *   ["transactions", portfolioId, "ledger"]            every transaction (oversell checks)
 *
 * `viewKey` is the canonical URL query string of the view (see `filtersKey`).
 */
export const transactionKeys = {
  all: (portfolioId: string) => ["transactions", portfolioId] as const,
  list: (portfolioId: string, viewKey: string) =>
    ["transactions", portfolioId, "list", viewKey] as const,
  ledger: (portfolioId: string) =>
    ["transactions", portfolioId, "ledger"] as const,
};
