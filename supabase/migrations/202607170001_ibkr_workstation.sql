create extension if not exists pgcrypto;

create table if not exists public.ibkr_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  account_key text not null,
  base_currency text not null default 'USD',
  display_name text not null default 'IBKR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, account_key)
);

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('IBKR', 'IBKR_FLEX', 'COMPANY_INTELLIGENCE')),
  idempotency_key text not null,
  status text not null check (status in ('RUNNING', 'COMPLETED', 'FAILED')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  item_count integer not null default 0 check (item_count >= 0),
  error_message text,
  unique (owner_id, source, idempotency_key)
);

create table if not exists public.instruments (
  owner_id uuid not null references auth.users(id) on delete cascade,
  contract_id bigint not null,
  contract_id_ex text,
  symbol text not null,
  description text not null default '',
  security_type text not null,
  currency text not null default 'USD',
  exchange text,
  underlying_contract_id bigint,
  updated_at timestamptz not null default now(),
  primary key (owner_id, contract_id)
);

create table if not exists public.ibkr_trades (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.ibkr_accounts(id) on delete cascade,
  sync_run_id uuid references public.sync_runs(id) on delete set null,
  source_trade_id text not null,
  contract_id bigint not null,
  symbol text not null,
  security_type text not null,
  side text not null check (side in ('BUY', 'SELL')),
  quantity numeric(28, 8) not null check (quantity > 0),
  price numeric(28, 8) not null,
  commission numeric(28, 8) not null default 0,
  net_amount numeric(28, 8),
  currency text not null,
  executed_at timestamptz not null,
  raw jsonb not null default '{}'::jsonb,
  unique (owner_id, source_trade_id)
);

create table if not exists public.cash_flows (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.ibkr_accounts(id) on delete cascade,
  sync_run_id uuid references public.sync_runs(id) on delete set null,
  source_id text not null,
  flow_type text not null,
  amount numeric(28, 8) not null,
  currency text not null,
  is_external boolean not null default false,
  occurred_at timestamptz not null,
  description text,
  raw jsonb not null default '{}'::jsonb,
  unique (owner_id, source_id)
);

create table if not exists public.account_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.ibkr_accounts(id) on delete cascade,
  sync_run_id uuid not null references public.sync_runs(id) on delete cascade,
  as_of timestamptz not null,
  currency text not null,
  net_liquidation numeric(28, 8) not null,
  available_funds numeric(28, 8) not null default 0,
  buying_power numeric(28, 8) not null default 0,
  initial_margin numeric(28, 8) not null default 0,
  maintenance_margin numeric(28, 8) not null default 0,
  excess_liquidity numeric(28, 8) not null default 0,
  gross_position_value numeric(28, 8) not null default 0,
  unique (owner_id, account_id, as_of)
);

create table if not exists public.position_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.ibkr_accounts(id) on delete cascade,
  sync_run_id uuid not null references public.sync_runs(id) on delete cascade,
  contract_id bigint not null,
  symbol text not null,
  description text not null default '',
  security_type text not null,
  currency text not null,
  quantity numeric(28, 8) not null,
  average_cost numeric(28, 8) not null,
  market_price numeric(28, 8) not null,
  market_value numeric(28, 8) not null,
  unrealized_pnl numeric(28, 8) not null default 0,
  daily_pnl numeric(28, 8) not null default 0,
  bid numeric(28, 8),
  ask numeric(28, 8),
  implied_volatility numeric(18, 8),
  open_interest numeric(28, 8),
  market_data_delayed boolean not null default false,
  market_data_as_of timestamptz not null,
  unique (owner_id, account_id, contract_id, market_data_as_of)
);

create table if not exists public.performance_points (
  owner_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.ibkr_accounts(id) on delete cascade,
  point_date date not null,
  nav numeric(28, 8) not null,
  cash numeric(28, 8) not null,
  market_value numeric(28, 8) not null,
  net_external_flow numeric(28, 8) not null default 0,
  daily_return numeric(18, 10) not null default 0,
  cumulative_return numeric(18, 10) not null default 0,
  realized_pnl numeric(28, 8) not null default 0,
  unrealized_pnl numeric(28, 8) not null default 0,
  rebuilt_at timestamptz not null default now(),
  primary key (owner_id, account_id, point_date)
);

create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  external_id text not null,
  name text not null,
  source_hash bigint not null,
  synced_at timestamptz not null default now(),
  unique (owner_id, external_id)
);

create table if not exists public.watchlist_members (
  owner_id uuid not null references auth.users(id) on delete cascade,
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  sync_run_id uuid not null references public.sync_runs(id) on delete cascade,
  contract_id_ex text not null,
  symbol text not null,
  description text not null default '',
  underlying_symbol text,
  primary key (watchlist_id, contract_id_ex)
);

create table if not exists public.news_sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  source_type text not null check (source_type in ('IR', 'NEWSROOM', 'SEC', 'FUND_ISSUER')),
  source_name text not null,
  source_url text not null,
  enabled boolean not null default true,
  etag text,
  last_modified text,
  last_checked_at timestamptz,
  unique (owner_id, source_url)
);

create table if not exists public.intelligence_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  sync_run_id uuid references public.sync_runs(id) on delete set null,
  fingerprint text not null,
  symbol text not null,
  event_type text not null,
  severity text not null check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  title_original text not null,
  title_zh text not null,
  summary_zh text not null,
  impact_zh text not null,
  source_name text not null,
  source_url text not null,
  published_at timestamptz not null,
  detected_at timestamptz not null default now(),
  read_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  unique (owner_id, fingerprint)
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  symbol text,
  severity text not null check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  title text not null,
  detail text not null,
  source_event_id uuid references public.intelligence_events(id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists ibkr_accounts_owner_idx on public.ibkr_accounts (owner_id);
create index if not exists sync_runs_owner_status_idx on public.sync_runs (owner_id, status, started_at desc);
create index if not exists ibkr_trades_owner_time_idx on public.ibkr_trades (owner_id, account_id, executed_at);
create index if not exists cash_flows_owner_time_idx on public.cash_flows (owner_id, account_id, occurred_at);
create index if not exists account_snapshots_latest_idx on public.account_snapshots (owner_id, account_id, as_of desc);
create index if not exists position_snapshots_latest_idx on public.position_snapshots (owner_id, account_id, market_data_as_of desc);
create index if not exists performance_points_range_idx on public.performance_points (owner_id, account_id, point_date desc);
create index if not exists watchlist_members_owner_symbol_idx on public.watchlist_members (owner_id, symbol);
create index if not exists news_sources_due_idx on public.news_sources (owner_id, enabled, last_checked_at);
create index if not exists intelligence_events_feed_idx on public.intelligence_events (owner_id, published_at desc);
create index if not exists alerts_unread_idx on public.alerts (owner_id, read_at, created_at desc);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'ibkr_accounts', 'sync_runs', 'instruments', 'ibkr_trades', 'cash_flows',
    'account_snapshots', 'position_snapshots', 'performance_points', 'watchlists',
    'watchlist_members', 'news_sources', 'intelligence_events', 'alerts'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id)',
      table_name || '_owner_policy',
      table_name
    );
  end loop;
end $$;

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
