/* Adopción de perfil en un dispositivo nuevo (web-habitos.vercel.app en blanco).
 *
 * Una cuenta con varios perfiles podía abrir la app vacía en cualquier móvil
 * o navegador nuevo: el pull adoptaba «el perfil más antiguo», que a veces es
 * un perfil provisional sin filas, mientras que tareas y regalos vivían en el
 * otro. Comprueba que:
 *   1) un dispositivo nuevo adopta el perfil que MÁS FILAS POSEE;
 *   2) meta.activeProfileId (lo recordado en los ajustes) manda si existe;
 *   3) un perfil recordado ya borrado cae al que tiene datos;
 *   4) con un solo perfil nada cambia (sin regresiones);
 *   5) save() estampa meta.activeProfileId para que la nube lo recuerde.
 *
 * Uso: node tools/test-profile-adoption.mjs   (también forma parte de test-all.js)
 */
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const UID = 'a0d02ba2-df58-4ab4-a0d4-b7fa8aa6c643';           // cuenta (y perfil antiguo vacío)
const PERFIL_VACIO = UID;
const PERFIL_DATOS = 'd40cbfa2-4230-47b3-bc92-81f2d7b52f20'; // el de la foto, dueño de los datos

let fallos = 0;
const ok = (label, cond, extra) => {
  console.log((cond ? '  OK  ' : ' FALLO') + ' ' + label + (cond ? '' : (extra ? ' → ' + extra : '')));
  if (!cond) fallos++;
};

/* NodeCache agrupa por fichero: para que cada casoree el módulo con estado
 * propio, se importa una copia temporal única (el mismo truco que test-all.js
 * usa para comprobar sintaxis). */
let importSeq = 0;
async function importarModuloFresco(rel) {
  const destino = path.join(os.tmpdir(), 'dailyhub-fresco-' + (importSeq++) + '-' + process.pid + '.mjs');
  fs.copyFileSync(path.join(RAIZ, rel), destino);
  try {
    return await import(pathToFileURL(destino).href);
  } finally {
    try { fs.rmSync(destino, { force: true }); } catch (e) {}
  }
}

/* ---------- dobles: Supabase en memoria ---------- */
function nubePorDefecto() {
  return {
    profiles: [
      // ordenados por created_at: el vacío es el más antiguo (el que adoptaba el bug)
      { id: PERFIL_VACIO, user_id: UID, name: 'Darwin', color: '#2563EB', photo: null, pin: null, pin_len: null, created_at: '2026-10-15T06:46:00Z', updated_at: '2026-10-15T07:13:00Z' },
      { id: PERFIL_DATOS, user_id: UID, name: 'Darwin', color: '#2563EB', photo: 'data:image/png;base64,x', pin: null, pin_len: null, created_at: '2026-10-15T07:06:00Z', updated_at: '2026-10-06T21:38:00Z' }
    ],
    tasks: [
      { id: '11111111-1111-4111-8111-111111111111', user_id: UID, profile_id: PERFIL_DATOS, title: 'Aviso', created_at: '2026-09-22T10:00:00Z', updated_at: '2026-10-14T10:00:00Z' },
      { id: '22222222-2222-4222-8222-222222222222', user_id: UID, profile_id: PERFIL_DATOS, title: 'Ducha', created_at: '2026-09-22T10:01:00Z', updated_at: '2026-10-14T10:01:00Z' },
      { id: '33333333-3333-4333-8333-333333333333', user_id: UID, profile_id: PERFIL_DATOS, title: 'Dientes', created_at: '2026-09-22T10:02:00Z', updated_at: '2026-10-14T10:02:00Z' }
    ],
    people: [
      { id: '44444444-4444-4444-8444-444444444444', user_id: UID, profile_id: PERFIL_DATOS, name: 'Ruth', created_at: '2026-09-22T11:00:00Z', updated_at: '2026-10-14T11:00:00Z' }
    ],
    gifts: [
      { id: '55555555-5555-4555-8555-555555555555', user_id: UID, profile_id: PERFIL_DATOS, title: 'Picnic', created_at: '2026-09-22T12:00:00Z', updated_at: '2026-10-14T12:00:00Z' }
    ],
    notes: [], subjects: [], class_slots: [], class_inbox: [], class_sessions: [],
    class_breaks: [], class_offs: [], tombstones: [],
    settings: [{ user_id: UID, data: {}, meta: {}, updated_at: '2026-10-15T00:00:00Z' }]
  };
}

/* Cualquier cadena de métodos (select/order/limit/eq/in/…) encadena; al
 * resolverse devuelve las filas de la tabla con los filtros aplicados. */
function consultaBuilder(db, table) {
  const filtros = [];
  const b = {
    select: () => b,
    order: () => b,
    limit: () => b,
    lte: () => b,
    gte: () => b,
    delete: () => b,
    upsert: () => b,
    eq: (col, val) => { filtros.push(row => row[col] === val); return b; },
    in: (col, vals) => { filtros.push(row => vals.includes(row[col])); return b; },
    then: (resolve, reject) => Promise.resolve({
      data: (db[table] || []).filter(row => filtros.every(f => f(row))).map(row => ({ ...row })),
      error: null
    }).then(resolve, reject)
  };
  return b;
}

