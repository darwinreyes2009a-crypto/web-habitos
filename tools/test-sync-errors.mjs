/* Fase E — fiabilidad de sync (docs/auditoria-fase1.md, P2.15 y P2.18).
 *
 * Carga app-sync.js con dobles de Supabase/navegador y comprueba que:
 *   1) un fallo de red y un rechazo del servidor NO se etiquetan igual
 *      (P2.15: un HTTP 400 se mostraba como «Sin conexión»);
 *   2) la política de reintento no martillea un rechazo del servidor en bucle;
 *   3) un id que no es UUID (p. ej. el perfil 'test-uid') no viaja en ninguna
 *      consulta `.in('id', …)` ni en ningún upsert: eso tiraba TODA la
 *      petición con 400 y se repetía en bucle;
 *   4) el pull cancela si la sesión no es la cuenta activa (P2.18), sin
 *      fusionar nada.
 *
 * Uso: node tools/test-sync-errors.mjs   (también forma parte de test-all.js)
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UID_SESION = 'd40cbfa2-4230-47b3-bc92-81f2d7b52f20';
const UID_CUENTA = UID_SESION;

/* ---------- dobles ---------- */
const avisos = { warn: [], error: [] };
const realWarn = console.warn;
const realError = console.error;
console.warn = (...args) => { avisos.warn.push(args.map(String).join(' ')); };
console.error = (...args) => { avisos.error.push(args.map(String).join(' ')); };

/* Registro de lo que la app manda a la nube. */
const nube = { inCalls: [], upserts: [], selects: 0 };

function sbBuilder(table) {
  const b = {
    table,
    select(cols) { if (String(cols).includes('*')) nube.selects++; b._select = cols; return b; },
    in(col, vals) { nube.inCalls.push({ table, col, vals: [...vals] }); return b; },
    eq() { return b; },
    lte() { return b; },
    gte() { return b; },
    order() { return b; },
    limit() { return b; },
    maybeSingle() { return b; },
    delete() { b._op = 'delete'; return b; },
    upsert(rows) { nube.upserts.push({ table, rows: JSON.parse(JSON.stringify(rows)) }); return b; },
    then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); }
  };
  return b;
}

const session = { user: { id: UID_SESION, email: 'darwin@example.com' } };

globalThis.window = {
  supabase: {
    createClient: () => ({
      from: (table) => sbBuilder(table),
      auth: {
        getSession: async () => ({ data: { session } }),
        onAuthStateChange: () => ({ data: {}, error: null }),
        setSession: async () => ({ data: {}, error: null }),
        signOut: async () => ({ error: null })
      },
      channel: () => ({ on: () => ({ subscribe: () => 'SUBSCRIBED' }) }),
      removeChannel: () => {}
    })
  },
  addEventListener: () => {},
  DailyHub: {
    core: { todayStr: () => '2026-10-13', h: (tag, props, ...kids) => ({ tag, props: props || {}, kids }) },
    render: () => {},
    state: {
      S: null,
      normalizeData: () => {},
      save: () => {},
      activeAccountUid: () => UID_CUENTA
    }
  }
};
globalThis.localStorage = {
  getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0
};

/* Estado local de partida: una cuenta con un perfil de pruebas cuyo id NO es
   UUID (el caso real que producía el bucle de 400) y filas normales. */
window.DailyHub.state.S = {
  profiles: [
    { id: UID_SESION, name: 'Darwin', color: '#2563EB', updatedAt: 1791000000000 },
    { id: 'test-uid', name: 'Test', color: '#2563EB', updatedAt: 1791000000000 }
  ],
  activeProfileId: UID_SESION,
  settings: { theme: 'dark', updatedAt: 1791000000000 },
  meta: { onboarded: true },
  __pendingDeletes: {},
  data: {
    [UID_SESION]: {
      tasks: [{ id: '11111111-2222-4333-8444-555555555555', title: 'Beber agua', updatedAt: 1791000000000 }]
    },
    'test-uid': {
      // id válido pero perfil que la nube no puede guardar (FK uuid)
      tasks: [{ id: '99999999-8888-4777-8666-555555555555', title: 'Tarea huérfana', updatedAt: 1791000000000 }]
    }
  }
};

await import(pathToFileURL(path.join(RAIZ, 'app-sync.js')).href);
const DailySync = window.DailySync;

