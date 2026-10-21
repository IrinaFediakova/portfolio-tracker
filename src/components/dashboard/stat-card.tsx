import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { TONE_CLASSES, type Tone } from "./tone";

interface StatCardProps {
  title: string;
  /** Main figure, already formatted. */
  value: string;
  icon: ReactNode;
  /** Tints the value; meaning is also carried by `detail`, never by colour alone. */
  tone?: Tone;
  /** Secondary line (e.g. percent change). Can be any node. */
  detail?: ReactNode;
}

export function StatCard({
  title,
  value,
  icon,
  tone = "neutral",
  detail,
}: StatCardProps) {
  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <span className="text-muted-foreground" aria-hidden>
          {icon}
        </span>
      </CardHeader>
      <CardContent className="grid gap-1">
        <p
          className={cn(
            "text-2xl font-semibold tracking-tight tabular-nums",
            tone !== "neutral" && TONE_CLASSES[tone],
          )}
        >
          {value}
        </p>
        {detail ? (
          <div className="text-xs text-muted-foreground">{detail}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
