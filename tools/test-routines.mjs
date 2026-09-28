/* Banco de pruebas del núcleo de rutinas (src/core/routines.js): tipos de
   hábito, valores registrados, días saltados, recurrencia avanzada, rachas,
   objetivo semanal y heatmap anual.

   Se importa el módulo real, así que lo que se prueba es el código de
   producción.

   Uso: node tools/test-routines.mjs
*/
import { registerRoutines } from '../src/core/routines.js';

/* ---------- aserciones ----------------------------------------------------- */
let fallos = 0;
let total = 0;
const comprueba = (etiqueta, ok, detalle) => {
  total++;
  console.log((ok ? '  OK  ' : ' FALLO') + ' ' + etiqueta + (ok ? '' : '  -> ' + JSON.stringify(detalle)));
  if (!ok) fallos++;
};
const seccion = titulo => console.log('\n== ' + titulo + ' ==');

/* ---------- dobles de fechas y app ---------------------------------------- */
const pad = n => String(n).padStart(2, '0');
const toYmd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parseYmd = v => new Date(v + 'T00:00:00');
const HOY = '2026-09-28';                 // lunes
let HOY_REAL = HOY;
const app = {
  core: {
    todayStr: () => HOY_REAL,
    parseYmd,
    toYmd,
    addDaysYmd(ymd, n) { const d = parseYmd(ymd); d.setDate(d.getDate() + n); return toYmd(d); },
    dowIdx: ymd => (parseYmd(ymd).getDay() + 6) % 7,
    weekStartOf(ymd) { const d = parseYmd(ymd); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return toYmd(d); },
    fmtShort: ymd => String(ymd).slice(8, 10) + '/' + String(ymd).slice(5, 7),
    WEEK_FULL: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
  },
  state: { S: { tasks: [] } }
};
registerRoutines(app);
const R = app.core;

const tarea = extra => Object.assign({ id: 't', title: 'X', freq: { type: 'daily' }, completions: [], createdAt: '2026-01-01' }, extra);

/* ---------- compatibilidad con el modelo viejo ----------------------------- */
seccion('modelo antiguo: solo completions');
const vieja = tarea({ completions: ['2026-09-27', '2026-09-26'] });
comprueba('un día en completions vale 1', R.logOf(vieja, '2026-09-27') === 1, R.logOf(vieja, '2026-09-27'));
comprueba('un día que no está vale 0', R.logOf(vieja, '2026-09-25') === 0, null);
comprueba('se reconoce como hecho', R.isDoneOn(vieja, '2026-09-27') === true, null);
comprueba('sin kind es de tipo check', R.kindOf(vieja) === 'check', R.kindOf(vieja));
comprueba('toggle añade a completions', (R.toggleOn(vieja, '2026-09-25'), vieja.completions.includes('2026-09-25')), vieja.completions);
comprueba('toggle quita de completions', (R.toggleOn(vieja, '2026-09-25'), !vieja.completions.includes('2026-09-25')), vieja.completions);

