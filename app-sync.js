/* ============================================================
   DailyHub — Capa de datos con Supabase (app-sync.js)
   - Cuentas por email: cada dispositivo guarda la sesión de su usuario
   - Sync POR FILAS con reloj updated_at (last-writer-wins)
   - Borrados = tombstones (nunca se borran filas físicamente)
   ============================================================ */
'use strict';

const SUPABASE_URL = 'https://clarchsmxdrqvbatfgkp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PEiFsRJrzlSx81AWS4VaGA_Bkkf5Gz7';
const SYNC_STATUS = { state: 'loading', error: null };  // loading | online | offline | loggedout

const authBlobKey = (uid) => 'dailyhub_v2:auth:' + uid;          // blob de sesión guardado por cuenta

window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ---------- helpers de sesion ---------- */
async function syncGetUser() {
  try {
    const { data } = await window.sb.auth.getSession();
    const user = data && data.session ? data.session.user : null;
    SYNC_STATUS.state = user ? 'online' : 'loggedout';
    return user;
  } catch (e) {
    SYNC_STATUS.state = 'offline';
    SYNC_STATUS.error = e;
    return null;
  }
}

function syncIsOnline() { return !!(window.sb && SYNC_STATUS.state === 'online'); }
async function syncSessionStill(uid) {
  if (!syncIsOnline()) return false;
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
    SYNC_STATUS.state = 'loggedout';
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
const SB_TABLES = ['profiles', 'tasks', 'people', 'gifts', 'notes', 'subjects', 'class_slots', 'class_inbox', 'class_sessions'];

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
function rowToTask(r) {
  return {
    id: r.id, title: r.title, icon: r.icon || 'star', cat: r.cat || 'Personal',
    freq: r.freq || { type: 'daily' }, time: r.time || '',
    completions: r.completions || [], updatedAt: toMs(r.updated_at), createdAt: r.created_at
  };
}
function taskToRow(t, uidv, pid) {
  return {
    id: t.id, user_id: uidv, profile_id: pid || null, title: t.title, icon: t.icon || 'star', cat: t.cat || 'Personal',
    freq: t.freq || { type: 'daily' }, time: t.time || '', completions: t.completions || [],
    updated_at: toIso(t.updatedAt || null)
  };
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
    id: r.id, text: r.text, kind: r.kind || 'nota', date: r.note_date || todayStr(), time: r.note_time || '',
    done: !!r.done, starred: !!r.starred,
    subjectId: r.subject_id || null, sessionId: r.session_id || null,
    updatedAt: toMs(r.updated_at), createdAt: r.created_at
  };
}
function noteToRow(n, uidv, pid) {
  return {
    id: n.id, user_id: uidv, profile_id: pid || null, text: n.text, kind: n.kind || 'nota',
    note_date: n.date || todayStr(), note_time: n.time || '',
    done: !!n.done, starred: !!n.starred,
    subject_id: n.subjectId || null, session_id: n.sessionId || null,
    updated_at: toIso(n.updatedAt || null)
  };
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
    active: r.active !== false, updatedAt: toMs(r.updated_at), createdAt: r.created_at
  };
}
function slotToRow(s, uidv, pid) {
  return {
    id: s.id, user_id: uidv, profile_id: pid || null, subject_id: s.subjectId || null, day: s.day || 0,
    start_time: s.start || '09:00', end_time: s.end || '10:00', room: s.room || '', active: s.active !== false,
    updated_at: toIso(s.updatedAt || null)
  };
}
function rowToInbox(r) {
  return {
    id: r.id, text: r.text, date: r.item_date || todayStr(), time: r.item_time || '',
    subjectId: r.subject_id || null, sessionId: r.session_id || null,
    updatedAt: toMs(r.updated_at), createdAt: r.created_at
  };
}
function inboxToRow(x, uidv, pid) {
  return {
    id: x.id, user_id: uidv, profile_id: pid || null, text: x.text,
    item_date: x.date || todayStr(), item_time: x.time || '',
    subject_id: x.subjectId || null, session_id: x.sessionId || null,
    updated_at: toIso(x.updatedAt || null)
  };
}
function rowToSession(r) {
  return {
    id: r.id, subjectId: r.subject_id || null, slotId: r.slot_id || null,
    date: r.session_date || todayStr(), start: r.start_time || '', end: r.end_time || '',
    room: r.room || '', endedAt: r.ended_at || null, counts: r.counts || { inbox: 0, notes: 0, important: 0 },
    updatedAt: toMs(r.updated_at), createdAt: r.created_at
  };
}
function sessionToRow(s, uidv, pid) {
  return {
    id: s.id, user_id: uidv, profile_id: pid || null, subject_id: s.subjectId || null, slot_id: s.slotId || null,
    session_date: s.date || todayStr(), start_time: s.start || '', end_time: s.end || '', room: s.room || '',
    ended_at: s.endedAt || null, counts: s.counts || {},
    updated_at: toIso(s.updatedAt || null)
  };
}
function rowToGift(r) {
  return {
    id: r.id, title: r.title, personId: r.person_id || null, price: r.price === null ? '' : r.price,
    targetDate: r.target_date || '', link: r.link || '', occasion: r.occasion || 'Cumpleaños',
    status: r.status || 'Idea', notes: r.notes || '', image: r.image || '',
    updatedAt: toMs(r.updated_at), createdAt: r.created_at
  };
}
function giftToRow(g, uidv, pid) {
  return {
    id: g.id, user_id: uidv, profile_id: pid || null, person_id: g.personId || null, title: g.title,
    price: g.price === '' || g.price == null ? null : Number(g.price),
    target_date: g.targetDate || null, link: g.link || '', occasion: g.occasion || 'Cumpleaños',
    status: g.status || 'Idea', notes: g.notes || '', image: g.image || null,
    updated_at: toIso(g.updatedAt || null)
  };
}

