// Propaga el número de versión de tools/version.js a los tres sitios donde
// aparecía escrito a mano: el nombre de la caché del service worker, el
// `?v=` del script de entrada y el `?v=` del import de app-sync.js.
//
//   node tools/sync-version.js
//
// Devuelve código de salida 1 si algún fichero queda sin sincronizar, para
// poder fallar la CI.

const fs = require('fs');
const path = require('path');
const { APP_VERSION } = require('./version.js');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, text) => fs.writeFileSync(path.join(root, file), text, 'utf8');

const TARGETS = [
  {
    file: 'sw.js',
    apply(text) {
      return text.replace(/const CACHE = 'dailyhub-v\d+';/, "const CACHE = 'dailyhub-v" + APP_VERSION + "';");
    },
    verify: text => text.includes("const CACHE = 'dailyhub-v" + APP_VERSION + "';")
  },
  {
    file: 'index.html',
    apply(text) {
      return text.replace(/src\/app\.js\?v=\d+/, 'src/app.js?v=' + APP_VERSION);
    },
    verify: text => text.includes('src/app.js?v=' + APP_VERSION)
  },
  {
    file: 'src/app.js',
    apply(text) {
      return text.replace(/\.\.\/app-sync\.js\?v=\d+/, '../app-sync.js?v=' + APP_VERSION);
    },
    verify: text => text.includes('../app-sync.js?v=' + APP_VERSION)
  }
];

let failed = false;
for (const target of TARGETS) {
  const before = read(target.file);
  const after = target.apply(before);
  if (!target.verify(after)) {
    console.error('✗ ' + target.file + ': no se encontró el patrón a actualizar');
    failed = true;
    continue;
  }
  if (after !== before) {
    write(target.file, after);
    console.log('✓ ' + target.file + ' → v' + APP_VERSION);
  } else {
    console.log('· ' + target.file + ' ya estaba en v' + APP_VERSION);
  }
}

// Comprobación extra: todo módulo de src/ debe estar en la lista ASSETS del SW,
// o no estará disponible sin conexión.
const sw = read('sw.js');
// Las entradas de ASSETS son cadenas como './src/app.js': se quita la comilla inicial, el './' y la final.
const assets = (sw.match(/'\.\/[^']+'/g) || []).map(value => value.slice(3, -1));
const missing = [];
const walk = dir => {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const full = dir + '/' + entry.name;
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) {
      if (!assets.includes(full)) missing.push(full);
    }
  }
};
walk('src');
if (missing.length) {
  console.error('\n✗ Estos módulos no están en ASSETS de sw.js (no funcionarían sin conexión):');
  console.error('  Añádelos al final de la lista ASSETS de sw.js.');
  for (const ref of missing) console.error('  ' + ref);
  failed = true;
} else {
  console.log('✓ ASSETS de sw.js cubre todos los módulos de src/');
}

process.exit(failed ? 1 : 0);
