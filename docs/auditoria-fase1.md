# Auditoría FASE 1 — DailyHub

Fecha: 13/10/2026 · Alcance: todo el repositorio, sin modificar código de la app.
Objetivo: inventariar qué conservar, corregir, simplificar o eliminar antes de tocar nada.

---

## 1. Método y línea base

| Qué | Cómo | Resultado |
|---|---|---|
| Línea base de pruebas | `node tools/test-all.js` | **Verde · exit 0 · "Los 17 pasos pasan"** (35 módulos, 85 checks de rutinas, 53 de calendario, 37 de copia, 16 de importación, 12 de sync, 5 de notas) |
| Revisión estática | Lectura de `src/`, `app-sync.js`, `sw.js`, `styles/`, `supabase/` | Ver hallazgos |
| Revisión en vivo | Servidor local `python -m http.server 8477`, navegador con **fixture de datos de auditoría** (4 tareas, 2 personas, 2 regalos, 2 notas, 2 asignaturas, 4 bloques de horario) inyectada en memoria, sin tocar ficheros del repo | 6 pantallas × 2 temas × 2 tamaños |
| Contraste | Cálculo WCAG 2.x (fórmula de luminancia) sobre el árbol real, componiendo capas con alfa | Ver §3 |
| Táctil | `getBoundingClientRect` + revisión de `::before` de 44 px | Ver §4 |
| Rendimiento | `performance.now()` sobre `save()` y `render()` con 4 y con 504 tareas | Ver §7 |
| Offline | Service worker registrado y caché precacheada | 1 SW activo, caché `dailyhub-v63` con **64 entradas** |

> Nota del entorno: la sesión de auditoría vivía en el navegador de la app. Al final se
> borró el artefacto (`dailyhub_v2:acc:audit`) y las claves derivadas; el blob real de la
> cuenta existente no se modificó y **ninguna escritura llegó a Supabase** (todos los
> `push` fallaron con HTTP 400 antes de mutar, porque el fixture usaba ids no-UUID).

---

## 2. Veredicto global

La arquitectura es sólida: composition root único, módulos con contrato `register*`, RLS
completa por tabla, sync por filas con tombstones y resurrección, copia de seguridad
idempotente y 17 bancos de pruebas verdes. **No hace falta reescribir nada**: los problemas
son de acabado (contraste, microcopy, foco/etiquetas), de consolidación (código duplicado)
y de manejo de errores (todo se etiqueta "sin conexión").

---

## 3. Hallazgos priorizados

Decisión: **CORREGIR** = arreglar en esta misión · **SIMPLIFICAR** = reducir sin perder
función · **ELIMINAR** = código muerto/redundante · **CONSERVAR** = está bien así.

### P0 — Rompen legibilidad o uso (corregir)

| # | Hallazgo | Evidencia | Decisión |
|---|---|---|---|
| 1 | **El distintivo "AHORA" es ilegible**: 1,08:1 en oscuro y 1,17:1 en claro. `.now-hero span` (0,1,1) gana por especificidad a `.now-badge` (0,1,0), así que el texto hereda `--text-2` sobre fondo `--danger` | `styles/features.css:476` vs `styles/features.css:477`; medido en vivo en la pantalla "Ahora" | CORREGIR |
| 2 | **Botón primario en modo oscuro 3,68:1** (blanco sobre `--primary:#3B82F6`) < 4,5:1. Afecta a `.btn-primary`, `.nav-badge`, `.activity-card-quick-action` (11 px) y `.cls-tab.on` (4,33:1) | `styles/tokens.css:125` + `styles/tokens.css:387`; medido en Inicio, Clase y Ahora | CORREGIR |
| 3 | **Texto duplicado visible en cada tarjeta**: "Desliza desliza a la derecha para completar" | `src/features/home-tasks.js:311-312` | CORREGIR |
| 4 | **Fecha ISO cruda en la interfaz**: una tarea "una vez" muestra `2026-10-13` en Inicio, Tareas, Ahora y buscador | `src/core/routines.js:376` (`text = freq.date`) | CORREGIR (usar `fmtShort`) |
| 5 | **El FAB tapa un control real**: a 390 px, el botón flotante (56×56) se superpone al segmento "Oscuro" de Ajustes → el toque abre el sheet de añadir en vez de cambiar el tema. El FAB se pinta en todas las rutas | `src/features/onboarding-shell.js:372`; medido: overlap exacto sobre `.set-seg button.on` | CORREGIR |

