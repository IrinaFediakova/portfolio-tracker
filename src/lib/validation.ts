import { z } from "zod";

import { isValidISODate, type ISODate } from "./dates";

/**
 * Zod schemas shared by client forms (react-hook-form resolver) and the
 * Server Actions that re-validate the same input. Never trust the client:
 * the server always parses again.
 */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address"));

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
});

export const signUpSchema = z
  .object({
    email: emailSchema,
    password: z
      .string()
      .min(8, "Use at least 8 characters")
      .max(72, "Use at most 72 characters"),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export type SignInInput = z.input<typeof signInSchema>;
export type SignUpInput = z.input<typeof signUpSchema>;

/** Mirrors the `portfolios.name` CHECK constraint (1-80 chars after trimming). */
export const portfolioNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name")
  .max(80, "Use at most 80 characters");

export const portfolioFormSchema = z.object({ name: portfolioNameSchema });

export const renamePortfolioSchema = z.object({
  id: z.uuid("Invalid portfolio"),
  name: portfolioNameSchema,
});

export const portfolioIdSchema = z.uuid("Invalid portfolio");

export type PortfolioFormInput = z.input<typeof portfolioFormSchema>;
export type RenamePortfolioInput = z.input<typeof renamePortfolioSchema>;

// -----------------------------------------------------------------------------
// Transactions
// -----------------------------------------------------------------------------

/** Largest value that fits `numeric(18, 6)` (12 integer digits). */
const MAX_NUMERIC = 999_999_999_999;

function hasAtMostSixDecimals(value: number): boolean {
  return Number(value.toFixed(6)) === value;
}

const quantitySchema = z
  .number({ error: "Enter a quantity" })
  .positive("Quantity must be greater than 0")
  .max(MAX_NUMERIC, "Quantity is too large")
  .refine(hasAtMostSixDecimals, "Use at most 6 decimal places");

const priceSchema = z
  .number({ error: "Enter a price" })
  .min(0, "Price cannot be negative")
  .max(MAX_NUMERIC, "Price is too large")
  .refine(hasAtMostSixDecimals, "Use at most 6 decimal places");

export const transactionTypeSchema = z.enum(["buy", "sell"], {
  error: "Choose buy or sell",
});

/**
 * Fields of a transaction, validated identically on the client (form resolver)
 * and in the Server Actions. `maxDate` is injected because "not in the future"
 * depends on a clock: the browser passes its local date, the server passes UTC
 * today (+1 day of slack for time zones ahead of UTC).
 *
 * Numbers are real `number`s (the form registers inputs with `valueAsNumber`).
 */
export function createTransactionSchema(maxDate: ISODate) {
  return z.object({
    assetId: z.uuid("Select an asset"),
    type: transactionTypeSchema,
    quantity: quantitySchema,
    price: priceSchema,
    executedAt: z
      .string({ error: "Pick a date" })
      .refine(isValidISODate, "Enter a valid date")
      .refine((date) => date <= maxDate, "Date cannot be in the future"),
  });
}

export function createUpdateTransactionSchema(maxDate: ISODate) {
  return createTransactionSchema(maxDate).extend({
    id: z.uuid("Invalid transaction"),
  });
}

export const deleteTransactionSchema = z.object({
  id: z.uuid("Invalid transaction"),
});

export type TransactionFormValues = z.input<
  ReturnType<typeof createTransactionSchema>
>;
export type UpdateTransactionValues = z.input<
  ReturnType<typeof createUpdateTransactionSchema>
>;
export type DeleteTransactionValues = z.input<typeof deleteTransactionSchema>;
