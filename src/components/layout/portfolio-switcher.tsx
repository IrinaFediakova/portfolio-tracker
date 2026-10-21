"use client";

import { Briefcase, ChevronsUpDown, Loader2, Settings2 } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { setActivePortfolio } from "@/app/(app)/portfolios/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface PortfolioOption {
  id: string;
  name: string;
}

interface PortfolioSwitcherProps {
  portfolios: PortfolioOption[];
  activeId: string | null;
}

export function PortfolioSwitcher({
  portfolios,
  activeId,
}: PortfolioSwitcherProps) {
  const [isPending, startTransition] = useTransition();
  const active = portfolios.find((portfolio) => portfolio.id === activeId);

  if (portfolios.length === 0) {
    return (
      <Link
        href="/portfolios"
        className={cn(buttonVariants({ variant: "outline" }))}
      >
        <Briefcase aria-hidden />
        Create a portfolio
      </Link>
    );
  }

  function handleChange(id: string) {
    if (id === activeId) return;
    startTransition(async () => {
      const result = await setActivePortfolio(id);
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className="max-w-[8.5rem] min-w-0 justify-between sm:max-w-[16rem]"
            aria-label={`Portfolio: ${active?.name ?? "none"}. Switch portfolio`}
          />
        }
      >
        {isPending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <Briefcase aria-hidden />
        )}
        <span className="truncate">{active?.name ?? "Select portfolio"}</span>
        <ChevronsUpDown className="text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Portfolios</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={activeId ?? ""}
            onValueChange={handleChange}
          >
            {portfolios.map((portfolio) => (
              <DropdownMenuRadioItem key={portfolio.id} value={portfolio.id}>
                <span className="truncate">{portfolio.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/portfolios" />}>
          <Settings2 aria-hidden />
          Manage portfolios
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
