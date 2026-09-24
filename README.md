# DailyHub — PWA de tareas, hábitos y regalos

DailyHub es una aplicación web progresiva (PWA) para gestionar tareas diarias, hábitos, rutinas de casa, planificación semanal y regalos por persona. Funciona **offline**, es instalable en móvil/escritorio y sincroniza tus datos entre dispositivos con tu propia base de datos de **Supabase**.

## Arquitectura

```
DailyHub (PWA)
│
├── Frontend
│   ├── index.html      → app completa (HTML + CSS + JS, sin frameworks)
│   ├── app-sync.js     → capa de datos: Supabase (Auth + DB) + caché offline
│   ├── vendor/supabase.js → cliente supabase-js v2 (servido local, offline)
│   ├── sw.js           → service worker (offline + actualizaciones inmediatas)
│   └── manifest.webmanifest + icon.svg
│
└── Supabase
    ├── Auth      → usuario (email + contraseña)
    ├── Database  → perfiles, tareas, hábitos, completions, personas, regalos
    └── RLS       → cada usuario solo accede a SUS filas
```

**Separación código/datos:** puedes cambiar todo el frontend sin tocar la base de datos. Los datos viven en Supabase; el navegador guarda una copia por cuenta (`dailyhub_v2:acc:<uid>`) para funcionar sin conexión y sincroniza automáticamente (subida con debounce de 1,2 s tras cada cambio; descarga al arrancar). `dailyhub_v2` queda como buffer de adopción de versiones antiguas.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La aplicación completa |
| `app-sync.js` | Sincronización con Supabase (login, pull, push) |
| `vendor/supabase.js` | Cliente oficial supabase-js v2 (UMD) |
| `sw.js` | Service worker — cachea la app para uso offline |
| `manifest.webmanifest` | Manifest PWA (nombre, iconos, colores) |
| `icon.svg` | Icono de la app |
| `supabase/schema.sql` | SQL completo para tablas, RLS, relojes y tombstones |
| `supabase/migrations/20260923000000_accounts_sync.sql` | Migración idempotente para instalaciones existentes |

## Puesta en marcha

### 1. Base de datos (Supabase)

1. Entra en [supabase.com](https://supabase.com) → tu proyecto.
2. Para una instalación nueva, abre **SQL Editor → New query**, pega `supabase/schema.sql` y pulsa **Run**. El archivo incluye `updated_at` en las tablas de datos y la tabla `tombstones` usada por la sincronización.
3. Si ya tienes una instalación anterior, ejecuta además `supabase/migrations/20260923000000_accounts_sync.sql`; es idempotente y conserva los datos existentes.
4. Comprueba en **Table Editor** que aparecen `profiles`, `tasks`, `people`, `gifts`, `settings` y `tombstones`.

### 2. Frontend

Sírvelo por HTTPS (Netlify, Vercel, GitHub Pages…). No hay paso de build: son archivos estáticos.

- **Netlify**: arrastra la carpeta a app.netlify.com/drop, o conecta el repo (build command vacío, publish directory = raíz).
- Actualizar = subir los archivos de nuevo; el service worker es *network-first*, los usuarios reciben la versión nueva en cuanto abren la web con conexión.

### 3. Configuración de la app

- URL y clave pública de Supabase están al principio de `app-sync.js` (`SUPABASE_URL`, `SUPABASE_KEY`). La clave pública es segura de exponer: la protección real la hace RLS (cada usuario solo lee/escribe sus filas).
- En Supabase → Authentication → Providers, el proveedor **Email** debe estar activado. Si quieres evitar la confirmación por correo en pruebas: Authentication → Sign In / Providers → Email → desactiva "Confirm email".

## Uso

- Primera apertura: bienvenida → **crear cuenta** (email) → crear tu perfil → datos.
- Los datos de la versión anterior (sin cuenta) se **adoptan automáticamente** solo por la primera cuenta que entra en el dispositivo. Las cuentas posteriores tienen su propio bucket local.
- Cada dispositivo puede guardar varias cuentas; **Cambiar de cuenta** detiene realtime y restaura la sesión y el estado de la cuenta elegida.
- El PIN de cada perfil local se guarda **hasheado** (nunca en claro).

## Desarrollo local

```bash
python -m http.server 8477
# abre http://localhost:8477
```

## Probar RLS

En Supabase → SQL Editor:

```sql
-- Debe devolver 0 filas aunque haya datos de otros usuarios:
select * from public.tasks;  -- sin auth → RLS bloquea todo
```
