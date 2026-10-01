/* Banco de pruebas compartido: ejecuta el app-sync.js real dentro de un vm con
   un doble de Supabase que guarda de verdad lo que se le hace upsert. Así se
   prueba el round-trip local <-> nube con el código de producción, no con una
   reimplementación.

   Uso desde un test:
     const { crearBanco, DailySync, S, DB, PID, UID } = require('./harness.cjs');
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.resolve(__dirname, '..');
const PID = 'p1';
const UID = 'uid-test';

const TABLES = [
  'profiles', 'subjects', 'class_slots', 'class_inbox', 'class_sessions',
  'class_breaks', 'class_offs', 'tombstones',
  'tasks', 'people', 'gifts', 'notes', 'settings'
];

function emptyBucket() {
  return {
    tasks: [], people: [], gifts: [], notes: [], subjects: [], slots: [],
    inbox: [], sessions: [], breaks: [], offs: [], activeSession: null, __del: {}
  };
}

/* ---------- contadores de comprobaciones ---------------------------------- */
function crearAserciones() {
  const estado = { fallos: 0, total: 0 };
  const comprueba = (etiqueta, ok, detalle) => {
    estado.total++;
    console.log((ok ? '  OK  ' : ' FALLO') + ' ' + etiqueta + (ok ? '' : '  -> ' + JSON.stringify(detalle)));
    if (!ok) estado.fallos++;
  };
  const seccion = titulo => console.log('\n== ' + titulo + ' ==');
  const resumen = () => {
    console.log('\n' + (estado.fallos ? estado.fallos + ' de ' + estado.total + ' comprobaciones fallidas' : 'Todo correcto (' + estado.total + ' comprobaciones)'));
    return estado.fallos ? 1 : 0;
  };
  return { comprueba, seccion, resumen, estado };
}

/* ---------- doble de Supabase --------------------------------------------- */
function crearSupabase(DB, opciones) {
  const op = opciones || {};
  const from = tabla => {
    const store = DB[tabla] || (DB[tabla] = []);
    // Una tabla opcional que no existe responde con error, como en una
    // instalación a la que todavía no se le aplicó la migración.
    if (op.faltanTablas && op.faltanTablas.includes(tabla)) {
      const roto = {
        select: () => roto, insert: () => roto, upsert: () => roto, update: () => roto,
        delete: () => roto, eq: () => roto, in: () => roto, lte: () => roto, order: () => roto, limit: () => roto,
        then: (res, rej) => Promise.resolve({ data: null, error: { message: 'relation "' + tabla + '" does not exist' } }).then(res, rej)
      };
      return roto;
    }
    const st = { mode: 'select', rows: null, columns: '*' };
    const missingColumns = new Set((op.faltanColumnas && op.faltanColumnas[tabla]) || []);
    const run = () => {
      if (op.selectError && st.mode === 'select') return Promise.resolve({ data: null, error: op.selectError });
      if (st.mode === 'upsert' && Array.isArray(st.rows)) {
        const invalidColumn = st.rows.flatMap(row => Object.keys(row || [])).find(column => missingColumns.has(column));
        if (invalidColumn) return Promise.resolve({ data: null, error: { message: 'column "' + invalidColumn + '" does not exist' } });
        for (const row of st.rows) {
          const at = store.findIndex(r => r.id === row.id);
          if (at >= 0) store[at] = row;
          else store.push(row);
        }
        return Promise.resolve({ data: st.rows, error: null });
      }
      if (st.mode === 'delete') return Promise.resolve({ data: [], error: null });
      if (tabla === 'tombstones') return Promise.resolve({ data: [], error: null });
      if (st.columns !== '*') {
        const invalidColumn = String(st.columns).split(',').map(column => column.trim()).find(column => missingColumns.has(column));
        if (invalidColumn) return Promise.resolve({ data: null, error: { message: 'column "' + invalidColumn + '" does not exist' } });
      }
      return Promise.resolve({ data: store.map(r => ({ ...r })), error: null });
    };
    let proxy;
    const q = {
      select: columns => { st.columns = columns || '*'; st.mode = 'select'; return proxy; }, insert: () => proxy,
      upsert: filas => { st.mode = 'upsert'; st.rows = filas; return proxy; },
      update: () => proxy, delete: () => { st.mode = 'delete'; return proxy; },
      eq: () => proxy, in: () => proxy, lte: () => proxy, order: () => proxy, limit: () => proxy,
      then: (res, rej) => run().then(res, rej)
    };
    proxy = new Proxy(q, { get: (t, k) => t[k] });
    return proxy;
  };

  return {
    auth: {
      getSession: async () => {
        if (op.authError) throw (op.authError instanceof Error ? op.authError : new Error(String(op.authError)));
        return { data: { session: { user: { id: UID } } } };
      },
      getUser: async () => ({ data: { session: { user: { id: UID } } } }),
      setSession: async () => ({ data: { session: { user: { id: UID } } } }),
      signOut: async () => ({}),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
    },
    from,
    channel: () => { const ch = { on: () => ch, subscribe: () => ({}) }; return ch; },
    removeChannel: () => {}
  };
}

/* ---------- entorno y arranque ------------------------------------------- */
function crearBanco(opciones) {
  const op = opciones || {};
  const DB = {};
  for (const tabla of TABLES) DB[tabla] = [];

  const S = {
    meta: { onboarded: true, version: 1 },
    settings: {},
    profiles: [{ id: PID, name: 'Darwin', color: '#2563EB', updatedAt: 1, createdAt: 1 }],
    activeProfileId: PID,
    data: { [PID]: emptyBucket() },
    __pendingDeletes: {}
  };

  const DailyHub = {
    state: {
      S,
      SYNC_KEYS: [],
      save() {}, normalizeData() {}, switchProfileData() {},
      trackDeletes() {}, rememberPendingDeletes() {}
    },
    core: {
      todayStr: () => op.hoy || '2026-09-27',
      parseYmd: value => new Date(value + 'T00:00:00'),
      toYmd: date => date.toISOString().slice(0, 10),
      uid: prefix => String(prefix || 'id') + '-' + Math.random().toString(16).slice(2)
    },
    domain: {}
  };

  const sb = crearSupabase(DB, op);
  const localStorage = {
    _d: {},
    getItem(k) { return k in this._d ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; }
  };

  const networkListeners = {};
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, Promise, Date, JSON, Math, localStorage,
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(16).slice(2) },
    navigator: { onLine: op.onLine !== false },
    location: { origin: 'https://test', href: 'https://test/' },
    fetch: async () => ({ ok: false, status: 0 }),
    document: { addEventListener() {}, visibilityState: 'visible' },
    window: null,
    addEventListener(type, callback) {
      (networkListeners[type] || (networkListeners[type] = [])).push(callback);
    }
  };
  sandbox.window = sandbox;
  sandbox.supabase = { createClient: () => sb };
  sandbox.DailyHub = DailyHub;
  sandbox.self = sandbox;
  sandbox.DailySync = undefined;

  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'app-sync.js'), 'utf8'), sandbox, { filename: 'app-sync.js' });

  function emitNetwork(type) {
    if (type === 'online') sandbox.navigator.onLine = true;
    if (type === 'offline') sandbox.navigator.onLine = false;
    for (const callback of networkListeners[type] || []) callback();
  }

  return { DB, S, DailyHub, sb, DailySync: sandbox.DailySync, PID, UID, emptyBucket, RAIZ, emitNetwork, sandbox };
}

module.exports = { crearBanco, crearAserciones, emptyBucket, PID, UID, RAIZ };