### P1 — Flujos y accesibilidad (corregir / simplificar)

| # | Hallazgo | Evidencia | Decisión |
|---|---|---|---|
| 6 | **Actividades arranca en "Todas"** en vez de "Para hoy", y la línea que normaliza el filtro es un no-op (`x === 'todas' ? 'todas' : 'hoy'` conserva cualquier valor) | `src/navigation/router.js:41` (`tasksFilter: 'todas'`), `src/features/home-tasks.js:351` | CORREGIR (default `'hoy'`) + ELIMINAR línea muerta |
| 7 | **Pista de gesto repetida en cada tarjeta** de Actividades (4 avisos seguidos); solo se oculta en Inicio | `src/features/home-tasks.js:311`, `styles/components.css:204` (oculto en home) y `:225` (visible en lista) | SIMPLIFICAR (una vez por sesión o primera vez) |
| 8 | **Las notas rápidas muestran Markdown crudo** (`**Traer cartulina** el viernes`) aunque `markdownPreview` existe y está probado | `src/features/class/notes.js:141` vs `:12` | CORREGIR |
| 9 | **Títulos truncados con espacio sobrante** en las tarjetas de 2 columnas y en la fila de Actividades ("Llamar al dent…", "No comer cha…") | `src/features/home-tasks.js:294-297` (`.activity-copy b` con elipse) | CORREGIR (2 líneas o quitar elipse) |
| 10 | **Tres CTA distintos para la misma acción** en una misma lista: `Hecho`, `Día limpio ✓`, `Abrir →` | `src/features/home-tasks.js:314-320` | SIMPLIFICAR (unificar lógica de etiqueta) |
| 11 | **Etiquetas de formulario sin `for`** en Auth y mensaje de error sin `aria-live` → el lector de pantalla no asocia email/contraseña ni anuncia el error | `src/features/auth.js:231-232`, mensaje en `:166-171` | CORREGIR |
| 12 | **Navegación sin `aria-current`**: la pestaña activa solo lleva clase `.on` | `src/features/onboarding-shell.js:347` | CORREGIR |
| 13 | **`.btn` mide ~37 px de alto** (padding 12 px + texto 13 px), por debajo del objetivo de 44 px que fija el propio proyecto | `styles/tokens.css:377-384` | CORREGIR (`min-height: var(--tap)`) |
| 14 | **Arranque dependiente de la red**: `authCheck` devuelve `true` mientras `state === 'loading'`, así que el primer pintado puede ser la bienvenida o el login según cuándo resuelva Supabase | `src/features/auth.js:26-32`, `src/app.js:44-48` | SIMPLIFICAR (esperar resolución o decidir orden explícito) |

### P2 — Fiabilidad, datos y seguridad (corregir)

| # | Hallazgo | Evidencia | Decisión |
|---|---|---|---|
| 15 | **Todo error de sync se etiqueta "offline"**: 400 (validación), 401 (sesión caducada) o 5xx acaban en `state = 'offline'`, y la UI dice "Sin conexión" con red disponible. Observado en bucle: `syncPushAll Object` + HTTP 400 repetidos en consola | `app-sync.js:733-741` (y `:550`, `:565`, `:577`, `:1018`), etiqueta en `src/features/auth.js:155-157` | CORREGIR (clasificar error y separar "sin red" de "nube rechaza") |
| 16 | **`save()` con cuota llena solo hace toast y pierde el guardado**: no dice cuánto pesa ni ofrece salida; las fotos van en dataURL (regalos de 60–116 KB medidos) y el cupo de localStorage son ~5 MB | `src/state/store.js:349-352`; medidas en §7 | CORREGIR (aviso de uso, exportar, comprimir más) |
| 17 | **Caché instalada incompleta en silencio**: `cache.addAll(ASSETS).catch(() => {})` deja pasar un install con ficheros ausentes → modo roto offline sin aviso | `sw.js:59` | CORREGIR |
| 18 | **Riesgo latente de mezcla entre cuentas**: `syncPullAll` fusiona la nube de la sesión autenticada **sin comprobar que `activeAccountUid() === user.id`**; se fusiona en `S.data[perfil]` de la cuenta local activa. Se observó con la fixture: filas de otra cuenta entraron en la copia local | `app-sync.js:746-772` (no hay guarda de uid) | CORREGIR (guarda + log) |
| 19 | **PIN con hash débil y sincronizado**: DJB2 sin sal (un PIN de 6 dígitos = 10⁶ combinaciones, se revienta offline en segundos) y el hash viaja a la tabla `profiles` | `src/core/security.js:3-7`, `supabase/schema.sql:14` | CORREGIR (PBKDF2/WebCrypto con sal por perfil; revisar si debe subir) |
| 20 | **Acceso offline sin contraseña** cuando existe cuenta activa (`authCheck` en estado `offline`); es la contrapartida natural de un offline-first, pero queda sin documentar y sin mitigación | `src/features/auth.js:26-32` | CONSERVAR + documentar; ofrecer bloqueo con PIN/candado |
| 21 | **Notificaciones solo con la app abierta**: los avisos salen de un `setInterval(60000)`; el push de fondo depende de Edge Functions que no se prueban aquí | `src/services/notifications.js:140-151`, `supabase/functions/push-*` | CONSERVAR (hay push real) + documentar límite |