const STATE_SLOTS = {
  profiles: 'profiles', tasks: 'tasks', people: 'people', gifts: 'gifts', notes: 'notes',
  subjects: 'subjects', class_slots: 'slots', class_inbox: 'inbox', class_sessions: 'sessions'
};
const DATA_KEYS = ['tasks', 'people', 'gifts', 'notes', 'subjects', 'slots', 'inbox', 'sessions'];
function bucketFor(pid) {
  if (!pid) return null;
  if (!S.data || typeof S.data !== 'object') S.data = {};
  if (!S.data[pid]) S.data[pid] = { tasks: [], people: [], gifts: [], notes: [], subjects: [], slots: [], inbox: [], sessions: [], activeSession: null, __del: {} };
  const b = S.data[pid];
  if (!b.__del) b.__del = {};
  for (const k of DATA_KEYS) if (!Array.isArray(b[k])) b[k] = [];
  return b;
}
function localListFor(table, pid) {
  const k = STATE_SLOTS[table];
  if (k === 'profiles') return S.profiles;
  const b = bucketFor(pid);
  if (!b) return [];
  if (!Array.isArray(b[k])) b[k] = [];
  return b[k];
}
function localEntries(table) {
  if (table === 'profiles') return (S.profiles || []).map(row => ({ row, pid: null }));
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
  for (const pid of Object.keys((S && S.data) || {})) {
    const k = STATE_SLOTS[table];
    for (const row of (S.data[pid] && S.data[pid][k]) || []) add(row, pid);
  }
  // Compatibilidad con estados legacy que aún solo tienen las listas globales.
  const activeArr = S[STATE_SLOTS[table]];
  if (Array.isArray(activeArr)) for (const row of activeArr) add(row, S.activeProfileId || null);
  return out;
}
function profileBucketIds() {
  const ids = new Set((S.profiles || []).map(p => p && p.id).filter(Boolean));
  if (S.activeProfileId) ids.add(S.activeProfileId);
  for (const pid of Object.keys((S && S.data) || {})) if (ids.has(pid)) ids.add(pid);
  return [...ids];
}

