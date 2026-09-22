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

**Separación código/datos:** puedes cambiar todo el frontend sin tocar la base de datos. Los datos viven en Supabase; el navegador guarda una copia (`localStorage`, clave `dailyhub_v2`) para funcionar sin conexión y sincroniza automáticamente (subida con debounce de 1,2 s tras cada cambio; descarga al arrancar).

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La aplicación completa |
| `app-sync.js` | Sincronización con Supabase (login, pull, push) |
| `vendor/supabase.js` | Cliente oficial supabase-js v2 (UMD) |
| `sw.js` | Service worker — cachea la app para uso offline |
| `manifest.webmanifest` | Manifest PWA (nombre, iconos, colores) |
| `icon.svg` | Icono de la app |
| `supabase/schema.sql` | SQL para crear tablas + RLS en Supabase |

## Puesta en marcha

### 1. Base de datos (Supabase)

1. Entra en [supabase.com](https://supabase.com) → tu proyecto.
2. Abre **SQL Editor → New query**, pega el contenido de `supabase/schema.sql` y pulsa **Run**.
3. Comprueba en **Table Editor** que aparecen las tablas: `profiles`, `tasks`, `people`, `gifts`, `settings`.

### 2. Frontend

Sírvelo por HTTPS (Netlify, Vercel, GitHub Pages…). No hay paso de build: son archivos estáticos.

- **Netlify**: arrastra la carpeta a app.netlify.com/drop, o conecta el repo (build command vacío, publish directory = raíz).
- Actualizar = subir los archivos de nuevo; el service worker es *network-first*, los usuarios reciben la versión nueva en cuanto abren la web con conexión.

### 3. Configuración de la app

- URL y clave pública de Supabase están al principio de `app-sync.js` (`SUPABASE_URL`, `SUPABASE_KEY`). La clave pública es segura de exponer: la protección real la hace RLS (cada usuario solo lee/escribe sus filas).
- En Supabase → Authentication → Providers, el proveedor **Email** debe estar activado. Si quieres evitar la confirmación por correo en pruebas: Authentication → Sign In / Providers → Email → desactiva "Confirm email".

## Uso

- Primera apertura: bienvenida → **crear cuenta** (email) → crear tu perfil → datos.
- Sin cuenta: pulsa "Usar solo este dispositivo" — todo funciona igual pero solo en ese navegador.
- Datos locales de la v1: al iniciar sesión en una cuenta nueva se **suben automáticamente** a la nube (migración). Si la nube ya tiene datos, se usan los de la nube.
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
