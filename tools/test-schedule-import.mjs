/* Pruebas del parser y el planificador de importación de horario. */
import { parseScheduleText, planScheduleImport } from '../src/features/class/schedule-import.js';

let fallos = 0;
let total = 0;
const comprueba = (etiqueta, ok, detalle) => {
  total++;
  console.log((ok ? '  OK  ' : ' FALLO') + ' ' + etiqueta + (ok ? '' : '  -> ' + JSON.stringify(detalle)));
  if (!ok) fallos++;
};
const seccion = titulo => console.log('\n== ' + titulo + ' ==');

seccion('parseo y validación de tablas');
const vacio = parseScheduleText('  \n');
comprueba('una tabla vacía explica qué falta', vacio.rows.length === 0 && vacio.errors.length > 0, vacio);
comprueba('rechaza texto sin separador', parseScheduleText('Lunes 09:00 10:00').errors[0].includes('Separa'), null);

const csv = parseScheduleText('Día;Fin;Asignatura;Aula;Inicio;Tipo\nMiércoles;10:00;"Historia, Arte";"Aula 2";9:00;Clase\nJue;11:00;Recreo;;10:30;');
comprueba('reconoce encabezados reordenados y tildes', csv.rows[0] && csv.rows[0].day === 2 && csv.rows[0].start === '09:00' && csv.rows[0].end === '10:00', csv.rows[0]);
comprueba('respeta comas dentro de campos CSV entrecomillados', csv.rows[0] && csv.rows[0].subjectName === 'Historia, Arte', csv.rows[0]);
comprueba('detecta recreo como patio aunque venga en asignatura', csv.rows[1] && csv.rows[1].kind === 'patio' && csv.rows[1].room === 'patio', csv.rows[1]);

const tsv = parseScheduleText('Viernes\t8:05\t09:00\tMúsica\tAula 1\n6\t10:00\t10:30\t\t\tPatio');
comprueba('admite filas TSV sin encabezado y normaliza HH:MM', tsv.rows[0] && tsv.rows[0].day === 4 && tsv.rows[0].start === '08:05', tsv.rows[0]);
comprueba('admite el día numérico 0–6 y el tipo patio', tsv.rows[1] && tsv.rows[1].day === 6 && tsv.rows[1].kind === 'patio', tsv.rows[1]);

const invalid = parseScheduleText('Día,Inicio,Fin,Asignatura\nLunes,25:00,26:00,Mates\nFunday,09:00,10:00,Unknown\nMartes,12:00,11:00,Invertido\nJueves,09:00,10:00,Válida');
comprueba('omite horas inválidas y conserva las filas válidas', invalid.rows.length === 1 && invalid.rows[0].subjectName === 'Válida' && invalid.errors.length === 3, invalid);
comprueba('menciona el número de fila en los errores', invalid.errors[0].includes('Fila 2'), invalid.errors);
comprueba('detecta comillas sin cerrar', parseScheduleText('Lunes,"09:00,10:00,Mates').errors[0].includes('comilla'), null);

seccion('plan de importación atómico');
const subjects = [{ id: 's-mat', name: 'Matemáticas' }];
const slots = [{ id: 'c1', day: 0, start: '09:00', end: '10:00', active: true }];
const validPlan = planScheduleImport(parseScheduleText('Lunes\t10:00\t10:55\tmatemáticas\tAula 2\nMartes\t09:00\t09:55\tFísica\tAula 3'), subjects, slots);
comprueba('la asignatura existente se encuentra sin distinguir mayúsculas', validPlan.additions[0] && validPlan.additions[0].subjectId === 's-mat', validPlan.additions[0]);
comprueba('las asignaturas nuevas se preparan sin añadirlas al estado', validPlan.newSubjects.length === 1 && validPlan.newSubjects[0].name === 'Física' && subjects.length === 1, validPlan.newSubjects);
comprueba('las filas nuevas apuntan por clave a su asignatura pendiente', validPlan.additions[1] && validPlan.additions[1].subjectKey === 'fisica', validPlan.additions[1]);

const conflict = planScheduleImport(parseScheduleText('Lunes\t09:30\t10:30\tNueva\tAula\nMartes\t12:00\t12:30\tOtra\tAula'), subjects, slots);
comprueba('un solape con el horario actual invalida el lote completo', !!conflict.error && !conflict.additions.length && !conflict.newSubjects.length, conflict);
const selfConflict = planScheduleImport(parseScheduleText('Lunes\t10:00\t10:30\tNueva\tAula\nLunes\t10:20\t10:50\tOtra\tAula'), subjects, slots);
comprueba('un solape dentro del lote invalida todas las filas', !!selfConflict.error && !selfConflict.additions.length, selfConflict);
comprueba('un intervalo contiguo sin solape sí cabe', !planScheduleImport(parseScheduleText('Lunes\t10:00\t10:30\tNueva\tAula'), subjects, slots).error, null);

console.log('\n' + (fallos ? fallos + ' de ' + total + ' comprobaciones fallidas' : 'Todo correcto (' + total + ' comprobaciones)'));
process.exit(fallos ? 1 : 0);