### P3 — Deuda técnica y duplicación (simplificar / eliminar)

| # | Hallazgo | Evidencia | Decisión |
|---|---|---|---|
| 22 | **`app.features` se registra dos veces en el mismo fichero**, la segunda con un subconjunto (no rompe, pero confunde y el segundo registro queda muerto) | `src/features/task-row.js:465` y `:626` | ELIMINAR el segundo |
| 23 | **Utilidades de hora duplicadas en tres sitios** (`hm`, `minTxt`, `timeTxt`, `leftTxt`, `inTxt`, `classNow`): agenda, Ahora y notificaciones mantienen versiones propias; un cambio de formato hay que hacerlo en tres | `src/features/class/agenda.js:39-96`, `src/features/now.js:11-19`, `src/services/notifications.js:113` | SIMPLIFICAR (mover a `core/dates.js`) |
| 24 | **Tres superficies "qué toca ahora"** con textos distintos: línea de clase en Inicio, tarjeta "Ahora" y pestaña Hoy de Modo Clase | `src/features/home-tasks.js:76-84`, `src/features/now.js:20-60`, `src/features/class/agenda.js:267-352` | CONSERVAR (responde a momentos distintos) + unificar copy y helper |
| 25 | **Manifest solo con iconos SVG** y `apple-touch-icon` apuntando a SVG: iOS no usa SVG para el icono de inicio | `manifest.webmanifest` (`icons`), `index.html:12` | CORREGIR (PNG 192/512 + apple-touch PNG) |
| 26 | **Sin pruebas de UI ni de contraste**: `test-all.js` no cubre microcopy, contraste ni rutas de pantalla (solo hay 4 tests de rutas/NOTAS en `tools/`) | `tools/test-all.js:44-70` | CORREGIR (añadir bancos, §8) |

---

## 4. Accesibilidad — lo que ya está bien (CONSERVAR)

- `--tap: 44px` (`styles/tokens.css:106`) y expansión real del área pulsable con `::before`
  en `.icon-btn`/`.mini-btn` (`styles/tokens.css:344-356`), `.row-check`/`.note-check`
  (`styles/components.css:107-112`) y `.profile-del` (`styles/features.css:237`).
- Anillo de foco global `:focus-visible` (`styles/tokens.css:171`), *skip link*
  (`index.html:16`, `styles/components.css:35`).
- Trampa de foco con Escape y restauración en overlays (`src/components/overlays.js:47-88`).
- `role="status"` en toasts (`src/components/overlays.js:259`), `aria-live` en el estado de
  sincronización (`src/features/auth.js:163`).
- Landmarks reales: `aside` / `main` / `nav` (`src/features/onboarding-shell.js:356-371`).
- `prefers-reduced-motion` en 4 hojas + ajuste manual de animaciones (`styles/tokens.css:184`,
  `styles/motion.css:154`, `components.css:302`, `features.css:65`).
- 0 fallos de contraste en **claro** salvo el distintivo "AHORA"; en **oscuro** los fallos se
  concentran en el color primario (§3.2).

---

## 5. Datos, sync y seguridad — lo que ya está bien (CONSERVAR)

- **RLS completa**: política `for all using (auth.uid() = user_id) with check (...)` en las
  12 tablas, incluidos `settings` y `tombstones` (`supabase/schema.sql:286-341`).
- **Sync por filas con `updated_at`** (last-writer-wins), resurrección de filas editadas
  tras un tombstone, purga física por lotes de 50 y guardas de sesión (`app-sync.js:594-745`).
