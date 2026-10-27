"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAllAssets } from "@/lib/data/assets";
import { getCurrentUser } from "@/lib/data/auth";
import { getPortfolioTransactions } from "@/lib/data/market-data";
import { getActivePortfolio } from "@/lib/data/portfolios";
import { getTransactionsPage } from "@/lib/data/transactions";
import { addDays, todayISO } from "@/lib/dates";
import type { PortfolioTransaction } from "@/lib/portfolio";
import {
  checkTransactionChange,
  type TransactionChange,
} from "@/lib/transaction-rules";
import {
  parseTransactionFilters,
  type TransactionsPage,
} from "@/lib/transactions-query";
import { createClient } from "@/lib/supabase/server";
import {
  createTransactionSchema,
  createUpdateTransactionSchema,
  deleteTransactionSchema,
  type DeleteTransactionValues,
  type TransactionFormValues,
  type UpdateTransactionValues,
} from "@/lib/validation";

/**
 * Server Actions are the source of truth for transaction changes. Each one:
 *  1. checks the session (`getUser`, not `getSession`),
 *  2. checks the target is the ACTIVE portfolio (guards against a stale tab),
 *  3. re-validates the input with the same zod schemas as the form,
 *  4. runs the oversell rule against the real ledger,
 *  5. writes through Supabase, where RLS is the last line of defence.
 *
 * Known limitation: steps 4 and 5 are not atomic, so two truly simultaneous
 * requests could both pass the check. Closing that gap needs a database
 * function/trigger; out of scope for this demo.
 */

export type TransactionActionResult =
  | { ok: true; id: string }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<string, string[]>>;
    };

const FOREIGN_KEY_VIOLATION = "23503";

/** "Not in the future" on the server: UTC today plus a day for zones ahead of UTC. */
function serverMaxDate() {
  return addDays(todayISO(), 1);
}

type Auth = { ok: true; portfolioId: string } | { ok: false; error: string };

function fail(error: string): Auth {
  return { ok: false, error };
}

async function authorize(portfolioId: string): Promise<Auth> {
  if (!(await getCurrentUser())) return fail("You need to be signed in.");

  if (!z.uuid().safeParse(portfolioId).success)
    return fail("Invalid portfolio.");

  const active = await getActivePortfolio();
  if (!active || active.id !== portfolioId) {
    return fail(
      "This portfolio is no longer active. Refresh the page and try again.",
    );
  }
  return { ok: true, portfolioId: active.id };
}

function invalid(error: z.ZodError): TransactionActionResult {
  return {
    ok: false,
    error: "Please fix the highlighted fields.",
    fieldErrors: z.flattenError(error).fieldErrors,
  };
}

/** Runs the oversell rule for a change against the portfolio's real ledger. */
async function checkOversell(
  portfolioId: string,
  change: TransactionChange,
): Promise<TransactionActionResult | null> {
  const [ledger, assets] = await Promise.all([
    getPortfolioTransactions(portfolioId),
    getAllAssets(),
  ]);

  if (change.kind !== "create" && !ledger.some((tx) => tx.id === change.id)) {
    return { ok: false, error: "Transaction not found." };
  }

  const symbols = new Map(assets.map((asset) => [asset.id, asset.symbol]));
  const check = checkTransactionChange(
    ledger,
    change,
    (assetId) => symbols.get(assetId) ?? "this asset",
  );
  if (check.ok) return null;

  return {
    ok: false,
    error: check.message,
    // Attach to the quantity field only when the edited transaction is the problem.
    fieldErrors: check.own ? { quantity: [check.message] } : undefined,
  };
}

function afterWrite() {
  // The dashboard is computed from transactions, so it must refresh too.
  revalidatePath("/dashboard");
  revalidatePath("/transactions");
}

export async function createTransaction(
  portfolioId: string,
  input: TransactionFormValues,
): Promise<TransactionActionResult> {
  const auth = await authorize(portfolioId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = createTransactionSchema(serverMaxDate()).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const draft = parsed.data;

  const blocked = await checkOversell(auth.portfolioId, {
    kind: "create",
    draft,
  });
  if (blocked) return blocked;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      portfolio_id: auth.portfolioId,
      asset_id: draft.assetId,
      type: draft.type,
      quantity: draft.quantity,
      price: draft.price,
      executed_at: draft.executedAt,
    })
    .select("id")
    .single();

  if (error) {
    return error.code === FOREIGN_KEY_VIOLATION
      ? {
          ok: false,
          error: "That asset does not exist.",
          fieldErrors: { assetId: ["That asset does not exist."] },
        }
      : { ok: false, error: "Could not add the transaction." };
  }

  afterWrite();
  return { ok: true, id: data.id };
}

export async function updateTransaction(
  portfolioId: string,
  input: UpdateTransactionValues,
): Promise<TransactionActionResult> {
  const auth = await authorize(portfolioId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed =
    createUpdateTransactionSchema(serverMaxDate()).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id, ...draft } = parsed.data;

  const blocked = await checkOversell(auth.portfolioId, {
    kind: "update",
    id,
    draft,
  });
  if (blocked) return blocked;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .update({
      asset_id: draft.assetId,
      type: draft.type,
      quantity: draft.quantity,
      price: draft.price,
      executed_at: draft.executedAt,
    })
    // Scoped to the active portfolio as well as the id.
    .eq("id", id)
    .eq("portfolio_id", auth.portfolioId)
    .select("id");

  if (error) {
    return error.code === FOREIGN_KEY_VIOLATION
      ? {
          ok: false,
          error: "That asset does not exist.",
          fieldErrors: { assetId: ["That asset does not exist."] },
        }
      : { ok: false, error: "Could not save the transaction." };
  }
  if (data.length === 0) return { ok: false, error: "Transaction not found." };

  afterWrite();
  return { ok: true, id };
}

export async function deleteTransaction(
  portfolioId: string,
  input: DeleteTransactionValues,
): Promise<TransactionActionResult> {
  const auth = await authorize(portfolioId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = deleteTransactionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid transaction." };
  const { id } = parsed.data;

  const blocked = await checkOversell(auth.portfolioId, { kind: "delete", id });
  if (blocked) return blocked;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", id)
    .eq("portfolio_id", auth.portfolioId)
    .select("id");

  if (error) return { ok: false, error: "Could not delete the transaction." };
  if (data.length === 0) return { ok: false, error: "Transaction not found." };

  afterWrite();
  return { ok: true, id };
}

// -----------------------------------------------------------------------------
// Reads used by TanStack Query to re-fetch after a mutation settles.
// (Server Actions are the simplest authenticated read channel from the client;
// they are POSTs and run one at a time, which is fine for this refetch.)
// -----------------------------------------------------------------------------

export async function fetchTransactionsPage(
  portfolioId: string,
  rawFilters: Readonly<Record<string, unknown>>,
): Promise<TransactionsPage> {
  const auth = await authorize(portfolioId);
  if (!auth.ok) throw new Error(auth.error);

  return getTransactionsPage(
    auth.portfolioId,
    parseTransactionFilters(rawFilters),
    await getAllAssets(),
  );
}

export async function fetchLedger(
  portfolioId: string,
): Promise<PortfolioTransaction[]> {
  const auth = await authorize(portfolioId);
  if (!auth.ok) throw new Error(auth.error);
  return getPortfolioTransactions(auth.portfolioId);
}
