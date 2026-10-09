-- Life Tracker database schema
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  time text not null check (time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  title text not null,
  category text not null default 'Routine',
  required boolean not null default true,
  enabled boolean not null default true,
  notify boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.task_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  date date not null,
  status text not null check (status in ('done','missed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, task_id, date)
);

create table if not exists public.daily_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, date)
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique(user_id, endpoint)
);

alter table public.tasks enable row level security;
alter table public.task_logs enable row level security;
alter table public.daily_notes enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "tasks own rows" on public.tasks;
create policy "tasks own rows" on public.tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "logs own rows" on public.task_logs;
create policy "logs own rows" on public.task_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "notes own rows" on public.daily_notes;
create policy "notes own rows" on public.daily_notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "push own rows" on public.push_subscriptions;
create policy "push own rows" on public.push_subscriptions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists tasks_due_idx on public.tasks(weekday, time, enabled, notify);
create index if not exists task_logs_date_idx on public.task_logs(date);
