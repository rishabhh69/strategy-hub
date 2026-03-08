-- Run this in Supabase SQL Editor to create the client_accounts table for RIA CRM.
-- client_accounts: firm-level client credentials (PIN and TOTP encrypted at rest by backend).

create table if not exists public.client_accounts (
  id                uuid primary key default gen_random_uuid(),
  ria_user_id       uuid not null references auth.users(id) on delete cascade,
  client_name       text not null,
  capital_allocation numeric not null default 0,
  broker            text not null default 'angelone',
  client_id         text not null,
  encrypted_pin     text,
  encrypted_totp_secret text,
  status            text not null default 'Active',
  created_at        timestamptz not null default now()
);

-- RLS: users can only see/edit their own clients (by ria_user_id = auth.uid())
alter table public.client_accounts enable row level security;

create policy "Users can manage own client accounts"
  on public.client_accounts
  for all
  using (auth.uid() = ria_user_id)
  with check (auth.uid() = ria_user_id);

-- Optional: index for listing by RIA
create index if not exists idx_client_accounts_ria_user_id
  on public.client_accounts (ria_user_id);
