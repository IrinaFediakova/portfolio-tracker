import { z } from "zod";

/**
 * Zod schemas shared by client forms (react-hook-form resolver) and the
 * Server Actions that re-validate the same input. Never trust the client:
 * the server always parses again.
 *
 * Transaction schemas are added in Phase 4.
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
