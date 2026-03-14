-- Run in Supabase SQL Editor to enable engine process management (Live Bots).
create table if not exists public.live_deployments (
  deployment_id text primary key,
  strategy_deployment_id uuid not null,
  user_id text not null,
  strategy_name text,
  target_accounts text,
  status text not null default 'running',
  created_at timestamptz default now()
);