let fallos = 0;
const ok = (label, cond, extra) => {
  console.log((cond ? '  OK  ' : ' FALLO') + ' ' + label + (cond ? '' : (extra ? ' → ' + extra : '')));
  if (!cond) fallos++;
};

/* ---------- 1. clasificación: red vs servidor ---------- */
const netFail = DailySync.classify({ message: 'TypeError: Failed to fetch' });
const netLoad = DailySync.classify({ message: 'Load failed' });
const srvUuid = DailySync.classify({ code: 'PGRST204', message: 'invalid input syntax for type uuid: "test-uid"' });
const srvHttp = DailySync.classify({ status: 500, message: 'Internal Server Error' });
ok('Failed to fetch se clasifica como red', netFail === 'network', netFail);
ok('Load failed se clasifica como red', netLoad === 'network', netLoad);
ok('error PGRST de Postgres se clasifica como servidor', srvUuid === 'server', srvUuid);
ok('HTTP 500 se clasifica como servidor', srvHttp === 'server', srvHttp);
ok('extrae el estado HTTP del error', DailySync.errorStatus({ status: 400 }) === 400);
ok('sin estado HTTP devuelve null', DailySync.errorStatus({ message: 'x' }) === null);

/* ---------- 2. política de reintento: sin bucle contra el servidor ---------- */
ok('un rechazo del servidor espera 5 minutos', DailySync.retryPolicy.nextDelay('server', 1) === 5 * 60000,
  String(DailySync.retryPolicy.nextDelay('server', 1)));
ok('un conflicto de cuenta también', DailySync.retryPolicy.nextDelay('account', 1) === 5 * 60000);
ok('la red sigue con backoff de 1 s', DailySync.retryPolicy.nextDelay('network', 1) === 1000);
ok('el backoff de red está acotado a 60 s', DailySync.retryPolicy.nextDelay('network', 8) === 60000 &&
  DailySync.retryPolicy.nextDelay('network', 99) === 60000);
ok('tras 3 rechazos seguidos se detiene', DailySync.retryPolicy.shouldRetry('server', DailySync.retryPolicy.serverMax) === false);
ok('antes de 3 sigue reintentando', DailySync.retryPolicy.shouldRetry('server', DailySync.retryPolicy.serverMax - 1) === true);
ok('los fallos de red no se cortan', DailySync.retryPolicy.shouldRetry('network', 99) === true);

/* ---------- 3. push: ningún id no-UUID viaja a la nube ---------- */
const status = DailySync.status;
status.state = 'online';
const pushOk = await DailySync.push();
const idsInvalidos = nube.inCalls.flatMap(call => call.vals).filter(id => !UUID_RE.test(String(id)));
const upsertsInvalidos = nube.upserts.filter(u => u.table !== 'settings').flatMap(u => u.rows)
  .filter(row => row.id != null &&
    (!UUID_RE.test(String(row.id)) || (row.profile_id != null && !UUID_RE.test(String(row.profile_id)))));
const subidaPerfilValido = nube.upserts.some(u => u.table === 'profiles' && u.rows.some(r => r.id === UID_SESION));
const subidaTareaValida = nube.upserts.some(u => u.table === 'tasks' && u.rows.some(r => r.id === '11111111-2222-4333-8444-555555555555'));

ok('el push termina en online (sin 400)', pushOk === true && status.state === 'online' && status.kind === null,
  'pushOk=' + pushOk + ' state=' + status.state + ' kind=' + status.kind);
ok('ninguna consulta .in("id", …) lleva un id que no sea UUID', idsInvalidos.length === 0, JSON.stringify(idsInvalidos));
ok('ningún upsert lleva id o profile_id que no sea UUID', upsertsInvalidos.length === 0, JSON.stringify(upsertsInvalidos.map(r => ({ id: r.id, profile_id: r.profile_id }))));
ok('el perfil con UUID sí se sube', subidaPerfilValido);
ok('la tarea con id y perfil válidos sí se sube', subidaTareaValida);
ok('avisa de las filas que se quedan en local', avisos.warn.some(w => w.includes('no es UUID')), avisos.warn.join(' | '));
ok('no queda ningún reintento programado', status.retryAt === null);

