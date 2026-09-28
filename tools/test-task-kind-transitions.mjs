/* Pruebas del cambio de tipo y el registro por día de las rutinas. */
import { registerRoutines } from '../src/core/routines.js';

let fallos = 0;
let total = 0;
const comprueba = (etiqueta, ok, detalle) => {
  total++;
  console.log((ok ? '  OK  ' : ' FALLO') + ' ' + etiqueta + (ok ? '' : '  -> ' + JSON.stringify(detalle)));
  if (!ok) fallos++;
};
const pad = n => String(n).padStart(2, '0');
const toYmd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parseYmd = value => new Date(value + 'T00:00:00');
const app = {
  core: {
    todayStr: () => '2026-09-28',
    parseYmd,
    addDaysYmd(ymd, n) { const date = parseYmd(ymd); date.setDate(date.getDate() + n); return toYmd(date); },
    dowIdx: ymd => (parseYmd(ymd).getDay() + 6) % 7,
    weekStartOf: ymd => ymd,
    fmtShort: ymd => ymd
  },
  state: { S: { tasks: [] } }
};
registerRoutines(app);
const R = app.core;
const base = { id: 't', title: 'Hábito', createdAt: '2026-09-20', freq: { type: 'daily' }, completions: [] };

const check = { ...base, completions: ['2026-09-27'] };
R.prepareKindTransition(check, 'amount');
check.kind = 'amount';
check.target = 10;
comprueba('al cambiar sí/no a cantidad, las marcas check cuentan como una unidad', R.logOf(check, '2026-09-27') === 1 && R.isDoneOn(check, '2026-09-27') === false, check);
comprueba('el pasado de una rutina no se puede marcar como cumplido', R.toggleOn(check, '2026-09-19') === false && !check.completions.includes('2026-09-19'), check);
comprueba('el pasado de una rutina no cambia su registro numérico', R.bumpOn(check, '2026-09-19', 4) === 0 && R.logOf(check, '2026-09-19') === 0, check.log);
comprueba('una rutina no permite saltar un día en que no tocaba', R.skipOn(check, '2026-09-19', true) === false && !R.isSkipped(check, '2026-09-19'), check.skips);

const toAvoid = { ...base, kind: 'check', completions: ['2026-09-21', '2026-09-22'], log: { '2026-09-22': 4 }, skips: ['2026-09-21'] };
R.prepareKindTransition(toAvoid, 'avoid');
comprueba('al convertir una rutina en evitar, limpia checks, cantidades y log antiguos', !toAvoid.log && toAvoid.completions.length === 0 && toAvoid.skips.includes('2026-09-21'), toAvoid);
toAvoid.kind = 'avoid';
comprueba('evitar no considera éxito lo previo a su creación', R.isDoneOn(toAvoid, '2026-09-19') === false, null);
comprueba('el día de evitar se puede saltar', R.skipOn(toAvoid, '2026-09-25', true) && R.isSkipped(toAvoid, '2026-09-25'), toAvoid.skips);
comprueba('el día saltado no permite marcar un fallo hasta restaurarlo', R.toggleOn(toAvoid, '2026-09-25') === false && !toAvoid.completions.includes('2026-09-25'), toAvoid.completions);
R.skipOn(toAvoid, '2026-09-25', false);
comprueba('restaurar el día saltado deja el día de evitar limpio', R.isDoneOn(toAvoid, '2026-09-25'), null);
comprueba('una cantidad numérica restaurada se des-salta antes de sumar', (() => {
  const t = { ...base, kind: 'amount', target: 4, skips: ['2026-09-27'] };
  R.bumpOn(t, '2026-09-27', 1);
  return R.logOf(t, '2026-09-27') === 1 && !R.isSkipped(t, '2026-09-27');
})(), null);

const numeric = { ...base, kind: 'count', target: 3, unit: 'veces', log: { '2026-09-27': 2 }, completions: ['2026-09-27'] };
R.prepareKindTransition(numeric, 'check');
comprueba('al salir de numérico se limpia el registro numérico y conserva solo los días alcanzados', !numeric.log && numeric.target === undefined && numeric.unit === undefined && numeric.completions.length === 0, numeric);

console.log('\n' + (fallos ? fallos + ' de ' + total + ' comprobaciones fallidas' : 'Todo correcto (' + total + ' comprobaciones)'));
process.exit(fallos ? 1 : 0);
