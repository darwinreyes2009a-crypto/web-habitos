/* Fase E — caché del service worker (docs/auditoria-fase1.md, P2.17).
 *
 * sw.js instalaba con `cache.addAll(ASSETS).catch(() => {})`: un fichero
 * ausente dejaba la caché incompleta y el instalador pasaba igual, con el modo
 * offline roto y sin aviso. El test comprueba que:
 *   1) el precache ya NO traga el fallo (hay throw y se elimina la caché
 *      a medias para no dejarla en un estado intermedio);
 *   2) el instalador avisa a la ventana (`sw-install-failed`);
 *   3) la app escucha ese mensaje y lo muestra (platform.js);
 *   4) ningún otro `.catch(() => {})` vuelve a ocultar fallos de precache.
 *
 * Uso: node tools/test-sw-precache.mjs   (también forma parte de test-all.js)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

const sw = leer('sw.js');
const platform = leer('src/features/platform.js');

let fallos = 0;
const ok = (label, cond, extra) => {
  console.log((cond ? '  OK  ' : ' FALLO') + ' ' + label + (cond ? '' : (extra ? ' → ' + extra : '')));
  if (!cond) fallos++;
};

const bloqueInstall = (sw.match(/self\.addEventListener\('install'[\s\S]*?\n\}\);/) || [''])[0];
ok('existe el manejador install', bloqueInstall.length > 0);
ok('el precache no traga el fallo con .catch(() => {})', !/addAll\(ASSETS\)\.catch\(\(\)\s*=>\s*\{\}\)/.test(bloqueInstall));
ok('el fallo se vuelve a lanzar (throw) para rechazar la instalación',
  /throw\s+error/.test(bloqueInstall), bloqueInstall.slice(0, 200));
ok('se elimina la caché incompleta antes de rechazar',
  /caches\.delete\(CACHE\)/.test(bloqueInstall));
ok('avisa a las ventanas con sw-install-failed',
  /sw-install-failed/.test(bloqueInstall) && /postMessage/.test(bloqueInstall));
ok('sin skipWaiting en install (la versión nueva espera)', !/skipWaiting\(\)/.test(bloqueInstall));
ok('el precache baja cada fichero con no-cache (sin caché HTTP del navegador)',
  /cache:\s*'no-cache'/.test(bloqueInstall) && !/addAll\(ASSETS\)/.test(bloqueInstall));
ok('la revalidación de fondo del fetch también usa no-cache (no pisa la caché con bytes viejos)',
  (sw.match(/fetch\(event\.request,\s*\{\s*cache:\s*'no-cache'\s*\}\)/g) || []).length === 2);

ok('la app escucha sw-install-failed', /sw-install-failed/.test(platform));
ok('y lo muestra con un toast', /No se pudo preparar la versión nueva/.test(platform));

/* El manejador de mensajes del SW no debe estar roto por la misma causa. */
const bloqueMessage = (sw.match(/self\.addEventListener\('message'[\s\S]*?\n\}\);/) || [''])[0];
ok('el mensaje skip-waiting sigue operativo', /skip-waiting/.test(bloqueMessage));

console.log('\n' + (fallos ? fallos + ' comprobaciones fallidas' : 'Todo correcto (precache del SW)'));
process.exit(fallos ? 1 : 0);
