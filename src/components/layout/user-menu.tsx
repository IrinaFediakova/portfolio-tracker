"use client";

import { Briefcase, Loader2, LogOut, User } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";

import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getInitials } from "@/lib/initials";

interface UserMenuProps {
  email: string | undefined;
}

/**
 * Account menu. Base UI provides the keyboard behaviour: Enter/Space opens,
 * arrow keys move between items, Escape closes and returns focus to the trigger.
 */
export function UserMenu({ email }: UserMenuProps) {
  const [isSigningOut, startTransition] = useTransition();
  const initials = getInitials(email);

  function handleSignOut() {
    // The Server Action clears the session cookies and redirects to /login.
    startTransition(async () => {
      await signOut();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            className="rounded-full"
            aria-label={email ? `Account menu for ${email}` : "Account menu"}
          />
        }
      >
        {isSigningOut ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : initials ? (
          <span className="text-xs font-semibold" aria-hidden>
            {initials}
          </span>
        ) : (
          <User aria-hidden />
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          {/* A label, not an item: not focusable and skipped by arrow keys. */}
          <DropdownMenuLabel className="grid gap-0.5 py-1.5">
            <span>Signed in as</span>
            <span
              className="truncate text-sm font-medium text-foreground"
              title={email}
            >
              {email ?? "Unknown user"}
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/portfolios" />}>
          <Briefcase aria-hidden />
          Portfolios
        </DropdownMenuItem>
        <DropdownMenuItem disabled={isSigningOut} onClick={handleSignOut}>
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
