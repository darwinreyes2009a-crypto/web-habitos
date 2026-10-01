# Checklist PWA — DailyHub (producción)

Comprobaciones manuales antes/después de desplegar en https://web-habitos.vercel.app.
La parte estática se puede automatizar con `node tools/check-pwa.cjs` (también va en `npm test`).

## Antes del deploy

- [ ] `node tools/test-all.cjs` pasa en CI / local
- [ ] `APP_VERSION` subido y `node tools/sync-version.cjs` ejecutado si cambió código cacheado
- [ ] `manifest.webmanifest` tiene `name`, `short_name`, `start_url`, `display`, `icons`, colores
- [ ] Icono `icon.svg` accesible y referenciado (any + maskable)
- [ ] `sw.js` precachea los módulos de `src/` (lo verifica `sync-version`)

## En el dispositivo (HTTPS / prod)

- [ ] Chrome/Edge (Android o escritorio): *Instalar aplicación* / banner de instalación aparece o está en el menú
- [ ] Tras instalar: abre en `standalone` (sin barra de URL del navegador)
- [ ] Sin red: la shell carga (offline) y muestra datos locales / aviso coherente
- [ ] Actualización: tras un deploy con `CACHE` nuevo, aparece el aviso «Hay una versión nueva» y *Actualizar* recarga limpio
- [ ] Atajos del manifest (Nueva tarea / Modo Clase / …) abren la ruta esperada
- [ ] iOS Safari: *Añadir a pantalla de inicio* usa el icono y el título «DailyHub»
- [ ] Notificaciones (si están activadas): permiso, y un push de prueba llega con icono

## No bloqueante / seguimiento

- [ ] Iconos PNG 192 y 512 además del SVG (mejor soporte en algunos launchers Android) — pendiente de decisión de producto
- [ ] Lighthouse PWA ≥ umbral interno del equipo

## Comando rápido

```bash
node tools/check-pwa.cjs
npm test   # incluye check-pwa
```
