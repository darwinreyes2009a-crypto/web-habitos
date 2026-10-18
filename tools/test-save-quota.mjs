/* Fase E — almacenamiento (docs/auditoria-fase1.md, P2.16).
 *
 * `save()` llamaba «almacenamiento lleno» a CUALQUIER error de escritura y se
 * quedaba en un toast sin salida. Aquí se comprueba que:
 *   1) un error de cuota se identifica como tal, se registra con el uso real
 *      y ofrece exportar la copia;
 *   2) cualquier otro error NO se disfraza de cuota llena y ofrece reintentar;
 *   3) el fallo queda expuesto (saveIssue) y desaparece cuando vuelve a
 *      escribirse, y save() devuelve false sólo si falló;
 *   4) aunque falle el disco, si hay nube se sigue programando el push: el
 *      cambio no se pierde del todo.
 *
 * Uso: node tools/test-save-quota.mjs   (también forma parte de test-all.js)
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ACC_UID = 'd40cbfa2-4230-47b3-bc92-81f2d7b52f20';

/* ---------- dobles ---------- */
const avisos = { error: [] };
const realError = console.error;
console.error = (...args) => { avisos.error.push(args.map(String).join(' ')); };

const toasts = [];          // { message, action }
const pushes = [];          // intentos de push a la nube
let modo = 'ok';            // 'ok' | 'quota' | 'otro'
let backupAbierto = 0;

globalThis.console = console;
const guardado = new Map();   // localStorage en memoria
const storageStub = {
  get length() { return guardado.size; },
  key: (i) => [...guardado.keys()][i] ?? null,
  getItem: (k) => (guardado.has(k) ? guardado.get(k) : null),
  setItem: (k, v) => {
    if (modo === 'quota') { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
    if (modo === 'otro') { const e = new Error('cruce extraño de memoria'); e.name = 'TypeError'; throw e; }
    guardado.set(k, String(v));
  },
  removeItem: (k) => { guardado.delete(k); }
};
// Node puede exponer `localStorage` como propiedad de sólo lectura.
Object.defineProperty(globalThis, 'localStorage', { value: storageStub, configurable: true, writable: true });

const app = {
  core: {
    todayStr: () => '2026-10-13',
    DEFAULT_CATEGORIES: ['Personal', 'Trabajo'],
    DEFAULT_RELATIONSHIPS: ['Familia', 'Amigo/a']
  },
  components: {
    toast: (message, action) => toasts.push({ message, action })
  },
  features: {
    backupSheet: () => { backupAbierto++; }
  },
  services: {
    sync: {
      status: { state: 'online' },
      push: () => { pushes.push(Date.now()); return Promise.resolve(true); }
    }
  },
  state: {}
};

/* applyTheme/switchProfileData tocan el DOM; el store solo necesita que
   existan a nivel de objeto. */
globalThis.document = {
  documentElement: { style: { setProperty: () => {}, removeProperty: () => {} }, dataset: {}, setAttribute: () => {}, getAttribute: () => null, removeAttribute: () => {} },
  createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {} })
};
globalThis.window = { matchMedia: () => ({ matches: false, addEventListener: () => {} }), addEventListener: () => {} };

let fallos = 0;
const ok = (label, cond, extra) => {
  console.log((cond ? '  OK  ' : ' FALLO') + ' ' + label + (cond ? '' : (extra ? ' → ' + extra : '')));
  if (!cond) fallos++;
};

const { registerStore } = await import(pathToFileURL(path.join(RAIZ, 'src', 'state', 'store.js')).href);
registerStore(app);

const { save, saveIssue, isQuotaError, S, replaceState, ACC_PREFIX, activeAccountUid } = app.state;

/* Estado de partida: una cuenta reclamada con datos. */
replaceState({
  profiles: [{ id: 'pr-1', name: 'Darwin', color: '#2563EB', updatedAt: Date.now() }],
  activeProfileId: 'pr-1',
  people: [], tasks: [{ id: 't1', title: 'Agua', updatedAt: Date.now() }], gifts: [], notes: [],
  subjects: [], slots: [], inbox: [], sessions: [], breaks: [], offs: [], activeSession: null,
  settings: { theme: 'light', fontScale: 1, highContrast: false, reduceMotion: 'auto', haptics: true, categories: ['Personal'], relationships: ['Familia'], taskTemplates: [], scheduleTemplates: [], notif: {}, updatedAt: Date.now() },
  meta: { onboarded: true, created: '2026-10-13', lastNotified: null },
  data: {},
  __pendingDeletes: {}
});
/* claimAccount vive en el mismo módulo; si está, lo usamos, si no, sembramos
   el índice directamente para que activeAccountUid() devuelva la cuenta. */
