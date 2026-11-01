-- تراز: ساختار پایگاه داده برای مدیریت حقوق، هزینه و پس‌انداز.
-- ستون month مقدار سال-ماه شمسی با ارقام لاتین نگه می‌دارد (نمونه: 1405-08).
-- ستون‌های تاریخ از نوع DATE و به‌صورت میلادی استاندارد ذخیره می‌شوند؛ رابط برنامه آن‌ها را شمسی نمایش می‌دهد.
-- Run the entire script in Supabase Dashboard > SQL Editor.
-- Security: every table is protected by RLS and each user can access only their own rows.

create extension if not exists pgcrypto;

create table if not exists public.income_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  title text not null default 'حقوق ماهانه',
  amount numeric(14,2) not null check (amount > 0),
  received_on date not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.expense_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  title text not null,
  category text not null default 'سایر',
  expense_type text not null default 'monthly' check (expense_type in ('monthly', 'fixed')),
  amount numeric(14,2) not null check (amount > 0),
  spent_on date not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.reserved_funds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  title text not null,
  amount numeric(14,2) not null check (amount > 0),
  reserved_on date not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.savings_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  title text not null default 'پس‌انداز',
  amount numeric(14,2) not null check (amount > 0),
  saved_on date not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists income_records_user_month_idx on public.income_records(user_id, month);
create index if not exists expense_records_user_month_idx on public.expense_records(user_id, month);
create index if not exists reserved_funds_user_month_idx on public.reserved_funds(user_id, month);
create index if not exists savings_records_user_month_idx on public.savings_records(user_id, month);

alter table public.income_records enable row level security;
alter table public.expense_records enable row level security;
alter table public.reserved_funds enable row level security;
alter table public.savings_records enable row level security;

-- Remove/recreate policies so rerunning this script is safe.
drop policy if exists "Users manage their own income" on public.income_records;
drop policy if exists "Users manage their own expenses" on public.expense_records;
drop policy if exists "Users manage their own reserved funds" on public.reserved_funds;
drop policy if exists "Users manage their own savings" on public.savings_records;

create policy "Users manage their own income"
on public.income_records for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users manage their own expenses"
on public.expense_records for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users manage their own reserved funds"
on public.reserved_funds for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users manage their own savings"
on public.savings_records for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.income_records to authenticated;
grant select, insert, update, delete on public.expense_records to authenticated;
grant select, insert, update, delete on public.reserved_funds to authenticated;
grant select, insert, update, delete on public.savings_records to authenticated;
