/* Banco de pruebas del plan del día (src/core/dayplan.js): qué bloque toca
   ahora (clases + hábitos con hora), el siguiente bloque, el cruce de
   medianoche, el estado sin nada programado y el cálculo de la racha de días
   completos.

   El módulo es puro, así que se prueba el código real sin DOM ni reloj.

   Uso: node tools/test-dayplan.mjs
*/
import { registerDayPlan } from '../src/core/dayplan.js';

/* ---------- aserciones ----------------------------------------------------- */
let fallos = 0;
let total = 0;
const comprueba = (etiqueta, ok, detalle) => {
  total++;
  console.log((ok ? '  OK  ' : ' FALLO') + ' ' + etiqueta + (ok ? '' : '  -> ' + JSON.stringify(detalle)));
  if (!ok) fallos++;
};
const seccion = titulo => console.log('\n== ' + titulo + ' ==');

/* ---------- app mínima ----------------------------------------------------- */
const app = { core: {} };
registerDayPlan(app);
const D = app.core;

const pad = value => String(value).padStart(2, '0');
const ymd = date => date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
const parse = value => new Date(value + 'T00:00:00');
const addDaysYmd = (value, days) => {
  const date = parse(value);
  date.setDate(date.getDate() + days);
  return ymd(date);
};

const slot = (id, start, end) => ({ id, start, end });
const tarea = (id, time, extra) => Object.assign({
  id, title: id, time, freq: { type: 'daily' }, completions: [], createdAt: '2026-01-01'
}, extra);

const HOY = '2026-11-16'; // lunes

/* ---------- horas y bloques ------------------------------------------------ */
seccion('horas y cruce de medianoche');
comprueba('09:05 son 545 minutos', D.hmToMinutes('09:05') === 545, D.hmToMinutes('09:05'));
comprueba('una hora inválida no es un bloque', D.hmToMinutes('25:00') === null, D.hmToMinutes('25:00'));
comprueba('un bloque normal conserva su fin', JSON.stringify(D.blockBounds({ start: '10:00', end: '11:30' })) === JSON.stringify({ start: 600, end: 690 }), D.blockBounds({ start: '10:00', end: '11:30' }));
const nocturno = D.blockBounds({ start: '23:30', end: '00:30' });
comprueba('23:30–00:30 termina al día siguiente', nocturno.start === 1410 && nocturno.end === 1470, nocturno);

/* ---------- construcción -------------------------------------------------- */
seccion('bloques del día');
const bloques = D.buildDayBlocks({
  slots: [slot('c1', '10:00', '11:00'), slot('c2', '15:00', '16:00')],
  tasks: [tarea('h1', '09:00'), tarea('h2', '10:00'), tarea('sin-hora', '')],
  ymd: HOY,
  isDueOn: task => task.id !== 'h2'
});
comprueba('solo entran los hábitos que tocan hoy y tienen hora', bloques.length === 3 && !bloques.some(b => b.id === 'h2' || b.id === 'sin-hora'), bloques.map(b => b.id));
comprueba('los bloques van ordenados por hora', bloques.map(b => b.start).join(',') === '540,600,900', bloques.map(b => b.start));
comprueba('la clase y el hábito conservan su tipo', bloques.some(b => b.kind === 'habit' && b.id === 'h1') && bloques.some(b => b.kind === 'class' && b.id === 'c1'), bloques.map(b => b.kind));

/* ---------- selección del bloque actual ----------------------------------- */
seccion('bloque actual');
const agenda = D.buildDayBlocks({
  slots: [slot('clase', '10:00', '11:00'), slot('tarde', '15:00', '16:00')],
  tasks: [tarea('desayuno', '08:00')],
  ymd: HOY
});
const enClase = D.pickDayBlock(agenda, 10 * 60 + 15);
comprueba('a las 10:15 la clase de 10:00 está en curso', enClase.current && enClase.current.id === 'clase', enClase.current && enClase.current.id);
comprueba('el siguiente bloque es el de la tarde', enClase.next && enClase.next.id === 'tarde', enClase.next && enClase.next.id);

const enHabito = D.pickDayBlock(agenda, 8 * 60 + 40);
comprueba('un hábito sigue en curso dentro de su franja', enHabito.current && enHabito.current.id === 'desayuno', enHabito.current && enHabito.current.id);
const fueraDeFranja = D.pickDayBlock(agenda, 12 * 60);
comprueba('fuera de la franja no hay bloque actual', fueraDeFranja.current === null, fueraDeFranja.current);
comprueba('pero sí se anuncia el siguiente con su hora', fueraDeFranja.next && fueraDeFranja.next.start === 900, fueraDeFranja.next && fueraDeFranja.next.start);

const sinNadaAhora = D.pickDayBlock(agenda, 13 * 60);
comprueba('nada programado ahora devuelve siguiente, no un bloque roto', sinNadaAhora.current === null && sinNadaAhora.next && sinNadaAhora.next.id === 'tarde', sinNadaAhora);
const terminado = D.pickDayBlock(agenda, 22 * 60);
comprueba('cuando ya pasó todo no hay actual ni siguiente', terminado.current === null && terminado.next === null, terminado);

const empate = D.pickDayBlock(D.buildDayBlocks({
  slots: [slot('clase', '10:00', '11:00')],
  tasks: [tarea('habito', '10:00')],
  ymd: HOY
}), 10 * 60 + 5);
comprueba('si coinciden, la clase tiene prioridad', empate.current && empate.current.kind === 'class', empate.current && empate.current.kind);