- **Borrados con deshacer** y `rememberPendingDeletes` (`src/actions/records.js`).
- **Notas escapadas** contra HTML/XSS con prueba propia (`src/features/class/notes.js:1-13`,
  `tools/test-notes-preview.mjs`).
- **Copia de seguridad** con fusión idempotente, conservación de preferencias locales y
  reasignación de ids colisionados (37 checks).
- **Importación de horario atómica** (todo o nada ante solapes, `tools/test-schedule-import.mjs`).
- Clave Supabase pública (`sb_publishable_…`) en repo: **no es un secreto filtrado**.

---

## 6. Offline y actualizaciones — verificado

- SW activo en `http://localhost:8477/`, caché `dailyhub-v63` con 64 entradas precacheadas.
- Navegación *network-first* con `index.html` de respaldo; resto *cache-first* con
  `ignoreSearch` y actualización en segundo plano (`sw.js:77-113`).
- Sin `skipWaiting` automático: la actualización se aplica con el aviso del usuario (`sw.js:44-70`).

---

## 7. Medidas de rendimiento (fixture)

| Escenario | `save()` | `render()` pantalla | Marcar tarea + render |
|---|---|---|---|
| 4 tareas, 645 KB en localStorage | 25 ms | 41 ms | 26 ms |
| 504 tareas + 302 notas, 1,1 MB | 31 ms | **411 ms** | — |

Lectura: el render completo (`root.innerHTML = ''` + reconstrucción) es aceptable en tamaños
reales (20–50 tareas) pero degrada linealmente; `save()` serializa el estado entero en cada
acción. Riesgo real: **cuota de localStorage con fotos** (60–116 KB por imagen medida).

---

## 8. Plan por fases pequeñas (para las siguientes pasadas)

Cada fase termina con `node tools/test-all.js` en verde y commits pequeños.

1. **Fase A — Tokens y contraste (P0.1, P0.2, P1.13)**
   Corregir `.now-badge`, subir contraste del primario en oscuro (o token `--on-primary`),
   `min-height: var(--tap)` en `.btn`. Añadir `tools/test-contrast.mjs` que parsea
   `tokens.css` y verifica los pares de color que se usan con texto.
2. **Fase B — Microcopy (P0.3, P0.4, P1.7, P1.8, P1.10)**
   "Desliza desliza", `freqText` con `fmtShort`, Markdown en la lista de notas, CTA
   unificados, pista de gesto única. Pruebas nuevas en `tools/` para `freqText('once')`
   y para la cadena de pista.
3. **Fase C — Accesibilidad semántica y layout móvil (P1.11, P1.12, P0.5, P1.9)**
   `for`/`id` en Auth, `aria-live` en errores, `aria-current` en la navegación, FAB
   condicional por ruta + espacio final de scroll, títulos a 2 líneas.
4. **Fase D — Flujo diario (P1.6, P1.14)**
   Actividades arranca en "Para hoy" (y fuera la línea muerta), orden de arranque de la
   primera pantalla determinista.
5. **Fase E — Fiabilidad de sync y storage (P2.15, P2.16, P2.17, P2.18)**
   Clasificar errores de sync (red / sesión / validación), guarda de cuenta activa vs
   sesión autenticada, `addAll` sin tragar errores, aviso de cuota con exportación.
6. **Fase F — Seguridad del PIN (P2.19, P2.20)**
   Hash con PBKDF2 + sal, migración compatible con los PIN existentes, decisión sobre si el
   hash sube a la nube, documentar el acceso offline.
7. **Fase G — Consolidación (P3.22, P3.23, P3.25)**
   Quitar el doble registro, centralizar utilidades de tiempo, iconos raster para el manifest.

---

## 9. Limitaciones de esta auditoría

- **No se probó un flujo real de cuenta** (login, logout, cambio de cuenta, RLS en vivo):
  requiere credenciales; la sesión existente en el navegador no se usó para mutar datos.
- **No se probó offline con la red cortada**; solo se verificó el precache y las estrategias
  de `sw.js` por lectura.
- **No se probó en iOS/Safari ni lectores de pantalla reales**; la accesibilidad medida es
  contraste, objetivos táctiles, landmarks y estados ARIA por DOM.
- Las Edge Functions de push (`supabase/functions/*`) **no se ejecutaron**.
- El fixture de auditoría se inyectó en el navegador (no en el repo) y se borró al terminar.
