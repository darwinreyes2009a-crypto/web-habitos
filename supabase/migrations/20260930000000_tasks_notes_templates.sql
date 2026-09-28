-- Campos opcionales de tareas y notas añadidos por DailyHub.
-- Idempotente: se puede aplicar incluso si algunas columnas ya existen.
alter table public.tasks add column if not exists priority integer not null default 0;
alter table public.tasks add column if not exists due_date date;
alter table public.tasks add column if not exists steps jsonb not null default '[]';
alter table public.tasks add column if not exists template_id text;
create index if not exists tasks_due_idx on public.tasks(user_id, due_date);

alter table public.notes add column if not exists tags text[] not null default '{}';
alter table public.notes add column if not exists deleted_at timestamptz;
create index if not exists notes_deleted_idx on public.notes(user_id, deleted_at);
