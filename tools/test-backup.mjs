/* Banco de pruebas de la copia de seguridad portable (src/features/platform.js):
   construir la copia, fusionarla en un dispositivo vacío, reasignar las
   referencias (bloque -> asignatura) y no duplicar al importar dos veces.

   Uso: node tools/test-backup.mjs
*/
import { registerPlatform } from '../src/features/platform.js';

/* ---------- aserciones ----------------------------------------------------- */
let fallos = 0;
let total = 0;
const comprueba = (etiqueta, ok, detalle) => {
  total++;
  console.log((ok ? '  OK  ' : ' FALLO') + ' ' + etiqueta + (ok ? '' : '  -> ' + JSON.stringify(detalle)));
  if (!ok) fallos++;
};
const seccion = titulo => console.log('\n== ' + titulo + ' ==');

/* ---------- dobles de la app ---------------------------------------------- */
const hoy = '2026-09-28';
let guardadas = 0;
let nuevosIds = 0;
const app = {
  core: { h: () => ({}), icon: () => ({}), todayStr: () => hoy, cap: v => v, uid: prefix => prefix + '-import-' + (++nuevosIds) },
  state: {
    S: {
      profiles: [],
      data: {},
      settings: { theme: 'auto' }
    },
    save: () => { guardadas++; }
  },
  domain: { switchProfileData: () => {}, render: () => {}, go: () => {} },
  components: { closeOverlays: () => {}, toast: () => {}, confirmDialog: () => {}, openSheet: () => {} },
  features: {}
};
registerPlatform(app);
const P = app.features;

// El store nunca se reemplaza (se muta en el mismo objeto), así que el núcleo
// captura esa referencia. El test hace lo mismo en vez de asignar `S`.
function setState(next) {
  for (const key of Object.keys(app.state.S)) delete app.state.S[key];
  Object.assign(app.state.S, next);
}

function perfilDemo() {
  return {
    settings: { theme: 'dark', categories: ['Hábitos'] },
    profiles: [{ id: 'p1', name: 'Darwin', color: '#2563EB', photo: 'data:image/png;base64,AA==', pin: 'secret-hash', pinLen: 4, createdAt: '2026-01-01' }],
    data: {
      p1: {
        tasks: [
          { id: 't1', title: 'Dientes', kind: 'check', freq: { type: 'daily' }, completions: ['2026-09-28'] },
          { id: 't2', title: 'Agua', kind: 'count', target: 8, log: { '2026-09-28': 3 }, completions: ['2026-09-28'] }
        ],
        notes: [{ id: 'n1', text: 'Teorema de Tales' }],
        people: [{ id: 'pe1', name: 'Mamá' }],
        gifts: [{ id: 'g1', title: 'Perfume', personId: 'pe1' }],
        subjects: [{ id: 's1', name: 'Matemáticas' }],
        slots: [{ id: 'c1', day: 0, start: '09:00', end: '10:00', subjectId: 's1' }],
        inbox: [], sessions: [], breaks: [{ id: 'b1', from: '2026-10-24', to: '2026-11-02', label: 'Vacaciones' }],
        offs: [], activeSession: null
      }
    }
  };
}

/* ---------- construir ------------------------------------------------------ */
seccion('construir la copia');
setState(perfilDemo());
const copia = P.buildBackup();
comprueba('se marca como copia de DailyHub', copia.kind === 'backup' && copia.app === 'DailyHub', copia.kind);
comprueba('lleva la versión del formato', copia.version === 1, copia.version);
comprueba('incluye los perfiles', copia.profiles.length === 1, copia.profiles.length);
comprueba('incluye los datos de cada perfil', !!(copia.data.p1 && copia.data.p1.tasks.length === 2), null);
comprueba('incluye los ajustes', copia.settings && copia.settings.theme === 'dark', copia.settings);
comprueba('no exporta el PIN local del perfil', !('pin' in copia.profiles[0]) && !('pinLen' in copia.profiles[0]), copia.profiles[0]);
comprueba('incluye la foto del perfil', copia.profiles[0].photo === 'data:image/png;base64,AA==', copia.profiles[0]);
comprueba('el JSON es serializable', (() => { try { JSON.parse(JSON.stringify(copia)); return true; } catch (e) { return false; } })(), null);
comprueba('el bloque conserva su referencia a la asignatura', copia.data.p1.slots[0].subjectId === 's1', copia.data.p1.slots[0]);

