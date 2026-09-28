/* Banco de pruebas de la lógica pura del calendario escolar
   (src/features/class/calendar-core.js): huecos, solapes, carga semanal,
   días no lectivos, cancelaciones puntuales y el .ics de exportación.

   Es un módulo ESM real, así que se importa tal cual: lo que se prueba es el
   código de producción, no una copia.

   Uso: node tools/test-calendar-core.mjs
*/
import { registerClassCalendarCore } from '../src/features/class/calendar-core.js';

/* ---------- aserciones ----------------------------------------------------- */
let fallos = 0;
let total = 0;
const comprueba = (etiqueta, ok, detalle) => {
  total++;
  console.log((ok ? '  OK  ' : ' FALLO') + ' ' + etiqueta + (ok ? '' : '  -> ' + JSON.stringify(detalle)));
  if (!ok) fallos++;
};
const seccion = titulo => console.log('\n== ' + titulo + ' ==');

/* ---------- dobles mínimos de la app -------------------------------------- */
const pad = n => String(n).padStart(2, '0');
const toYmd = date => date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
const parseYmd = value => new Date(value + 'T00:00:00');
const HOY = '2026-09-28';   // lunes
const dowIdx = ymd => (parseYmd(ymd).getDay() + 6) % 7;
const hm = time => {
  const parts = String(time || '0:00').split(':');
  return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
};
const minTxt = minutes => pad(Math.floor(((Math.round(minutes) % 1440) + 1440) % 1440 / 60)) + ':' + pad((((Math.round(minutes) % 1440) + 1440) % 1440) % 60);
const timeTxt = time => (time ? String(time).slice(0, 5) : '');

const subjects = [
  { id: 's-mat', name: 'Matemáticas', color: '#2563EB' },
  { id: 's-fis', name: 'Física', color: '#059669' }
];
const slots = [
  { id: 'c1', day: 0, start: '09:00', end: '09:55', subjectId: 's-mat', kind: 'class' },
  { id: 'c2', day: 0, start: '11:00', end: '11:55', subjectId: 's-fis', kind: 'class' },  // hueco de 65 min
  { id: 'c3', day: 0, start: '12:00', end: '12:30', subjectId: null, kind: 'patio' },
  { id: 'c4', day: 1, start: '09:00', end: '09:55', subjectId: 's-mat', kind: 'class' },
  { id: 'c5', day: 1, start: '09:30', end: '10:25', subjectId: 's-fis', kind: 'class' },  // se pisa con c4
  { id: 'c6', day: 2, start: '09:00', end: '09:55', subjectId: 's-mat', kind: 'class', active: false },  // desactivado
  { id: 'c7', day: 3, start: '10:00', end: '10:55', subjectId: 's-fis', kind: 'class' }
];

let guardadas = 0;
const S = { slots, subjects, breaks: [], offs: [], settings: {} };
const app = {
  core: {
    todayStr: () => HOY,
    addDaysYmd(ymd, amount) { const d = parseYmd(ymd); d.setDate(d.getDate() + amount); return toYmd(d); },
    dowIdx,
    parseYmd,
    toYmd,
    uid: prefix => prefix + '-' + (guardadas++)
  },
  state: { S, save: () => { guardadas++; } },
  class: { hm, minTxt, timeTxt, subjectById: id => subjects.find(s => s.id === id) || null }
};
registerClassCalendarCore(app);
const C = app.class;

