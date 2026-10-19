/**
 * Seeds a Supabase project with demo data. Run with: npm run seed
 *
 * SECURITY: uses SUPABASE_SERVICE_ROLE_KEY, which BYPASSES Row Level Security.
 * It is read only here, from the local environment. Never import this file (or
 * the key) from application code under src/.
 *
 * Idempotent: safe to run repeatedly.
 *   - demo user: created if missing, otherwise password reset + email confirmed
 *   - assets:    upserted by symbol
 *   - prices:    upserted by (asset_id, date); values are deterministic
 *   - portfolios: matched by (user, name), created if missing
 *   - transactions: replaced for the demo portfolios, which also resets any
 *     edits made to the public demo account
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

import { todayISO } from "../src/lib/dates";
import type { Database, TablesInsert } from "../src/types/database";
import {
  PORTFOLIO_PLANS,
  SEED_ASSETS,
  buildPriceLookup,
  generatePriceSeries,
  generateTransactions,
  historyWindowStart,
} from "./seed-data";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

type Client = SupabaseClient<Database>;

const BATCH_SIZE = 1000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Add it to .env.local (see .env.example).`,
    );
  }
  return value;
}

function fail(step: string, error: { message: string }): never {
  throw new Error(`${step}: ${error.message}`);
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function ensureDemoUser(
  supabase: Client,
  email: string,
  password: string,
): Promise<string> {
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) fail("List users", error);

    const existing = data.users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase(),
    );
    if (existing) {
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        existing.id,
        { password, email_confirm: true },
      );
      if (updateError) fail("Update demo user", updateError);
      console.log(
        `  demo user exists (${email}); password reset, email confirmed`,
      );
      return existing.id;
    }
    if (data.users.length < perPage) break;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) fail("Create demo user", error);
  console.log(`  demo user created (${email})`);
  return data.user.id;
}

async function seedAssets(supabase: Client): Promise<Map<string, string>> {
  const rows: TablesInsert<"assets">[] = SEED_ASSETS.map(
    ({ symbol, name, type }) => ({ symbol, name, type }),
  );
  const { data, error } = await supabase
    .from("assets")
    .upsert(rows, { onConflict: "symbol" })
    .select("id, symbol");
  if (error) fail("Upsert assets", error);

  console.log(`  ${data.length} assets upserted`);
  return new Map(data.map((asset) => [asset.symbol, asset.id]));
}

async function seedPrices(
  supabase: Client,
  assetIds: ReadonlyMap<string, string>,
  seriesBySymbol: ReadonlyMap<string, { date: string; price: number }[]>,
  windowStart: string,
): Promise<void> {
  const rows: TablesInsert<"price_history">[] = [];
  for (const [symbol, series] of seriesBySymbol) {
    const assetId = assetIds.get(symbol);
    if (!assetId) throw new Error(`No id for asset ${symbol}`);
    for (const point of series) {
      if (point.date >= windowStart) {
        rows.push({ asset_id: assetId, date: point.date, price: point.price });
      }
    }
  }

  for (const batch of chunk(rows, BATCH_SIZE)) {
    const { error } = await supabase
      .from("price_history")
      .upsert(batch, { onConflict: "asset_id,date" });
    if (error) fail("Upsert prices", error);
  }
  console.log(`  ${rows.length} price rows upserted`);
}

async function ensurePortfolios(
  supabase: Client,
  userId: string,
): Promise<Map<string, string>> {
  const names = PORTFOLIO_PLANS.map((plan) => plan.name);
  const { data: existing, error } = await supabase
    .from("portfolios")
    .select("id, name")
    .eq("user_id", userId)
    .in("name", names);
  if (error) fail("Load portfolios", error);

  const ids = new Map(existing.map((p) => [p.name, p.id]));
  const missing = names.filter((name) => !ids.has(name));

  if (missing.length > 0) {
    // The service role has no auth.uid(), so user_id must be explicit.
    const { data: created, error: insertError } = await supabase
      .from("portfolios")
      .insert(missing.map((name) => ({ name, user_id: userId })))
      .select("id, name");
    if (insertError) fail("Create portfolios", insertError);
    created.forEach((p) => ids.set(p.name, p.id));
  }

  console.log(
    `  portfolios ready: ${names.join(", ")} (${missing.length} created)`,
  );
  return ids;
}

async function main(): Promise<void> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const demoEmail = requireEnv("DEMO_USER_EMAIL");
  const demoPassword = requireEnv("DEMO_USER_PASSWORD");

  const supabase = createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const today = todayISO();
  const windowStart = historyWindowStart(today);
  console.log(`Seeding ${new URL(url).host} (as of ${today})`);

  console.log("Demo user");
  const userId = await ensureDemoUser(supabase, demoEmail, demoPassword);

  console.log("Assets");
  const assetIds = await seedAssets(supabase);

  console.log("Prices");
  const seriesBySymbol = new Map(
    SEED_ASSETS.map((asset) => [
      asset.symbol,
      generatePriceSeries(asset, today),
    ]),
  );
  await seedPrices(supabase, assetIds, seriesBySymbol, windowStart);

  console.log("Portfolios & transactions");
  const portfolioIds = await ensurePortfolios(supabase, userId);
  const priceLookup = buildPriceLookup(seriesBySymbol);

  const { error: deleteError } = await supabase
    .from("transactions")
    .delete()
    .in("portfolio_id", [...portfolioIds.values()]);
  if (deleteError) fail("Clear transactions", deleteError);

  let total = 0;
  for (const plan of PORTFOLIO_PLANS) {
    const portfolioId = portfolioIds.get(plan.name);
    if (!portfolioId) throw new Error(`No id for portfolio ${plan.name}`);

    const rows: TablesInsert<"transactions">[] = generateTransactions(
      plan,
      priceLookup,
      today,
    ).map((t) => {
      const assetId = assetIds.get(t.symbol);
      if (!assetId) throw new Error(`No id for asset ${t.symbol}`);
      return {
        portfolio_id: portfolioId,
        asset_id: assetId,
        type: t.type,
        quantity: t.quantity,
        price: t.price,
        executed_at: t.executedAt,
      };
    });

    for (const batch of chunk(rows, BATCH_SIZE)) {
      const { error } = await supabase.from("transactions").insert(batch);
      if (error) fail(`Insert transactions (${plan.name})`, error);
    }
    console.log(`  ${plan.name}: ${rows.length} transactions`);
    total += rows.length;
  }

  console.log(
    `Done. ${total} transactions across ${PORTFOLIO_PLANS.length} portfolios.`,
  );
}

main().catch((error: unknown) => {
  console.error(
    `\nSeed failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