/* ---------- contador y cantidad -------------------------------------------- */
seccion('tipo contador y cantidad');
const vasos = tarea({ kind: 'count', target: 2 });
R.bumpOn(vasos, '2026-09-28', 1);
comprueba('con 1 de 2 no está hecho', R.isDoneOn(vasos, '2026-09-28') === false, R.logOf(vasos, '2026-09-28'));
comprueba('con 1 de 2 es parcial', R.progressOn(vasos, '2026-09-28').partial === true, R.progressOn(vasos, '2026-09-28'));
comprueba('con 1 de 2 el progreso es la mitad', R.progressOn(vasos, '2026-09-28').ratio === 0.5, R.progressOn(vasos, '2026-09-28'));
R.bumpOn(vasos, '2026-09-28', 1);
comprueba('con 2 de 2 está hecho', R.isDoneOn(vasos, '2026-09-28') === true, R.logOf(vasos, '2026-09-28'));
comprueba('el día sigue listado en completions', vasos.completions.includes('2026-09-28'), vasos.completions);
R.bumpOn(vasos, '2026-09-28', -1);
comprueba('un día parcial sigue listado como tocado', vasos.completions.includes('2026-09-28'), vasos.completions);
comprueba('pero no cuenta como hecho', R.isDoneOn(vasos, '2026-09-28') === false, null);
comprueba('el valor guardado es 1', R.logOf(vasos, '2026-09-28') === 1, vasos.log);
comprueba('toggle con objetivo lo sube entero', (R.toggleOn(vasos, '2026-09-28'), R.logOf(vasos, '2026-09-28') === 2), R.logOf(vasos, '2026-09-28'));
comprueba('toggle estando lleno lo vacía', (R.toggleOn(vasos, '2026-09-28'), R.logOf(vasos, '2026-09-28') === 0), R.logOf(vasos, '2026-09-28'));
const paginas = tarea({ kind: 'amount', target: 30, unit: 'páginas' });
R.setLog(paginas, '2026-09-28', 15);
comprueba('la cantidad parcial no cuenta como día hecho', R.isDoneOn(paginas, '2026-09-28') === false, null);
comprueba('pero sí como día con registro', R.hasEntryOn(paginas, '2026-09-28') === true, null);
comprueba('a 30 sí está hecho', (R.setLog(paginas, '2026-09-28', 30), R.isDoneOn(paginas, '2026-09-28') === true), null);
comprueba('sin objetivo, con 1 basta', (() => { const t = tarea({ kind: 'count' }); R.bumpOn(t, '2026-09-28', 1); return R.isDoneOn(t, '2026-09-28'); })(), null);
comprueba('el valor nunca baja de cero', (() => { const t = tarea({ kind: 'count', target: 2 }); R.bumpOn(t, '2026-09-28', -5); return R.logOf(t, '2026-09-28') === 0; })(), null);
comprueba('un registro numérico restaura el día saltado antes de sumar', (() => { const t = tarea({ kind: 'count', target: 2, skips: ['2026-09-28'] }); R.bumpOn(t, '2026-09-28', 1); return R.logOf(t, '2026-09-28') === 1 && !R.isSkipped(t, '2026-09-28'); })(), null);
comprueba('una rutina check no admite cambiar el registro durante un día saltado', (() => { const t = tarea({ skips: ['2026-09-28'] }); R.toggleOn(t, '2026-09-28'); return !t.completions.includes('2026-09-28'); })(), null);
comprueba('un contador no puede restablecer un día saltado al restar', (() => { const t = tarea({ kind: 'count', skips: ['2026-09-28'] }); R.bumpOn(t, '2026-09-28', -1); return R.isSkipped(t, '2026-09-28') && R.logOf(t, '2026-09-28') === 0; })(), null);
comprueba('un día numérico saltado se restaura al empezar a sumar', (() => { const t = tarea({ kind: 'count', skips: ['2026-09-28'] }); R.bumpOn(t, '2026-09-28', 1); return !R.isSkipped(t, '2026-09-28') && R.logOf(t, '2026-09-28') === 1; })(), null);
comprueba('limpiar un día de evitar elimina el fallo aunque estuviera saltado', (() => { const t = tarea({ kind: 'avoid', completions: ['2026-09-28'], skips: ['2026-09-28'] }); R.clearDay(t, '2026-09-28'); return !R.isSkipped(t, '2026-09-28') && !t.completions.includes('2026-09-28') && R.isDoneOn(t, '2026-09-28'); })(), null);

