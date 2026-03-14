-- Run in Supabase SQL Editor to enable engine process management (Live Bots).
create table if not exists public.live_deployments (
  deployment_id text primary key,
  strategy_deployment_id uuid not null,
  user_id text not null,
  strategy_name text,
  symbol text,
  capital numeric,
  target_accounts text,
  status text not null default 'running',
  order_placed boolean not null default false,
  executed_at timestamptz,
  created_at timestamptz default now()
);

-- If table already exists, add new columns:
-- alter table public.live_deployments add column if not exists symbol text;
-- alter table public.live_deployments add column if not exists capital numeric;
-- alter table public.live_deployments add column if not exists order_placed boolean not null default false;
-- alter table public.live_deployments add column if not exists executed_at timestamptz;
