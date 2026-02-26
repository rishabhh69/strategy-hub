-- =============================================================================
-- Strategies table for "Deploy to Live Terminal" (Strategy Studio → Live Terminal)
-- Paste this in Supabase Dashboard → SQL Editor → New query. Run once.
-- Does NOT modify any existing tables or columns.
-- =============================================================================

-- Create strategies table only if it does not exist
CREATE TABLE IF NOT EXISTS public.strategies (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL,
  logic_text text NOT NULL,
  user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Required: allow API (anon/authenticated) and backend (service_role) to use the table
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON public.strategies TO anon, authenticated, service_role;

-- Optional: add columns if the table already existed with fewer columns
-- (Run these only if you get "column does not exist" errors; safe to run multiple times in PG 11+)
ALTER TABLE public.strategies ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.strategies ADD COLUMN IF NOT EXISTS logic_text text;
ALTER TABLE public.strategies ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.strategies ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- RLS: enable so you can control access (skip if you already use RLS on this table)
ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist (so re-running this script doesn’t error)
DROP POLICY IF EXISTS "strategies_insert_authenticated" ON public.strategies;
DROP POLICY IF EXISTS "strategies_insert_anon" ON public.strategies;
DROP POLICY IF EXISTS "strategies_select_authenticated" ON public.strategies;
DROP POLICY IF EXISTS "strategies_select_anon" ON public.strategies;
DROP POLICY IF EXISTS "strategies_service_role_all" ON public.strategies;

-- Policy: allow authenticated users to insert (Strategy Studio save)
CREATE POLICY "strategies_insert_authenticated"
  ON public.strategies FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: allow anon to insert (avoids "new row violates RLS" when session not yet attached or key is anon)
-- If you want to require login, use: WITH CHECK (auth.uid() IS NOT NULL) and ensure the app sends the session.
CREATE POLICY "strategies_insert_anon"
  ON public.strategies FOR INSERT
  TO anon
  WITH CHECK (true);

-- Policy: allow authenticated users to read all (Live Terminal dropdown)
CREATE POLICY "strategies_select_authenticated"
  ON public.strategies FOR SELECT
  TO authenticated
  USING (true);

-- Policy: allow anon to read when logged in
CREATE POLICY "strategies_select_anon"
  ON public.strategies FOR SELECT
  TO anon
  USING (auth.uid() IS NOT NULL);

-- Policy: allow service_role full access (backend deploy-bot reads by id)
CREATE POLICY "strategies_service_role_all"
  ON public.strategies FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- Saved strategies table for private user library
-- Users save successful backtests (code + metrics + equity curve) here.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.saved_strategies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  code          text NOT NULL,
  ticker        text NOT NULL,
  cagr          double precision,
  total_return  double precision,
  max_drawdown  double precision,
  volatility    double precision,
  sharpe_ratio  double precision,
  sortino_ratio double precision,
  win_rate      double precision,
  total_trades  integer,
  equity_curve  jsonb,
  created_at    timestamptz DEFAULT now()
);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON public.saved_strategies TO anon, authenticated, service_role;

-- Add columns defensively so the script can be re-run safely.
ALTER TABLE public.saved_strategies ADD COLUMN IF NOT EXISTS user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.saved_strategies ADD COLUMN IF NOT EXISTS name          text;
ALTER TABLE public.saved_strategies ADD COLUMN IF NOT EXISTS description   text;
ALTER TABLE public.saved_strategies ADD COLUMN IF NOT EXISTS code          text;
ALTER TABLE public.saved_strategies ADD COLUMN IF NOT EXISTS ticker        text;
ALTER TABLE public.saved_strategies ADD COLUMN IF NOT EXISTS cagr          double precision;
ALTER TABLE public.saved_strategies ADD COLUMN IF NOT EXISTS total_return  double precision;
ALTER TABLE public.saved_strategies ADD COLUMN IF NOT EXISTS max_drawdown  double precision;
ALTER TABLE public.saved_strategies ADD COLUMN IF NOT EXISTS volatility    double precision;
ALTER TABLE public.saved_strategies ADD COLUMN IF NOT EXISTS sharpe_ratio  double precision;
ALTER TABLE public.saved_strategies ADD COLUMN IF NOT EXISTS sortino_ratio double precision;
ALTER TABLE public.saved_strategies ADD COLUMN IF NOT EXISTS win_rate      double precision;
ALTER TABLE public.saved_strategies ADD COLUMN IF NOT EXISTS total_trades  integer;
ALTER TABLE public.saved_strategies ADD COLUMN IF NOT EXISTS equity_curve  jsonb;
ALTER TABLE public.saved_strategies ADD COLUMN IF NOT EXISTS created_at    timestamptz DEFAULT now();

-- Enable RLS and restrict reads to owning user at the SQL layer.
ALTER TABLE public.saved_strategies ENABLE ROW LEVEL SECURITY;

-- Drop existing policies so this script is idempotent.
DROP POLICY IF EXISTS "saved_strategies_insert_authenticated" ON public.saved_strategies;
DROP POLICY IF EXISTS "saved_strategies_select_authenticated" ON public.saved_strategies;
DROP POLICY IF EXISTS "saved_strategies_service_role_all"      ON public.saved_strategies;

-- Allow authenticated users to insert rows for themselves.
CREATE POLICY "saved_strategies_insert_authenticated"
  ON public.saved_strategies FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to read only their own saved strategies.
CREATE POLICY "saved_strategies_select_authenticated"
  ON public.saved_strategies FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow backend (service_role) full access for API/endpoints.
CREATE POLICY "saved_strategies_service_role_all"
  ON public.saved_strategies FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

