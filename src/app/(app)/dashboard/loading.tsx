import { Skeleton } from "@/components/ui/skeleton";

/** Streamed instantly while the dashboard's server-side data loads. */
export default function DashboardLoading() {
  return (
    <div className="grid gap-6" role="status" aria-label="Loading dashboard">
      <div className="grid gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Skeleton className="h-[26rem] rounded-xl" />
        <Skeleton className="h-[26rem] rounded-xl" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
