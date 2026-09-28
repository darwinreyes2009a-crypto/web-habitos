-- Tareas: referencia opcional a la plantilla de origen.
alter table public.tasks add column if not exists template_id text;

-- Notas: etiquetas y papelera con eliminación restaurable.
alter table public.notes add column if not exists tags text[] not null default '{}';
alter table public.notes add column if not exists deleted_at timestamptz;

create index if not exists notes_deleted_idx on public.notes(user_id, deleted_at);
