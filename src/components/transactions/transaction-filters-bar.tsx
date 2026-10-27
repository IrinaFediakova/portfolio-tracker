"use client";

import { Search, X } from "lucide-react";
import { useEffect, useEffectEvent, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AssetInfo } from "@/lib/portfolio";
import {
  hasActiveFilters,
  type TransactionFilters,
} from "@/lib/transactions-query";

const SEARCH_DEBOUNCE_MS = 300;
const ALL = "all";

const TYPE_ITEMS = [
  { value: ALL, label: "All types" },
  { value: "buy", label: "Buy" },
  { value: "sell", label: "Sell" },
];

interface TransactionFiltersBarProps {
  filters: TransactionFilters;
  assets: readonly AssetInfo[];
  /** Applies a filter change (the parent resets the page and updates the URL). */
  onChange: (patch: Partial<TransactionFilters>) => void;
  /** Same, but replaces the history entry (used while typing). */
  onSearchChange: (query: string | undefined) => void;
  onClear: () => void;
}

export function TransactionFiltersBar({
  filters,
  assets,
  onChange,
  onSearchChange,
  onClear,
}: TransactionFiltersBarProps) {
  const id = useId();
  const assetItems = [
    { value: ALL, label: "All assets" },
    ...assets.map((asset) => ({
      value: asset.id,
      label: `${asset.symbol} · ${asset.name}`,
    })),
  ];

  return (
    <form
      role="search"
      aria-label="Filter transactions"
      onSubmit={(event) => event.preventDefault()}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_auto] lg:items-end"
    >
      <div className="grid gap-1.5 sm:col-span-2 lg:col-span-1">
        <Label htmlFor={`${id}-search`}>Search</Label>
        <SearchInput
          id={`${id}-search`}
          urlValue={filters.q ?? ""}
          onSearch={onSearchChange}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-type`}>Type</Label>
        <Select
          items={TYPE_ITEMS}
          value={filters.type ?? ALL}
          onValueChange={(value) =>
            onChange({
              type: value === "buy" || value === "sell" ? value : undefined,
            })
          }
        >
          <SelectTrigger id={`${id}-type`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {TYPE_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-asset`}>Asset</Label>
        <Select
          items={assetItems}
          value={filters.asset ?? ALL}
          onValueChange={(value) =>
            onChange({ asset: value && value !== ALL ? value : undefined })
          }
        >
          <SelectTrigger id={`${id}-asset`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {assetItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-from`}>From</Label>
        <Input
          id={`${id}-from`}
          type="date"
          value={filters.from ?? ""}
          max={filters.to}
          onChange={(event) =>
            onChange({ from: event.target.value || undefined })
          }
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-to`}>To</Label>
        <Input
          id={`${id}-to`}
          type="date"
          value={filters.to ?? ""}
          min={filters.from}
          onChange={(event) =>
            onChange({ to: event.target.value || undefined })
          }
        />
      </div>

      <Button
        type="button"
        variant="ghost"
        onClick={onClear}
        disabled={!hasActiveFilters(filters)}
        className="sm:col-span-2 lg:col-span-1"
      >
        <X aria-hidden />
        Clear filters
      </Button>
    </form>
  );
}

/**
 * Text input that updates the URL after the user stops typing.
 *
 * `text` is what the user sees; `urlValue` is what the URL says. They are
 * kept in sync without clobbering in-progress typing: an incoming URL value
 * only overwrites the input when it is NOT the value we just sent ourselves
 * (e.g. "Clear filters" or browser back/forward).
 */
function SearchInput({
  id,
  urlValue,
  onSearch,
}: {
  id: string;
  urlValue: string;
  onSearch: (query: string | undefined) => void;
}) {
  const [text, setText] = useState(urlValue);
  const [sent, setSent] = useState(urlValue);
  const [seenUrlValue, setSeenUrlValue] = useState(urlValue);

  if (urlValue !== seenUrlValue) {
    setSeenUrlValue(urlValue);
    if (urlValue !== sent) {
      setText(urlValue);
      setSent(urlValue);
    }
  }

  const emit = useEffectEvent((query: string) => {
    setSent(query);
    onSearch(query || undefined);
  });

  useEffect(() => {
    const query = text.trim();
    if (query === urlValue) return;
    const timer = setTimeout(() => emit(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, urlValue]);

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        id={id}
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Symbol or name"
        autoComplete="off"
        maxLength={60}
        className="pl-8"
      />
    </div>
  );
}
