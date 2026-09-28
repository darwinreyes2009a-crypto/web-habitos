/* ============================================================
   DailyHub — Capa de datos con Supabase (app-sync.js)
   - Cuentas por email: cada dispositivo guarda la sesión de su usuario
   - Sync POR FILAS con reloj updated_at (last-writer-wins)
   - Borrados = tombstone temporal + DELETE físico de la fila en la nube
   ============================================================ */
'use strict';

const SUPABASE_URL = 'https://clarchsmxdrqvbatfgkp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PEiFsRJrzlSx81AWS4VaGA_Bkkf5Gz7';
const SYNC_STATUS = { state: 'loading', error: null, lastSyncAt: null, retryAt: null };  // loading | online | offline | loggedout

const authBlobKey = (uid) => 'dailyhub_v2:auth:' + uid;          // blob de sesión guardado por cuenta

window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ---------- helpers de sesion ---------- */
async function syncGetUser() {
  try {
    const { data } = await window.sb.auth.getSession();
    const user = data && data.session ? data.session.user : null;
    if (user) {
      // Una lectura local de la sesión puede funcionar sin red. No declares
      // una sincronización online si el navegador ya sabe que no hay conexión,
      // ni revivas una sesión que el usuario cerró mientras había una llamada.
      if (SYNC_STATUS.state !== 'loggedout') {
        SYNC_STATUS.state = typeof navigator === 'undefined' || navigator.onLine !== false ? 'online' : 'offline';
      }
    } else {
      SYNC_STATUS.state = 'loggedout';
    }
    return user;
  } catch (e) {
    if (SYNC_STATUS.state !== 'loggedout') {
      SYNC_STATUS.state = 'offline';
      SYNC_STATUS.error = e && (e.message || String(e));
      scheduleSyncRetry();
    }
    return null;
  }
}

function syncIsOnline() {
  return !!(window.sb && SYNC_STATUS.state === 'online' && (typeof navigator === 'undefined' || navigator.onLine !== false));
}
async function syncSessionStill(uid) {
  if (!window.sb || SYNC_STATUS.state === 'loggedout') return false;
  try {
    const { data } = await window.sb.auth.getSession();
    return !!(data && data.session && data.session.user && data.session.user.id === uid);
  } catch (e) { return false; }
}

/* Custodia de sesión por cuenta: al abrir la app restauramos el token de la
   última cuenta usada sin pedir el email otra vez. */
function saveAuthBlob(session) {
  if (!session || !session.user) return;
  try { localStorage.setItem(authBlobKey(session.user.id), JSON.stringify(session)); } catch (e) {}
}
(async () => {
  try {
    window.sb.auth.onAuthStateChange((event, session) => {
      if (session) saveAuthBlob(session);
    });
  } catch (e) {}
})();

async function restoreSession(userId) {
  try {
    const raw = localStorage.getItem(authBlobKey(userId));
    if (!raw) return null;
    const blob = JSON.parse(raw);
    if (!blob.access_token) { SYNC_STATUS.state = 'loggedout'; return null; }
    await window.sb.auth.setSession({ access_token: blob.access_token, refresh_token: blob.refresh_token });
    const { data } = await window.sb.auth.getSession();
    const user = data && data.session ? data.session.user : null;
    if (!user || user.id !== userId) { SYNC_STATUS.state = 'loggedout'; return null; }
    return user;
  } catch (e) {
    SYNC_STATUS.state = 'offline';
    SYNC_STATUS.error = e && (e.message || String(e));
    return null;
  }
}

async function removeAuthBlob(userId) {
  try {
    const { data } = await window.sb.auth.getSession();
    if (data && data.session && data.session.user && data.session.user.id === userId) {
      await window.sb.auth.signOut();
    }
  } catch (e) {}
  localStorage.removeItem(authBlobKey(userId));
}

/* ---------- mapping local <-> Supabase ---------- */
const SB_TABLES = ['profiles', 'tasks', 'people', 'gifts', 'notes', 'subjects', 'class_slots', 'class_inbox', 'class_sessions', 'class_breaks', 'class_offs'];

const toMs = (v) => (v ? new Date(v).getTime() : 0);
const toIso = (v) => (v ? new Date(v).toISOString() : null);

function rowToProfile(r) {
  return {
    id: r.id, name: r.name, color: r.color, photo: r.photo || '', pin: r.pin || null,
    pinLen: r.pin_len || null,
    updatedAt: toMs(r.updated_at), createdAt: r.created_at
  };
}
function profileToRow(p, uidv) {
  return {
    id: p.id, user_id: uidv, name: p.name, color: p.color || '#2563EB',
    photo: p.photo || null, pin: p.pin || null, pin_len: p.pinLen || null,
    updated_at: toIso(p.updatedAt || null)
  };
}
function isMissingColumnError(error) {
  const code = String(error && error.code || '');
  const message = String(error && error.message || error || '').toLowerCase();
  return code === '42703' || code === 'pgrst204' ||
    /column\b.*\b(does not exist|not found)|could not find\b.*\bcolumn/.test(message);
}
function isMissingTableError(error) {
  const code = String(error && error.code || '');
  const message = String(error && error.message || error || '').toLowerCase();
  return code === '42p01' || code === 'pgrst205' ||
    /relation\b.*\bdoes not exist|table\b.*\b(not found|does not exist)|could not find\b.*\btable/.test(message);
}

function rowToTask(r) {
  const task = {
    id: r.id, title: r.title, icon: r.icon || 'star', cat: r.cat || 'Personal',
    freq: r.freq || { type: 'daily' }, time: r.time || '',
    completions: r.completions || [], updatedAt: toMs(r.updated_at), createdAt: r.created_at
  };
  // Columnas nuevas (tipos, valores, saltos, objetivo). Sin migración aplicada
  // llegan a null y la tarea se comporta como un sí/no de siempre.
  if (r.kind) task.kind = r.kind;
  if (r.target != null) task.target = Number(r.target) || 0;
  if (r.unit) task.unit = r.unit;
  if (r.goal_per_week != null) task.goal = Number(r.goal_per_week) || 0;
  if (r.log && typeof r.log === 'object' && Object.keys(r.log).length) task.log = r.log;
  if (Array.isArray(r.skips) && r.skips.length) task.skips = r.skips;
  if (r.priority != null) task.priority = Number(r.priority) || 0;
  if (r.due_date) task.dueDate = r.due_date;
  if (Array.isArray(r.steps) && r.steps.length) task.steps = r.steps;
  return task;
}
function taskToRow(t, uidv, pid) {
  const row = {
    id: t.id, user_id: uidv, profile_id: pid || null, title: t.title, icon: t.icon || 'star', cat: t.cat || 'Personal',
    freq: t.freq || { type: 'daily' }, time: t.time || '', completions: t.completions || [],
    updated_at: toIso(t.updatedAt || null)
  };
  if (TASK_EXTRA_COLUMNS.kind) {
    // Escribir también los valores vacíos permite limpiar en la nube prioridad,
    // plazo, registros y subtareas cuando el usuario los borra localmente.
    row.kind = t.kind || 'check';
    row.target = Number(t.target) || 0;
    row.unit = String(t.unit || '').slice(0, 24);
    row.goal_per_week = Number(t.goal) || 0;
    row.log = t.log && typeof t.log === 'object' ? t.log : {};
    row.skips = Array.isArray(t.skips) ? t.skips : [];
    row.priority = Math.max(0, Math.min(2, Number(t.priority) || 0));
    row.due_date = t.dueDate || null;
    row.steps = Array.isArray(t.steps) ? t.steps : [];
  }
  return row;
}
/* Sonda de columnas nuevas de tasks (kind, target, unit, goal_per_week, log,
   skips, priority, due_date, steps): se comprueba una vez por sesión y queda en
   cache. Sin la migración aplicada el push las omite y todo sigue funcionando
   como un sí/no de siempre. */