/* ---------- días no lectivos ---------------------------------------------- */
seccion('días no lectivos');
comprueba('sin periodos, un día cualquiera es lectivo', !C.isNonSchool(HOY), null);
C.addBreak('2026-10-24', '2026-11-02', 'Vacaciones de otoño', 'vacaciones');
comprueba('el primer día del periodo es no lectivo', C.isNonSchool('2026-10-24'), null);
comprueba('el último día del periodo es no lectivo', C.isNonSchool('2026-11-02'), null);
comprueba('un día en medio del periodo es no lectivo', C.isNonSchool('2026-10-28'), null);
comprueba('el día posterior al periodo ya es lectivo', !C.isNonSchool('2026-11-03'), null);
comprueba('el día anterior al periodo es lectivo', !C.isNonSchool('2026-10-23'), null);
comprueba('breakOn devuelve la etiqueta', C.breakOn('2026-10-28').label === 'Vacaciones de otoño', C.breakOn('2026-10-28'));
comprueba('en vacaciones no hay bloques aunque el patrón los tenga', C.slotsOnDate('2026-10-26').length === 0, C.slotsOnDate('2026-10-26'));
comprueba('un día lectivo normal sí devuelve sus bloques', C.slotsOnDate(HOY).length === 3, C.slotsOnDate(HOY).map(s => s.id));
C.removeBreak(C.breaks()[0].id);
comprueba('al eliminar el periodo vuelve a ser lectivo', !C.isNonSchool('2026-10-28'), null);

/* ---------- cancelaciones puntuales --------------------------------------- */
seccion('cancelación de un bloque en una fecha');
const jueves = app.core.addDaysYmd(HOY, 3);
comprueba('el bloque se celebra si no está cancelado', C.slotRunsOn(slots[0], jueves), null);
C.setOff('c1', jueves, true);
comprueba('tras cancelar, el bloque no se celebra ese día', !C.slotRunsOn(slots[0], jueves), null);
comprueba('los demás bloques del día siguen', C.slotRunsOn(slots[3], jueves), null);
comprueba('la cancelación no afecta a otro día', C.slotRunsOn(slots[0], app.core.addDaysYmd(HOY, 10)), null);
comprueba('el bloque cancelado desaparece de la agenda del día', C.slotsOnDate(jueves).every(s => s.id !== 'c1'), C.slotsOnDate(jueves).map(s => s.id));
comprueba('el resto de bloques del día sigue en la agenda', C.slotsOnDate(jueves).some(s => s.id === 'c7'), C.slotsOnDate(jueves).map(s => s.id));
C.setOff('c1', jueves, false);
comprueba('al quitar la cancelación vuelve a celebrarse', C.slotRunsOn(slots[0], jueves), null);

/* ---------- huecos y solapes ---------------------------------------------- */
seccion('huecos y solapes');
const gaps = C.dayGaps(0, 45);
comprueba('el lunes tiene un hueco largo (09:55–11:00)', gaps.length === 1 && gaps[0].from === '09:55' && gaps[0].to === '11:00', gaps);
comprueba('el hueco se mide en minutos', gaps[0].minutes === 65, gaps[0]);
comprueba('con un umbral de 5 min también cuenta el hueco corto', C.dayGaps(0, 5).length === 2, C.dayGaps(0, 5));
comprueba('el hueco corto es el del patio', C.dayGaps(0, 5)[1].minutes === 5, C.dayGaps(0, 5));
comprueba('el martes tiene un solape', C.dayOverlaps(1).length === 1, C.dayOverlaps(1).map(p => p.map(s => s.id)));
comprueba('el solape es entre c4 y c5',
  C.dayOverlaps(1)[0] && C.dayOverlaps(1)[0][0].id === 'c4' && C.dayOverlaps(1)[0][1].id === 'c5', C.dayOverlaps(1)[0]);
comprueba('el lunes no tiene solapes', C.dayOverlaps(0).length === 0, C.dayOverlaps(0));

/* ---------- carga semanal -------------------------------------------------- */
seccion('carga del horario');
const load = C.weekLoad();
comprueba('el bloque desactivado no cuenta en la carga', load.classMinutes === 55 * 5, load.classMinutes);
comprueba('el patio va aparte', load.patioMinutes === 30, load.patioMinutes);
comprueba('Física es la asignatura con más horas', load.subjects[0].name === 'Física' && load.subjects[0].minutes === 55 * 3, load.subjects);
comprueba('Matemáticas suma sus 2 bloques activos', load.subjects[1].name === 'Matemáticas' && load.subjects[1].minutes === 55 * 2, load.subjects);
comprueba('el reparto está ordenado de más a menos horas', load.subjects[0].minutes > load.subjects[1].minutes, load.subjects);
comprueba('el lunes acumula sus tres bloques', load.byDay[0] === 55 + 55 + 30, load.byDay);
comprueba('el martes acumula sus dos bloques', load.byDay[1] === 55 + 55, load.byDay);
comprueba('el miércoles solo tiene el bloque desactivado, así que nada', load.byDay[2] === 0, load.byDay);
comprueba('humanMinutes escribe horas y minutos', C.humanMinutes(95) === '1 h 35 min', C.humanMinutes(95));
comprueba('humanMinutes de una hora exacta', C.humanMinutes(120) === '2 h', C.humanMinutes(120));
comprueba('humanMinutes de cero', C.humanMinutes(0) === '0 min', C.humanMinutes(0));

