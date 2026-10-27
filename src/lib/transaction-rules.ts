/**
 * Business rule: a transaction change must never leave a negative position.
 *
 * Runs the same pure check in the form (friendly, instant message) and in the
 * Server Actions (authoritative). It builds a HYPOTHETICAL ledger with the
 * change applied and compares `findOversells` before and after, so it also
 * catches edits/deletes that would strand a LATER sell.
 *
 * Only NEW problems block a change: if legacy data already contains an
 * oversell, unrelated edits are not held hostage by it.
 */
import type { ISODate } from "./dates";
import { formatDate, formatQuantity } from "./format";
import {
  findOversells,
  type Oversell,
  type PortfolioTransaction,
  type TransactionType,
} from "./portfolio";

/** The user-editable fields of a transaction. */
export interface TransactionDraft {
  assetId: string;
  type: TransactionType;
  quantity: number;
  price: number;
  executedAt: ISODate;
}

export type TransactionChange =
  | { kind: "create"; draft: TransactionDraft }
  | { kind: "update"; id: string; draft: TransactionDraft }
  | { kind: "delete"; id: string };

/** Placeholder id for a transaction that does not exist yet. */
export const NEW_TRANSACTION_ID = "__new__";

/**
 * Ledger as it would look after the change. Does not mutate the input.
 * `newId` is the id given to a created transaction (the optimistic cache passes
 * its temporary id so several pending creates never share one).
 */
export function applyChange(
  ledger: readonly PortfolioTransaction[],
  change: TransactionChange,
  newId: string = NEW_TRANSACTION_ID,
): PortfolioTransaction[] {
  switch (change.kind) {
    case "create":
      return [...ledger, { ...change.draft, id: newId }];
    case "update":
      return ledger.map((tx) =>
        tx.id === change.id ? { ...change.draft, id: change.id } : tx,
      );
    case "delete":
      return ledger.filter((tx) => tx.id !== change.id);
  }
}

/** The id of the transaction being created/edited/deleted. */
function changedId(change: TransactionChange): string {
  return change.kind === "create" ? NEW_TRANSACTION_ID : change.id;
}

/**
 * Oversells that the change introduces: sells that were fine before but are
 * short after, plus the edited/new transaction itself if it is short.
 */
export function findNewOversells(
  ledger: readonly PortfolioTransaction[],
  change: TransactionChange,
): Oversell[] {
  const target = changedId(change);
  const before = new Set(
    findOversells(ledger).flatMap((o) =>
      o.transactionId ? [o.transactionId] : [],
    ),
  );
  return findOversells(applyChange(ledger, change)).filter(
    (o) =>
      o.transactionId === target ||
      o.transactionId === undefined ||
      !before.has(o.transactionId),
  );
}

/** Units of an asset held at the end of `date`, optionally ignoring one transaction. */
export function unitsHeldOn(
  ledger: readonly PortfolioTransaction[],
  assetId: string,
  date: ISODate,
  excludeId?: string,
): number {
  let units = 0;
  for (const tx of ledger) {
    if (tx.assetId !== assetId || tx.executedAt > date) continue;
    if (excludeId !== undefined && tx.id === excludeId) continue;
    units += tx.type === "buy" ? tx.quantity : -tx.quantity;
  }
  return Math.max(0, Math.round(units * 1e6) / 1e6);
}

export type SymbolLookup = (assetId: string) => string;

export function describeOversell(
  oversell: Oversell,
  change: TransactionChange,
  symbolFor: SymbolLookup,
): string {
  const symbol = symbolFor(oversell.assetId);
  const date = formatDate(oversell.executedAt);
  const own = oversell.transactionId === changedId(change);

  if (own) {
    return `You only hold ${formatQuantity(oversell.available)} units of ${symbol} on ${date}.`;
  }
  const action =
    change.kind === "delete" ? "Deleting this transaction" : "This change";
  return `${action} would leave a later sale of ${symbol} on ${date} short (${formatQuantity(oversell.available)} units held, ${formatQuantity(oversell.requested)} sold).`;
}

export type CheckResult =
  | { ok: true }
  | { ok: false; message: string; oversell: Oversell; own: boolean };

/**
 * Validates a change against the ledger. Reports the first problem, preferring
 * one on the transaction being edited since that is what the user can act on.
 */
export function checkTransactionChange(
  ledger: readonly PortfolioTransaction[],
  change: TransactionChange,
  symbolFor: SymbolLookup,
): CheckResult {
  const problems = findNewOversells(ledger, change);
  if (problems.length === 0) return { ok: true };

  const target = changedId(change);
  const first = problems.find((o) => o.transactionId === target) ?? problems[0];
  return {
    ok: false,
    message: describeOversell(first, change, symbolFor),
    oversell: first,
    own: first.transactionId === target,
  };
}