const TASK_EXTRA_COLUMNS = { kind: true };
async function detectTaskExtraColumns() {
  const { error } = await window.sb.from('tasks').select('kind,target,unit,goal_per_week,log,skips,priority,due_date,steps').limit(1);
  if (error) {
    if (!isMissingColumnError(error)) throw error;
    TASK_EXTRA_COLUMNS.kind = false;
  }
}
function rowToPerson(r) {
  return {
    id: r.id, name: r.name, color: r.color, photo: r.photo || '',
    relationship: r.relationship || 'Amigo/a', birthday: r.birthday || '', notes: r.notes || '',
    details: r.details || {},
    updatedAt: toMs(r.updated_at), createdAt: r.created_at
  };
}
function personToRow(p, uidv, pid) {
  return {
    id: p.id, user_id: uidv, profile_id: pid || null, name: p.name, color: p.color || '#2563EB', photo: p.photo || null,
    relationship: p.relationship || 'Amigo/a', birthday: p.birthday || null, notes: p.notes || '',
    details: p.details || {},
    updated_at: toIso(p.updatedAt || null)
  };
}
function rowToNote(r) {
  return {
    id: r.id, text: r.text, kind: r.kind || 'nota', date: r.note_date || window.DailyHub.core.todayStr(), time: r.note_time || '',
    done: !!r.done, starred: !!r.starred,
    subjectId: r.subject_id || null, sessionId: r.session_id || null,
    tags: Array.isArray(r.tags) ? r.tags : [], deletedAt: r.deleted_at || null,
    updatedAt: toMs(r.updated_at), createdAt: r.created_at
  };
}
const NOTE_EXTRA_COLUMNS = { tags: true, deleted_at: true };
async function detectNoteExtraColumns() {
  const { error } = await window.sb.from('notes').select('tags,deleted_at').limit(1);
  if (error) {
    if (!isMissingColumnError(error)) throw error;
    NOTE_EXTRA_COLUMNS.tags = false;
    NOTE_EXTRA_COLUMNS.deleted_at = false;
  }
}
function noteToRow(n, uidv, pid) {
  const row = {
    id: n.id, user_id: uidv, profile_id: pid || null, text: n.text, kind: n.kind || 'nota',
    note_date: n.date || window.DailyHub.core.todayStr(), note_time: n.time || '',
    done: !!n.done, starred: !!n.starred,
    subject_id: n.subjectId || null, session_id: n.sessionId || null,
    updated_at: toIso(n.updatedAt || null)
  };
  if (NOTE_EXTRA_COLUMNS.tags) row.tags = Array.isArray(n.tags) ? n.tags : [];
  if (NOTE_EXTRA_COLUMNS.deleted_at) row.deleted_at = n.deletedAt || null;
  return row;
}
/* ---------- Modo Clase: asignaturas, horario, Para después e historial ---------- */
function rowToSubject(r) {
  return { id: r.id, name: r.name, color: r.color || '#2563EB', icon: r.icon || 'book', updatedAt: toMs(r.updated_at), createdAt: r.created_at };
}
function subjectToRow(s, uidv, pid) {
  return { id: s.id, user_id: uidv, profile_id: pid || null, name: s.name, color: s.color || '#2563EB', icon: s.icon || 'book', updated_at: toIso(s.updatedAt || null) };
}
function rowToSlot(r) {
  return {
    id: r.id, subjectId: r.subject_id || null, day: r.day || 0,
    start: r.start_time || '09:00', end: r.end_time || '10:00', room: r.room || '',
    // La columna `kind` (clase | patio) es nueva. Sin ella se deducia del aula
    // o de que el bloque no tenga asignatura: un hueco sin asignatura es un patio.
    kind: r.kind || (r.room === 'patio' || !r.subject_id ? 'patio' : 'class'),
    // `active` permite desactivar un bloque sin borrarlo (un trimestre entero
    // de una asignatura, o un aula que cambia). Ausente = activo.
    active: r.active === false ? false : true,
    updatedAt: toMs(r.updated_at), createdAt: r.created_at
  };
}
function slotToRow(s, uidv, pid) {
  const row = {
    id: s.id, user_id: uidv, profile_id: pid || null, subject_id: s.subjectId || null, day: s.day || 0,
    start_time: s.start || '09:00', end_time: s.end || '10:00', room: s.room || '',
    active: s.active === false ? false : true,
    updated_at: toIso(s.updatedAt || null)
  };
  if (SLOT_EXTRA_COLUMNS.kind) row.kind = s.kind || (s.room === 'patio' ? 'patio' : 'class');
  return row;
}

/* Sonda de columnas nuevas de class_slots (kind): se comprueba una vez por
   sesión y queda en cache. Sin la migración aplicada el push omite `kind` y el
   patio se sigue reconociendo por el aula o por no tener asignatura. */
const SLOT_EXTRA_COLUMNS = { kind: true };
async function detectSlotExtraColumns() {
  const { error } = await window.sb.from('class_slots').select('kind').limit(1);
  if (error) {
    if (!isMissingColumnError(error)) throw error;
    SLOT_EXTRA_COLUMNS.kind = false;
  }
}

/* Sonda de columnas nuevas de gifts (starred, remind_days): se comprueba una
   vez por sesión y queda en cache. Sin la migración aplicada el push omite
   esas columnas y todo sigue funcionando. */
const GIFT_EXTRA_COLUMNS = { starred: true, remind_days: true };
async function detectGiftExtraColumns() {
  const { error } = await window.sb.from('gifts').select('starred,remind_days').limit(1);
  if (error) {
    if (!isMissingColumnError(error)) throw error;
    GIFT_EXTRA_COLUMNS.starred = false;
    GIFT_EXTRA_COLUMNS.remind_days = false;
  }
}
/* Tablas nuevas que aún no existen en una instalación antigua: se detectan una
   vez por sesión y quedan fuera del push/pull en vez de romper la sincronización.
   Así la app funciona igual sin haber aplicado la migración. */
