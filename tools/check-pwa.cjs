/* Comprobaciones estáticas mínimas de la PWA (manifest, SW, iconos, meta).
   Uso: node tools/check-pwa.cjs
   No sustituye la checklist manual de docs/pwa-checklist.md. */
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const fallos = [];
const ok = (etiqueta) => console.log('  OK   ' + etiqueta);
const fail = (etiqueta, detalle) => {
  fallos.push(etiqueta + (detalle ? ': ' + detalle : ''));
  console.log(' FALLO ' + etiqueta + (detalle ? '  -> ' + detalle : ''));
};

function exists(rel) {
  return fs.existsSync(path.join(RAIZ, rel));
}

function read(rel) {
  return fs.readFileSync(path.join(RAIZ, rel), 'utf8');
}

console.log('\n== Checklist PWA (estático) ==');

if (!exists('manifest.webmanifest')) fail('manifest.webmanifest existe');
else {
  ok('manifest.webmanifest existe');
  let manifest;
  try {
    manifest = JSON.parse(read('manifest.webmanifest'));
  } catch (error) {
    fail('manifest JSON válido', String(error.message || error));
    manifest = null;
  }
  if (manifest) {
    for (const key of ['name', 'short_name', 'start_url', 'display', 'icons', 'theme_color', 'background_color']) {
      if (manifest[key] == null || (Array.isArray(manifest[key]) && !manifest[key].length)) fail('manifest.' + key);
      else ok('manifest.' + key);
    }
    if (!['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display)) {
      fail('manifest.display instalable', String(manifest.display));
    }
    for (const icon of manifest.icons || []) {
      const src = String(icon.src || '').replace(/^\.\//, '');
      if (!src || !exists(src)) fail('icono referenciado', icon.src);
      else ok('icono ' + icon.src + ' (' + (icon.purpose || 'any') + ')');
    }
  }
}

if (!exists('sw.js')) fail('sw.js existe');
else {
  ok('sw.js existe');
  const sw = read('sw.js');
  if (!/addEventListener\(\s*['"]install['"]/.test(sw)) fail('sw.js registra install');
  else ok('sw.js registra install');
  if (!/addEventListener\(\s*['"]fetch['"]/.test(sw)) fail('sw.js registra fetch');
  else ok('sw.js registra fetch');
  if (!/caches\.open|cache\.addAll|CACHE\s*=/.test(sw)) fail('sw.js usa Cache API');
  else ok('sw.js usa Cache API');
}

if (!exists('index.html')) fail('index.html existe');
else {
  const html = read('index.html');
  if (!/rel=["']manifest["']/.test(html)) fail('index.html enlaza el manifest');
  else ok('index.html enlaza el manifest');
  if (!/apple-mobile-web-app-capable/.test(html)) fail('index.html meta apple-mobile-web-app-capable');
  else ok('index.html meta apple-mobile-web-app-capable');
  if (!/theme-color/.test(html)) fail('index.html meta theme-color');
  else ok('index.html meta theme-color');
  if (!/serviceWorker|navigator\.serviceWorker/.test(html) && !exists('src/app.js')) {
    fail('registro de service worker');
  }
}

if (exists('src/app.js')) {
  const app = read('src/app.js');
  if (!/serviceWorker\.register/.test(app) && !/navigator\.serviceWorker/.test(app)) {
    // platform.js puede registrar el SW; buscar en src/
    const src = (function walk(dir, acc) {
      for (const entry of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
        const full = dir + '/' + entry.name;
        if (entry.isDirectory()) walk(full, acc);
        else if (entry.name.endsWith('.js')) acc.push(full);
      }
      return acc;
    })('src', []);
    const hasRegister = src.some(file => /serviceWorker\.register/.test(read(file)));
    if (!hasRegister) fail('serviceWorker.register en src/');
    else ok('serviceWorker.register presente en src/');
  } else {
    ok('referencia a service worker en app.js');
  }
}

if (!exists('docs/pwa-checklist.md')) fail('docs/pwa-checklist.md (checklist manual)');
else ok('docs/pwa-checklist.md presente');

console.log('');
if (fallos.length) {
  console.log(fallos.length + ' comprobaciones PWA fallidas');
  process.exit(1);
}
console.log('Todo correcto (checklist PWA estática)');
