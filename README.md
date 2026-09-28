# DailyHub — PWA de tareas, hábitos y regalos

DailyHub es una aplicación web progresiva (PWA) para gestionar tareas diarias, hábitos, rutinas de casa, planificación semanal, apuntes de Modo Clase y regalos por persona. Funciona **offline**, es instalable en móvil/escritorio y sincroniza los datos de cada usuario con **Supabase**.

## Arquitectura

El frontend es estático y usa módulos ES nativos, sin frameworks ni paso de compilación. `index.html` solo compone la aplicación; cada sección tiene responsabilidades y contratos propios.

```text
DailyHub (PWA)
│
├── Frontend
│   ├── index.html                 → composition HTML mínima
│   ├── styles/
│   │   ├── tokens.css             → tokens, tema, layout y navegación
│   │   ├── components.css         → controles, tarjetas, formularios y overlays
│   │   └── features.css           → Modo Clase, regalos, onboarding y estados
│   ├── src/app.js                 → composition root + render + bootstrap
│   ├── src/core/                  → contexto, DOM, fechas, iconos, constantes y seguridad
│   ├── src/state/store.js         → estado, cuentas, persistencia y tombstones
│   ├── src/navigation/router.js   → rutas, sesión UI, selectores y reglas de dominio
│   ├── src/components/            → sheets, búsqueda, diálogos y acciones rápidas
│   ├── src/actions/               → mutaciones destructivas y deshacer
│   ├── src/features/              → onboarding, Inicio, tareas, regalos, formularios, Ajustes y Auth
│   ├── src/features/class/        → agenda, apuntes, asignaturas y horario
│   ├── src/services/              → medios y notificaciones
│   ├── app-sync.js                → adaptador Supabase: Auth + merge por filas + tombstones
│   ├── vendor/supabase.js         → cliente supabase-js v2 servido local
│   ├── sw.js                      → service worker y grafo offline
│   └── manifest.webmanifest + icon.svg
│
└── Supabase
    ├── Auth      → usuario (email + contraseña)
    ├── Database  → perfiles, tareas, hábitos, personas, regalos y Modo Clase
    └── RLS       → cada usuario solo accede a SUS filas
```

### Contratos entre módulos

- `src/core/context.js` crea un contexto central con espacios de nombres: `core`, `state`, `domain`, `services`, `components`, `actions`, `class`, `features`, `auth` y `settings`.
- Cada módulo exporta una función `register*` que recibe el contexto y publica únicamente sus dependencias públicas.
- `src/app.js` es el único composition root: registra los módulos en orden, crea el registro de vistas y coordina el arranque.
- `window.DailyHub` es el puente deliberado para la capa clásica `app-sync.js`; los módulos no comparten globals implícitos y las APIs públicas existentes (`window.DailySync`, `window.sb`) se conservan.

**Separación código/datos:** puedes cambiar el frontend sin tocar la base de datos. Los datos viven en Supabase; el navegador guarda una copia por cuenta (`dailyhub_v2:acc:<uid>`) para funcionar sin conexión y sincroniza automáticamente con debounce de 1,2 s. `dailyhub_v2` queda como buffer de adopción de versiones antiguas.

## Archivos principales

| Ruta | Responsabilidad |
|---|---|
| `index.html` | Shell HTML, hojas de estilo y entrada del Composition Root |
| `src/app.js` | Registro de módulos, render, navegación inicial y PWA |
| `src/core/` | Utilidades sin estado de negocio |
| `src/state/store.js` | Estado estable, aislamiento por perfil, guardado y borrados |
| `src/navigation/router.js` | Router y helpers compartidos de tareas/regalos |
| `src/features/` | Vistas y flujos independientes por sección |
| `src/actions/records.js` | Eliminaciones con confirmación y deshacer |
| `src/services/` | Imágenes y notificaciones |
| `app-sync.js` | Contrato con Supabase y sincronización por filas |
| `sw.js` | Precache y estrategias de red/caché |
| `manifest.webmanifest` | Manifest PWA, iconos y accesos directos |
| `supabase/schema.sql` | Esquema completo, RLS, relojes y tombstones |
| `supabase/migrations/20260923000000_accounts_sync.sql` | Migración idempotente para instalaciones existentes |
| `src/features/class/calendar-core.js` | Días no lectivos, excepciones, huecos/solapes, carga y `.ics` |
| `src/features/class/schedule-grid.js` | Rejilla semanal con arrastre y redimensión |
| `src/features/class/schedule-extra.js` | Carga, días no lectivos y plantillas de horario |
| `src/features/class/schedule-import.js` | Importación CSV/TSV del horario con validación de solapes antes de guardar |
| `src/core/routines.js` | Tipos de hábito, valores, saltos, recurrencia y rachas |
| `src/features/task-row.js` | Control según el tipo, objetivo semanal y heatmap |
| `src/features/search.js` | Buscador global (Ctrl+K / "/") |
| `src/features/now.js` | Pantalla "Ahora": qué toca en este momento |
| `src/features/platform.js` | Aviso de versión, instalación y copia de seguridad |
| `tools/` | Versión única, arnés de pruebas y bancos de pruebas |