/* ---------- fusionar en un dispositivo vacío -------------------------------- */
seccion('fusionar en un dispositivo vacío');
setState({ profiles: [], data: {}, settings: {} });
const r1 = P.mergeBackup(JSON.parse(JSON.stringify(copia)));
comprueba('se crea el perfil', r1.created.profiles === 1 && app.state.S.profiles.length === 1, r1.created);
comprueba('se crean las dos tareas', r1.created.tasks === 2, r1.created.tasks);
comprueba('se crean notas, personas, regalos y asignaturas', r1.created.notes === 1 && r1.created.people === 1 && r1.created.gifts === 1 && r1.created.subjects === 1, r1.created);
comprueba('se crea el bloque y las vacaciones', r1.created.slots === 1 && r1.created.breaks === 1, r1.created);
comprueba('los ids estables se conservan si no hay colisión', app.state.S.data[app.state.S.profiles[0].id].tasks.some(t => t.id === 't1'), null);
comprueba('el bloque sigue apuntando a la asignatura importada', (() => {
  const pid = app.state.S.profiles[0].id;
  const b = app.state.S.data[pid];
  return b.slots[0].subjectId && b.subjects.some(s => s.id === b.slots[0].subjectId);
})(), null);
comprueba('el regalo sigue apuntando a la persona importada', (() => {
  const pid = app.state.S.profiles[0].id;
  const b = app.state.S.data[pid];
  return b.gifts[0].personId && b.people.some(p => p.id === b.gifts[0].personId);
})(), null);
comprueba('se guardó al menos una vez', guardadas > 0, guardadas);
comprueba('la copia limpia no lleva mapas internos vacíos', !('identity' in copia) && !('__backupIds' in copia.data.p1), copia);

/* ---------- importar dos veces --------------------------------------------- */
seccion('importar la misma copia dos veces');
const r2 = P.mergeBackup(JSON.parse(JSON.stringify(copia)));
comprueba('no se crea un segundo perfil', app.state.S.profiles.length === 1, app.state.S.profiles.length);
comprueba('no se duplica ninguna tarea', (() => {
  const pid = app.state.S.profiles[0].id;
  return app.state.S.data[pid].tasks.length === 2;
})(), null);
comprueba('se avisa de que ya estaba', r2.skippedDuplicates === 1, r2.skippedDuplicates);

/* ---------- fusionar sobre un perfil con otro nombre ------------------------ */
seccion('perfil distinto en el mismo dispositivo');
const copiaAjena = JSON.parse(JSON.stringify(copia));
copiaAjena.profiles[0].id = 'p9';
copiaAjena.profiles[0].name = 'Hermana';
copiaAjena.data.p9 = copiaAjena.data.p1;
const r3 = P.mergeBackup(copiaAjena);
comprueba('se añade como perfil aparte', r3.created.profiles === 1 && app.state.S.profiles.length === 2, app.state.S.profiles.length);
comprueba('su nombre es el suyo', app.state.S.profiles[1].name === 'Hermana', app.state.S.profiles[1]);
comprueba('el nuevo perfil trae sus propias tareas', (() => {
  const pid = app.state.S.profiles[1].id;
  return app.state.S.data[pid].tasks.length === 2;
})(), null);
comprueba('el primer perfil no se ha tocado', (() => {
  const pid = app.state.S.profiles[0].id;
  return app.state.S.data[pid].tasks.length === 2;
})(), null);
comprueba('una importación con ids de filas ya ocupados los reasigna una vez', (() => {
  const profile = app.state.S.profiles[1];
  const rows = app.state.S.data[profile.id];
  return rows.tasks.every(task => task.id !== 't1') && rows.slots[0].subjectId === rows.subjects[0].id && rows.gifts[0].personId === rows.people[0].id;
})(), app.state.S.data[app.state.S.profiles[1].id]);
const copiaPortada = P.buildBackup();
const rPortada = P.mergeBackup(JSON.parse(JSON.stringify(copiaPortada)));
comprueba('la copia exportada porta mapas de identidad de forma separada a los datos', !!copiaPortada.identity && Object.keys(copiaPortada.identity).length === 2 && rPortada.skippedDuplicates >= 2 && app.state.S.profiles.length === 2, { identity: copiaPortada.identity, result: rPortada });