const MISSING_TABLES = new Set();
async function detectMissingTables() {
  for (const table of OPTIONAL_TABLES) {
    const { error } = await window.sb.from(table).select('id').limit(1);
    if (error) {
      if (!isMissingTableError(error)) throw error;
      MISSING_TABLES.add(table);
    }
  }
}
const OPTIONAL_TABLES = ['class_breaks', 'class_offs'];
let __schemaDetectedForUser = '';
async function ensureSchemaFeatures(userId) {
  if (!userId || __schemaDetectedForUser === userId) return;
  // La primera comprobación puede ocurrir antes de iniciar sesión. Vuelve a
  // sondear por usuario para cubrir login/cambio de cuenta sin recargar.
  TASK_EXTRA_COLUMNS.kind = true;
  SLOT_EXTRA_COLUMNS.kind = true;
  GIFT_EXTRA_COLUMNS.starred = true;
  GIFT_EXTRA_COLUMNS.remind_days = true;
  NOTE_EXTRA_COLUMNS.tags = true;
  NOTE_EXTRA_COLUMNS.deleted_at = true;
  MISSING_TABLES.clear();
  await detectGiftExtraColumns();
  await detectSlotExtraColumns();
  await detectTaskExtraColumns();
  await detectNoteExtraColumns();
  await detectMissingTables();
  __schemaDetectedForUser = userId;
}
// Las tablas que existen siempre; las opcionales se descartan si faltan.
function activeTables() {
  return SB_TABLES.filter(table => !MISSING_TABLES.has(table));
}
function rowToInbox(r) {
  return {
    id: r.id, text: r.text, date: r.item_date || window.DailyHub.core.todayStr(), time: r.item_time || '',
    subjectId: r.subject_id || null, sessionId: r.session_id || null,
    updatedAt: toMs(r.updated_at), createdAt: r.created_at
  };
}
function inboxToRow(x, uidv, pid) {
  return {
    id: x.id, user_id: uidv, profile_id: pid || null, text: x.text,
    item_date: x.date || window.DailyHub.core.todayStr(), item_time: x.time || '',
    subject_id: x.subjectId || null, session_id: x.sessionId || null,
    updated_at: toIso(x.updatedAt || null)
  };
}
function rowToSession(r) {
  return {
    id: r.id, subjectId: r.subject_id || null, slotId: r.slot_id || null,
    date: r.session_date || window.DailyHub.core.todayStr(), start: r.start_time || '', end: r.end_time || '',
    room: r.room || '', endedAt: r.ended_at || null, counts: r.counts || { inbox: 0, notes: 0, important: 0 },
    updatedAt: toMs(r.updated_at), createdAt: r.created_at
  };
}
function sessionToRow(s, uidv, pid) {
  return {
    id: s.id, user_id: uidv, profile_id: pid || null, subject_id: s.subjectId || null, slot_id: s.slotId || null,
    session_date: s.date || window.DailyHub.core.todayStr(), start_time: s.start || '', end_time: s.end || '', room: s.room || '',
    ended_at: s.endedAt || null, counts: s.counts || {},
    updated_at: toIso(s.updatedAt || null)
  };
}
function rowToBreak(r) {
  return {
    id: r.id, from: r.date_from || '', to: r.date_to || '',
    label: r.label || 'No lectivo', kind: r.kind || 'libre',
    updatedAt: toMs(r.updated_at), createdAt: r.created_at
  };
}
function breakToRow(b, uidv, pid) {
  return {
    id: b.id, user_id: uidv, profile_id: pid || null,
    date_from: b.from || null, date_to: b.to || null,
    label: b.label || 'No lectivo', kind: b.kind || 'libre',
    updated_at: toIso(b.updatedAt || null)
  };
}
function rowToOff(r) {
  return {
    id: r.id, slotId: r.slot_id || null, date: r.date_off || '',
    updatedAt: toMs(r.updated_at), createdAt: r.created_at
  };
}
function offToRow(o, uidv, pid) {
  return {
    id: o.id, user_id: uidv, profile_id: pid || null,
    slot_id: o.slotId || null, date_off: o.date || null,
    updated_at: toIso(o.updatedAt || null)
  };
}
function rowToGift(r) {
  return {
    id: r.id, title: r.title, personId: r.person_id || null, price: r.price === null ? '' : r.price,
    targetDate: r.target_date || '', link: r.link || '', occasion: r.occasion || 'Cumpleaños',
    status: r.status || 'Idea', notes: r.notes || '', image: r.image || '',
    starred: !!r.starred, remindDays: r.remind_days == null ? null : Number(r.remind_days),
    updatedAt: toMs(r.updated_at), createdAt: r.created_at
  };
}
function giftToRow(g, uidv, pid) {
  const row = {
    id: g.id, user_id: uidv, profile_id: pid || null, person_id: g.personId || null, title: g.title,
    price: g.price === '' || g.price == null ? null : Number(g.price),
    target_date: g.targetDate || null, link: g.link || '', occasion: g.occasion || 'Cumpleaños',
    status: g.status || 'Idea', notes: g.notes || '', image: g.image || null,
    updated_at: toIso(g.updatedAt || null)
  };
  // Columnas nuevas (favoritas / días de aviso): solo se suben si la migración
  // está aplicada; si no, el INSERT fallaría por columna desconocida.
  if (GIFT_EXTRA_COLUMNS.starred) row.starred = !!g.starred;
  if (GIFT_EXTRA_COLUMNS.remind_days) row.remind_days = g.remindDays == null ? null : Number(g.remindDays);
  return row;
}

