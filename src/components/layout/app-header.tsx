import { FlaskConical } from "lucide-react";
import type { ReactNode } from "react";

import { PortfolioSwitcher } from "@/components/layout/portfolio-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { Badge } from "@/components/ui/badge";
import type { PortfolioSummary } from "@/lib/data/portfolios";

interface AppHeaderProps {
  /** Hamburger + slide-over nav, rendered by the layout (mobile only). */
  mobileNav: ReactNode;
  portfolios: PortfolioSummary[];
  activePortfolioId: string | null;
  email: string | undefined;
}

/**
 * Left to right: [hamburger (mobile)] [portfolio switcher] ...spacer...
 * [demo badge] [theme toggle] [user menu].
 */
export function AppHeader({
  mobileNav,
  portfolios,
  activePortfolioId,
  email,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur md:px-6">
      {mobileNav}
      <PortfolioSwitcher
        // Only plain id/name pairs cross the server -> client boundary.
        portfolios={portfolios.map(({ id, name }) => ({ id, name }))}
        activeId={activePortfolioId}
      />
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {/* Collapses to an icon below `sm` so the header fits at 375px. */}
        <Badge
          variant="secondary"
          title="Prices and transactions in this app are synthetic."
        >
          <FlaskConical className="size-3" aria-hidden />
          <span className="sr-only sm:not-sr-only">Demo data</span>
        </Badge>
        <ThemeToggle />
        <UserMenu email={email} />
      </div>
    </header>
  );
}