/* ---------- cruce de medianoche ------------------------------------------- */
seccion('cruce de medianoche');
const madrugada = D.buildDayBlocks({ slots: [slot('noche', '23:30', '00:30')], tasks: [], ymd: HOY });
comprueba('a las 23:45 la clase nocturna está en curso', D.pickDayBlock(madrugada, 23 * 60 + 45).current.id === 'noche', D.pickDayBlock(madrugada, 23 * 60 + 45).current);
comprueba('a las 00:15 sigue siendo el bloque de ahora', D.pickDayBlock(madrugada, 15).current.id === 'noche', D.pickDayBlock(madrugada, 15).current);
comprueba('a las 00:45 ya terminó', D.pickDayBlock(madrugada, 45).current === null, D.pickDayBlock(madrugada, 45).current);
comprueba('el siguiente bloque se busca desde ahora, no desde el final del nocturno', D.pickDayBlock(D.buildDayBlocks({
  slots: [slot('noche', '23:30', '00:30'), slot('manana', '08:00', '09:00')],
  tasks: [], ymd: HOY
}), 15).next.id === 'manana', D.pickDayBlock(D.buildDayBlocks({
  slots: [slot('noche', '23:30', '00:30'), slot('manana', '08:00', '09:00')],
  tasks: [], ymd: HOY
}), 15).next);

/* ---------- racha de días completos -------------------------------------- */
seccion('racha');
const hechos = [];
const vacios = [];
const saltados = [];
const isDueOn = (task, day) => !vacios.includes(task.id + '@' + day);
const isDoneOn = (task, day) => hechos.includes(task.id + '@' + day);
const isSkipped = (task, day) => saltados.includes(task.id + '@' + day);
const streak = (tasks, day) => D.allDoneStreak({ tasks, ymd: day, isDueOn, isDoneOn, isSkipped, addDaysYmd });

const dos = [tarea('a', '08:00'), tarea('b', '20:00')];
hechos.push('a@2026-11-16', 'b@2026-11-16', 'a@2026-11-15', 'b@2026-11-15', 'a@2026-11-14', 'b@2026-11-14');
comprueba('tres días con todo hecho son racha 3', streak(dos, HOY) === 3, streak(dos, HOY));

hechos.length = 0;
hechos.push('a@2026-11-16', 'b@2026-11-16', 'a@2026-11-15', 'b@2026-11-15');
comprueba('hoy incompleto no rompe la racha: cuenta desde ayer', streak(dos, HOY) === 2, streak(dos, HOY));

hechos.length = 0;
hechos.push('a@2026-11-16', 'b@2026-11-16', 'a@2026-11-15', 'b@2026-11-15', 'a@2026-11-13', 'b@2026-11-13');
comprueba('un día entero sin completar corta la racha', streak(dos, HOY) === 2, streak(dos, HOY));

hechos.length = 0;
hechos.push('a@2026-11-16', 'a@2026-11-15');
const soloUna = [tarea('a', '08:00'), tarea('b', '20:00')];
vacios.push('b@2026-11-16', 'b@2026-11-15', 'b@2026-11-14');
comprueba('un hábito que no tocaba no deja el día incompleto', streak(soloUna, HOY) === 2, streak(soloUna, HOY));
vacios.length = 0;

hechos.length = 0;
hechos.push('a@2026-11-16', 'b@2026-11-16', 'a@2026-11-14', 'b@2026-11-14');
saltados.push('a@2026-11-15', 'b@2026-11-15');
// El día saltado no suma ni rompe: cuenta hoy y el 14, con el 15 saltado en
// medio.
comprueba('un día saltado no rompe la racha', streak(dos, HOY) === 2, streak(dos, HOY));
saltados.length = 0;

comprueba('sin hábitos no hay racha', D.allDoneStreak({ tasks: [], ymd: HOY, isDueOn, isDoneOn, isSkipped, addDaysYmd }) === 0, 0);

/* ---------- resumen del día ---------------------------------------------- */
seccion('resumen del día');
hechos.length = 0;
hechos.push('a@2026-11-16');
const resumen = D.dayCompletion({ tasks: dos, ymd: HOY, isDueOn, isDoneOn, isSkipped });
comprueba('dos hábitos, uno hecho: día sin completar', resumen.due === 2 && resumen.done === 1 && resumen.all === false, resumen);
hechos.push('b@2026-11-16');
comprueba('dos de dos: día completo', D.dayCompletion({ tasks: dos, ymd: HOY, isDueOn, isDoneOn, isSkipped }).all === true, D.dayCompletion({ tasks: dos, ymd: HOY, isDueOn, isDoneOn, isSkipped }));
const soloSaltado = D.dayCompletion({ tasks: [tarea('a', '08:00')], ymd: HOY, isDueOn, isDoneOn, isSkipped: () => true });
comprueba('un día todo saltado no cuenta como completo', soloSaltado.due === 0 && soloSaltado.all === false, soloSaltado);

/* ---------- cierre -------------------------------------------------------- */
console.log('\n' + (fallos ? 'FALLOS: ' + fallos + ' de ' + total : 'Todo correcto: ' + total + ' comprobaciones'));
if (fallos) process.exit(1);
