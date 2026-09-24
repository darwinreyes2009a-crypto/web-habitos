# Diseño: cuentas por email + sync por filas

Fecha: 2026-09-23 · Estado: aprobado por el usuario · Alcance: DailyHub (habitos-web)

> **Nota de evolución (2026-09-24):** la decisión D8 original («mantener `index.html` como archivo único») fue sustituida por la modularización adoptada en este refactor. `index.html` queda como shell HTML y la aplicación se compone desde `src/app.js` y módulos ES con contratos explícitos. Además, los borrados (D3) se aplican ahora con **DELETE físico** de la fila en la nube: el tombstone es un aviso temporal para coordinar otros dispositivos y se limpia solo; ya no quedan filas «fantasma» en Supabase. El resto de este documento conserva el diseño histórico de cuentas y sincronización.

## Problema (reportado por el usuario)

1. El tema (claro/oscuro) cambia solo, sobre todo al entrar/recargar.
2. Los datos "cambian o se duplican solos"; móvil y PC no coinciden (incluida la foto de perfil).
3. Hay un regalo imposible de eliminar: siempre vuelve a aparecer.
4. El horario de clase está "bugueadísimo" (bug lógico aparte, ver D7).
5. El modelo de perfiles locales compartidos bajo una cuenta genera problemas.

## Diagnóstico (causa raíz común: sync de "estado completo + diff")

- `syncPushAll` (app-sync.js L158-210): borra en el servidor **todo id no presente en la lista local**
  (`del = remoteIds - localIds`, L178-179) y resube las listas completas → si un dispositivo dejó de
  subir algo (offline, app cerrada antes del push), el siguiente push de otro dispositivo **borra estos
  datos del servidor** → "los datos no coinciden / cambian solos / la foto no coincide" (last-writer-wins
  sin reloj).
- `syncPullAll` (L213-320): reemplaza las listas locales por las del servidor (L256-268) y el settings
  incondicionalmente (`S.settings = Object.assign(...)`, L310) → un cambio local (tema, tarea nueva)
  dentro de la ventana del push (debounce 1200ms, index.html L684-687) es revertido por un pull de
  realtime (900ms, app-sync.js L327-333) → "el tema cambia solo".
- Borrados: dependen de que el push de 1200ms llegue a ejecutarse. Si se cierra la app antes o el push
  falla, el id sigue en el servidor y reaparece (el tombstone local `__del` lo oculta en ese dispositivo,
  pero vuelve en otros y tras reinstalar).
- El horario de clase (clase semanal, recreos, sesiones) tiene bugs de lógica propios, no causados por el
  sync (ver D7).

## Decisión de arquitectura

**Identidad = cuenta Supabase (email+contraseña). Sin modo "sin cuenta".**
Cada persona usa su propia cuenta; el "cambio de perfil local" desaparece y se sustituye por la gestión
de cuentas en el dispositivo. Esto elimina los problemas de cuentas/personas compartidas y, junto con el
sync por filas, elimina los bugs 1-3.

## Decisiones de diseño

### D1 — Flujo de acceso (según lo que pidió el usuario)

- Sin sesión iniciada en el dispositivo → pantalla de login (email + contraseña).
- **Primera vez**: login con email → se guarda la "persona" en el dispositivo → se eligen nombre, foto y
  PIN (opcional) → se entra a la app.
- **Siguientes veces** (misma apertura de la web): si hay 1 cuenta guardada → pide PIN si lo tiene, si no
  entra directo; si hay varias cuentas guardadas → pantalla "¿Quién eres?" con las cuentas → PIN si lo tiene.
- El email solo se pide la primera vez en cada dispositivo; sirve además para tener la misma cuenta en
  varios dispositivos (auth de Supabase + sync).

### D2 — Datos por cuenta, no por perfil compartido

- Las listas (tasks, people, gifts, notes, subjects, slots, inbox, sessions) pasan a vivir a nivel de
  cuenta (una sola lista por tabla, filtrada por `user_id`).
- El "perfil" desaparece como contenedor de datos: `S.data[profileId]`, `switchProfileData()`,
  `bucketFor()` y el "reparto por compartimento" del pull se eliminan.
- La tabla `profiles` sigue como cabecera de la cuenta (name/photo/pin), pero un usuario tiene 1 fila.
- Migración: las filas existentes con `profile_id` se siguen leyendo (el pull deja de filtrar/desviar por
  perfil: todas las filas del user van a las listas únicas). Las escrituras nuevas no etiquetan con
  `profile_id` (o usan el del único perfil del usuario). No hay migración destructiva.

### D3 — Sync por filas con `updated_at` (last-writer-wins)

- Nueva columna `updated_at timestamptz DEFAULT now()` en las 9 tablas de datos + `settings`
  (migración SQL, ver D6).
- **Push** (reescribir `syncPushAll`):
  - Por tabla: `SELECT id, updated_at` de las filas del usuario (el paso de "traer ids remotos" ya existe).
  - `upsert` SOLO de las filas locales con `updated_at` local > servidor. Sin "borrado por ausencia".
  - Borrados: se propagan vía la tabla nueva `tombstones(user_id, key, id, updated_at)` (un upsert por
    borrado pendiente). El `__del` local actual sigue existiendo como memoria corta local.
