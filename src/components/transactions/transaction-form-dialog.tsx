"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  Controller,
  useForm,
  useWatch,
  type FieldErrors,
  type Resolver,
} from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { localTodayISO } from "@/lib/dates";
import { formatCurrency, formatDate, formatQuantity } from "@/lib/format";
import type { AssetInfo, PortfolioTransaction } from "@/lib/portfolio";
import {
  checkTransactionChange,
  unitsHeldOn,
  type TransactionChange,
} from "@/lib/transaction-rules";
import {
  createTransactionSchema,
  type TransactionFormValues,
} from "@/lib/validation";

/** Error returned by a rejected save, shown when the dialog reopens. */
export interface ServerFormError {
  message: string;
  fieldErrors?: Partial<Record<string, string[]>>;
}

const FIELD_ORDER = ["assetId", "quantity", "price", "executedAt"] as const;
type FieldName = (typeof FIELD_ORDER)[number];

const fieldDomId = (field: FieldName) => `transaction-form-${field}`;

interface TransactionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  /** Id of the transaction being edited (edit mode). */
  editingId?: string;
  defaultValues: Partial<TransactionFormValues>;
  serverError?: ServerFormError;
  assets: readonly AssetInfo[];
  /** Every transaction in the portfolio, for the instant oversell check. */
  ledger: readonly PortfolioTransaction[];
  onSubmit: (values: TransactionFormValues) => void;
  finalFocus: () => HTMLElement | null;
}

export function TransactionFormDialog({
  open,
  onOpenChange,
  mode,
  editingId,
  defaultValues,
  serverError,
  assets,
  ledger,
  onSubmit,
  finalFocus,
}: TransactionFormDialogProps) {
  const title = mode === "create" ? "Add transaction" : "Edit transaction";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        // After a rejected save, put focus on the first field with an error.
        initialFocus={() => {
          const first = FIELD_ORDER.find(
            (field) => serverError?.fieldErrors?.[field]?.length,
          );
          return first ? document.getElementById(fieldDomId(first)) : true;
        }}
        finalFocus={() => finalFocus() ?? true}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Record a buy or sell. Dashboard numbers update right away."
              : "Changes update your holdings and dashboard right away."}
          </DialogDescription>
        </DialogHeader>
        <TransactionForm
          mode={mode}
          editingId={editingId}
          defaultValues={defaultValues}
          serverError={serverError}
          assets={assets}
          ledger={ledger}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}

interface TransactionFormProps {
  mode: "create" | "edit";
  editingId?: string;
  defaultValues: Partial<TransactionFormValues>;
  serverError?: ServerFormError;
  assets: readonly AssetInfo[];
  ledger: readonly PortfolioTransaction[];
  onSubmit: (values: TransactionFormValues) => void;
}

function serverFieldErrors(
  serverError: ServerFormError | undefined,
): FieldErrors<TransactionFormValues> {
  const errors: FieldErrors<TransactionFormValues> = {};
  const fields = serverError?.fieldErrors;
  if (!fields) return errors;
  for (const name of [
    "assetId",
    "type",
    "quantity",
    "price",
    "executedAt",
  ] as const) {
    const message = fields[name]?.[0];
    if (message) errors[name] = { type: "server", message };
  }
  return errors;
}

/**
 * Mounted only while the dialog is open, so its state (values, errors) is
 * fresh every time. Validation = the shared zod schema, then the oversell rule;
 * the Server Action runs both again as the authority.
 */
