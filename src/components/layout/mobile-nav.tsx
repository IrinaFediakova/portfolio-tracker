"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface MobileNavProps {
  /** The (server-rendered) sidebar content, passed through as children. */
  children: ReactNode;
}

/** Slide-over navigation for screens below the `md` breakpoint. */
export function MobileNav({ children }: MobileNavProps) {
  const pathname = usePathname();
  // Remember WHERE the sheet was opened. Navigating changes the pathname, which
  // closes it automatically, with no effect or manual onClick wiring on links.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => setOpenedAt(next ? pathname : null)}
    >
      <SheetTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            className="md:hidden"
            aria-label="Open navigation menu"
          />
        }
      >
        <Menu aria-hidden />
      </SheetTrigger>
      <SheetContent side="left" showCloseButton className="bg-sidebar p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">
          Navigate between dashboard, transactions and portfolios.
        </SheetDescription>
        {children}
      </SheetContent>
    </Sheet>
  );
}