## Puesta en marcha

### 1. Base de datos (Supabase)

1. Entra en [supabase.com](https://supabase.com) → tu proyecto.
2. Para una instalación nueva, abre **SQL Editor → New query**, pega `supabase/schema.sql` y pulsa **Run**.
3. Si ya tienes una instalación anterior, aplica las migraciones de `supabase/migrations/` **en orden de fecha**. Además de cuentas, regalos y calendario, las migraciones `20260929000000_task_kinds.sql` y `20260930000000_tasks_notes_templates.sql` habilitan los campos nuevos de hábitos, fechas límite, subtareas, etiquetas y papelera de notas. Son idempotentes; puedes ejecutarlas aunque algunas columnas ya existan. La app conserva sincronización básica si aún no se han aplicado columnas opcionales, pero esos campos no se sincronizarán hasta que estén disponibles.
4. Comprueba que aparecen `profiles`, `tasks`, `people`, `gifts`, `settings` y `tombstones`.

### 2. Frontend

Sírvelo por HTTPS. No hay paso de build: son archivos estáticos.

- **Netlify**: conecta el repositorio con build command vacío y publish directory `raíz`.
- **GitHub Pages / Vercel / Cloudflare Pages**: publica la raíz sin compilación.
- Actualizar = subir los archivos; el service worker activa una versión nueva de caché.

### 3. Configuración

- URL y clave pública de Supabase están al principio de `app-sync.js` (`SUPABASE_URL`, `SUPABASE_KEY`).
- La protección real de datos la aporta RLS: cada usuario solo lee y escribe sus filas.
- En Supabase → Authentication → Providers, activa el proveedor **Email**.

## Uso

- Primera apertura: crear cuenta → crear perfil → datos.
- Los datos de una versión anterior se adoptan automáticamente solo por la primera cuenta que entra en el dispositivo.
- Cada dispositivo puede guardar varias cuentas; al cambiar, se restaura su sesión, estado y perfil.
- El PIN de cada perfil se guarda hasheado, nunca en claro.

## Desarrollo local

```bash
python -m http.server 8477
# abre http://localhost:8477
```

Comprobaciones rápidas sin dependencias externas:

```bash
node tools/test-all.js   # sintaxis + versión + sincronización, copias, importación y modelos
```

Equivale a:

```bash
node tools/sync-version.js         # coherencia de la versión y de ASSETS del SW
node tools/test-patio-sync.js      # round-trip de class_slots con y sin migración
node tools/test-calendar-sync.js   # class_breaks, class_offs y la columna active
node tools/test-calendar-core.mjs  # huecos, solapes, carga semanal y .ics
node tools/test-routines.mjs       # tipos de hábito, recurrencia, rachas y heatmap
node tools/test-task-kind-transitions.mjs # transiciones entre tipos y días saltados
node tools/test-backup.mjs          # copia de seguridad: fusionar, referencias, colisiones e idempotencia
node tools/test-schedule-import.mjs  # CSV/TSV, validación, solapes e importación atómica
node tools/test-sync-enhancements.js # round-trip de tareas/notas con y sin migración
node tools/test-notes-preview.mjs    # salida Markdown segura contra HTML/XSS
```

En `.github/workflows/ci.yml` se ejecuta `node tools/test-all.js` en cada push y PR.

> Nota: `node --check fichero.js` **no** parsea un módulo ESM si el proyecto no
> tiene `package.json` con `type: module`, así que un error de sintaxis se
> escapa. Por eso `test-all.js` comprueba sobre una copia `.mjs`. No lo
> sustituyas por un `node --check` directo.

### Publicar una versión

`sw.js` sirve con `cache.match(..., { ignoreSearch: true })`, así que el
parámetro `?v=` de `index.html` y de los imports de `src/app.js` **no** cambia
nada en la caché: el botón real es el nombre de `CACHE`. Aun así, el número se
mantiene en un único sitio para no tener que escribirlo a mano en tres ficheros:

1. sube `APP_VERSION` en `tools/version.js`;
2. ejecuta `node tools/sync-version.js`, que lo propaga a `sw.js`, `index.html`
   y `src/app.js`, y comprueba que todo módulo de `src/` esté en `ASSETS`;
3. `test-all.js` falla si algo queda desincronizado.

Al modificar un módulo:
1. mantén su registro en `src/app.js`;
2. ejecuta `node tools/sync-version.js` (añade a `ASSETS` lo que falte);
3. comprueba las vistas afectadas y los flujos que usan ese contrato.

## Probar RLS

```sql
-- Debe devolver 0 filas aunque haya datos de otros usuarios:
select * from public.tasks;  -- sin auth → RLS bloquea todo
```