/* Los borrados pendientes viven normalmente en el bucket del perfil. Durante
   "Borrar todo" pueden quedar en __pendingDeletes porque ya no existe ningún
   perfil activo; gathering/limpieza centralizados para ambos casos. */
function pendingDeleteIds(table) {
  const ids = new Set();
  const top = S && S.__pendingDeletes && S.__pendingDeletes[table];
  if (Array.isArray(top)) top.forEach(id => ids.add(id));
  for (const b of Object.values((S && S.data) || {})) {
    if (!b || !b.__del || !Array.isArray(b.__del[table])) continue;
    b.__del[table].forEach(id => ids.add(id));
  }
  return [...ids];
}
function clearPendingDeleteIds(table) {
  if (S && S.__pendingDeletes && Array.isArray(S.__pendingDeletes[table])) S.__pendingDeletes[table] = [];
  for (const b of Object.values((S && S.data) || {})) {
    if (b && b.__del && Array.isArray(b.__del[table])) b.__del[table] = [];
  }
}
function forgetPendingDeleteId(table, id) {
  if (S && S.__pendingDeletes && Array.isArray(S.__pendingDeletes[table])) {
    S.__pendingDeletes[table] = S.__pendingDeletes[table].filter(x => x !== id);
  }
  for (const b of Object.values((S && S.data) || {})) {
    if (b && b.__del && Array.isArray(b.__del[table])) b.__del[table] = b.__del[table].filter(x => x !== id);
  }
}