const STATE_SLOTS = {
  profiles: 'profiles', tasks: 'tasks', people: 'people', gifts: 'gifts', notes: 'notes',
  subjects: 'subjects', class_slots: 'slots', class_inbox: 'inbox', class_sessions: 'sessions',
  class_breaks: 'breaks', class_offs: 'offs'
};
const DATA_KEYS = ['tasks', 'people', 'gifts', 'notes', 'subjects', 'slots', 'inbox', 'sessions', 'breaks', 'offs'];
function bucketFor(pid) {
  if (!pid) return null;
  if (!window.DailyHub.state.S.data || typeof window.DailyHub.state.S.data !== 'object') window.DailyHub.state.S.data = {};
  if (!window.DailyHub.state.S.data[pid]) window.DailyHub.state.S.data[pid] = { tasks: [], people: [], gifts: [], notes: [], subjects: [], slots: [], inbox: [], sessions: [], breaks: [], offs: [], activeSession: null, __del: {} };
  const b = window.DailyHub.state.S.data[pid];
  if (!b.__del) b.__del = {};
  for (const k of DATA_KEYS) if (!Array.isArray(b[k])) b[k] = [];
  return b;
}
function localListFor(table, pid) {
  const k = STATE_SLOTS[table];
  if (k === 'profiles') return window.DailyHub.state.S.profiles;
  const b = bucketFor(pid);
  if (!b) return [];
  if (!Array.isArray(b[k])) b[k] = [];
  return b[k];
}
function localEntries(table) {
  if (table === 'profiles') return (window.DailyHub.state.S.profiles || []).map(row => ({ row, pid: null }));
  const out = [], index = new Map();
  const add = (row, pid) => {
    if (!row || row.id == null) return;
    const old = index.get(row.id);
    if (old !== undefined) {
      if (toMs(row.updatedAt) > toMs(out[old].row.updatedAt)) out[old] = { row, pid };
      return;
    }
    index.set(row.id, out.length);
    out.push({ row, pid });
  };
  for (const pid of Object.keys((window.DailyHub.state.S && window.DailyHub.state.S.data) || {})) {
    const k = STATE_SLOTS[table];
    for (const row of (window.DailyHub.state.S.data[pid] && window.DailyHub.state.S.data[pid][k]) || []) add(row, pid);
  }
  // Compatibilidad con estados legacy que aún solo tienen las listas globales.
  const activeArr = window.DailyHub.state.S[STATE_SLOTS[table]];
  if (Array.isArray(activeArr)) for (const row of activeArr) add(row, window.DailyHub.state.S.activeProfileId || null);
  return out;
}
function profileBucketIds() {
  const ids = new Set((window.DailyHub.state.S.profiles || []).map(p => p && p.id).filter(Boolean));
  if (window.DailyHub.state.S.activeProfileId) ids.add(window.DailyHub.state.S.activeProfileId);
  for (const pid of Object.keys((window.DailyHub.state.S && window.DailyHub.state.S.data) || {})) if (ids.has(pid)) ids.add(pid);
  return [...ids];
}

/* Claves bajo las que puede vivir un borrado pendiente.
   OJO: el estado local llama `slots`/`inbox`/`sessions` a lo que en Supabase
   es `class_slots`/`class_inbox`/`class_sessions`. El store registra los
   borrados con la clave de ESTADO, mientras que el push trabaja con el nombre
   de TABLA. Hay que mirar las dos o el borrado nunca se sube. */
function deleteKeys(table) {
  const stateKey = STATE_SLOTS[table];
  return stateKey && stateKey !== table ? [table, stateKey] : [table];
}

/* Los borrados pendientes viven normalmente en el bucket del perfil. Durante
   "Borrar todo" pueden quedar en __pendingDeletes porque ya no existe ningún
   perfil activo; gathering/limpieza centralizados para ambos casos. */
function pendingDeleteIds(table) {
  const ids = new Set();
  const keys = deleteKeys(table);
  const S = window.DailyHub.state.S;
  const top = S && S.__pendingDeletes;
  for (const key of keys) {
    if (top && Array.isArray(top[key])) top[key].forEach(id => ids.add(id));
  }
  for (const b of Object.values((S && S.data) || {})) {
    if (!b || !b.__del) continue;
    for (const key of keys) {
      if (Array.isArray(b.__del[key])) b.__del[key].forEach(id => ids.add(id));
    }
  }
  return [...ids];
}
function clearPendingDeleteIds(table) {
  const S = window.DailyHub.state.S;
  const keys = deleteKeys(table);
  if (S && S.__pendingDeletes) {
    for (const key of keys) if (Array.isArray(S.__pendingDeletes[key])) S.__pendingDeletes[key] = [];
  }
  for (const b of Object.values((S && S.data) || {})) {
    if (!b || !b.__del) continue;
    for (const key of keys) if (Array.isArray(b.__del[key])) b.__del[key] = [];
  }
}
function forgetPendingDeleteId(table, id) {
  const S = window.DailyHub.state.S;
  const keys = deleteKeys(table);
  if (S && S.__pendingDeletes) {
    for (const key of keys) {
      if (Array.isArray(S.__pendingDeletes[key])) S.__pendingDeletes[key] = S.__pendingDeletes[key].filter(x => x !== id);
    }
  }
  for (const b of Object.values((S && S.data) || {})) {
    if (!b || !b.__del) continue;
    for (const key of keys) {
      if (Array.isArray(b.__del[key])) b.__del[key] = b.__del[key].filter(x => x !== id);
    }
  }
}

/* ---------- mutex: push y pull nunca se pisan ---------- */
let __syncChain = Promise.resolve();
function syncQueue(fn) {
  const run = __syncChain.then(fn, fn);
  __syncChain = run.catch(() => {});   // la cola sigue viva aunque falle una operacion
  return run;
}