if (typeof app.state.claimAccount === 'function') app.state.claimAccount(ACC_UID, 'darwin@example.com');
else guardado.set('dailyhub_v2:accounts', JSON.stringify([{ uid: ACC_UID, email: 'darwin@example.com' }]));
guardado.set('dailyhub_v2:active', ACC_UID);

/* ---------- 1. guardado normal ---------- */
toasts.length = 0;
const okNormal = save();
ok('un guardado normal devuelve true', okNormal === true, String(okNormal));
ok('no quedan avisos pendientes', saveIssue() === null, JSON.stringify(saveIssue()));
ok('el estado se escribió en la cuenta activa', (guardado.get(ACC_PREFIX + ACC_UID) || '').includes('"activeProfileId"'));

/* ---------- 2. cuota llena ---------- */
toasts.length = 0; pushes.length = 0;
modo = 'quota';
const okCuota = save();
const avisoCuota = toasts[toasts.length - 1] || {};
ok('con cuota llena save() devuelve false', okCuota === false, String(okCuota));
ok('el aviso dice que es almacenamiento lleno', /lleno/i.test(avisoCuota.message || ''), avisoCuota.message);
ok('el aviso informa del uso en KB', /\d+\s*KB/.test(avisoCuota.message || ''), avisoCuota.message);
ok('el aviso ofrece exportar la copia', !!(avisoCuota.action && avisoCuota.action.label === 'Exportar copia'), JSON.stringify(avisoCuota.action));
avisoCuota.action && avisoCuota.action.fn();
ok('la acción abre la hoja de copia de seguridad', backupAbierto === 1, String(backupAbierto));
ok('el fallo queda expuesto como cuota', saveIssue() && saveIssue().kind === 'quota', JSON.stringify(saveIssue()));
// El push se programa con retardo (1,2 s) tras cada guardado; se espera aquí.
await new Promise(resolve => setTimeout(resolve, 1300));
ok('aunque falle el disco, con nube online se programa el push', pushes.length >= 1, String(pushes.length));
const antesDeReintentar = backupAbierto;

/* ---------- 3. recuperación: al volver a poder escribir, el aviso se retira ---------- */
modo = 'ok';
const okRecupera = save();
ok('vuelve a guardar con normalidad', okRecupera === true);
ok('el aviso de cuota desaparece', saveIssue() === null, JSON.stringify(saveIssue()));

/* ---------- 4. otros errores NO se disfrazan de cuota ---------- */
toasts.length = 0;
modo = 'otro';
const okOtro = save();
const avisoOtro = toasts[toasts.length - 1] || {};
ok('un error distinto no se llama «almacenamiento lleno»', !/lleno/i.test(avisoOtro.message || ''), avisoOtro.message);
ok('el mensaje conserva el error original', (avisoOtro.message || '').includes('cruce extraño de memoria'), avisoOtro.message);
ok('ofrece reintentar', !!(avisoOtro.action && avisoOtro.action.label === 'Reintentar'), JSON.stringify(avisoOtro.action));
ok('queda registrado como error genérico', saveIssue() && saveIssue().kind === 'error', JSON.stringify(saveIssue()));
ok('save() devuelve false', okOtro === false);
/* Reintentar vuelve a llamar a save y, con el modo ya saneado, escribe. */
modo = 'ok';
avisoOtro.action && avisoOtro.action.fn();
ok('reintentar escribe el estado', (guardado.get(ACC_PREFIX + ACC_UID) || '').includes('"activeProfileId"'));
ok('y retira el aviso', saveIssue() === null);

/* ---------- 5. clasificador de errores ---------- */
ok('reconoce QuotaExceededError', isQuotaError({ name: 'QuotaExceededError' }) === true);
ok('reconoce el código legacy 22', isQuotaError({ code: 22 }) === true);
ok('no confunde un error normal con cuota', isQuotaError(new Error('x')) === false);

console.error = realError;
console.log('\n' + (fallos ? fallos + ' comprobaciones fallidas' : 'Todo correcto (cuota de almacenamiento)'));
process.exit(fallos ? 1 : 0);
