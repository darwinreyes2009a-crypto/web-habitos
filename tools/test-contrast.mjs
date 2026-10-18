/* Pares de color: la regla de contraste de la app, fijada.
 *
 * Comprueba dos cosas:
 *   1) Que cada par de color que la app pinta de verdad cumple WCAG 2.2 AA
 *      (4,5:1 texto normal; 3:1 texto grande y gráficos) en los cuatro temas:
 *      claro, oscuro, alto contraste claro y alto contraste oscuro.
 *      «Texto ampliado» (font-scale 1,1 / 1,2) no cambia ningún color, y al
 *      agrandar el texto el umbral baja a 3:1, así que quien aprueba a 4,5:1
 *      con la escala base también aprueba con la ampliada.
 *   2) Que las reglas siguen usando los tokens seguros: si alguien vuelve a
 *      escribir `background: var(--primary); color: #fff` (3,68:1 en oscuro)
 *      o a pintar el distintivo "AHORA" con un selector pisable, el test
 *      falla aunque los tokens estén bien.
 *
 * Uso: node tools/test-contrast.mjs   (también forma parte de test-all.js)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* Sin comentarios: si no, el bloque `:root` arrastra la cabecera del fichero
   y un comentario puede simular una regla que no existe. */
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

/* ---------- 1. Lectura de tokens por tema ---------------------------------- */

function bloques(css) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) out.push({ selector: m[1].trim().replace(/\s+/g, ' '), body: m[2] });
  return out;
}

function variables(body) {
  const map = {};
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(body))) map[m[1]] = m[2].trim();
  return map;
}

const css = leer('styles/tokens.css');
const todos = bloques(css);
const porSelector = (buscado) => {
  const bloque = todos.find(b => b.selector === buscado);
  if (!bloque) throw new Error('No se encontró el bloque «' + buscado + '» en styles/tokens.css');
  return variables(bloque.body);
};

const claro = porSelector(':root');
const oscuro = { ...claro, ...porSelector(':root[data-theme="dark"]') };
const claroAlto = { ...claro, ...porSelector(':root[data-contrast="high"]') };
const oscuroAlto = { ...oscuro, ...porSelector(':root[data-theme="dark"][data-contrast="high"]') };

const TEMAS = [
  { id: 'claro', vars: claro },
  { id: 'oscuro', vars: oscuro },
  { id: 'alto contraste (claro)', vars: claroAlto },
  { id: 'alto contraste (oscuro)', vars: oscuroAlto }
];

/* ---------- 2. Color: resolución, composición y contraste ------------------ */

function resolver(nombre, vars, profundo = 0) {
  if (profundo > 8) throw new Error('Referencia circular en ' + nombre);
  const bruto = vars[nombre];
  if (!bruto) throw new Error('Falta la variable ' + nombre);
  const varRef = bruto.match(/^var\((--[\w-]+)\)$/);
  if (varRef) return resolver(varRef[1], vars, profundo + 1);
  return bruto;
}

function aRgb(valor, vars) {
  const bruto = String(valor).trim();
  const varRef = bruto.match(/^var\((--[\w-]+)\)$/);
  // Admite tanto `var(--x)` como el nombre suelto `--x`, que es como se
  // declaran los pares más abajo.
  const texto = varRef ? resolver(varRef[1], vars) : (bruto.startsWith('--') ? resolver(bruto, vars) : bruto);
  const hex = texto.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }
  const rgb = texto.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const p = rgb[1].split(',').map(n => parseFloat(n));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  throw new Error('Color no reconocido: ' + texto);
}

const encima = (fg, bg) => ({
  r: fg.r * fg.a + bg.r * (1 - fg.a),
  g: fg.g * fg.a + bg.g * (1 - fg.a),
  b: fg.b * fg.a + bg.b * (1 - fg.a),
  a: 1
});

const canal = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const luminancia = c => 0.2126 * canal(c.r) + 0.7152 * canal(c.g) + 0.0722 * canal(c.b);

