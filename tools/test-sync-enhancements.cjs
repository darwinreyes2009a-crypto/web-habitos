/* Round-trip de mejoras opcionales para tasks y notes contra app-sync.js real. */
const { crearBanco, crearAserciones, PID } = require('./harness.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  const { comprueba, seccion, resumen } = crearAserciones();
  const extraTaskColumns = ['kind', 'target', 'unit', 'goal_per_week', 'log', 'skips', 'priority', 'due_date', 'steps'];
  const extraNoteColumns = ['tags', 'deleted_at'];

  seccion('migración aplicada: campos de rutina y notas');
  {
    const { DB, S, DailySync, emptyBucket } = crearBanco();
    S.data[PID] = emptyBucket();
    S.data[PID].tasks.push({
      id: 't-new', title: 'Leer', kind: 'amount', target: 20, unit: 'páginas', goal: 4,
      log: { '2026-09-28': 7 }, skips: ['2026-09-27'], priority: 2,
      dueDate: '2026-10-02', steps: [{ id: 'st1', title: 'Abrir libro', done: true }],
      freq: { type: 'daily' }, completions: ['2026-09-28'], updatedAt: Date.now()
    });
    S.data[PID].notes.push({
      id: 'n-new', text: 'Repasar', tags: ['examen', 'mate'], deletedAt: '2026-09-28T11:00:00.000Z',
      date: '2026-09-28', done: false, starred: true, updatedAt: Date.now()
    });
    await DailySync.boot();
    comprueba('las columnas de tareas se suben completas', extraTaskColumns.every(key => key in DB.tasks.find(row => row.id === 't-new')), DB.tasks.find(row => row.id === 't-new'));
    comprueba('tags y papelera se suben', extraNoteColumns.every(key => key in DB.notes.find(row => row.id === 'n-new')), DB.notes.find(row => row.id === 'n-new'));
    S.data[PID] = emptyBucket();
    await DailySync.pull();
    const task = S.data[PID].tasks.find(row => row.id === 't-new');
    const note = S.data[PID].notes.find(row => row.id === 'n-new');
    comprueba('el pull restaura prioridad, plazo, pasos y log', task && task.priority === 2 && task.dueDate === '2026-10-02' && task.steps[0].done && task.log['2026-09-28'] === 7, task);
    comprueba('el pull restaura etiquetas y estado archivado', note && note.tags.join(',') === 'examen,mate' && !!note.deletedAt, note);
  }

  seccion('fallo transitorio de la sonda: no se fija el esquema como ausente');
  {
    const opciones = { selectError: { code: 'PGRST000', message: 'network connection timeout' } };
    const { S, DB, DailySync, emptyBucket } = crearBanco(opciones);
    S.data[PID] = emptyBucket();
    S.data[PID].tasks.push({ id: 't-retry', title: 'Reintentar', freq: { type: 'daily' }, completions: [] });
    DailySync.status.state = 'online';
    const first = await DailySync.pull();
    comprueba('un error de red de sonda no se confunde con columnas faltantes', !first && DailySync.status.state === 'offline' && /timeout/.test(DailySync.status.error || ''), DailySync.status);
    DailySync.cancelRetry();
    opciones.selectError = null;
    DailySync.status.state = 'online';
    const ok = await DailySync.pull();
    comprueba('el siguiente intento en la misma instancia vuelve a sondear y sincroniza', ok && DB.tasks.some(row => row.id === 't-retry'), DailySync.status);
  }

  seccion('reintentos de conexión, recuperación y cierre de sesión');
  {
    const { S, DB, DailySync, emptyBucket, emitNetwork } = crearBanco({ onLine: false });
    S.data[PID] = emptyBucket();
    S.data[PID].tasks.push({ id: 't-offline', title: 'Sin conexión', freq: { type: 'daily' }, completions: [] });
    const offlineBoot = await DailySync.boot();
    comprueba('el arranque offline conserva los datos locales y no crea retry prematuro', offlineBoot === undefined && DailySync.status.state === 'offline' && DB.tasks.length === 0 && DailySync.status.retryAt === null, DailySync.status);
    emitNetwork('online');
    await delay(20);
    comprueba('al volver la red sincroniza los datos locales', DailySync.status.state === 'online' && DB.tasks.some(row => row.id === 't-offline'), { status: DailySync.status, rows: DB.tasks });
    DailySync.status.state = 'offline';
    const pushOk = await DailySync.push();
    comprueba('un push explícito desde offline rechaza sin cambiar a loggedout', pushOk === false && DailySync.status.state === 'offline', DailySync.status);
    DailySync.cancelRetry();
    DailySync.status.state = 'loggedout';
    emitNetwork('offline');
    emitNetwork('online');
    await delay(10);
    comprueba('una reconexión no reactiva un usuario que cerró sesión', DailySync.status.state === 'loggedout', DailySync.status);
  }

  seccion('sin columnas opcionales: se conserva la sincronización básica');
  {
    const faltanColumnas = { tasks: extraTaskColumns, notes: extraNoteColumns };
    const { DB, S, DailySync, emptyBucket } = crearBanco({ faltanColumnas });
    S.data[PID] = emptyBucket();
    S.data[PID].tasks.push({ id: 't-basic', title: 'Caminar', freq: { type: 'daily' }, completions: [], priority: 2, steps: [{ id: 'st', title: 'Salir' }] });
    S.data[PID].notes.push({ id: 'n-basic', text: 'Apunte', tags: ['privado'], deletedAt: '2026-09-28T00:00:00.000Z' });
    let error = null;
    try { await DailySync.boot(); } catch (caught) { error = caught; }
    comprueba('la app sincroniza aunque las columnas nuevas no existan', !error && DB.tasks.some(row => row.id === 't-basic') && DB.notes.some(row => row.id === 'n-basic'), error && error.message);
    const taskRow = DB.tasks.find(row => row.id === 't-basic');
    const noteRow = DB.notes.find(row => row.id === 'n-basic');
    comprueba('los detalles opcionales no se envían a una base sin migrar', !!taskRow && !!noteRow && !extraTaskColumns.some(key => key in taskRow) && !extraNoteColumns.some(key => key in noteRow), { task: taskRow, note: noteRow });
  }

  return resumen();
}

run().then(code => process.exit(code)).catch(error => {
  console.error(error);
  process.exit(1);
});
