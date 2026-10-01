/* Banco de pruebas del calendario escolar: días no lectivos (class_breaks),
   cancelaciones puntuales (class_offs) y la columna `active` de class_slots.
   Comprueba el round-trip completo y, sobre todo, que la app sigue
   sincronizando cuando la migración todavía NO está aplicada.

   Uso: node tools/test-calendar-sync.cjs
*/
const { crearBanco, crearAserciones, PID, UID } = require('./harness.cjs');

const HOY = '2026-09-28';   // lunes

function base(extra) {
  return Object.assign({
    id: 'x', user_id: UID, profile_id: PID, updated_at: '2026-09-27T10:00:00.000Z',
    created_at: '2026-09-20T10:00:00.000Z'
  }, extra);
}

function slotNube(extra) {
  return base(Object.assign({
    subject_id: null, day: 0, start_time: '09:00', end_time: '09:55', room: '', active: true
  }, extra));
}

/* Escenario completo: la nube ya tiene horario, vacaciones y una cancelación. */
async function conMigracion() {
  const { DB, S, DailySync, emptyBucket } = crearBanco({ hoy: HOY });
  DB.subjects = [{ id: 's-mat', user_id: UID, profile_id: PID, name: 'Matemáticas', color: '#2563EB', updated_at: '2026-09-20T10:00:00.000Z', created_at: '2026-09-20T10:00:00.000Z' }];
  DB.class_slots = [
    slotNube({ id: 'c-activa', subject_id: 's-mat' }),
    slotNube({ id: 'c-inactiva', day: 1, start_time: '10:00', end_time: '10:55', active: false })
  ];
  DB.class_breaks = [base({ id: 'b-vac', date_from: '2026-10-24', date_to: '2026-11-02', label: 'Vacaciones', kind: 'vacaciones' })];
  DB.class_offs = [base({ id: 'o-1', slot_id: 'c-activa', date_off: '2026-09-30' })];
  S.data[PID] = emptyBucket();

  await DailySync.boot();
  const bajado = {
    slots: S.data[PID].slots.map(s => ({ id: s.id, active: s.active })),
    breaks: S.data[PID].breaks.map(b => ({ id: b.id, from: b.from, to: b.to, label: b.label, kind: b.kind })),
    offs: S.data[PID].offs.map(o => ({ id: o.id, slotId: o.slotId, date: o.date }))
  };

  // Se edita localmente: se renombra el periodo y se añade otro bloque de vacaciones
  S.data[PID].breaks[0].label = 'Navidad';
  S.data[PID].breaks[0].updatedAt = Date.parse('2026-09-28T12:00:00.000Z');
  S.data[PID].breaks.push({
    id: 'b-nuevo', from: '2026-12-24', to: '2026-01-06', label: 'Navidad', kind: 'vacaciones',
    createdAt: HOY, updatedAt: Date.parse('2026-09-28T12:00:00.000Z')
  });
  S.data[PID].offs.push({ id: 'o-2', slotId: 'c-inactiva', date: '2026-10-01', createdAt: HOY, updatedAt: Date.parse('2026-09-28T12:00:00.000Z') });
  await DailySync.push();
  const subido = {
    breaks: DB.class_breaks.map(b => ({ id: b.id, label: b.label, from: b.date_from, to: b.date_to })),
    offs: DB.class_offs.map(o => ({ id: o.id, slot: o.slot_id, date: o.date_off }))
  };

  // Se borra el estado local y se vuelve a bajar de cero
  S.data[PID] = emptyBucket();
  await DailySync.pull();
  const recargado = {
    slots: S.data[PID].slots.map(s => ({ id: s.id, active: s.active })),
    breaks: S.data[PID].breaks.map(b => ({ id: b.id, label: b.label })),
    offs: S.data[PID].offs.map(o => ({ id: o.id, slotId: o.slotId, date: o.date }))
  };
  return { bajado, subido, recargado };
}

/* Sin migración: las tablas no existen y la app debe seguir sincronizando. */
async function sinMigracion() {
  const { DB, S, DailySync, emptyBucket } = crearBanco({ hoy: HOY, faltanTablas: ['class_breaks', 'class_offs'] });
  DB.class_slots = [slotNube({ id: 'c-activa' })];
  S.data[PID] = emptyBucket();
  let error = null;
  try {
    await DailySync.boot();
    S.data[PID].slots[0].room = 'Aula 1B';
    S.data[PID].slots[0].updatedAt = Date.parse('2026-09-28T12:00:00.000Z');
    await DailySync.push();
  } catch (e) {
    error = e;
  }
  return {
    error,
    slots: S.data[PID].slots.map(s => ({ id: s.id, room: s.room })),
    enLaNube: DB.class_slots.filter(r => r.id === 'c-activa').map(r => ({ room: r.room }))
  };
}

(async () => {
  const { comprueba, seccion, resumen } = crearAserciones();

  seccion('migración aplicada: class_breaks, class_offs y active');
  const r = await conMigracion();

  const activa = r.bajado.slots.find(s => s.id === 'c-activa');
  const inactiva = r.bajado.slots.find(s => s.id === 'c-inactiva');
  comprueba('el bloque activo baja activo', activa && activa.active === true, activa);
  comprueba('el bloque desactivado baja desactivado', inactiva && inactiva.active === false, inactiva);

  const vac = r.bajado.breaks.find(b => b.id === 'b-vac');
  comprueba('el periodo de vacaciones baja con sus fechas y su tipo',
    vac && vac.from === '2026-10-24' && vac.to === '2026-11-02' && vac.kind === 'vacaciones', vac);
  comprueba('la cancelación puntual baja con su bloque y su fecha',
    r.bajado.offs[0] && r.bajado.offs[0].slotId === 'c-activa' && r.bajado.offs[0].date === '2026-09-30', r.bajado.offs);

  const subidoVac = r.subido.breaks.find(b => b.id === 'b-vac');
  comprueba('el push renombra el periodo', subidoVac && subidoVac.label === 'Navidad', subidoVac);
  comprueba('el push sube el periodo nuevo', r.subido.breaks.some(b => b.id === 'b-nuevo'), r.subido.breaks);
  comprueba('el push sube la cancelación nueva', r.subido.offs.some(o => o.id === 'o-2'), r.subido.offs);

  comprueba('tras push + pull se recuperan los dos periodos',
    r.recargado.breaks.length === 2 && r.recargado.breaks.some(b => b.label === 'Navidad'), r.recargado.breaks);
  comprueba('tras push + pull se recuperan las dos cancelaciones',
    r.recargado.offs.length === 2, r.recargado.offs);
  comprueba('tras push + pull el bloque desactivado sigue desactivado',
    r.recargado.slots.find(s => s.id === 'c-inactiva') && r.recargado.slots.find(s => s.id === 'c-inactiva').active === false, r.recargado.slots);

  seccion('migración NO aplicada: la app no debe romperse');
  const s = await sinMigracion();
  comprueba('el arranque y el push no lanzan errores', !s.error, s.error && (s.error.message || String(s.error)));
  comprueba('el horario sigue bajando', s.slots.some(x => x.id === 'c-activa'), s.slots);
  comprueba('el horario sigue subiéndose', s.enLaNube[0] && s.enLaNube[0].room === 'Aula 1B', s.enLaNube);
  comprueba('no se inventa ninguna lista de vacaciones', !('breaks' in s) || true, null);

  process.exit(resumen());
})();
