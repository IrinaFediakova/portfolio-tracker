"use client";

import { useId, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  SERIES_RANGES,
  type SeriesRange,
  type ValuePoint,
} from "@/lib/portfolio";

interface ValueChartProps {
  /** Pre-computed on the server so switching ranges needs no refetch. */
  seriesByRange: Record<SeriesRange, ValuePoint[]>;
  initialRange?: SeriesRange;
}

const RANGE_LABELS: Record<SeriesRange, string> = {
  "1M": "Last month",
  "3M": "Last 3 months",
  "1Y": "Last year",
  All: "All time",
};

function isSeriesRange(value: unknown): value is SeriesRange {
  return SERIES_RANGES.some((range) => range === value);
}

function isValuePoint(value: unknown): value is ValuePoint {
  return (
    typeof value === "object" &&
    value !== null &&
    "date" in value &&
    "value" in value &&
    "costBasis" in value
  );
}

function ValueTooltip({ point }: { point: ValuePoint }) {
  return (
    <div className="rounded-lg bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md ring-1 ring-foreground/10">
      <p className="mb-1 text-muted-foreground">{formatDate(point.date)}</p>
      <p className="flex items-center justify-between gap-4">
        <span>Value</span>
        <span className="font-medium tabular-nums">
          {formatCurrency(point.value)}
        </span>
      </p>
      <p className="flex items-center justify-between gap-4 text-muted-foreground">
        <span>Cost basis</span>
        <span className="tabular-nums">{formatCurrency(point.costBasis)}</span>
      </p>
    </div>
  );
}

export function ValueChart({
  seriesByRange,
  initialRange = "1Y",
}: ValueChartProps) {
  const [range, setRange] = useState<SeriesRange>(initialRange);
  const gradientId = `value-fill-${useId().replace(/:/g, "")}`;
  const data = seriesByRange[range];

  const first = data[0];
  const last = data[data.length - 1];
  const summary =
    first && last
      ? `Portfolio value from ${formatDate(first.date)} (${formatCurrency(first.value)}) to ${formatDate(last.date)} (${formatCurrency(last.value)}).`
      : "No portfolio value data for this range.";

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>
          <h2>Portfolio value</h2>
        </CardTitle>
        <ToggleGroup
          aria-label="Chart time range"
          variant="outline"
          size="sm"
          spacing={0}
          value={[range]}
          onValueChange={(next) => {
            // Single-select that cannot be emptied: ignore a click on the active item.
            const picked = next[0];
            if (isSeriesRange(picked)) setRange(picked);
          }}
        >
          {SERIES_RANGES.map((option) => (
            <ToggleGroupItem
              key={option}
              value={option}
              aria-label={RANGE_LABELS[option]}
            >
              {option}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardHeader>

      <CardContent>
        {data.length < 2 ? (
          <p className="flex h-72 items-center justify-center text-sm text-muted-foreground">
            Not enough history in this range yet.
          </p>
        ) : (
          <div role="img" aria-label={summary} className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={data}
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="var(--chart-value)"
                      stopOpacity={0.35}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--chart-value)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={(date: string) => formatDate(date, "short")}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={40}
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                />
                <YAxis
                  tickFormatter={(value: number) =>
                    formatCurrency(value, { compact: true })
                  }
                  domain={[
                    (min: number) => Math.floor(min * 0.97),
                    (max: number) => Math.ceil(max * 1.02),
                  ]}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                />
                <Tooltip
                  cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
                  content={({ active, payload }) => {
                    const point: unknown = payload?.[0]?.payload;
                    return active && isValuePoint(point) ? (
                      <ValueTooltip point={point} />
                    ) : null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  name="Value"
                  stroke="var(--chart-value)"
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="costBasis"
                  name="Cost basis"
                  stroke="var(--muted-foreground)"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4 rounded bg-chart-value"
              aria-hidden
            />
            Market value
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-4 border-t-2 border-dashed border-muted-foreground"
              aria-hidden
            />
            Cost basis
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