/* ---------- mutex: push y pull nunca se pisan ---------- */
let __syncChain = Promise.resolve();
function syncQueue(fn) {
  const run = __syncChain.then(fn, fn);
  __syncChain = run.catch(() => {});   // la cola sigue viva aunque falle una operacion
  return run;
}

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
    for (const table of SB_TABLES) {
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
      }
      if (toRevive.size) {
        if (!(await syncSessionStill(uid))) { scheduleRealtimeResume(); return false; }
        const { error: revErr } = await window.sb.from('tombstones').delete().eq('user_id', uid).eq('key', table).in('id', [...toRevive]);
        if (revErr) throw revErr;
      }
      const map = { profiles: profileToRow, tasks: taskToRow, people: personToRow, gifts: giftToRow, notes: noteToRow,
        subjects: subjectToRow, class_slots: slotToRow, class_inbox: inboxToRow, class_sessions: sessionToRow };
      const rows = toUpload.map(entry => map[table](entry.row, uid, table === 'profiles' ? undefined : entry.pid));
      for (let j = 0; j < rows.length; j += 50) {
        if (!(await syncSessionStill(uid))) { scheduleRealtimeResume(); return false; }
        const { error } = await window.sb.from(table).upsert(rows.slice(j, j + 50), { onConflict: 'id' });
        if (error) throw error;
      }
      // borrados pendientes de este dispositivo → tombstones en la nube
      const pendDel = pendingDeleteIds(table);
      if (pendDel.length) {
        try {
          const now = new Date().toISOString();
          const tsRows = pendDel.map(id => ({ user_id: uid, key: table, id, updated_at: now }));
          for (let j = 0; j < tsRows.length; j += 50) {
            const { error } = await window.sb.from('tombstones').upsert(tsRows.slice(j, j + 50), { onConflict: 'user_id,key,id' });
            if (error) throw error;
          }
          clearPendingDeleteIds(table);   // confirmado en la nube: el tombstone ya vive allí
        } catch (e) {
          // tabla tombstones aún sin migrar: los borrados quedan pendientes, no se pierden
          console.warn('DailyHub: tombstones no disponibles (aplica la migración)', e.message || e);
        }
      }
      if (needRender && typeof render === 'function') render();
      if (needRender && typeof save === 'function') save();
    }
    // Settings (un row por usuario) — se sube solo si cambió desde el último push
    if (!(await syncSessionStill(uid))) { scheduleRealtimeResume(); return false; }
    const su = (S.settings && S.settings.updatedAt) || 0;
    const metaJson = JSON.stringify(S.meta || {});
    if (su !== __lastPushedSettingsAt || metaJson !== __lastPushedMetaJson) {
      const data = Object.assign({}, S.settings); delete data.updatedAt;
      const { error } = await window.sb.from('settings').upsert(
        { user_id: uid, data, meta: S.meta, updated_at: toIso(su || undefined) || new Date().toISOString() },
        { onConflict: 'user_id' });
      if (error) throw error;
      __lastPushedSettingsAt = su;
      __lastPushedMetaJson = metaJson;
    }
    scheduleRealtimeResume();
    return true;
  } catch (e) {
    console.error('syncPushAll', e);
    scheduleRealtimeResume();
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
    const totals = Promise.all([
      window.sb.from('tombstones').select('id,key,updated_at').eq('user_id', uid),
      ...SB_TABLES.map(t => window.sb.from(t).select('*').order('created_at')),
      window.sb.from('settings').select('*')
    ]);
    const [tsRes, ...rest] = await totals;
    const fetches = rest.slice(0, SB_TABLES.length);
    const settingsRes = rest[SB_TABLES.length];
    const res = {};
    SB_TABLES.forEach((t, i) => { res[t] = fetches[i].data || []; });
    const softErr = fetches.slice(5).find(r => r.error);
    if (softErr) console.warn('DailyHub: tablas de Modo Clase no disponibles todavía', softErr.error.message || softErr.error);
    const err = fetches.slice(0, 5).find(r => r.error);
    if (err) throw err.error;
    if (tsRes.error) throw tsRes.error;
    if (settingsRes.error) console.warn('DailyHub: no se pudieron leer los ajustes remotos', settingsRes.error.message || settingsRes.error);
    const tsRows = tsRes.data || [];
    const settingsRow = settingsRes.data && settingsRes.data[0];
    if (!(await syncSessionStill(uid))) return false;

    normalizeData();
    const remoteProfiles = (res.profiles || []).map(rowToProfile);
    if (!S.profiles.length && remoteProfiles.length) {
      // Una cuenta con datos en la nube ya tiene su cabecera; no crear un
      // perfil provisional paralelo al que ya existe en Supabase.
      S.profiles = remoteProfiles;
      S.activeProfileId = remoteProfiles[0].id;
    }
    if (!S.activeProfileId || !S.profiles.some(p => p.id === S.activeProfileId)) {
      S.activeProfileId = S.profiles.length ? S.profiles[0].id : null;
    }
    // Sin perfil todavía: crear uno provisional para no perder los datos que bajan.
    // La pantalla de bienvenida (index.html) lo renombra / pone foto y PIN después.
    if (!S.activeProfileId) {
      const p = { id: uid, name: 'Sin nombre', color: '#2563EB', photo: '', pin: null, pinLen: null, updatedAt: Date.now() };
      S.profiles = [p];
      S.activeProfileId = p.id;
      needPush = true;
    }
    const pid = S.activeProfileId;
    if (!pid) return false;

    // tombstone más nuevo (o igual) que la fila → está borrada en la nube
    const tsMap = {};
    for (const t of tsRows || []) {
      (tsMap[t.key] = tsMap[t.key] || new Map()).set(t.id, toMs(t.updated_at));
    }
    // Las filas antiguas sin profile_id pertenecen al perfil activo. Un
    // profile_id que ya no existe se ignora para no mover datos al azar.
    const knownProfileIds = new Set([
      ...(S.profiles || []).map(p => p && p.id).filter(Boolean),
      ...remoteProfiles.map(p => p.id).filter(Boolean)
    ]);
    const remoteBucketId = (r) => {
      if (r.profile_id) return knownProfileIds.has(r.profile_id) ? r.profile_id : null;
      return S.activeProfileId;
    };
    const allProfileIds = [...new Set([...profileBucketIds(), ...remoteProfiles.map(p => p.id).filter(Boolean)])];
    // fusión fila a fila por tabla (tabla → función de mapeo)
    const MERGE = {
      tasks: rowToTask, people: rowToPerson, gifts: rowToGift, notes: rowToNote,
      subjects: rowToSubject, class_slots: rowToSlot, class_inbox: rowToInbox,
      class_sessions: rowToSession
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
      const localProfMap = new Map(S.profiles.map(p => [p.id, p]));
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
      for (const p of S.profiles) {
        if (serverProfIds.has(p.id)) continue;
        const tomb = (tsMap.profiles && tsMap.profiles.get(p.id)) || 0;
        if (localProfDel.has(p.id) && toMs(p.updatedAt) <= (tomb || 0)) continue;
        if (tomb && tomb >= toMs(p.updatedAt)) continue;
        forgetPendingDeleteId('profiles', p.id);
        profMerged.push(p);
        needPush = true;
      }
      S.profiles = profMerged;
    }
    if (typeof normalizeData === 'function') normalizeData();
    if (S.activeProfileId && !S.profiles.some(p => p.id === S.activeProfileId)) {
      S.activeProfileId = S.profiles.length ? S.profiles[0].id : null;
    }
    if (typeof switchProfileData === 'function') switchProfileData();

    // Settings con reloj: la nube SOLO gana si es más nueva que lo local
    const supMs = settingsRow ? toMs(settingsRow.updated_at) : 0;
    const localSettingsUp = (S.settings && S.settings.updatedAt) || 0;
    if (settingsRow && supMs > localSettingsUp) {
      S.settings = Object.assign(defaultState().settings, settingsRow.data || {});
      S.settings.updatedAt = supMs;
      S.meta = Object.assign(defaultState().meta, settingsRow.meta || {});
      __lastPushedSettingsAt = supMs;
      __lastPushedMetaJson = JSON.stringify(S.meta || {});
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
    if (!(await syncSessionStill(uid))) return false;
    rebuildPrevCaches();
    save();
    if (needPush) await syncPushAll();   // primer login o filas nuevas sin subir
    return true;
  } catch (e) {
    console.error('syncPullAll', e);
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
    const u = await syncGetUser();
    if (!u) return;
    const ok = await syncQueue(syncPullAll);
    if (ok && typeof render === 'function') render();
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

/* ---------- boot de sincronización (se llama desde index.html) ---------- */
async function syncBoot() {
  const user = await syncGetUser();
  if (!user) { SYNC_STATUS.state = 'loggedout'; realtimeStop(); save(); if (typeof render === 'function') render(); return; }   // sin sesión
  const ok = await syncQueue(syncPullAll);
  // El usuario puede haber cambiado de cuenta mientras esperaba la cola.
  if (!(await syncSessionStill(user.id))) {
    SYNC_STATUS.state = 'loggedout';
    realtimeStop();
    if (typeof render === 'function') render();
    return;
  }
  SYNC_STATUS.state = ok ? 'online' : 'offline';
  if (ok) realtimeStart();
  if (typeof render === 'function') render();
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
  return h('span', { class: m.cls }, h('i', { html: m.dot }), m.label);
}

/* ---------- export para index.html ---------- */
function queuedSyncPush() { return syncQueue(syncPushAll); }
function queuedSyncPull() { return syncQueue(syncPullAll); }
window.DailySync = {
  boot: syncBoot, push: queuedSyncPush, pull: queuedSyncPull, status: SYNC_STATUS, badge: syncBadge,
  getUser: syncGetUser, realtime: { start: realtimeStart, stop: realtimeStop },
  restoreSession, removeAuthBlob, authBlobKey
};