function contraste(a, b) {
  const la = luminancia(a), lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* Fondo: un token tal cual, o un tinte translúcido compuesto sobre otro. */
function fondo(desc, vars) {
  if (typeof desc === 'string') return aRgb(desc, vars);
  return encima(aRgb(desc.tinte, vars), aRgb(desc.sobre, vars));
}

/* ---------- 3. Los pares que la app pinta de verdad ------------------------ */

const PARES = [
  // Texto sobre superficies (tokens.css: --text / --text-2 / --text-3)
  { fg: '--text', bg: '--bg', min: 4.5, donde: 'Cuerpo sobre el lienzo' },
  { fg: '--text', bg: '--surface', min: 4.5, donde: 'Títulos y texto sobre tarjetas' },
  { fg: '--text', bg: '--surface-2', min: 4.5, donde: 'Texto en zonas hundidas (chips, campos)' },
  { fg: '--text-2', bg: '--surface', min: 4.5, donde: 'Subtítulos de cabecera (.scr-head .sub, sobre la banda)' },
  { fg: '--text-2', bg: '--surface', min: 4.5, donde: 'Metadatos de fila (.r-sub)' },
  { fg: '--text-2', bg: '--surface-2', min: 4.5, donde: 'Pistas de formulario (.field-hint)' },
  { fg: '--text-3', bg: '--surface', min: 4.5, donde: 'Etiquetas pequeñas y placeholders' },
  { fg: '--text-3', bg: '--surface-2', min: 4.5, donde: 'Pista de gesto y pies sobre superficie hundida' },

  // Primario como texto e icono (a, .link, foco)
  { fg: '--primary', bg: '--bg', min: 4.5, donde: 'Enlaces sobre el lienzo' },
  { fg: '--primary', bg: '--surface', min: 4.5, donde: 'Enlaces (.link) y foco sobre tarjetas' },
  { fg: '--primary', bg: '--surface-2', min: 4.5, donde: 'Enlaces sobre superficie hundida' },
  { fg: '--primary-ink', bg: '--surface', min: 4.5, donde: 'btn-secondary y nav activo' },
  { fg: '--primary-ink', bg: { tinte: '--primary-soft', sobre: '--surface' }, min: 4.5, donde: '.chip.on, .cls-tab.on, .icon-opt.on' },
  { fg: '--primary-ink', bg: { tinte: '--primary-softer', sobre: '--surface' }, min: 4.5, donde: 'Tinte marcado (.icon-opt.on, bordes)' },

  // Relleno sólido con texto claro encima (botones, badges, FAB)
  { fg: '--on-primary', bg: '--primary-solid', min: 4.5, donde: '.btn-primary, .nav-badge, .fab, .banner button, día/calendario sel.' },
  { fg: '--on-primary', bg: '--primary-solid-hover', min: 4.5, donde: 'Hover del botón primario' },
  { fg: '--primary-solid', bg: '--surface', min: 3, donde: 'Relleno como componente (borde visual)' },

  // Rellenos de estado
  { fg: '--on-danger', bg: '--danger', min: 4.5, donde: 'Distintivo "AHORA" (.now-hero .now-badge)' },
  { fg: '--on-muted', bg: '--text-3', min: 4.5, donde: 'Distintivo "DESPUÉS" (.now-badge.idle)' },
  { fg: '--on-green', bg: '--green', min: 3, donde: 'Marca de hecho (.row-check.done) — gráfico' },
  { fg: '--green', bg: '--surface', min: 4.5, donde: 'Texto verde de estado y rachas' },
  { fg: '--amber', bg: '--surface', min: 4.5, donde: 'Texto ámbar (patio, avisos)' },
  { fg: '--danger', bg: '--surface', min: 4.5, donde: 'Texto de peligro y "Fallo"' },
  { fg: '--green', bg: { tinte: '--green-soft', sobre: '--surface' }, min: 4.5, donde: 'Chips de estado y tarjeta completada' },
  { fg: '--amber', bg: { tinte: '--amber-soft', sobre: '--surface' }, min: 4.5, donde: 'Fila de patio y estados saltados' },
  { fg: '--danger', bg: { tinte: '--danger-soft', sobre: '--surface' }, min: 4.5, donde: 'btn-danger y control fallado' },

  // Avisos flotantes
  { fg: '--toast-fg', bg: '--toast-bg', min: 4.5, donde: 'Toast' }
];

/* ---------- 4. Contrato: las reglas deben usar los tokens seguros ---------- */

function reglasDe(rel) {
  return bloques(leer(rel)).map(b => ({ ...b, archivo: rel }));
}

const reglas = ['styles/tokens.css', 'styles/components.css', 'styles/features.css'].flatMap(reglasDe);

const violaciones = [];
for (const regla of reglas) {
  const fondoPrimario = /background(?:-color)?:\s*var\(--primary\)(?![\w-])/.test(regla.body);
  const fondoVerde = /background(?:-color)?:\s*var\(--green\)(?![\w-])/.test(regla.body);
  const tintaClara = /color:\s*#fff\b/i.test(regla.body);
  if (fondoPrimario && tintaClara) {
    violaciones.push(`${regla.archivo} · ${regla.selector} → relleno var(--primary) con texto #fff (usa --primary-solid / --on-primary)`);
  }
  if (fondoVerde && tintaClara) {
    violaciones.push(`${regla.archivo} · ${regla.selector} → relleno var(--green) con texto #fff (usa --on-green)`);
  }
}

function exige(selector, fragmento, mensaje) {
  const regla = reglas.find(r => r.selector.includes(selector));
  if (!regla) { violaciones.push('No existe la regla «' + selector + '» (' + mensaje + ')'); return; }
  if (!regla.body.includes(fragmento)) {
    violaciones.push(`styles/*.css · ${selector} → falta «${fragmento}» (${mensaje})`);
  }
}

exige('.btn-primary', 'var(--primary-solid)', 'el botón primario debe usar el relleno con contraste garantizado');
exige('.now-hero .now-badge', 'var(--on-danger)', 'el distintivo AHORA necesita selector específico y tinta --on-danger');
exige('.row-check.done::after', 'var(--on-green)', 'la marca de hecho debe pintarse con --on-green');
exige('.cls-tab.on', 'var(--primary-ink)', 'la pestaña activa de Modo Clase debe usar tinta --primary-ink');

// El selector específico tiene que ganarle a `.now-hero span`.
const badge = reglas.find(r => r.selector.includes('.now-hero .now-badge'));
if (badge && /\.now-hero \.now-badge\b/.test(badge.selector) === false) {
  violaciones.push('El distintivo "AHORA" vuelve a quedar pisado por .now-hero span');
}

// Los tokens nuevos deben existir en los dos temas.
const claves = ['--primary-solid', '--primary-solid-hover', '--on-primary', '--on-danger', '--on-muted', '--on-green'];
for (const clave of claves) {
  if (!claro[clave]) violaciones.push('Falta ' + clave + ' en el tema claro');
  if (!oscuro[clave]) violaciones.push('Falta ' + clave + ' en el tema oscuro');
}

/* ---------- 5. Ejecución ----------------------------------------------------*/

let fallos = 0;
console.log('\n### Contraste de pares de color (WCAG 2.2 AA)');

for (const par of PARES) {
  for (const tema of TEMAS) {
    let fg, bg, ratio;
    try {
      fg = aRgb(par.fg, tema.vars);
      bg = fondo(par.bg, tema.vars);
      ratio = contraste(fg.a < 1 ? encima(fg, bg) : fg, bg);
    } catch (error) {
      console.log(`  FAIL ${tema.id} · ${par.donde} → ${error.message}`);
      fallos++;
      continue;
    }
    const redondeado = Math.round(ratio * 100) / 100;
    if (redondeado < par.min) {
      console.log(`  FAIL ${tema.id} · ${par.donde} → ${redondeado}:1 (mínimo ${par.min}:1)`);
      fallos++;
    }
  }
}

const total = PARES.length * TEMAS.length;
console.log(`  OK   ${total - fallos}/${total} comprobaciones de contraste en ${TEMAS.length} temas`);

if (violaciones.length) {
  console.log('\n### Contrato de selectores');
  for (const violacion of violaciones) console.log('  FAIL ' + violacion);
  fallos += violaciones.length;
} else {
  console.log('  OK   las reglas usan los tokens seguros (ningún relleno primario/verde con #fff)');
}

if (fallos) {
  console.error(`\n${fallos} incumplimiento(s) de contraste.`);
  process.exit(1);
}
console.log('Todo correcto (contraste)\n');