function montarNavegador(db) {
  const session = { user: { id: UID, email: 'darwin@example.com' } };
  globalThis.window = {
    supabase: {
      createClient: () => ({
        from: table => consultaBuilder(db, table),
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
      core: { todayStr: () => '2026-10-21', h: (tag, props, ...kids) => ({ tag, props: props || {}, kids }) },
      render: () => {},
      state: {
        S: null,
        normalizeData: () => {},
        switchProfileData: () => {},
        save: () => {},
        defaultState: () => ({ settings: {}, meta: { onboarded: true } }),
        activeAccountUid: () => UID
      }
    }
  };
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 };
  // Estado de un dispositivo NUEVO: vacío, sin perfiles ni datos.
  window.DailyHub.state.S = {
    profiles: [], activeProfileId: null,
    people: [], tasks: [], gifts: [], notes: [],
    subjects: [], slots: [], inbox: [], sessions: [], breaks: [], offs: [], activeSession: null,
    settings: { updatedAt: 0 }, meta: { onboarded: true }, data: {}
  };
}

async function pullEnDispositivoNuevo(db, metaCloud) {
  if (metaCloud) db.settings[0].meta = metaCloud;
  montarNavegador(db);
  await importarModuloFresco('app-sync.js');
  window.DailySync.status.state = 'online';
  const okPull = await window.DailySync.pull();
  return { okPull, S: window.DailyHub.state.S };
}

/* ---------- 1. dispositivo nuevo adopta el perfil con datos ---------- */
{
  const { okPull, S } = await pullEnDispositivoNuevo(nubePorDefecto());
  ok('el pull de un dispositivo nuevo termina bien', okPull === true, String(okPull));
  ok('adopta el perfil que tiene datos, no el más antiguo', S.activeProfileId === PERFIL_DATOS, S.activeProfileId);
  ok('carga las tareas del perfil adoptado', ((S.data[PERFIL_DATOS] || {}).tasks || []).length === 3);
  ok('carga regalos y personas', ((S.data[PERFIL_DATOS] || {}).gifts || []).length === 1 &&
    ((S.data[PERFIL_DATOS] || {}).people || []).length === 1);
}

/* ---------- 2. meta.activeProfileId recordado manda ---------- */
{
  const { S } = await pullEnDispositivoNuevo(nubePorDefecto(), { activeProfileId: PERFIL_DATOS });
  ok('el perfil recordado en meta se respeta', S.activeProfileId === PERFIL_DATOS, S.activeProfileId);
}
{
  // También si el recordado es el otro perfil: es una elección del usuario.
  const { S } = await pullEnDispositivoNuevo(nubePorDefecto(), { activeProfileId: PERFIL_VACIO });
  ok('una elección explícita del usuario gana sobre el heuristic', S.activeProfileId === PERFIL_VACIO, S.activeProfileId);
}

/* ---------- 3. perfil recordado ya borrado → cae al de datos ---------- */
{
  const { S } = await pullEnDispositivoNuevo(nubePorDefecto(), { activeProfileId: '99999999-9999-4999-8999-999999999999' });
  ok('un perfil recordado inexistente cae al que tiene datos', S.activeProfileId === PERFIL_DATOS, S.activeProfileId);
}

/* ---------- 4. un solo perfil: sin regresiones ---------- */
{
  const db = nubePorDefecto();
  db.profiles = [db.profiles[0]];                            // solo el «vacío»…
  for (const tabla of ['tasks', 'people', 'gifts']) {        // …que ahora sí tiene datos
    db[tabla].forEach(fila => { fila.profile_id = PERFIL_VACIO; });
  }
  const { S } = await pullEnDispositivoNuevo(db);
  ok('con un solo perfil se adopta ese perfil', S.activeProfileId === PERFIL_VACIO, String(S.activeProfileId));
  ok('y sus datos se cargan en su bucket', ((S.data[PERFIL_VACIO] || {}).tasks || []).length === 3);
}

/* ---------- 5. save() estampa meta.activeProfileId ---------- */
{
  const escrituras = new Map();
  globalThis.localStorage = {
    getItem: k => (escrituras.has(k) ? escrituras.get(k) : null),
    setItem: (k, v) => escrituras.set(k, String(v)),
    removeItem: k => escrituras.delete(k),
    key: i => [...escrituras.keys()][i] ?? null,
    get length() { return escrituras.size; }
  };
  escrituras.set('dailyhub_v2:active', UID);   // cuenta activa: save() serializa en su clave
  globalThis.document = {
    documentElement: {
      getAttribute: () => null, setAttribute: () => {}, removeAttribute: () => {},
      dataset: {}, style: { setProperty: () => {} }
    }
  };
  const store = await importarModuloFresco('src/state/store.js');
  const app = {
    core: { todayStr: () => '2026-10-21', DEFAULT_CATEGORIES: ['Personal'], DEFAULT_RELATIONSHIPS: ['Amigo/a'] },
    state: {}, components: {}, services: {}, features: {}
  };
  store.registerStore(app);
  app.state.S.profiles = [{ id: PERFIL_VACIO, name: 'A' }, { id: PERFIL_DATOS, name: 'B' }];
  app.state.normalizeData();   // crea un bucket por perfil
  app.state.S.activeProfileId = PERFIL_DATOS;
  app.state.save();
  ok('save() estampa meta.activeProfileId', app.state.S.meta.activeProfileId === PERFIL_DATOS,
    String(app.state.S.meta.activeProfileId));
  const guardado = JSON.parse(escrituras.get('dailyhub_v2:acc:' + UID) || '{}');
  ok('el perfil elegido viaja en el estado persistido', !!(guardado.meta && guardado.meta.activeProfileId === PERFIL_DATOS));
  app.state.S.activeProfileId = PERFIL_VACIO;
  app.state.save();
  ok('cambiar de perfil actualiza el recordatorio', app.state.S.meta.activeProfileId === PERFIL_VACIO,
    String(app.state.S.meta.activeProfileId));
}

console.log(fallos ? '\n' + fallos + ' comprobaciones fallan' : '\nAdopción de perfil: todo pasa');
if (fallos) process.exit(1);
