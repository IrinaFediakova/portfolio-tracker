"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import { getCurrentUser } from "@/lib/data/auth";
import { ACTIVE_PORTFOLIO_COOKIE } from "@/lib/data/portfolios";
import { createClient } from "@/lib/supabase/server";
import {
  portfolioFormSchema,
  portfolioIdSchema,
  renamePortfolioSchema,
  type PortfolioFormInput,
  type RenamePortfolioInput,
} from "@/lib/validation";

export type PortfolioActionResult =
  | { ok: true; id: string }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<string, string[]>>;
    };

const NOT_SIGNED_IN: PortfolioActionResult = {
  ok: false,
  error: "You need to be signed in.",
};

function invalid(error: z.ZodError): PortfolioActionResult {
  return {
    ok: false,
    error: "Please fix the highlighted fields.",
    fieldErrors: z.flattenError(error).fieldErrors,
  };
}

async function rememberPortfolio(id: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_PORTFOLIO_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/**
 * Every action re-checks the session and re-validates its input. RLS is the
 * real security boundary, but explicit checks give clear errors and keep the
 * actions safe even if a policy were ever misconfigured.
 */
export async function createPortfolio(
  input: PortfolioFormInput,
): Promise<PortfolioActionResult> {
  if (!(await getCurrentUser())) return NOT_SIGNED_IN;

  const parsed = portfolioFormSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  // user_id is filled by its column default (auth.uid()), never by the client.
  const { data, error } = await supabase
    .from("portfolios")
    .insert({ name: parsed.data.name })
    .select("id")
    .single();

  if (error) return { ok: false, error: "Could not create the portfolio." };

  await rememberPortfolio(data.id);
  revalidatePath("/", "layout");
  return { ok: true, id: data.id };
}

export async function renamePortfolio(
  input: RenamePortfolioInput,
): Promise<PortfolioActionResult> {
  if (!(await getCurrentUser())) return NOT_SIGNED_IN;

  const parsed = renamePortfolioSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("portfolios")
    .update({ name: parsed.data.name })
    .eq("id", parsed.data.id)
    .select("id");

  if (error) return { ok: false, error: "Could not rename the portfolio." };
  // RLS hides other users' rows, so "no row updated" means not found / not yours.
  if (data.length === 0) return { ok: false, error: "Portfolio not found." };

  revalidatePath("/", "layout");
  return { ok: true, id: parsed.data.id };
}

export async function setActivePortfolio(
  portfolioId: string,
): Promise<PortfolioActionResult> {
  if (!(await getCurrentUser())) return NOT_SIGNED_IN;

  const parsed = portfolioIdSchema.safeParse(portfolioId);
  if (!parsed.success) return { ok: false, error: "Invalid portfolio." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("portfolios")
    .select("id")
    .eq("id", parsed.data)
    .maybeSingle();

  if (error || !data) return { ok: false, error: "Portfolio not found." };

  await rememberPortfolio(data.id);
  revalidatePath("/", "layout");
  return { ok: true, id: data.id };
}
