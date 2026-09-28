/* Banco de pruebas del round-trip de class_slots (patio <-> nube).
   Ejecuta el app-sync.js real con el arnés compartido para comprobar que un
   bloque de patio sigue siendo patio tras subirlo y volver a bajarlo.

   Uso: node tools/test-patio-sync.js
*/
const { crearBanco, crearAserciones, PID, UID } = require('./harness');

const { DB, S, DailySync, emptyBucket } = crearBanco({ conKind: true });

/* ---------- datos de la nube: horario con un patio y una clase -------------- */
function filaNube(extra) {
  return Object.assign({
    id: 'x', user_id: UID, profile_id: PID, subject_id: null, day: 2,
    start_time: '10:15', end_time: '10:45', room: '', active: true,
    updated_at: '2026-09-27T10:00:00.000Z', created_at: '2026-09-20T10:00:00.000Z'
  }, extra);
}

async function escenario(migracionAplicada) {
  DB.profiles = [];
  DB.subjects = [{ id: 's-mat', user_id: UID, profile_id: PID, name: 'Matemáticas', color: '#2563EB', updated_at: '2026-09-20T10:00:00.000Z', created_at: '2026-09-20T10:00:00.000Z' }];
  DB.class_slots = [
    // Patio guardado antes de que existiera la columna kind
    filaNube({ id: 'c-patio' }),
    // Clase normal con asignatura
    filaNube({ id: 'c-clase', subject_id: 's-mat', start_time: '09:00', end_time: '09:55', room: 'Aula 3' }),
    // Patio de la versión antigua, marcado por el aula
    filaNube({ id: 'c-legado', day: 3, room: 'patio' })
  ];
  // Migración aplicada = columna añadida con su valor por defecto + el
  // UPDATE que marca como patio los bloques que no tienen asignatura.
  if (migracionAplicada) {
    DB.class_slots.forEach(row => { row.kind = 'class'; });
    DB.class_slots.forEach(row => { if (!row.subject_id) row.kind = 'patio'; });
  }
  S.data[PID] = emptyBucket();

  await DailySync.boot();
  const bajado = S.data[PID].slots.map(s => ({ id: s.id, kind: s.kind, room: s.room, subjectId: s.subjectId }));

  // Se edita el patio (por ejemplo se le cambia la hora) y se sube
  const patio = S.data[PID].slots.find(s => s.id === 'c-patio');
  patio.end = '11:00';
  patio.updatedAt = Date.parse('2026-09-27T12:00:00.000Z');
  await DailySync.push();
  const subido = DB.class_slots.filter(r => r.id === 'c-patio').map(r => ({ kind: r.kind, end: r.end_time }));

  // Se borra todo local y se vuelve a bajar: aquí es donde se rompía
  S.data[PID] = emptyBucket();
  await DailySync.pull();
  const recargado = S.data[PID].slots.map(s => ({ id: s.id, kind: s.kind, room: s.room }));
  return { bajado, subido, recargado };
}

(async () => {
  const { comprueba, seccion, resumen } = crearAserciones();

  for (const migracion of [false, true]) {
    seccion(migracion ? 'con migración aplicada (columna kind)' : 'sin migración (solo deducción)');
    const r = await escenario(migracion);
    const patio = r.bajado.find(s => s.id === 'c-patio');
    const clase = r.bajado.find(s => s.id === 'c-clase');
    const legado = r.bajado.find(s => s.id === 'c-legado');
    comprueba('el patio vuelve como patio', patio && patio.kind === 'patio', patio);
    comprueba('la clase sigue siendo clase', clase && clase.kind === 'class', clase);
    comprueba('el patio legacy (room=patio) sigue siendo patio', legado && legado.kind === 'patio', legado);
    if (migracion) {
      comprueba('el push escribe la columna kind', r.subido[0] && r.subido[0].kind === 'patio', r.subido);
    }
    const recargadoPatio = r.recargado.find(s => s.id === 'c-patio');
    comprueba('tras push + pull el patio sigue siendo patio', recargadoPatio && recargadoPatio.kind === 'patio', recargadoPatio);
  }

  process.exit(resumen());
})();
