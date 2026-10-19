import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * PHASE 1 PLACEHOLDER: proves the auth round-trip works end to end.
 * Replaced by the real dashboard (and the (app) layout) in Phase 3.
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  // getUser() re-validates the token with Supabase Auth; safe for trust decisions.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-muted-foreground">
        Signed in as <span className="text-foreground">{user.email}</span>.
        Charts and stats arrive in Phase 3.
      </p>
      <form action={signOut}>
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </main>
  );
}
