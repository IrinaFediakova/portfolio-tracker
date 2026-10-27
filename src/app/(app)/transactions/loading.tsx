import { Skeleton } from "@/components/ui/skeleton";

/** Streamed instantly while the transactions page loads on the server. */
export default function TransactionsLoading() {
  return (
    <div className="grid gap-6" role="status" aria-label="Loading transactions">
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
      <div className="grid gap-2 rounded-xl border p-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
