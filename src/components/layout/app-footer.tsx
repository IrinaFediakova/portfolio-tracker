import { Info } from "lucide-react";

export function AppFooter() {
  return (
    <footer className="border-t px-4 py-4 text-xs text-muted-foreground md:px-6">
      <p className="flex items-start gap-2">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          <strong className="font-medium text-foreground">Demo data:</strong>{" "}
          all prices and transactions are synthetic and generated for
          illustration. Nothing here is real market data or financial advice.
        </span>
      </p>
    </footer>
  );
}