/* ---------- tipo evitar ----------------------------------------------------- */
seccion('tipo evitar');
const fumar = tarea({ kind: 'avoid', completions: [] });
comprueba('un día limpio cuenta como bueno', R.isDoneOn(fumar, '2026-09-28') === true, null);
R.toggleOn(fumar, '2026-09-28');
comprueba('al marcarlo, ese día deja de estar bueno', R.isDoneOn(fumar, '2026-09-28') === false, null);
R.toggleOn(fumar, '2026-09-28');
comprueba('al desmarcarlo vuelve a estar bueno', R.isDoneOn(fumar, '2026-09-28') === true, null);
comprueba('el smoke test se puede saltar igual', (R.skipOn(fumar, '2026-09-28', true), R.isDoneOn(fumar, '2026-09-28') === false), null);
comprueba('al saltar hoy deja de contar como fallo si se restaura', (() => {
  const t = tarea({ kind: 'avoid', completions: ['2026-09-28'] });
  R.skipOn(t, '2026-09-28', true);
  R.skipOn(t, '2026-09-28', false);
  return R.isDoneOn(t, '2026-09-28') && !t.completions.includes('2026-09-28');
})(), null);
const noDomingo = tarea({ kind: 'avoid', freq: { type: 'weekly', days: [0] }, completions: [] });
comprueba('no se puede saltar un día en que no toca', !R.skipOn(noDomingo, '2026-09-27', true) && !R.isSkipped(noDomingo, '2026-09-27'), noDomingo.skips);

/* ---------- días saltados -------------------------------------------------- */
seccion('días saltados');
const conSalto = tarea({ completions: ['2026-09-26', '2026-09-27', '2026-09-28'] });
R.skipOn(conSalto, '2026-09-27', true);
comprueba('el día saltado no es un fallo', R.isDoneOn(conSalto, '2026-09-27') === false && R.isSkipped(conSalto, '2026-09-27'), null);
comprueba('la racha no se rompe por un salto', R.streakOf(conSalto) === 2, R.streakOf(conSalto));
comprueba('sin el salto, el 27 sí cuenta y la racha es 3', (R.skipOn(conSalto, '2026-09-27', false), R.streakOf(conSalto) === 3), R.streakOf(conSalto));
R.skipOn(conSalto, '2026-09-27', true);
comprueba('un salto tampoco cuenta como día con registro', R.hasEntryOn(conSalto, '2026-09-27') === false, null);
R.skipOn(conSalto, '2026-09-27', false);
comprueba('quitar el salto lo restaura', R.isSkipped(conSalto, '2026-09-27') === false, null);
comprueba('clearDay borra el registro y el salto', (R.skipOn(conSalto, '2026-09-26', true), R.clearDay(conSalto, '2026-09-26'), R.isSkipped(conSalto, '2026-09-26') === false && R.logOf(conSalto, '2026-09-26') === 0), null);

