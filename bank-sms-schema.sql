-- Taraz: idempotent bank SMS integration schema for Blu Bank.
-- Run this after the main supabase-schema.sql.
-- The tables can also be reused if the earlier Saman draft migration was already run.

create extension if not exists pgcrypto;

create table if not exists public.bank_sms_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create unique index if not exists bank_sms_devices_one_active_per_user
  on public.bank_sms_devices(user_id) where revoked_at is null;

create table if not exists public.bank_sms_pending (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bank_name text not null default 'بلو بانک',
  direction text not null check (direction in ('debit','credit')),
  amount_original numeric(18,2) not null check (amount_original > 0),
  original_unit text not null check (original_unit in ('rial','toman')),
  amount_toman numeric(16,2) not null check (amount_toman > 0),
  counterparty text not null default '',
  occurred_at timestamptz not null default now(),
  transaction_date date not null default (now() at time zone 'Asia/Tehran')::date,
  fingerprint text not null,
  status text not null default 'pending' check (status in ('pending','confirmed','ignored')),
  confirmed_record_id uuid,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, fingerprint)
);

alter table public.bank_sms_pending alter column bank_name set default 'بلو بانک';
create index if not exists bank_sms_pending_user_status_date_idx
  on public.bank_sms_pending(user_id, status, occurred_at desc);

alter table public.bank_sms_devices enable row level security;
alter table public.bank_sms_pending enable row level security;

drop policy if exists "Users manage their own bank SMS devices" on public.bank_sms_devices;
create policy "Users manage their own bank SMS devices"
  on public.bank_sms_devices for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage their own Saman SMS devices" on public.bank_sms_devices;

drop policy if exists "Users read their own pending bank SMS" on public.bank_sms_pending;
create policy "Users read their own pending bank SMS"
  on public.bank_sms_pending for select to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.bank_sms_devices to authenticated;
revoke all on public.bank_sms_pending from anon, authenticated;
grant select on public.bank_sms_pending to authenticated;

create or replace function public.confirm_saman_sms_transaction(
  p_pending_id uuid,
  p_month text,
  p_title text,
  p_category text default 'سایر',
  p_note text default ''
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.bank_sms_pending%rowtype;
  v_record_id uuid;
  v_title text;
  v_note text;
begin
  if auth.uid() is null then raise exception 'برای ثبت تراکنش باید وارد حساب شوید.'; end if;
  if p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'ماه شمسی معتبر نیست.'; end if;

  select * into v_row from public.bank_sms_pending
  where id = p_pending_id and user_id = auth.uid() and status = 'pending'
  for update;
  if not found then raise exception 'این تراکنش دیگر در انتظار تأیید نیست.'; end if;

  v_title := coalesce(nullif(btrim(p_title), ''), case when v_row.direction='credit' then 'واریزی بلو' else 'برداشت بلو' end);
  v_note := coalesce(nullif(btrim(p_note), ''), case when v_row.counterparty <> '' then 'مبدأ/مقصد: ' || v_row.counterparty else '' end);

  if v_row.direction = 'debit' then
    insert into public.expense_records(user_id, month, title, category, expense_type, amount, spent_on, note)
    values(auth.uid(), p_month, v_title, coalesce(nullif(btrim(p_category),''),'سایر'), 'monthly', v_row.amount_toman, v_row.transaction_date, v_note)
    returning id into v_record_id;
  else
    insert into public.income_records(user_id, month, title, amount, received_on, note)
    values(auth.uid(), p_month, v_title, v_row.amount_toman, v_row.transaction_date, v_note)
    returning id into v_record_id;
  end if;

  update public.bank_sms_pending
  set status='confirmed', confirmed_record_id=v_record_id, confirmed_at=now()
  where id=v_row.id and user_id=auth.uid();
  return v_record_id;
end;
$$;

create or replace function public.ignore_saman_sms_transaction(p_pending_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'برای ادامه باید وارد حساب شوید.'; end if;
  update public.bank_sms_pending set status='ignored'
  where id=p_pending_id and user_id=auth.uid() and status='pending';
  if not found then raise exception 'تراکنش در انتظار یافت نشد.'; end if;
end;
$$;

revoke all on function public.confirm_saman_sms_transaction(uuid,text,text,text,text) from public, anon;
revoke all on function public.ignore_saman_sms_transaction(uuid) from public, anon;
grant execute on function public.confirm_saman_sms_transaction(uuid,text,text,text,text) to authenticated;
grant execute on function public.ignore_saman_sms_transaction(uuid) to authenticated;

-- Only the Edge Function uses the Supabase secret key. Never add it to the client app or Shortcut.