/* ---------- 4. mensaje honesto cuando la nube rechaza ---------- */
status.state = 'error';
status.kind = 'server';
status.http = 400;
status.error = 'invalid input syntax for type uuid';
const etiquetaError = DailySync.errorLabel();
const badgeError = DailySync.badge();
const textoBadge = JSON.stringify(badgeError);
ok('la etiqueta dice que la nube rechaza (no «Sin conexión»)', etiquetaError.includes('rechaza') && !etiquetaError.includes('Sin conexión'), etiquetaError);
ok('la etiqueta incluye el HTTP', etiquetaError.includes('HTTP 400'), etiquetaError);
ok('el badge usa esa etiqueta', textoBadge.includes('La nube rechaza'), textoBadge);
status.kind = 'network';
status.http = null;
status.state = 'offline';
const etiquetaRed = DailySync.errorLabel();
ok('con fallo de red la etiqueta cambia', etiquetaRed.includes('cambios locales') && !etiquetaRed.includes('rechaza'), etiquetaRed);

/* ---------- 5. guarda de aislamiento (P2.18) ---------- */
nube.inCalls.length = 0;
nube.upserts.length = 0;
nube.selects = 0;
window.DailyHub.state.activeAccountUid = () => 'otra-cuenta-distinta';
status.state = 'online';
status.kind = null;
const pullOk = await DailySync.pull();
ok('el pull se cancela si la sesión no es la cuenta activa', pullOk === false, String(pullOk));
ok('el estado expone el motivo (kind account)', status.kind === 'account' && status.state === 'error',
  'kind=' + status.kind + ' state=' + status.state);
ok('la etiqueta habla de la cuenta activa', /cuenta activa/i.test(DailySync.errorLabel()), DailySync.errorLabel());
ok('no se hizo ninguna consulta de datos a la nube en el pull cancelado',
  nube.selects === 0 && nube.inCalls.length === 0 && nube.upserts.length === 0,
  'selects=' + nube.selects + ' in=' + nube.inCalls.length + ' upserts=' + nube.upserts.length);
ok('el motivo queda registrado en la consola', avisos.error.some(e => e.includes('pull cancelado')), avisos.error.slice(-2).join(' | '));
window.DailyHub.state.activeAccountUid = () => UID_CUENTA;

/* La misma guarda en el push: no sube nada con la cuenta equivocada. */
status.state = 'online';
status.kind = null;
nube.upserts.length = 0;
window.DailyHub.state.activeAccountUid = () => 'otra-cuenta-distinta';
const pushCruzado = await DailySync.push();
ok('el push también se cancela con cuentas cruzadas', pushCruzado === false && nube.upserts.length === 0,
  'push=' + pushCruzado + ' upserts=' + nube.upserts.length);
window.DailyHub.state.activeAccountUid = () => UID_CUENTA;

/* ---------- 6. el estado 'error' no deja muerto el reintento ---------- */
/* syncIsOnline debe aceptar 'error' (hay red y sesión; la nube rechazó):
   si no, ni «Sincronizar ahora» ni el reintento podrían volver a probar. */
status.state = 'error';
status.kind = 'server';
status.http = 400;
status.error = 'invalid input syntax for type uuid';
nube.upserts.length = 0;
const reintento = await DailySync.push();
ok('con el estado error el push vuelve a intentarse y se recupera',
  reintento === true && status.state === 'online' && status.kind === null && status.error === null,
  'reintento=' + reintento + ' state=' + status.state + ' kind=' + status.kind);

/* Leer la sesión no demuestra que la nube deje de rechazar: el estado
   'error' debe sobrevivir a un getUser (p. ej. al abrir la hoja de cuenta). */
status.state = 'error';
status.kind = 'server';
status.http = 400;
status.error = 'invalid input syntax for type uuid';
await DailySync.getUser();
ok('leer la sesión no borra el estado error',
  status.state === 'error' && status.kind === 'server' && status.http === 400,
  'state=' + status.state + ' kind=' + status.kind);
status.state = 'online';
status.kind = null;
status.http = null;
status.error = null;

console.warn = realWarn;
console.error = realError;
if (fallos && avisos.error.length) {
  console.log('\nConsola capturada durante el test:');
  for (const line of avisos.error.slice(-6)) console.log('  ' + line.slice(0, 220));
}
console.log('\n' + (fallos ? fallos + ' comprobaciones fallidas' : 'Todo correcto (sync)'));
process.exit(fallos ? 1 : 0);
