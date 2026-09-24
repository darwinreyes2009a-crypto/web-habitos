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

## Puesta en marcha

### 1. Base de datos (Supabase)

1. Entra en [supabase.com](https://supabase.com) → tu proyecto.
2. Para una instalación nueva, abre **SQL Editor → New query**, pega `supabase/schema.sql` y pulsa **Run**.
3. Si ya tienes una instalación anterior, ejecuta además `supabase/migrations/20260923000000_accounts_sync.sql`.
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
for f in app-sync.js sw.js $(find src -name '*.js' -type f | sort); do node --check "$f" || exit 1; done
git diff --check
```

Al modificar un módulo:
1. mantén su registro en `src/app.js`;
2. actualiza `ASSETS` en `sw.js` si añades un archivo;
3. bumpea `CACHE` para publicar una versión nueva;
4. comprueba las vistas afectadas y los flujos que usan ese contrato.

## Probar RLS

```sql
-- Debe devolver 0 filas aunque haya datos de otros usuarios:
select * from public.tasks;  -- sin auth → RLS bloquea todo
```