/* ---------- recurrencia avanzada ------------------------------------------- */
seccion('recurrencia avanzada');
const cada3 = tarea({ freq: { type: 'every', every: 3, from: '2026-09-28' } });
comprueba('el día de arranque toca', R.isDueOn(cada3, '2026-09-28') === true, null);
comprueba('un día después no toca', R.isDueOn(cada3, '2026-09-29') === false, null);
comprueba('tres días después vuelve a tocar', R.isDueOn(cada3, '2026-10-01') === true, null);
comprueba('antes de empezar no toca', R.isDueOn(cada3, '2026-09-25') === false, null);
const laborables = tarea({ freq: { type: 'weekdays' } });
comprueba('el lunes toca', R.isDueOn(laborables, '2026-09-28') === true, null);
comprueba('el sábado no toca', R.isDueOn(laborables, '2026-10-03') === false, null);
comprueba('el domingo no toca', R.isDueOn(laborables, '2026-10-04') === false, null);
const miercoles = tarea({ freq: { type: 'weekdays', days: [2] } });
comprueba('con días concretos, el miércoles sí', R.isDueOn(miercoles, '2026-09-30') === true, null);
comprueba('con días concretos, el lunes no', R.isDueOn(miercoles, '2026-09-28') === false, null);
const hasta = tarea({ freq: { type: 'daily', until: '2026-09-30' } });
comprueba('hasta la fecha sí toca', R.isDueOn(hasta, '2026-09-30') === true, null);
comprueba('pasada la fecha ya no toca', R.isDueOn(hasta, '2026-10-01') === false, null);
comprueba('el texto de la recurrencia menciona el final', /hasta el/.test(R.freqText(hasta)), R.freqText(hasta));
const desde = tarea({ freq: { type: 'daily', from: '2026-10-01' } });
comprueba('con "desde" no toca antes', R.isDueOn(desde, '2026-09-28') === false, null);
comprueba('con "desde" toca a partir de ahí', R.isDueOn(desde, '2026-10-01') === true, null);
comprueba('el texto menciona el arranque', /desde el/.test(R.freqText(desde)), R.freqText(desde));
comprueba('el texto de "cada N días" sale bien', R.freqText(cada3) === 'Cada 3 días', R.freqText(cada3));
const creadoHoy = tarea({ createdAt: HOY, completions: [] });
comprueba('una rutina no estaba prevista antes de crearse', !R.isDueOn(creadoHoy, '2026-09-27') && !R.isDoneOn(creadoHoy, '2026-09-27'), null);
comprueba('el heatmap no atribuye cumplimiento antes de crear la rutina', (() => {
  const map = R.heatmapData(creadoHoy, 2026).weeks.flat();
  return map.every(day => day.ymd >= HOY || (!day.done && !day.due));
})(), null);
comprueba('un hábito evitar antiguo no marca como limpios días previos al alta', !R.isDoneOn(tarea({ kind: 'avoid', createdAt: HOY }), '2026-09-27'), null);
comprueba('el heatmap deja vacíos los días de evitar previos al alta', (() => {
  const map = R.heatmapData(tarea({ kind: 'avoid', createdAt: HOY }), 2026).weeks.flat();
  return map.every(day => day.ymd >= HOY || (!day.done && !day.due && !day.skipped));
})(), null);
comprueba('el texto del contador incluye el objetivo', /2 veces al día/.test(R.freqText(tarea({ kind: 'count', target: 2 }))), R.freqText(tarea({ kind: 'count', target: 2 })));
comprueba('el texto de la cantidad incluye la unidad', /30 páginas al día/.test(R.freqText(paginas)), R.freqText(paginas));

/* ---------- rachas ---------------------------------------------------------- */
seccion('rachas');
const racha = tarea({});
R.setLog(racha, '2026-09-26', 1);
R.setLog(racha, '2026-09-27', 1);
R.setLog(racha, '2026-09-28', 1);
R.setLog(racha, '2026-09-25', 1);
comprueba('la racha cuenta hacia atrás', R.streakOf(racha) === 4, R.streakOf(racha));
R.clearDay(racha, '2026-09-27');
comprueba('fallar un día la corta', R.streakOf(racha) === 1, R.streakOf(racha));
comprueba('la mejor racha histórica mira más allá del fallo', R.bestStreakOf(racha) === 2, R.bestStreakOf(racha));
comprueba('la racha de días lectivos ignora el finde', (() => {
  const t = tarea({});
  R.setLog(t, '2026-09-25', 1);   // viernes
  R.setLog(t, '2026-09-28', 1);   // lunes
  return R.weekdayStreakOf(t) === 2;
})(), null);
comprueba('un domingo no rompe la racha de laborables', (() => {
  HOY_REAL = '2026-09-27';       // domingo
  const t = tarea({});
  R.setLog(t, '2026-09-25', 1);   // viernes
  const r = R.weekdayStreakOf(t);
  HOY_REAL = HOY;
  return r === 1;
})() === true, 'la racha de laborables debe ser 1 desde un domingo');

