"use client";

import { useState } from "react";
import { Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { AllocationSlice } from "@/lib/dashboard";
import { formatCurrency, formatPercent } from "@/lib/format";

import { assetSliceColor, typeSliceColor } from "./chart-colors";

type View = "asset" | "type";

interface AllocationChartProps {
  byAsset: AllocationSlice[];
  byType: AllocationSlice[];
  totalValue: number;
}

interface ColoredSlice extends AllocationSlice {
  fill: string;
}

function isView(value: unknown): value is View {
  return value === "asset" || value === "type";
}

function isColoredSlice(value: unknown): value is ColoredSlice {
  return (
    typeof value === "object" &&
    value !== null &&
    "label" in value &&
    "value" in value &&
    "share" in value
  );
}

export function AllocationChart({
  byAsset,
  byType,
  totalValue,
}: AllocationChartProps) {
  const [view, setView] = useState<View>("asset");

  const slices: ColoredSlice[] = (view === "asset" ? byAsset : byType).map(
    (slice, index) => ({
      ...slice,
      fill:
        view === "asset"
          ? assetSliceColor(index, slice.key)
          : typeSliceColor(slice.key),
    }),
  );

  const summary = slices
    .map((s) => `${s.label} ${formatPercent(s.share, { digits: 1 })}`)
    .join(", ");

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>
          <h2>Allocation</h2>
        </CardTitle>
        <ToggleGroup
          aria-label="Group allocation by"
          variant="outline"
          size="sm"
          spacing={0}
          value={[view]}
          onValueChange={(next) => {
            const picked = next[0];
            if (isView(picked)) setView(picked);
          }}
        >
          <ToggleGroupItem value="asset">Asset</ToggleGroupItem>
          <ToggleGroupItem value="type">Type</ToggleGroupItem>
        </ToggleGroup>
      </CardHeader>

      <CardContent className="grid items-center gap-6 sm:grid-cols-[minmax(0,13rem)_1fr]">
        <div
          role="img"
          aria-label={`Allocation by ${view}: ${summary}`}
          className="relative mx-auto h-52 w-full max-w-52"
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                content={({ active, payload }) => {
                  const slice: unknown = payload?.[0]?.payload;
                  if (!active || !isColoredSlice(slice)) return null;
                  return (
                    <div className="rounded-lg bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md ring-1 ring-foreground/10">
                      <p className="font-medium">{slice.label}</p>
                      <p className="text-muted-foreground tabular-nums">
                        {formatCurrency(slice.value)} ·{" "}
                        {formatPercent(slice.share, { digits: 1 })}
                      </p>
                    </div>
                  );
                }}
              />
              <Pie
                data={slices}
                dataKey="value"
                nameKey="label"
                innerRadius="62%"
                outerRadius="100%"
                paddingAngle={slices.length > 1 ? 2 : 0}
                stroke="var(--card)"
                strokeWidth={2}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xs text-muted-foreground">Total</span>
            <span className="text-lg font-semibold tabular-nums">
              {formatCurrency(totalValue, { compact: true })}
            </span>
          </div>
        </div>

        <ul className="grid gap-2 text-sm">
          {slices.map((slice) => (
            <li key={slice.key} className="flex items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: slice.fill }}
                aria-hidden
              />
              <span className="truncate font-medium">{slice.label}</span>
              <span className="ml-auto text-muted-foreground tabular-nums">
                {formatPercent(slice.share, { digits: 1 })}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
