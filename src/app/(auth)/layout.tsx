import { LineChart } from "lucide-react";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12">
      <div className="flex items-center gap-2 text-lg font-semibold">
        <LineChart className="size-5" aria-hidden />
        Portfolio Tracker
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