/* ---------- objetivo semanal ------------------------------------------------ */
seccion('objetivo semanal');
// Hoy es lunes, así que la semana en curso solo tiene un día recorrido: para
// medir el objetivo se usa la semana pasada, que ya está entera.
const meta = tarea({ goal: 5 });
R.setLog(meta, '2026-09-21', 1);
R.setLog(meta, '2026-09-22', 1);
R.setLog(meta, '2026-09-23', 1);
const semana = R.weekProgress(meta, -1);
comprueba('el objetivo semanal cuenta lo hecho', semana.done === 3, semana);
comprueba('el objetivo semanal son 5', semana.goal === 5, semana);
comprueba('el progreso es 3 de 5', semana.ratio === 0.6, semana);
comprueba('la semana en curso solo cuenta hasta hoy', R.weekProgress(meta, 0).due === 1, R.weekProgress(meta, 0));
comprueba('no cuenta días futuros', (() => {
  R.setLog(meta, '2026-09-30', 1);   // miércoles de la semana en curso, aún futuro
  return R.weekProgress(meta, 0).done === 0;
})(), R.weekProgress(meta, 0));
comprueba('sin objetivo el progreso es 0', R.weekProgress(tarea({}), 0).ratio === 0, null);
comprueba('el objetivo de la semana pasada se guarda', semana.end === '2026-09-27', semana);

/* ---------- heatmap anual --------------------------------------------------- */
seccion('heatmap anual');
const anual = tarea({ createdAt: '2026-01-05' });
R.setLog(anual, '2026-03-01', 1);
R.setLog(anual, '2026-03-02', 1);
R.skipOn(anual, '2026-03-03', true);
const mapa = R.heatmapData(anual, 2026);
const dias = mapa.weeks.flat();
comprueba('el heatmap cubre el año', dias.length >= 364, dias.length);
comprueba('marca los días cumplidos', dias.filter(d => d.done).length === 2, dias.filter(d => d.done).length);
comprueba('marca los saltados', dias.some(d => d.skipped && d.ymd === '2026-03-03'), null);
comprueba('no inventa días anteriores a la creación', dias.every(d => !d.done || d.ymd >= '2026-01-05'), null);
comprueba('marca los días futuros como futuros', dias.some(d => d.future), null);
comprueba('los días previos a crearse no cuentan como previstos', dias.every(d => !d.due || d.ymd >= '2026-01-05'), null);
comprueba('un año distinto viene vacío', R.heatmapData(anual, 2025).weeks.flat().every(d => !d.done), null);

/* ---------- hábitos en riesgo ---------------------------------------------- */
seccion('hábitos en riesgo');
const parado = tarea({ id: 'parado', title: 'Parado', createdAt: '2026-01-01' });
R.setLog(parado, '2026-09-20', 1);   // último cumplimiento hace 8 días
// `meta` solo se cumplió la semana pasada, así que hoy también está en riesgo.
app.state.S.tasks = [parado, meta, tarea({ id: 'al dia', freq: { type: 'daily' }, completions: [HOY] })];
const riesgo = R.atRisk(3);
comprueba('detecta el hábito parado', riesgo.some(r => r.task.id === 'parado'), riesgo.map(r => r.task.id));
comprueba('detecta también el que lleva hoy sin hacer', riesgo.some(r => r.task.id === 't'), riesgo.map(r => r.task.id));
comprueba('cuenta los días sin cumplir', riesgo.filter(r => r.task.id === 'parado')[0].missed >= 3, riesgo.filter(r => r.task.id === 'parado')[0].missed);
comprueba('no marca los que van al día', !riesgo.some(r => r.task.id === 'al dia'), null);
comprueba('saltar los días pendientes evita la alerta', (() => {
  // Se saltan todos los días desde el último cumplimiento: el aviso desaparece.
  const dias = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28'];
  for (const ymd of dias) R.skipOn(parado, ymd, true);
  const r = R.atRisk(3).every(x => x.task.id !== 'parado');
  for (const ymd of dias) R.skipOn(parado, ymd, false);
  return r;
})(), null);
comprueba('las tareas de un solo día no se alertan', (() => {
  const una = tarea({ id: 'una', freq: { type: 'once', date: '2026-01-05' } });
  app.state.S.tasks = [una];
  return R.atRisk(1).length === 0;
})(), null);

console.log('\n' + (fallos ? fallos + ' de ' + total + ' comprobaciones fallidas' : 'Todo correcto (' + total + ' comprobaciones)'));
process.exit(fallos ? 1 : 0);