/* ---------- misma etiqueta de perfil, identidad distinta ------------------- */
seccion('perfiles con el mismo nombre no se confunden');
const copiaMismoNombre = JSON.parse(JSON.stringify(copia));
copiaMismoNombre.profiles[0].id = 'p-darwin-distinto';
copiaMismoNombre.data['p-darwin-distinto'] = JSON.parse(JSON.stringify(copiaMismoNombre.data.p1));
copiaMismoNombre.data['p-darwin-distinto'].tasks[0].id = 't-diferente';
const rMismoNombre = P.mergeBackup(copiaMismoNombre);
comprueba('el perfil de mismo nombre y distinto id se conserva aparte', rMismoNombre.created.profiles === 1 && app.state.S.profiles.some(profile => profile.id === 'p-darwin-distinto' && profile.name === 'Darwin'), app.state.S.profiles);
comprueba('se importa contenido adicional aunque se parezca el nombre', app.state.S.data['p-darwin-distinto'].tasks.length === 2, app.state.S.data['p-darwin-distinto'].tasks);

/* ---------- entradas inválidas --------------------------------------------- */
seccion('ficheros que no son copia');
const lanza = valor => { try { P.mergeBackup(valor); return false; } catch (e) { return true; } };
comprueba('un null lanza error en vez de reventar', lanza(null), null);
comprueba('un JSON que no es copia lanza error', lanza({ app: 'otra' }), null);
comprueba('un objeto sin data lanza error', lanza({ kind: 'backup' }), null);

/* ---------- preferencias locales y ajustes sincronizados ------------------ */
seccion('fusionar ajustes sin pisar preferencias del dispositivo');
setState({
  profiles: [], data: {},
  settings: {
    theme: 'light', hideCompleted: true, fontScale: 1.2,
    taskTemplates: [{ name: 'Local', data: { title: 'Local' } }, { name: 'Rutina', data: { title: 'Versión local' } }],
    notif: { gifts: false, quietFrom: '21:00' }
  }
});
const copiaSettings = JSON.parse(JSON.stringify(copia));
copiaSettings.settings = {
  theme: 'dark', hideCompleted: false, fontScale: 1,
  taskTemplates: [{ name: 'Rutina', data: { title: 'Versión de la copia' } }, { name: 'Remota', data: { title: 'Remota' } }],
  notif: { gifts: true, daily: true, quietTo: '07:00' }
};
P.mergeBackup(copiaSettings);
comprueba('conserva el tema, contraste de lectura y ocultar completadas locales', app.state.S.settings.theme === 'light' && app.state.S.settings.hideCompleted && app.state.S.settings.fontScale === 1.2, app.state.S.settings);
comprueba('une plantillas sin pisar una plantilla local del mismo nombre', app.state.S.settings.taskTemplates.length === 3 && app.state.S.settings.taskTemplates.find(template => template.name === 'Rutina').data.title === 'Versión local', app.state.S.settings.taskTemplates);
comprueba('combina campos nuevos de notificación sin sobreescribir los locales', app.state.S.settings.notif.gifts === false && app.state.S.settings.notif.quietFrom === '21:00' && app.state.S.settings.notif.daily === true && app.state.S.settings.notif.quietTo === '07:00', app.state.S.settings.notif);

const sinPerfiles = (() => {
  const r = P.mergeBackup({ kind: 'backup', data: {}, profiles: [] });
  return r.created.profiles === 0;
})();
comprueba('una copia sin perfiles no rompe nada', sinPerfiles, null);
const filasSueltas = (() => {
  const r = P.mergeBackup({ kind: 'backup', profiles: [{ id: 'x', name: 'Vacío' }], data: { x: { tasks: [{ noId: true }, null] } } });
  return r.created.profiles === 1;
})();
comprueba('las filas sin id se ignoran sin error', filasSueltas, null);

console.log('\n' + (fallos ? fallos + ' de ' + total + ' comprobaciones fallidas' : 'Todo correcto (' + total + ' comprobaciones)'));
process.exit(fallos ? 1 : 0);