- **Pull** (reescribir `syncPullAll`):
  - `SELECT * FROM <tabla> WHERE user_id = me`.
  - Merge por fila: se aplica la versión más nueva (local si `local.updated_at >= server.updated_at`,
    servidor en caso contrario → `needPush` si hay locales más nuevas).
  - Exclusión de borrados: fila cuyo id esté en `tombstones` (server + local `__del`) con
    `updated_at >= fila.updated_at` no se aplica; si el servidor trae la fila más nueva que el tombstone
    (deshacer desde otro dispositivo), el tombstone se descarta y la fila regresa.
  - Limpieza de tombstones confirmados (ya no existen fila ni tombstone más nuevos).
- **Race debounce arreglada**: la sincronización usa una única cola con mutex (`__busy` + re-encolado del
  pull si hay push pendiente). Un pull de realtime ya no pisa un cambio local dentro de la ventana del push.
- **Cierre de app**: `visibilitychange hidden` / `pagehide` → push inmediato si hay cambios pendientes
  (evita "lo cambié y al volver se deshizo").

### D4 — Settings y tema (el bug del tema)

- El row de `settings` ya lleva `updated_at` en el upsert (app-sync.js L202); falta comparar en el pull:
  solo se aplican los settings del servidor si `updated_at` del servidor > `updated_at` local.
  `save()` estampa `updatedAt = Date.now()` local al cambiar cualquier ajuste.
- `applyTheme()`: guard del valor aplicado (`__appliedTheme`) para no reaplicar el tema en cada `render()`
  (evita parpadeos y el "cambio solo" percibido).

### D5 — Varias cuentas en el mismo dispositivo

- `localStorage` por cuenta: `dailyhub_v2` (estado antiguo) migra a `dailyhub_v2:<uid>` + índice
  `dailyhub_v2:accounts` = [{ uid, email, name, photo, pin, pinLen, updatedAt }].
  `dailyhub_v2` queda solo como bolsa de migración.
- Sesión Supabase: el token (`sb-clarchsmxdrqvbatfgkp-auth-token`) se custodia por cuenta; al cambiar de
  persona se hace swap del token + `getSession` + boot del estado local de esa cuenta.
- PIN: hash local (`hashPin`) verificado contra la entrada de la cuenta antes de desbloquear
  (`session.unlocked`), tal como hoy con los perfiles.
- "Cerrar sesión" = eliminar la entrada local (los datos siguen en la nube). Borrado total de cuenta en
  ajustes, con doble confirmación.

### D6 — Migración SQL (la ejecuta el usuario en Supabase)

```
-- 1) updated_at en tablas de datos
ALTER TABLE public.profiles     ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.tasks        ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.people       ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.gifts        ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.notes        ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.subjects     ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.class_slots  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.class_inbox  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.class_sessions ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.settings     ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 2) tombstones
CREATE TABLE IF NOT EXISTS public.tombstones (
  user_id uuid NOT NULL, key text NOT NULL, id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key, id)
);
ALTER TABLE public.tombstones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tombstones_own" ON public.tombstones
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

- Antes de migrar conviene verificar las policies RLS de las tablas de datos (el pull actual hace
  `select('*')` sin `where`): en el modelo de cuentas, RLS debe aislar `user_id = auth.uid()`.
- El SQL se guarda en el repo (`supabase-migration.sql`).

### D7 — Bugs fuera del sync (trabajo aparte)

- **Horario de clase** ("bugueadísimo"): se ataca después del sync nuevo, empezando por reproducción
  (systematic-debugging). Es lógica de slots/sesiones, independiente del modelo de cuentas.
- **Regalo imposible de eliminar**: con D3 (tombstones en servidor + push sin diff-delete + pull que
  respeta borrados) la resurrección desaparece. Se añade un caso de verificación manual (borrar → recargar
  → push+pull → no vuelve). Además: blindar `giftToRow`/`rowToGift` contra precios no numéricos
  (`Number(g.price)` de un string inválido rompía el push entero).

### D8 — Index.html único (decisión histórica, sustituida)

La decisión original de mantener `index.html` como archivo único queda sustituida por la arquitectura
modular adoptada posteriormente. `index.html` es ahora únicamente el shell de composición; `src/app.js`
es el composition root y cada sección reside en un módulo ES independiente, conectado mediante contratos
explícitos y sin duplicar el resto de la aplicación.

## Archivos afectados

- `app-sync.js` — reescritura de push/pull (D3, D4): validación por fila, tombstones, mutex, updated_at.
- `index.html` — pantallas de login/cuentas/PIN (D1), localState por cuenta + swap de sesión (D5),
  eliminar compartimentos por perfil (D2), guard de tema (D4), push al cerrar (D3), copy "solo cuentas".
- `supabase-migration.sql` — nuevo (D6).
- `sw.js` — solo refresco de versión/caché al desplegar.

## QA plan

1. Aplicar migración SQL en Supabase y verificar políticas RLS.
2. Smoke test UI completo en el navegador real (login, PIN, creación/edición/borrado, Modo Clase).
3. Tema: cambiar tema → recargar → push + pull → sigue igual (repro del bug 1).
4. Borrado: borrar un regalo → recargar → push + pull → no vuelve (repro del bug 3).
5. Multi-dispositivo simulado: dos pestañas/contextos con la misma cuenta y con cuentas distintas.
6. Consola de navegador sin errores. `DailySync.push()/pull()` → `true`.

## Fuera de alcance

- Horario de clase (D7, fase 2).
- Compartir entre cuentas (listas familiares compartidas) — no pedido.
- Aplicación nativa / push notifications — no pedido.