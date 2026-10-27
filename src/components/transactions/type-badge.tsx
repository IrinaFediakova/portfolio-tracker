import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { TransactionType } from "@/lib/portfolio";
import { cn } from "@/lib/utils";

/**
 * Buy / Sell badge. Colour is never the only signal: the label and an icon
 * carry the meaning too.
 */
export function TypeBadge({ type }: { type: TransactionType }) {
  const isBuy = type === "buy";
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 border-transparent",
        isBuy ? "bg-gain/10 text-gain" : "bg-loss/10 text-loss",
      )}
    >
      {isBuy ? <ArrowDownLeft aria-hidden /> : <ArrowUpRight aria-hidden />}
      {isBuy ? "Buy" : "Sell"}
    </Badge>
  );
}
