-- Calendario escolar: días no lectivos (vacaciones, exámenes) y
-- cancelaciones puntuales de un bloque en una fecha concreta.
--
-- No toca el horario: solo marca qué días no se imparten las clases del patrón
-- semanal, para que la app no enseñe clases en vacaciones ni en exámenes.
-- Sin esta migración aplicada la app funciona igual: al arrancar comprueba si
-- las tablas existen y, si no, las deja fuera de la sincronización.

-- ---------- CLASS_BREAKS (días no lectivos) ----------
create table if not exists public.class_breaks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  date_from date not null default current_date,
  date_to date not null default current_date,
  label text not null default 'No lectivo',
  kind text not null default 'libre',        -- 'vacaciones' | 'examenes' | 'libre' | 'puente'
  created_at timestamptz not null default now()
);
create index if not exists class_breaks_user_idx on public.class_breaks(user_id);
create index if not exists class_breaks_profile_idx on public.class_breaks(profile_id);

-- ---------- CLASS_OFFS (cancelar un bloque en una fecha) ----------
create table if not exists public.class_offs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  slot_id uuid references public.class_slots(id) on delete cascade,
  date_off date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists class_offs_user_idx on public.class_offs(user_id);
create index if not exists class_offs_profile_idx on public.class_offs(profile_id);
create index if not exists class_offs_slot_idx on public.class_offs(slot_id);

-- updated_at lo manage la app (los demás mapeadores de app-sync.js ya lo usan)
alter table public.class_breaks add column if not exists updated_at timestamptz;
alter table public.class_offs  add column if not exists updated_at timestamptz;

-- `active` en class_slots: desactivar un bloque sin borrarlo
alter table public.class_slots add column if not exists active boolean not null default true;

-- ---------- RLS ----------
alter table public.class_breaks enable row level security;
alter table public.class_offs  enable row level security;

drop policy if exists "class_breaks_all" on public.class_breaks;
create policy "class_breaks_all" on public.class_breaks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "class_offs_all" on public.class_offs;
create policy "class_offs_all" on public.class_offs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
