import { LineChart } from "lucide-react";
import Link from "next/link";

import { NavLinks } from "@/components/layout/nav-links";

/**
 * Navigation only (account controls live in the header's user menu).
 * Shared by the desktop sidebar and the mobile sheet.
 */
export function SidebarContent() {
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link
        href="/dashboard"
        className="flex items-center gap-2 rounded-md px-2 py-1 text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      >
        <LineChart className="size-5" aria-hidden />
        Portfolio Tracker
      </Link>

      <NavLinks />
    </div>
  );
}
