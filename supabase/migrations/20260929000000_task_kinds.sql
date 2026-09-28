-- Rutinas: tipos de hábito, valores por día, días saltados y objetivo semanal.
--
-- La tabla tasks ya guardaba `completions` (un sí/no por día) y `freq` (jsonb).
-- Aquí se añade lo que hace falta para hábitos que no son un simple ✓:
--   kind            'check' | 'count' | 'amount' | 'avoid'
--   target          objetivo numérico (2 vasos, 30 páginas)
--   unit            unidad de texto ('vasos', 'páginas', 'min')
--   log             { 'YYYY-MM-DD': valor }  registros por día
--   skips           [ 'YYYY-MM-DD' ]          días saltados (vacaciones, enfermo)
--   goal_per_week   objetivo semanal (4 de 7)
--   priority        0 normal | 1 alta | 2 urgente
--   due_date        fecha límite
--   steps           [ {id, title, done} ]    subtareas
--
-- `freq` es jsonb, así que las nuevas formas de repetir (every, until, from)
-- viajan dentro sin necesidad de columna.
--
-- Sin esta migración aplicada la app sigue funcionando: al arrancar comprueba
-- si las columnas existen y, si no, las omite y las tareas quedan como sí/no.

alter table public.tasks add column if not exists kind text not null default 'check';
alter table public.tasks add column if not exists target integer not null default 0;
alter table public.tasks add column if not exists unit text not null default '';
alter table public.tasks add column if not exists log jsonb not null default '{}';
alter table public.tasks add column if not exists skips jsonb not null default '[]';
alter table public.tasks add column if not exists goal_per_week integer not null default 0;
alter table public.tasks add column if not exists priority integer not null default 0;
alter table public.tasks add column if not exists due_date date;
alter table public.tasks add column if not exists steps jsonb not null default '[]';

-- Índice para buscar por fecha límite (las tareas con plazo van primero).
create index if not exists tasks_due_idx on public.tasks(user_id, due_date);