let __syncRetryTimer = null;
let __syncRetryAttempt = 0;
let __retryingSync = false;
function clearSyncRetry() {
  clearTimeout(__syncRetryTimer);
  __syncRetryTimer = null;
  SYNC_STATUS.retryAt = null;
  __syncRetryAttempt = 0;
}
let __syncRetryGeneration = 0;
function cancelSyncRetry() {
  __syncRetryGeneration++;
  clearSyncRetry();
}
function scheduleSyncRetry(delayOverride) {
  if (__syncRetryTimer || SYNC_STATUS.state === 'loggedout' || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  const generation = __syncRetryGeneration;
  __syncRetryAttempt = Math.min(__syncRetryAttempt + 1, 8);
  const delay = delayOverride == null ? Math.min(60000, 1000 * (2 ** (__syncRetryAttempt - 1))) : Math.max(0, delayOverride);
  SYNC_STATUS.retryAt = Date.now() + delay;
  __syncRetryTimer = setTimeout(() => {
    __syncRetryTimer = null;
    SYNC_STATUS.retryAt = null;
    if (generation !== __syncRetryGeneration || SYNC_STATUS.state === 'loggedout') return;
    // syncPullAll is intentionally online-only; allow it to re-check the
    // session and network rather than remaining stuck in the offline state.
    SYNC_STATUS.state = 'online';
    __retryingSync = true;
    syncQueue(syncPullAll).then(ok => {
      __retryingSync = false;
      if (generation !== __syncRetryGeneration || SYNC_STATUS.state === 'loggedout') return;
      if (!ok) {
        if (SYNC_STATUS.state !== 'loggedout') SYNC_STATUS.state = 'offline';
        scheduleSyncRetry();
        if (window.DailyHub && typeof window.DailyHub.render === 'function') window.DailyHub.render();
        return;
      }
      SYNC_STATUS.state = 'online';
      SYNC_STATUS.error = null;
      SYNC_STATUS.lastSyncAt = Date.now();
      clearSyncRetry();
      realtimeStart();
      if (window.DailyHub && typeof window.DailyHub.render === 'function') window.DailyHub.render();
    }).catch(error => {
      __retryingSync = false;
      if (generation !== __syncRetryGeneration || SYNC_STATUS.state === 'loggedout') return;
      SYNC_STATUS.error = error && (error.message || String(error));
      SYNC_STATUS.state = 'offline';
      scheduleSyncRetry();
      if (window.DailyHub && typeof window.DailyHub.render === 'function') window.DailyHub.render();
    });
  }, delay);
}
function registerSyncNetworkEvents() {
  if (typeof window.addEventListener !== 'function' || window.__dailyHubSyncNetworkHooks) return;
  window.__dailyHubSyncNetworkHooks = true;
  window.addEventListener('offline', () => {
    __syncRetryGeneration++;
    clearSyncRetry();
    if (SYNC_STATUS.state !== 'loggedout') SYNC_STATUS.state = 'offline';
    if (window.DailyHub && typeof window.DailyHub.render === 'function') window.DailyHub.render();
  });
  window.addEventListener('online', () => {
    if (SYNC_STATUS.state === 'loggedout') return;
    __syncRetryAttempt = 0;
    SYNC_STATUS.state = 'loading';
    scheduleSyncRetry(0);
    if (window.DailyHub && typeof window.DailyHub.render === 'function') window.DailyHub.render();
  });
}
registerSyncNetworkEvents();

let __rtIgnore = false;   // anti-eco: no reaccionar a los cambios que subimos nosotros
function scheduleRealtimeResume() { setTimeout(() => { __rtIgnore = false; }, 3000); }

/* ---------- push: sube lo que NO está ya en la nube o es más nuevo (por filas) ---------- */
async function syncPushAll() {
  if (!syncIsOnline()) return false;
  const user = await syncGetUser();
  if (!user) return false;
  const uid = user.id;
  if (!(await syncSessionStill(uid))) { scheduleRealtimeResume(); return false; }
  if (__lastPushedAccount !== uid) {
    __lastPushedAccount = uid;
    __lastPushedSettingsAt = 0;
    __lastPushedMetaJson = '';
  }
  __rtIgnore = true;
  try {
    await ensureSchemaFeatures(uid);
    for (const table of activeTables()) {
      const entries = localEntries(table);
      const ids = entries.map(e => e.row.id).filter(Boolean);
      const [sRes, tRes] = await Promise.allSettled([
        ids.length ? window.sb.from(table).select('id,updated_at').in('id', ids) : Promise.resolve({ data: [] }),
        ids.length ? window.sb.from('tombstones').select('id,updated_at').eq('user_id', uid).eq('key', table).in('id', ids) : Promise.resolve({ data: [] })
      ]);
      if (!(await syncSessionStill(uid))) { scheduleRealtimeResume(); return false; }
      if (sRes.status === 'rejected') throw sRes.reason;
      // La consulta de tombstones puede fallar en una instalación antigua;
      // las filas todavía se pueden subir, pero los borrados quedan pendientes.
      if (tRes.status === 'rejected') console.warn('DailyHub: no se pudieron leer los tombstones', tRes.reason && (tRes.reason.message || tRes.reason));
      const serverRows = sRes.status === 'fulfilled' ? (sRes.value.data || []) : [];
      const tsRows = tRes.status === 'fulfilled' ? (tRes.value.data || []) : [];
      const serverUp = new Map(serverRows.map(x => [x.id, toMs(x.updated_at)]));
      const tsUp = new Map(tsRows.map(x => [x.id, toMs(x.updated_at)]));
      const toUpload = [];
      const toRevive = new Set();
      const toDrop = [];
      for (const entry of entries) {
        const x = entry.row;
        const id = x.id;
        const up = toMs(x.updatedAt);
        const tsup = tsUp.get(id);
        // Una edición local posterior al tombstone lo resucita. Hay que
        // retirar el tombstone aunque la fila siga existiendo en la nube:
        // si no, el siguiente pull volvería a ocultarla.
        if (tsup !== undefined && tsup < up) toRevive.add(id);
        if (tsup !== undefined && tsup >= up) { toDrop.push(entry); continue; }
        const sup = serverUp.get(id);
        if (sup === undefined) {
          if (!x.updatedAt) x.updatedAt = Date.now();
          toUpload.push(entry);
        } else if (up > sup) {
          toUpload.push(entry);
        }
      }
      let needRender = false;
      if (toDrop.length) {
        for (const entry of toDrop) {
          const arr = localListFor(table, entry.pid);
          const i = arr.findIndex(x => x.id === entry.row.id);
          if (i >= 0) arr.splice(i, 1);
        }
        needRender = true;
        // Filas muertas ocultas por un tombstone: purga física de la nube.
        // El tombstone se conserva para que un dispositivo desactualizado
        // no resucite la fila con su copia local.
        try {
          const dropIds = toDrop.map(entry => entry.row.id).filter(Boolean);
          for (let j = 0; j < dropIds.length; j += 50) {
            if (!(await syncSessionStill(uid))) { scheduleRealtimeResume(); return false; }
            const { error } = await window.sb.from(table).delete().in('id', dropIds.slice(j, j + 50));
            if (error) throw error;
          }
        } catch (e) {
          console.warn('DailyHub: no se pudieron purgar filas muertas de ' + table, e.message || e);
        }
      }
      if (toRevive.size) {
        if (!(await syncSessionStill(uid))) { scheduleRealtimeResume(); return false; }
        const { error: revErr } = await window.sb.from('tombstones').delete().eq('user_id', uid).eq('key', table).in('id', [...toRevive]);
        if (revErr) throw revErr;
      }
      const map = { profiles: profileToRow, tasks: taskToRow, people: personToRow, gifts: giftToRow, notes: noteToRow,
        subjects: subjectToRow, class_slots: slotToRow, class_inbox: inboxToRow, class_sessions: sessionToRow,
        class_breaks: breakToRow, class_offs: offToRow };
      const rows = toUpload.map(entry => map[table](entry.row, uid, table === 'profiles' ? undefined : entry.pid));
      for (let j = 0; j < rows.length; j += 50) {
        if (!(await syncSessionStill(uid))) { scheduleRealtimeResume(); return false; }
        const { error } = await window.sb.from(table).upsert(rows.slice(j, j + 50), { onConflict: 'id' });
        if (error) throw error;
      }
      // borrados pendientes de este dispositivo → tombstone + DELETE físico en la nube
      const pendDel = pendingDeleteIds(table);
      if (pendDel.length) {
        const now = new Date().toISOString();
        try {
          // El tombstone avisa al resto de dispositivos antes de que la fila
          // desaparezca; en cuanto la fila se borra físicamente se limpia solo.
          const tsRows = pendDel.map(id => ({ user_id: uid, key: table, id, updated_at: now }));
          for (let j = 0; j < tsRows.length; j += 50) {
            const { error } = await window.sb.from('tombstones').upsert(tsRows.slice(j, j + 50), { onConflict: 'user_id,key,id' });
            if (error) throw error;
          }
        } catch (e) {
          // tabla tombstones aún sin migrar: el borrado físico sigue adelante,
          // pero otros dispositivos podrían resucitar la fila hasta aplicar la migración
          console.warn('DailyHub: tombstones no disponibles (aplica la migración)', e.message || e);
        }
        // Borrado físico real: la fila desaparece de Supabase (RLS la limita al usuario).
        try {
          for (let j = 0; j < pendDel.length; j += 50) {
            if (!(await syncSessionStill(uid))) { scheduleRealtimeResume(); return false; }
            const { error } = await window.sb.from(table).delete().in('id', pendDel.slice(j, j + 50));
            if (error) throw error;
          }
          clearPendingDeleteIds(table);   // confirmado: filas borradas y tombstones escritos
        } catch (e) {
          console.error('DailyHub: no se pudo borrar en la nube (' + table + ')', e.message || e);
          // los pendientes se conservan para reintentar en el siguiente push
        }
      }
      if (needRender && window.DailyHub && typeof window.DailyHub.render === 'function') window.DailyHub.render();
      if (needRender && window.DailyHub && typeof window.DailyHub.state.save === 'function') window.DailyHub.state.save();
    }
    // Settings (un row por usuario) — se sube solo si cambió desde el último push
    if (!(await syncSessionStill(uid))) { scheduleRealtimeResume(); return false; }
    const su = (window.DailyHub.state.S.settings && window.DailyHub.state.S.settings.updatedAt) || 0;
    const metaJson = JSON.stringify(window.DailyHub.state.S.meta || {});
    if (su !== __lastPushedSettingsAt || metaJson !== __lastPushedMetaJson) {
      const data = Object.assign({}, window.DailyHub.state.S.settings); delete data.updatedAt;
      const { error } = await window.sb.from('settings').upsert(
        { user_id: uid, data, meta: window.DailyHub.state.S.meta, updated_at: toIso(su || undefined) || new Date().toISOString() },
        { onConflict: 'user_id' });
      if (error) throw error;
      __lastPushedSettingsAt = su;
      __lastPushedMetaJson = metaJson;
    }
    scheduleRealtimeResume();
    SYNC_STATUS.error = null;
    SYNC_STATUS.lastSyncAt = Date.now();
    clearSyncRetry();
    return true;
  } catch (e) {
    SYNC_STATUS.error = e && (e.message || String(e));
    if (SYNC_STATUS.state !== 'loggedout') SYNC_STATUS.state = 'offline';
    console.error('syncPushAll', e);
    scheduleRealtimeResume();
    if (!__retryingSync) scheduleSyncRetry();
    return false;
  }
}
let __lastPushedSettingsAt = 0;
let __lastPushedMetaJson = '';
let __lastPushedAccount = '';

/* ---------- pull: baja la nube y fusiona POR FILAS (last-writer-wins) ---------- */
async function syncPullAll() {
  if (!syncIsOnline()) return false;
  const user = await syncGetUser();
  if (!user) return false;
  const uid = user.id;
  let needPush = false;
  try {
    await ensureSchemaFeatures(uid);
    const tables = activeTables();
    const totals = Promise.all([
      window.sb.from('tombstones').select('id,key,updated_at').eq('user_id', uid),
      ...tables.map(t => window.sb.from(t).select('*').order('created_at')),
      window.sb.from('settings').select('*')
    ]);
    const [tsRes, ...rest] = await totals;
    const fetches = rest.slice(0, tables.length);
    const settingsRes = rest[tables.length];
    const res = {};
    tables.forEach((t, i) => { res[t] = fetches[i].data || []; });
    const softErr = fetches.slice(5).find(r => r.error);
    if (softErr) console.warn('DailyHub: tablas de Modo Clase no disponibles todavia', softErr.error.message || softErr.error);
    const err = fetches.slice(0, 5).find(r => r.error);
    if (err) throw err.error;
    if (tsRes.error) throw tsRes.error;
    if (settingsRes.error) console.warn('DailyHub: no se pudieron leer los ajustes remotos', settingsRes.error.message || settingsRes.error);
    const tsRows = tsRes.data || [];
    const settingsRow = settingsRes.data && settingsRes.data[0];
    if (!(await syncSessionStill(uid))) return false;

    window.DailyHub.state.normalizeData();
    const remoteProfiles = (res.profiles || []).map(rowToProfile);
    if (!window.DailyHub.state.S.profiles.length && remoteProfiles.length) {
      // Una cuenta con datos en la nube ya tiene su cabecera; no crear un
      // perfil provisional paralelo al que ya existe en Supabase.
      window.DailyHub.state.S.profiles = remoteProfiles;
      window.DailyHub.state.S.activeProfileId = remoteProfiles[0].id;
    }
    if (!window.DailyHub.state.S.activeProfileId || !window.DailyHub.state.S.profiles.some(p => p.id === window.DailyHub.state.S.activeProfileId)) {
      window.DailyHub.state.S.activeProfileId = window.DailyHub.state.S.profiles.length ? window.DailyHub.state.S.profiles[0].id : null;
    }
    // Sin perfil todavía: crear uno provisional para no perder los datos que bajan.
    // La pantalla de bienvenida (index.html) lo renombra / pone foto y PIN después.
    if (!window.DailyHub.state.S.activeProfileId) {
      const p = { id: uid, name: 'Sin nombre', color: '#2563EB', photo: '', pin: null, pinLen: null, updatedAt: Date.now() };
      window.DailyHub.state.S.profiles = [p];
      window.DailyHub.state.S.activeProfileId = p.id;
      needPush = true;
    }
    const pid = window.DailyHub.state.S.activeProfileId;
    if (!pid) return false;

    // tombstone más nuevo (o igual) que la fila → está borrada en la nube
    const tsMap = {};
    for (const t of tsRows || []) {
      (tsMap[t.key] = tsMap[t.key] || new Map()).set(t.id, toMs(t.updated_at));
    }
    // Las filas antiguas sin profile_id pertenecen al perfil activo. Un
    // profile_id que ya no existe se ignora para no mover datos al azar.
    const knownProfileIds = new Set([
      ...(window.DailyHub.state.S.profiles || []).map(p => p && p.id).filter(Boolean),
      ...remoteProfiles.map(p => p.id).filter(Boolean)
    ]);
    const remoteBucketId = (r) => {
      if (r.profile_id) return knownProfileIds.has(r.profile_id) ? r.profile_id : null;
      return window.DailyHub.state.S.activeProfileId;
    };
    const allProfileIds = [...new Set([...profileBucketIds(), ...remoteProfiles.map(p => p.id).filter(Boolean)])];
    // fusión fila a fila por tabla (tabla → función de mapeo)
    const MERGE = {
      tasks: rowToTask, people: rowToPerson, gifts: rowToGift, notes: rowToNote,
      subjects: rowToSubject, class_slots: rowToSlot, class_inbox: rowToInbox,
      class_sessions: rowToSession, class_breaks: rowToBreak, class_offs: rowToOff
    };
    for (const table of Object.keys(MERGE)) {
      const mapFn = MERGE[table];
      const localDel = new Set(pendingDeleteIds(table));
      const remoteByBucket = new Map();
      for (const r of res[table] || []) {
        const bucketId = remoteBucketId(r);
        if (!bucketId) continue;
        if (!remoteByBucket.has(bucketId)) remoteByBucket.set(bucketId, []);
        remoteByBucket.get(bucketId).push(r);
      }
      for (const bucketId of allProfileIds) {
        const localArr = localListFor(table, bucketId);
        const remoteRows = remoteByBucket.get(bucketId) || [];
        const localMap = new Map(localArr.map(x => [x.id, x]));
        const serverIds = new Set();
        const merged = [];
        for (const r of remoteRows) {
          serverIds.add(r.id);
          const l = localMap.get(r.id);
          const localUp = toMs(l && l.updatedAt);
          const serverUp = toMs(r.updated_at);
          const tomb = (tsMap[table] && tsMap[table].get(r.id)) || 0;
          if (localDel.has(r.id) && !(l && localUp > tomb)) continue;
          if (tomb && tomb >= serverUp) {
            if (l && localUp > tomb) {
              forgetPendingDeleteId(table, r.id);
              merged.push(l);
              needPush = true;
            }
            // No copiamos aquí el tombstone remoto a __del: __del significa
            // "borrado local pendiente de subir". Volver a subirlo en cada push
            // refrescaría el reloj del borrado y podría ocultar una edición.
            continue;
          }
          if (l && localUp > serverUp) {
            merged.push(l);
            needPush = true;
          } else {
            merged.push(mapFn(r));
          }
        }
        for (const l of localArr) {
          if (serverIds.has(l.id)) continue;
          const tomb = (tsMap[table] && tsMap[table].get(l.id)) || 0;
          if (localDel.has(l.id) && toMs(l.updatedAt) <= tomb) continue;
          if (tomb && tomb >= toMs(l.updatedAt)) continue;
          forgetPendingDeleteId(table, l.id);
          merged.push(l);
          needPush = true;
        }
        localArr.length = 0;
        localArr.push(...merged);
      }
    }
    // perfiles: se fusionan por fila, igual que el resto de tablas
    {
      const localProfMap = new Map(window.DailyHub.state.S.profiles.map(p => [p.id, p]));
      const localProfDel = new Set(pendingDeleteIds('profiles'));
      const remoteProfs = remoteProfiles;
      const serverProfIds = new Set(remoteProfs.map(p => p.id));
      const profMerged = [];
      for (const p of remoteProfs) {
        const l = localProfMap.get(p.id);
        const localUp = toMs(l && l.updatedAt);
        const serverUp = toMs(p.updatedAt);
        const tomb = (tsMap.profiles && tsMap.profiles.get(p.id)) || 0;
        if (localProfDel.has(p.id) && !(l && localUp > tomb)) continue;
        if (tomb && tomb >= serverUp) {
          if (l && localUp > tomb) {
            forgetPendingDeleteId('profiles', p.id);
            profMerged.push(l);
            needPush = true;
          }
          // El tombstone remoto no es un borrado local pendiente; se conserva
          // en la nube hasta que una fila realmente más nueva lo resuelva.
          continue;
        }
        if (l && localUp > serverUp) {
          profMerged.push(l);
          needPush = true;
        } else {
          profMerged.push(p);
        }
      }
      for (const p of window.DailyHub.state.S.profiles) {
        if (serverProfIds.has(p.id)) continue;
        const tomb = (tsMap.profiles && tsMap.profiles.get(p.id)) || 0;
        if (localProfDel.has(p.id) && toMs(p.updatedAt) <= (tomb || 0)) continue;
        if (tomb && tomb >= toMs(p.updatedAt)) continue;
        forgetPendingDeleteId('profiles', p.id);
        profMerged.push(p);
        needPush = true;
      }
      window.DailyHub.state.S.profiles = profMerged;
    }
    if (window.DailyHub && typeof window.DailyHub.state.normalizeData === 'function') window.DailyHub.state.normalizeData();
    if (window.DailyHub.state.S.activeProfileId && !window.DailyHub.state.S.profiles.some(p => p.id === window.DailyHub.state.S.activeProfileId)) {
      window.DailyHub.state.S.activeProfileId = window.DailyHub.state.S.profiles.length ? window.DailyHub.state.S.profiles[0].id : null;
    }
    if (window.DailyHub && typeof window.DailyHub.state.switchProfileData === 'function') window.DailyHub.state.switchProfileData();

    // Settings con reloj: la nube SOLO gana si es más nueva que lo local
    const supMs = settingsRow ? toMs(settingsRow.updated_at) : 0;
    const localSettingsUp = (window.DailyHub.state.S.settings && window.DailyHub.state.S.settings.updatedAt) || 0;
    if (settingsRow && supMs > localSettingsUp) {
      window.DailyHub.state.S.settings = Object.assign(window.DailyHub.state.defaultState().settings, settingsRow.data || {});
      window.DailyHub.state.S.settings.updatedAt = supMs;
      window.DailyHub.state.S.meta = Object.assign(window.DailyHub.state.defaultState().meta, settingsRow.meta || {});
      __lastPushedSettingsAt = supMs;
      __lastPushedMetaJson = JSON.stringify(window.DailyHub.state.S.meta || {});
    } else if (localSettingsUp > supMs) {
      needPush = true;   // el ajuste local es más nuevo; no perderlo tras un pull
    }

    // tombstones resueltos: la fila revivió (updated_at más nuevo que el tombstone) → limpiar en la nube.
    // La condición sobre updated_at evita borrar un tombstone nuevo escrito por otro dispositivo.
    for (const table of SB_TABLES) {
      const m = tsMap[table];
      if (!m) continue;
      for (const r of res[table] || []) {
        const remoteUp = toMs(r.updated_at);
        if (r.id && m.has(r.id) && remoteUp > m.get(r.id)) {
          const tombIso = toIso(m.get(r.id));
          Promise.resolve().then(() => window.sb.from('tombstones').delete().eq('user_id', uid).eq('key', table).eq('id', r.id).lte('updated_at', tombIso)).catch(() => {});
        }
      }
    }
    // Purga de filas fantasma: borradas en algún dispositivo, aún presentes
    // en la nube porque el tombstone solo las ocultaba (borrados anteriores a
    // DELETE físico). Si el tombstone tiene más de 7 días y ningún dispositivo
    // conserva la fila, se purga físicamente. El tombstone se conserva: sigue
    // protegiendo frente a dispositivos rezagados que aún tengan la copia.
    // Margen de 30 días para retirar tombstones cuya fila ya no existe:
    // pasado ese plazo, un dispositivo sin conectar tanto tiempo podría
    // resucitar su copia local; se asume que ya no está en uso.
    const GHOST_PURGE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
    const TOMBSTONE_GC_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
    for (const table of SB_TABLES) {
      const m = tsMap[table];
      if (!m || !m.size) continue;
      const serverIds = new Set((res[table] || []).map(r => r.id));
      const localIds = new Set();
      if (table === 'profiles') {
        (window.DailyHub.state.S.profiles || []).forEach(p => { if (p && p.id) localIds.add(p.id); });
      } else {
        for (const bucket of Object.values((window.DailyHub.state.S && window.DailyHub.state.S.data) || {})) {
          for (const row of (bucket && bucket[STATE_SLOTS[table]]) || []) if (row && row.id) localIds.add(row.id);
        }
      }
      const pendNow = pendingDeleteIds(table);
      const ghostRows = [];
      const deadTombs = [];
      for (const [id, ts] of m.entries()) {
        if (localIds.has(id) || pendNow.includes(id)) continue;
        const age = Date.now() - ts;
        if (serverIds.has(id)) {
          if (age >= GHOST_PURGE_AFTER_MS) ghostRows.push(id);   // fila viva en nube, oculta y abandonada → purgar
        } else if (age >= TOMBSTONE_GC_AFTER_MS) {
          deadTombs.push(id);                                     // fila ya borrada y tombstone obsoleto → GC
        }
      }
      if (ghostRows.length) {
        try {
          for (let j = 0; j < ghostRows.length; j += 50) {
            const { error } = await window.sb.from(table).delete().in('id', ghostRows.slice(j, j + 50));
            if (error) throw error;
          }
        } catch (e) {
          console.warn('DailyHub: no se pudo purgar filas fantasma de ' + table, e.message || e);
        }
      }
      if (deadTombs.length) {
        try {
          for (let j = 0; j < deadTombs.length; j += 50) {
            const { error } = await window.sb.from('tombstones').delete().eq('user_id', uid).eq('key', table).in('id', deadTombs.slice(j, j + 50));
            if (error) throw error;
          }
        } catch (e) {
          console.warn('DailyHub: no se pudieron limpiar tombstones de ' + table, e.message || e);
        }
      }
    }
    if (!(await syncSessionStill(uid))) return false;
    rebuildPrevCaches();
    window.DailyHub.state.save();
    // Un borrado pendiente (tombstone + DELETE físico) debe salir en cuanto
    // haya conexión, aunque no haya filas nuevas que subir. Así las filas
    // huérfanas que quedaron antes de un fallo se limpian solas.
    if (!needPush && activeTables().some(table => pendingDeleteIds(table).length)) needPush = true;
    if (needPush && !(await syncPushAll())) {
      if (!__retryingSync) scheduleSyncRetry();
      return false;   // primer login, filas nuevas o borrados pendientes
    }
    SYNC_STATUS.error = null;
    SYNC_STATUS.lastSyncAt = Date.now();
    clearSyncRetry();
    return true;
  } catch (e) {
    SYNC_STATUS.error = e && (e.message || String(e));
    if (SYNC_STATUS.state !== 'loggedout') SYNC_STATUS.state = 'offline';
    console.error('syncPullAll', e);
    if (!__retryingSync) scheduleSyncRetry();
    return false;
  }
}
function rebuildPrevCaches() { if (typeof window.__rebuildPrevCaches === 'function') window.__rebuildPrevCaches(); }

/* ---------- realtime: cambios instantáneos entre dispositivos ---------- */
let __rtChannel = null;
let __rtTimer = null;
function realtimeApply() {
  if (__rtIgnore) return;
  clearTimeout(__rtTimer);
  __rtTimer = setTimeout(async () => {
    if (!syncIsOnline()) return;
    const u = await syncGetUser();
    if (!u) return;
    const ok = await syncQueue(syncPullAll);
    if (ok && window.DailyHub && typeof window.DailyHub.render === 'function') window.DailyHub.render();
  }, 900);
}
function realtimeStart() {
  if (!window.sb || __rtChannel) return;
  try {
    __rtChannel = window.sb
      .channel('dailyhub-changes')
      .on('postgres_changes', { event: '*', schema: 'public' }, realtimeApply)
      .subscribe((status) => { if (status === 'SUBSCRIBED') console.log('DailyHub: sync en tiempo real activa'); });
  } catch (e) { console.warn('Realtime no disponible', e); }
}
function realtimeStop() {
  if (__rtChannel) { try { window.sb.removeChannel(__rtChannel); } catch (e) {} __rtChannel = null; }
}

/* ---------- boot de sincronización (lo llama el composition root) ---------- */
async function syncBoot() {
  const user = await syncGetUser();
  if (!user) {
    if (SYNC_STATUS.state === 'offline') {
      scheduleSyncRetry();
      if (window.DailyHub && typeof window.DailyHub.render === 'function') window.DailyHub.render();
      return;
    }
    SYNC_STATUS.state = 'loggedout';
    cancelSyncRetry();
    realtimeStop();
    window.DailyHub.state.save();
    if (window.DailyHub && typeof window.DailyHub.render === 'function') window.DailyHub.render();
    return;
  }   // sin sesión
  const ok = await syncQueue(syncPullAll);
  // El usuario puede haber cambiado de cuenta mientras esperaba la cola.
  if (!(await syncSessionStill(user.id))) {
    SYNC_STATUS.state = 'loggedout';
    realtimeStop();
    if (window.DailyHub && typeof window.DailyHub.render === 'function') window.DailyHub.render();
    return;
  }
  SYNC_STATUS.state = ok ? 'online' : 'offline';
  if (ok) {
    clearSyncRetry();
    realtimeStart();
  } else {
    scheduleSyncRetry();
  }
  if (window.DailyHub && typeof window.DailyHub.render === 'function') window.DailyHub.render();
}

/* ---------- UI de estado de sincronización ---------- */
function syncBadge() {
  const map = {
    loading: { cls: 'sync-badge loading', label: 'Sincronizando…', dot: '…' },
    online:  { cls: 'sync-badge online',  label: 'Cuenta conectada', dot: '✓' },
    offline: { cls: 'sync-badge offline', label: 'Sin conexión · cambios locales', dot: '!' },
    loggedout: { cls: 'sync-badge out', label: 'Sin sesión', dot: '·' }
  };
  const m = map[SYNC_STATUS.state] || map.offline;
  return window.DailyHub.core.h('span', { class: m.cls }, window.DailyHub.core.h('i', { html: m.dot }), m.label);
}

/* ---------- contrato público para la aplicación modular ---------- */
function queuedSyncPush() { return syncQueue(syncPushAll); }
function queuedSyncPull() { return syncQueue(syncPullAll); }
window.DailySync = {
  boot: syncBoot, push: queuedSyncPush, pull: queuedSyncPull, status: SYNC_STATUS, badge: syncBadge,
  getUser: syncGetUser, realtime: { start: realtimeStart, stop: realtimeStop },
  restoreSession, removeAuthBlob, authBlobKey, cancelRetry: cancelSyncRetry,
  config: { url: SUPABASE_URL, key: SUPABASE_KEY }
};
