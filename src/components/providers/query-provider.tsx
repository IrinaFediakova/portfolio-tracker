"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * One QueryClient per browser session. Created in state (not at module level)
 * so server renders never share a client between requests.
 *
 * Server Components provide the first page of data; TanStack Query is used for
 * optimistic mutations and refetching afterwards, so a short `staleTime` is
 * unnecessary and `refetchOnWindowFocus` is off to avoid surprise reshuffles.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
