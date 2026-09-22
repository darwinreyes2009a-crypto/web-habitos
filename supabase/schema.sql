-- ============================================================
-- DailyHub — Esquema de base de datos (Supabase)
-- Pégalo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Crea tablas, RLS (cada usuario solo ve lo suyo) y triggers.
-- ============================================================

-- ---------- PROFILES (perfiles locales: "Darwin", "Mamá"…) ----------
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#2563EB',
  photo text,                          -- dataURL pequeño (se comprime a 512px en el cliente)
  pin text,                            -- hash del PIN local (opcional)
  created_at timestamptz not null default now()
);

-- ---------- TASKS (tareas y hábitos) ----------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  icon text not null default 'star',
  cat text not null default 'Personal',
  freq jsonb not null default '{"type":"daily"}',   -- {type: daily|weekdays|weekly|monthly|once, days, dom, date}
  time text not null default '',
  completions text[] not null default '{}',          -- fechas YYYY-MM-DD completadas (histórico)
  created_at timestamptz not null default now()
);
create index if not exists tasks_user_idx on public.tasks(user_id);

-- ---------- PEOPLE (personas para regalos) ----------
create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#2563EB',
  photo text,
  relationship text not null default 'Amigo/a',
  birthday date,
  notes text not null default '',
  details jsonb not null default '{}',  -- gustos, favoritos, fechas importantes
  created_at timestamptz not null default now()
);
create index if not exists people_user_idx on public.people(user_id);

-- Migración suave: si la tabla people ya existía de una versión anterior, gana la columna details
alter table public.people add column if not exists details jsonb not null default '{}';

-- ---------- GIFTS (regalos) ----------
create table if not exists public.gifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  title text not null,
  price numeric,
  target_date date,                    -- fecha del regalo (opcional, nullable)
  link text not null default '',
  occasion text not null default 'Cumpleaños',
  status text not null default 'Idea', -- Idea | Comprar | Comprado | Entregado
  notes text not null default '',
  image text,                          -- dataURL pequeño (comprimido a 640px en el cliente)
  created_at timestamptz not null default now()
);
create index if not exists gifts_user_idx on public.gifts(user_id);

-- ---------- NOTES (Modo Clase: notas rápidas, recordatorios, material, deberes) ----------
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  kind text not null default 'nota',      -- nota | recordatorio | deberes | material | importante
  note_date date not null default current_date,  -- fecha organizativa (hoy por defecto)
  note_time text not null default '',
  done boolean not null default false,
  starred boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notes_user_idx on public.notes(user_id);

-- ---------- SETTINGS (ajustes de la app, un row por usuario) ----------
create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}',    -- hideCompleted, notif, etc.
  meta jsonb not null default '{}',    -- onboarded, lastNotified…
  updated_at timestamptz not null default now()
);

-- ============================================================
-- RLS: cada usuario solo puede leer/escribir SUS filas
-- (idempotente: seguro de re-ejecutar; recrea las políticas si cambiaron)
-- ============================================================
alter table public.profiles  enable row level security;
alter table public.tasks     enable row level security;
alter table public.people    enable row level security;
alter table public.gifts     enable row level security;
alter table public.notes     enable row level security;
alter table public.settings  enable row level security;

drop policy if exists "profiles_all" on public.profiles;
create policy "profiles_all" on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "tasks_all" on public.tasks;
create policy "tasks_all" on public.tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "people_all" on public.people;
create policy "people_all" on public.people
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "gifts_all" on public.gifts;
create policy "gifts_all" on public.gifts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "notes_all" on public.notes;
create policy "notes_all" on public.notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "settings_all" on public.settings;
create policy "settings_all" on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- TRIGGER: crear fila en settings al registrarse un usuario
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.settings (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
