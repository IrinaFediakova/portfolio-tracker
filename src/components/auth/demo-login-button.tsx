"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { signInAsDemo } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

/**
 * Triggers the `signInAsDemo` Server Action. The demo credentials live only in
 * server-side env vars; this component never sees them.
 */
export function DemoLoginButton() {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      // On success the action redirects, so a result only comes back on failure.
      const result = await signInAsDemo();
      if (result && !result.ok) toast.error(result.error);
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={isPending}
      onClick={handleClick}
    >
      {isPending ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : (
        <Sparkles aria-hidden />
      )}
      Continue as demo user
    </Button>
  );
}