function TransactionForm({
  mode,
  editingId,
  defaultValues,
  serverError,
  assets,
  ledger,
  onSubmit,
}: TransactionFormProps) {
  // Lazy initialisers keep the clock out of render.
  const [maxDate] = useState(() => localTodayISO());
  const [initialErrors] = useState(() => serverFieldErrors(serverError));
  const hasFieldErrors = Object.keys(initialErrors).length > 0;

  const symbols = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset.symbol])),
    [assets],
  );

  const resolver = useMemo<Resolver<TransactionFormValues>>(() => {
    const schema = createTransactionSchema(maxDate);
    const base = zodResolver(schema);

    return async (values, context, options) => {
      const parsed = schema.safeParse(values);
      if (parsed.success) {
        const change: TransactionChange =
          mode === "edit" && editingId
            ? { kind: "update", id: editingId, draft: parsed.data }
            : { kind: "create", draft: parsed.data };
        const check = checkTransactionChange(
          ledger,
          change,
          (assetId) => symbols.get(assetId) ?? "this asset",
        );
        if (!check.ok) {
          return {
            values: {},
            errors: { quantity: { type: "oversell", message: check.message } },
          };
        }
      }
      return base(values, context, options);
    };
  }, [maxDate, mode, editingId, ledger, symbols]);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormValues>({
    resolver,
    defaultValues: {
      type: "buy",
      executedAt: maxDate,
      ...defaultValues,
    },
    errors: initialErrors,
    // On a failed submit, RHF moves focus to the first invalid field.
    shouldFocusError: true,
  });

  const [type, assetId, executedAt, quantity, price] = useWatch({
    control,
    name: ["type", "assetId", "executedAt", "quantity", "price"],
  });

  const total = quantity * price;
  const holdingsHint =
    type === "sell" && assetId && executedAt
      ? `You hold ${formatQuantity(unitsHeldOn(ledger, assetId, executedAt, editingId))} units of ${symbols.get(assetId) ?? "this asset"} on ${formatDate(executedAt)}.`
      : null;

  const submit = handleSubmit((values) => onSubmit(values));

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      {serverError && !hasFieldErrors ? (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {serverError.message}
        </p>
      ) : null}

      <Field
        label="Asset"
        htmlFor={fieldDomId("assetId")}
        error={errors.assetId?.message}
      >
        <Controller
          control={control}
          name="assetId"
          render={({ field }) => (
            <Combobox
              items={assets}
              value={assets.find((asset) => asset.id === field.value) ?? null}
              onValueChange={(asset: AssetInfo | null) =>
                field.onChange(asset?.id ?? "")
              }
              itemToStringLabel={(asset: AssetInfo) =>
                `${asset.symbol} ${asset.name}`
              }
              isItemEqualToValue={(a: AssetInfo, b: AssetInfo) => a.id === b.id}
            >
              <ComboboxInput
                id={fieldDomId("assetId")}
                ref={field.ref}
                onBlur={field.onBlur}
                placeholder="Search by symbol or name"
                autoComplete="off"
                aria-invalid={errors.assetId ? true : undefined}
                aria-describedby={
                  errors.assetId ? `${fieldDomId("assetId")}-error` : undefined
                }
                className="w-full"
              />
              <ComboboxContent>
                <ComboboxEmpty>No assets found</ComboboxEmpty>
                <ComboboxList>
                  {(asset: AssetInfo) => (
                    <ComboboxItem key={asset.id} value={asset}>
                      <span className="font-medium">{asset.symbol}</span>
                      <span className="truncate text-muted-foreground">
                        {asset.name}
                      </span>
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          )}
        />
      </Field>

      <div className="grid gap-1.5">
        <span id="transaction-form-type-label" className="text-sm font-medium">
          Type
        </span>
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <ToggleGroup
              aria-labelledby="transaction-form-type-label"
              variant="outline"
              spacing={0}
              value={[field.value]}
              onValueChange={(next) => {
                // Re-clicking the pressed option would unset it; keep one selected.
                const chosen = next[0];
                if (chosen === "buy" || chosen === "sell")
                  field.onChange(chosen);
              }}
            >
              <ToggleGroupItem
                value="buy"
                className="px-4 aria-pressed:bg-primary aria-pressed:text-primary-foreground"
              >
                Buy
              </ToggleGroupItem>
              <ToggleGroupItem
                value="sell"
                className="px-4 aria-pressed:bg-primary aria-pressed:text-primary-foreground"
              >
                Sell
              </ToggleGroupItem>
            </ToggleGroup>
          )}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Quantity"
          htmlFor={fieldDomId("quantity")}
          error={errors.quantity?.message}
          hint={holdingsHint}
        >
          <Input
            id={fieldDomId("quantity")}
            type="number"
            inputMode="decimal"
            step="any"
            placeholder="0"
            autoComplete="off"
            aria-invalid={errors.quantity ? true : undefined}
            aria-describedby={describedBy(
              "quantity",
              errors.quantity,
              holdingsHint,
            )}
            {...register("quantity", { valueAsNumber: true })}
          />
        </Field>

        <Field
          label="Price per unit"
          htmlFor={fieldDomId("price")}
          error={errors.price?.message}
        >
          <Input
            id={fieldDomId("price")}
            type="number"
            inputMode="decimal"
            step="any"
            placeholder="0.00"
            autoComplete="off"
            aria-invalid={errors.price ? true : undefined}
            aria-describedby={describedBy("price", errors.price)}
            {...register("price", { valueAsNumber: true })}
          />
        </Field>
      </div>

      <Field
        label="Date"
        htmlFor={fieldDomId("executedAt")}
        error={errors.executedAt?.message}
      >
        <Input
          id={fieldDomId("executedAt")}
          type="date"
          max={maxDate}
          aria-invalid={errors.executedAt ? true : undefined}
          aria-describedby={describedBy("executedAt", errors.executedAt)}
          {...register("executedAt")}
        />
      </Field>

      <p className="flex items-baseline justify-between rounded-lg bg-muted px-3 py-2 text-sm">
        <span className="text-muted-foreground">Total</span>
        <span className="font-semibold tabular-nums">
          {Number.isFinite(total) ? formatCurrency(total) : "—"}
        </span>
      </p>

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancel
        </DialogClose>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : null}
          {mode === "create" ? "Add transaction" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function describedBy(
  field: FieldName,
  error: unknown,
  hint?: string | null,
): string | undefined {
  const ids = [
    error ? `${fieldDomId(field)}-error` : null,
    hint ? `${fieldDomId(field)}-hint` : null,
  ].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
