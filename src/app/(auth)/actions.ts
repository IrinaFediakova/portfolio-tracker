"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getDemoCredentials } from "@/lib/env.server";
import { DEFAULT_REDIRECT_PATH, safeRedirectPath } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";
import {
  signInSchema,
  signUpSchema,
  type SignInInput,
  type SignUpInput,
} from "@/lib/validation";

/**
 * Result returned to the client. On success the actions `redirect()` instead,
 * except sign-up when email confirmation is required.
 */
export type AuthActionResult =
  | { ok: true; message: string }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<string, string[]>>;
    };

function validationFailure(error: z.ZodError): AuthActionResult {
  return {
    ok: false,
    error: "Please fix the highlighted fields.",
    fieldErrors: z.flattenError(error).fieldErrors,
  };
}

export async function signIn(
  input: SignInInput,
  next?: string,
): Promise<AuthActionResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Deliberately generic: do not reveal whether the email exists.
    return { ok: false, error: "Invalid email or password." };
  }

  redirect(safeRedirectPath(next));
}

export async function signUp(input: SignUpInput): Promise<AuthActionResult> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  // A session is only returned when email confirmation is disabled.
  if (data.session) {
    redirect(DEFAULT_REDIRECT_PATH);
  }

  return {
    ok: true,
    message: "Check your inbox to confirm your email, then sign in.",
  };
}

/**
 * One-click demo access. Credentials are read from server-only env vars inside
 * this action, so they never reach the client bundle.
 */
export async function signInAsDemo(): Promise<AuthActionResult> {
  const credentials = getDemoCredentials();
  if (!credentials) {
    return { ok: false, error: "The demo account is not configured." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(credentials);

  if (error) {
    return {
      ok: false,
      error:
        "Could not sign in as the demo user. Has the seed script been run?",
    };
  }

  redirect(DEFAULT_REDIRECT_PATH);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
