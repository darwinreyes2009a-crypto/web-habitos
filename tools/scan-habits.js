const fs = require('fs');
const path = require('path');
const root = process.argv[2] || process.cwd();
const favs = ['Bajar al perro', 'Dientes', 'Ducha', 'Hacer gemelo', 'Limpiar', 'Sérum', 'Dermarroller', 'Serum'];
const out = [];
function walk(dir) {
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.js')) continue;
      try {
        const t = fs.readFileSync(p, 'utf8');
        for (const f of favs) {
          if (new RegExp(`\\b${f.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`).test(t)) {
            out.push(`${p} :: ${f}`);
          }
        }
      } catch {}
    }
  } catch {}
}
walk(root);
out.forEach(x => console.log(x));
