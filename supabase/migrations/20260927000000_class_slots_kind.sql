-- Un bloque del horario puede ser una clase (con asignatura) o un patio
-- (recreo). Hasta ahora `kind` sólo vivía en el navegador, así que al
-- recargar un patio volvía como "clase sin asignatura".
alter table public.class_slots add column if not exists kind text not null default 'class';

-- Los bloques ya guardados sin asignatura son, en la práctica, patios:
-- se marcan para que recuperen su estado al sincronizar.
update public.class_slots set kind = 'patio' where kind = 'class' and subject_id is null;
