-- =============================================================================
-- 0001_init.sql
-- Portfolio tracker: schema, indexes and Row Level Security.
--
-- Run in the Supabase SQL editor (or `supabase db push`).
-- Seed data is NOT created here; see scripts/seed.ts.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.asset_type as enum ('stock', 'etf', 'crypto', 'bond');
create type public.transaction_type as enum ('buy', 'sell');

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

-- A portfolio belongs to exactly one user. `user_id` defaults to the caller's
-- auth.uid(), so clients never need to (and cannot usefully) set it themselves.
create table public.portfolios (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid()
             references auth.users (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

-- Shared, read-only reference data (one row per tradable instrument).
create table public.assets (
  id     uuid primary key default gen_random_uuid(),
  symbol text not null unique,
  name   text not null,
  type   public.asset_type not null
);

-- Individual buy/sell orders. Deleting a portfolio removes its transactions.
create table public.transactions (
  id           uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null
               references public.portfolios (id) on delete cascade,
  asset_id     uuid not null
               references public.assets (id),
  type         public.transaction_type not null,
  quantity     numeric(18, 6) not null check (quantity > 0),
  price        numeric(18, 6) not null check (price >= 0),
  executed_at  date not null default current_date,
  created_at   timestamptz not null default now()
);

-- Shared daily closing prices, one row per asset per day.
create table public.price_history (
  asset_id uuid not null
           references public.assets (id) on delete cascade,
  date     date not null,
  price    numeric(18, 6) not null check (price >= 0),
  primary key (asset_id, date)
);

-- -----------------------------------------------------------------------------
-- Indexes
-- (price_history is already covered by its composite primary key.)
-- -----------------------------------------------------------------------------
create index portfolios_user_id_idx
  on public.portfolios (user_id);

create index transactions_portfolio_id_executed_at_idx
  on public.transactions (portfolio_id, executed_at desc);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- Enabled on every table: with RLS on and no matching policy, access is denied.
-- `(select auth.uid())` is wrapped in a sub-select so Postgres evaluates it once
-- per statement (initPlan) rather than once per row.
-- -----------------------------------------------------------------------------
alter table public.portfolios    enable row level security;
alter table public.transactions  enable row level security;
alter table public.assets        enable row level security;
alter table public.price_history enable row level security;

-- portfolios: a signed-in user has full control over their own portfolios only.
-- USING filters reads/updates/deletes; WITH CHECK stops inserts or updates from
-- assigning a row to somebody else.
create policy "portfolios: owner full access"
  on public.portfolios
  for all
  to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- transactions: ownership is inherited from the parent portfolio. The EXISTS
-- subquery runs under the portfolios policy too, so it can only ever match the
-- caller's own portfolios. WITH CHECK also prevents moving a transaction into a
-- portfolio the caller does not own.
create policy "transactions: access via owned portfolio"
  on public.transactions
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.portfolios p
      where p.id = transactions.portfolio_id
        and p.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.portfolios p
      where p.id = transactions.portfolio_id
        and p.user_id = (select auth.uid())
    )
  );

-- assets: shared reference data. Signed-in users may read it but never write;
-- inserts/updates happen only via the service role (seed script), which
-- bypasses RLS.
create policy "assets: read for authenticated"
  on public.assets
  for select
  to authenticated
  using (true);

-- price_history: same model as assets (shared, read-only for app users).
create policy "price_history: read for authenticated"
  on public.price_history
  for select
  to authenticated
  using (true);
