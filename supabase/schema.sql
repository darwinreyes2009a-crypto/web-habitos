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
  pin_len int,                         -- longitud del PIN (4-6) para ajustar los puntos al desbloquear
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists pin_len int;

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

-- Aislamiento por perfil: cada fila sabe a qué perfil local pertenece (nullable: filas antiguas)
alter table public.people add column if not exists profile_id uuid references public.profiles(id) on delete cascade;
alter table public.gifts  add column if not exists profile_id uuid references public.profiles(id) on delete cascade;
alter table public.notes  add column if not exists profile_id uuid references public.profiles(id) on delete cascade;
create index if not exists people_profile_idx on public.people(profile_id);
create index if not exists gifts_profile_idx  on public.gifts(profile_id);
create index if not exists notes_profile_idx  on public.notes(profile_id);

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

-- ---------- SUBJECTS (Modo Clase: asignaturas, funcionan como carpetas) ----------
create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  color text not null default '#2563EB',
  icon text not null default 'book',
  created_at timestamptz not null default now()
);
create index if not exists subjects_user_idx on public.subjects(user_id);
create index if not exists subjects_profile_idx on public.subjects(profile_id);

-- ---------- CLASS_SLOTS (horario semanal: una fila por clase) ----------
create table if not exists public.class_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  day int not null default 0,                 -- 0 = lunes … 6 = domingo
  start_time text not null default '09:00',   -- HH:MM
  end_time text not null default '10:00',
  room text not null default '',
  active boolean not null default true,       -- desactivar sin borrar
  created_at timestamptz not null default now()
);
create index if not exists class_slots_user_idx on public.class_slots(user_id);
create index if not exists class_slots_profile_idx on public.class_slots(profile_id);

-- ---------- CLASS_INBOX ("Para después": lo apuntado sin organizar) ----------
create table if not exists public.class_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  text text not null,
  item_date date not null default current_date,
  item_time text not null default '',
  subject_id uuid references public.subjects(id) on delete set null,
  session_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists class_inbox_user_idx on public.class_inbox(user_id);
create index if not exists class_inbox_profile_idx on public.class_inbox(profile_id);

-- ---------- CLASS_SESSIONS (historial: clases empezadas y terminadas) ----------
create table if not exists public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  slot_id uuid,
  session_date date not null default current_date,
  start_time text not null default '',
  end_time text not null default '',
  room text not null default '',
  ended_at timestamptz,
  counts jsonb not null default '{}',           -- {inbox, notes, important}
  created_at timestamptz not null default now()
);
create index if not exists class_sessions_user_idx on public.class_sessions(user_id);
create index if not exists class_sessions_profile_idx on public.class_sessions(profile_id);

-- Migración suave: los apuntes antiguos se quedan sin asignatura ni sesión (no se pierde nada)
alter table public.notes add column if not exists subject_id uuid references public.subjects(id) on delete set null;
alter table public.notes add column if not exists session_id uuid;
create index if not exists notes_subject_idx on public.notes(subject_id);

-- ---------- SETTINGS (ajustes de la app, un row por usuario) ----------
create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}',    -- hideCompleted, notif, etc.
  meta jsonb not null default '{}',    -- onboarded, lastNotified…
  updated_at timestamptz not null default now()
);

-- ---------- PUSH SUBSCRIPTIONS (avisos con la app cerrada) ----------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subs_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push_subs_all" on public.push_subscriptions;
create policy "push_subs_all" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- REALTIME: habilita la replicación para que los cambios
-- aparezcan al instante en otros dispositivos
-- ============================================================
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.people;
alter publication supabase_realtime add table public.gifts;
alter publication supabase_realtime add table public.notes;
alter publication supabase_realtime add table public.subjects;
alter publication supabase_realtime add table public.class_slots;
alter publication supabase_realtime add table public.class_inbox;
alter publication supabase_realtime add table public.class_sessions;

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
alter table public.subjects       enable row level security;
alter table public.class_slots    enable row level security;
alter table public.class_inbox    enable row level security;
alter table public.class_sessions enable row level security;

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

drop policy if exists "subjects_all" on public.subjects;
create policy "subjects_all" on public.subjects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "class_slots_all" on public.class_slots;
create policy "class_slots_all" on public.class_slots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "class_inbox_all" on public.class_inbox;
create policy "class_inbox_all" on public.class_inbox
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "class_sessions_all" on public.class_sessions;
create policy "class_sessions_all" on public.class_sessions
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
