-- Mejoras del sistema de regalos:
--   starred      → ideas marcadas como favoritas (⭐)
--   remind_days  → días de antelación del aviso (null = usa el aviso por defecto de Ajustes)
-- Sin esta migración la app sigue funcionando: el push omite estas columnas
-- automáticamente hasta que se apliquen.

alter table public.gifts add column if not exists starred boolean not null default false;
alter table public.gifts add column if not exists remind_days integer;