/* ---------- exportación .ics ----------------------------------------------- */
seccion('exportación a .ics');
const ics = C.buildICS();
comprueba('el calendario empieza y termina bien', ics.startsWith('BEGIN:VCALENDAR') && ics.trim().endsWith('END:VCALENDAR'), ics.slice(0, 40));
comprueba('hay un evento por bloque activo', (ics.match(/BEGIN:VEVENT/g) || []).length === 6, (ics.match(/BEGIN:VEVENT/g) || []).length);
comprueba('cada evento se repite cada semana', (ics.match(/RRULE:FREQ=WEEKLY/g) || []).length === 6, (ics.match(/RRULE:FREQ=WEEKLY/g) || []).length);
comprueba('el bloque desactivado no aparece en el uid exportado', !ics.includes('c6'), null);
comprueba('cada bloque conserva su uid para no duplicar al reimportar', ics.includes('c1@dailyhub') && ics.includes('c7@dailyhub'), null);
comprueba('el patio se llama Patio', ics.includes('SUMMARY:Patio'), null);
comprueba('el aula va como LOCATION', ics.includes('LOCATION:'), null);
comprueba('las horas están en formato compacto', /\d{8}T\d{6}Z/.test(ics), ics.split('\r\n').slice(0, 12));

/* ---------- enlaces de videollamada ---------------------------------------- */
seccion('enlaces de videollamada');
comprueba('sin enlace no hay botón', C.videoLink({ room: 'Aula 3' }) === null, C.videoLink({ room: 'Aula 3' }));
comprueba('se detecta Google Classroom', C.videoLink({ room: 'https://classroom.google.com/u/1/abc' }).host === 'classroom.google.com', C.videoLink({ room: 'https://classroom.google.com/u/1/abc' }));
comprueba('se detecta Meet', C.videoLink({ link: 'https://meet.google.com/abc-defg-hij' }).host === 'meet.google.com', null);
comprueba('se detecta Zoom', C.videoLink({ link: 'https://zoom.us/j/123' }).host === 'zoom.us', null);
comprueba('un enlace sin protocolo se normaliza', C.videoLink({ link: 'classroom.google.com/abc' }).url.startsWith('https://'), C.videoLink({ link: 'classroom.google.com/abc' }));
comprueba('un aula normal no se confunde con un enlace', C.videoLink({ room: 'Aula 2B' }) === null, C.videoLink({ room: 'Aula 2B' }));

/* ---------- ventana de la rejilla ------------------------------------------ */
seccion('ventana de la rejilla');
const win = C.gridWindow(5);
comprueba('la rejilla empieza antes de la primera clase', win.from <= hm('09:00'), win);
comprueba('la rejilla termina después de la última clase', win.to >= hm('12:30'), win);
comprueba('la rejilla se redondea a horas enteras', win.from % 60 === 0 && win.to % 60 === 0, win);
comprueba('sin horario la ventana por defecto es de 8 a 15', (() => {
  const guardado = S.slots; S.slots = [];
  const v = C.gridWindow(5); S.slots = guardado;
  return v.from === 480 && v.to === 900;
})(), C.gridWindow(5));

console.log('\n' + (fallos ? fallos + ' de ' + total + ' comprobaciones fallidas' : 'Todo correcto (' + total + ' comprobaciones)'));
process.exit(fallos ? 1 : 0);
