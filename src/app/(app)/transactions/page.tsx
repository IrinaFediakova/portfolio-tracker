import { ReceiptText } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Transactions" };

/** PHASE 3 PLACEHOLDER: replaced by the filterable table in Phase 4. */
export default function TransactionsPage() {
  return (
    <EmptyState
      icon={<ReceiptText className="size-5" />}
      title="Transactions are coming next"
      description="The filterable, sortable transactions table with add, edit and delete arrives in Phase 4."
    />
  );
}
