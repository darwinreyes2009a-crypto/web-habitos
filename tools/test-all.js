/* Runner único: sintaxis de todos los módulos, coherencia de la versión y
   bancos de pruebas.

   Uso: node tools/test-all.js
   Devuelve código de salida 1 si algo falla, para poder fallar la CI.
*/
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');

/* `node --check un.js` no parsea un fichero como módulo ESM (el proyecto no
   tiene package.json con type=module), así que un error de sintaxis dentro de
   un módulo se escapa. Se comprueba sobre una copia .mjs, que sí se parsea
   como módulo. */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dailyhub-check-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} });

function checkModulo(file) {    const destino = path.join(tmp, file.replace(/[\\/]/g, '_').replace(/\.js$/, '') + '.mjs');
  fs.writeFileSync(destino, fs.readFileSync(path.join(RAIZ, file), 'utf8'), 'utf8');
  try {
    execFileSync(process.execPath, ['--check', destino], { cwd: RAIZ, stdio: 'pipe' });
  } catch (error) {
    const salida = (error.stderr ? error.stderr.toString() : '') + (error.stdout ? error.stdout.toString() : '');
    throw new Error(file + '\n' + salida.split('\n').filter(line => line.includes('.mjs') || line.includes('SyntaxError') || /\^\s*$/.test(line)).slice(0, 3).join('\n'));
  }
}

function modulos() {
  const out = ['app-sync.js', 'sw.js'];
  const walk = dir => {
    for (const entry of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = dir + '/' + entry.name;
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) out.push(full);
    }
  };
  walk('src');
  return out.sort();
}

const pasos = [
  {
    nombre: 'Sintaxis de los módulos',
    run: () => {
      for (const file of modulos()) checkModulo(file);
      console.log('  OK   ' + modulos().length + ' ficheros sin errores de sintaxis (parseados como módulos ES)');
    }
  },  { nombre: 'Coherencia de la versión y de la lista ASSETS del SW',
    run: () => {
      const salida = execFileSync(process.execPath, ['tools/sync-version.js'], { cwd: RAIZ, encoding: 'utf8' });
      process.stdout.write(salida.split('\n').map(line => '  ' + line + '\n').join(''));
    }
  },
  { nombre: 'Round-trip de class_slots (patio)', run: () => execFileSync(process.execPath, ['tools/test-patio-sync.js'], { cwd: RAIZ, stdio: 'inherit' }) },
  { nombre: 'Round-trip del calendario (vacaciones, cancelaciones, active)', run: () => execFileSync(process.execPath, ['tools/test-calendar-sync.js'], { cwd: RAIZ, stdio: 'inherit' }) },
  { nombre: 'Núcleo de rutinas (tipos, recurrencia, rachas, heatmap)', run: () => execFileSync(process.execPath, ['tools/test-routines.mjs'], { cwd: RAIZ, stdio: 'inherit' }) },
  { nombre: 'Transiciones de tipo y registros de rutina', run: () => execFileSync(process.execPath, ['tools/test-task-kind-transitions.mjs'], { cwd: RAIZ, stdio: 'inherit' }) },
  { nombre: 'Copia de seguridad portable', run: () => execFileSync(process.execPath, ['tools/test-backup.mjs'], { cwd: RAIZ, stdio: 'inherit' }) },
  { nombre: 'Lógica de calendario (huecos, solapes, carga, .ics)', run: () => execFileSync(process.execPath, ['tools/test-calendar-core.mjs'], { cwd: RAIZ, stdio: 'inherit' }) },
  { nombre: 'Importación de horarios CSV/TSV y solapes atómicos', run: () => execFileSync(process.execPath, ['tools/test-schedule-import.mjs'], { cwd: RAIZ, stdio: 'inherit' }) },
  { nombre: 'Round-trip de tareas y notas con columnas opcionales', run: () => execFileSync(process.execPath, ['tools/test-sync-enhancements.js'], { cwd: RAIZ, stdio: 'inherit' }) },
  { nombre: 'Vista previa de notas segura contra HTML', run: () => execFileSync(process.execPath, ['tools/test-notes-preview.mjs'], { cwd: RAIZ, stdio: 'inherit' }) },
  { nombre: 'Rutas de gestión de asignaturas en Modo Clase', run: () => execFileSync(process.execPath, ['tools/test-class-subject-routes.mjs'], { cwd: RAIZ, stdio: 'inherit' }) },
  { nombre: 'Agrupación diaria de clases en Ahora mismo, Después y Más tarde', run: () => execFileSync(process.execPath, ['tools/test-class-agenda-groups.mjs'], { cwd: RAIZ, stdio: 'inherit' }) },
  { nombre: 'Notas rápidas de Modo Clase y compatibilidad con datos antiguos', run: () => execFileSync(process.execPath, ['tools/test-class-quick-notes.mjs'], { cwd: RAIZ, stdio: 'inherit' }) },
  { nombre: 'Ejecución guiada y progreso diario de actividades', run: () => execFileSync(process.execPath, ['tools/test-guided-activities.mjs'], { cwd: RAIZ, stdio: 'inherit' }) },
  { nombre: 'Configuración guiada y actualización visible en todos los tipos de hábito', run: () => execFileSync(process.execPath, ['tools/test-guided-activity-ui.mjs'], { cwd: RAIZ, stdio: 'inherit' }) },
  { nombre: 'Tarjetas personalizadas en Actividades', run: () => execFileSync(process.execPath, ['tools/test-activity-cards.mjs'], { cwd: RAIZ, stdio: 'inherit' }) }
];

let fallos = 0;
for (const paso of pasos) {
  console.log('\n### ' + paso.nombre);
  try {
    paso.run();
  } catch (error) {
    console.error('  FALLO ' + paso.nombre);
    console.error(String((error && error.message) || error).split('\n').map(line => '  ' + line).join('\n'));
    fallos++;
  }
}

console.log('\n' + '='.repeat(56));
if (fallos) {
  console.log(fallos + ' de ' + pasos.length + ' pasos han fallado');
  process.exit(1);
}
console.log('Los ' + pasos.length + ' pasos pasan');
