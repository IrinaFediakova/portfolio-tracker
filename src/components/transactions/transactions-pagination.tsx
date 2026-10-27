"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { MouseEvent } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PAGE_SIZE_OPTIONS,
  buildTransactionsHref,
  getPageItems,
  updateFilters,
  type TransactionFilters,
  type TransactionsPage,
} from "@/lib/transactions-query";
import { cn } from "@/lib/utils";

interface TransactionsPaginationProps {
  filters: TransactionFilters;
  page: TransactionsPage;
  onNavigate: (next: TransactionFilters) => void;
}

/** Plain left-click without modifiers (anything else keeps native link behaviour). */
function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/**
 * Real links (shareable, middle-clickable) that are intercepted for plain
 * clicks so the parent can run the navigation in a transition and show
 * pending feedback.
 */
export function TransactionsPagination({
  filters,
  page,
  onNavigate,
}: TransactionsPaginationProps) {
  const current = page.page;
  const items = getPageItems(current, page.pageCount);
  const from = page.total === 0 ? 0 : (current - 1) * page.pageSize + 1;
  const to = Math.min(current * page.pageSize, page.total);

  const pageLink = (target: number) => {
    const next = updateFilters(filters, { page: target });
    return {
      href: buildTransactionsHref(next),
      onClick: (event: MouseEvent<HTMLAnchorElement>) => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        onNavigate(next);
      },
    };
  };

  const hasPrev = current > 1;
  const hasNext = current < page.pageCount;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {page.total === 0
          ? "No results"
          : `Showing ${from}–${to} of ${page.total}`}
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <Label
            htmlFor="transactions-page-size"
            className="text-muted-foreground"
          >
            Rows per page
          </Label>
          <Select
            value={String(filters.pageSize)}
            onValueChange={(value) => {
              const size = Number(value);
              if (Number.isFinite(size)) {
                onNavigate(updateFilters(filters, { pageSize: size }));
              }
            }}
          >
            <SelectTrigger
              id="transactions-page-size"
              size="sm"
              className="w-20"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <nav aria-label="Pagination">
          <ul className="flex items-center gap-1">
            <li>
              {hasPrev ? (
                <Link
                  {...pageLink(current - 1)}
                  aria-label="Previous page"
                  className={buttonVariants({
                    variant: "outline",
                    size: "icon-sm",
                  })}
                >
                  <ChevronLeft aria-hidden />
                </Link>
              ) : (
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled
                  aria-label="Previous page"
                >
                  <ChevronLeft aria-hidden />
                </Button>
              )}
            </li>

            {items.map((item) =>
              typeof item === "number" ? (
                <li key={item}>
                  <Link
                    {...pageLink(item)}
                    aria-label={`Page ${item}`}
                    aria-current={item === current ? "page" : undefined}
                    className={cn(
                      buttonVariants({
                        variant: item === current ? "default" : "ghost",
                        size: "icon-sm",
                      }),
                      "tabular-nums",
                    )}
                  >
                    {item}
                  </Link>
                </li>
              ) : (
                <li
                  key={item}
                  aria-hidden
                  className="px-1 text-muted-foreground"
                >
                  …
                </li>
              ),
            )}

            <li>
              {hasNext ? (
                <Link
                  {...pageLink(current + 1)}
                  aria-label="Next page"
                  className={buttonVariants({
                    variant: "outline",
                    size: "icon-sm",
                  })}
                >
                  <ChevronRight aria-hidden />
                </Link>
              ) : (
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled
                  aria-label="Next page"
                >
                  <ChevronRight aria-hidden />
                </Button>
              )}
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
}
