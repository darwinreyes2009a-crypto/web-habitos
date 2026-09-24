-- 2026-09-23 — Cuentas por email + sync por filas con updated_at (last-writer-wins)
-- No destructiva: añade updated_at a las tablas de datos y crea public.tombstones
-- para propagar borrados entre dispositivos (los borrados nunca borran filas físicamente).

-- updated_at en todas las tablas de datos (settings ya lo tiene)
alter table public.profiles      add column if not exists updated_at timestamptz;
alter table public.tasks         add column if not exists updated_at timestamptz;
alter table public.people        add column if not exists updated_at timestamptz;
alter table public.gifts         add column if not exists updated_at timestamptz;
alter table public.notes         add column if not exists updated_at timestamptz;
alter table public.subjects      add column if not exists updated_at timestamptz;
alter table public.class_slots   add column if not exists updated_at timestamptz;
alter table public.class_inbox   add column if not exists updated_at timestamptz;
alter table public.class_sessions add column if not exists updated_at timestamptz;

-- Backfill: rellena con created_at para que los relojes de las filas existentes
-- sean estables (no resucitar borrados antiguos con un updated_at recién puesto)
update public.tasks          set updated_at = created_at where updated_at is null;
update public.people         set updated_at = created_at where updated_at is null;
update public.gifts          set updated_at = created_at where updated_at is null;
update public.notes          set updated_at = created_at where updated_at is null;
update public.subjects       set updated_at = created_at where updated_at is null;
update public.class_slots    set updated_at = created_at where updated_at is null;
update public.class_inbox    set updated_at = created_at where updated_at is null;
update public.class_sessions set updated_at = created_at where updated_at is null;
update public.profiles       set updated_at = created_at where updated_at is null;

-- Tombstones: registro de borrado (user_id, tabla, id, cuando)
create table if not exists public.tombstones (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key, id)
);
create index if not exists tombstones_user_idx on public.tombstones(user_id);
alter table public.tombstones enable row level security;
drop policy if exists "tombstones_all" on public.tombstones;
create policy "tombstones_all" on public.tombstones
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Realtime: un borrado hecho en otro dispositivo genera un tombstone; si no está
-- en la publicación, este dispositivo no se entera y la fila seguiría visible.
-- Guardado idempotente: el `alter publication add table` falla si ya es miembro
-- (re-ejecución manual o futura en `db push`).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tombstones'
  ) then
    alter publication supabase_realtime add table public.tombstones;
  end if;
end $$;
