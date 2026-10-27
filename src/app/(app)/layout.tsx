import { redirect } from "next/navigation";

import { AppFooter } from "@/components/layout/app-footer";
import { AppHeader } from "@/components/layout/app-header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { SidebarContent } from "@/components/layout/sidebar-content";
import { QueryProvider } from "@/components/providers/query-provider";
import { getCurrentUser } from "@/lib/data/auth";
import { getActivePortfolio, getPortfolios } from "@/lib/data/portfolios";

/**
 * Shell for every signed-in page. The proxy already redirects signed-out
 * visitors; checking again here is defence in depth, so these pages stay
 * protected even if the proxy matcher is changed or misconfigured.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [portfolios, activePortfolio] = await Promise.all([
    getPortfolios(),
    getActivePortfolio(),
  ]);

  const sidebar = <SidebarContent />;

  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-screen border-r bg-sidebar md:block">
        {sidebar}
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col">
        <AppHeader
          mobileNav={<MobileNav>{sidebar}</MobileNav>}
          portfolios={portfolios}
          activePortfolioId={activePortfolio?.id ?? null}
          email={user.email}
        />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 p-4 outline-none md:p-6"
        >
          <QueryProvider>{children}</QueryProvider>
        </main>
        <AppFooter />
      </div>
    </div>
  );
}
