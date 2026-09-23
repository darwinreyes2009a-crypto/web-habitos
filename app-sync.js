/* ============================================================
   DailyHub — Capa de datos con Supabase (app-sync.js)
   - Carga los datos del usuario desde Supabase al arrancar
   - Guarda en local primero (offline-first) y sincroniza en segundo plano
   - Los cambios del móvil se reflejan en el PC (y viceversa) al abrir la app
   ============================================================ */
'use strict';

const SUPABASE_URL = 'https://clarchsmxdrqvbatfgkp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PEiFsRJrzlSx81AWS4VaGA_Bkkf5Gz7';
const SYNC_STATUS = { state: 'loading', error: null };  // loading | online | offline | loggedout

window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ---------- helpers de sesion ---------- */
async function syncGetUser() {
  try {
    const { data } = await window.sb.auth.getSession();
    let user = data && data.session ? data.session.user : null;
    if (!user) user = null;
    SYNC_STATUS.state = user ? 'online' : 'loggedout';
    return user;
  } catch (e) {
    SYNC_STATUS.state = 'offline';
    SYNC_STATUS.error = e;
    return null;
  }
}

function syncIsOnline() { return !!(window.sb && SYNC_STATUS.state === 'online'); }

/* ---------- mapping local <-> Supabase ---------- */
const SB_TABLES = ['profiles', 'tasks', 'people', 'gifts', 'notes', 'subjects', 'class_slots', 'class_inbox', 'class_sessions'];

function rowToProfile(r) {
  return {
    id: r.id, name: r.name, color: r.color, photo: r.photo || '', pin: r.pin || null,
    pinLen: r.pin_len || null,
    createdAt: r.created_at
  };
}
function profileToRow(p, uidv) {
  return {
    id: p.id, user_id: uidv, name: p.name, color: p.color || '#2563EB',
    photo: p.photo || null, pin: p.pin || null, pin_len: p.pinLen || null
  };
}
function rowToTask(r) {
  return {
    id: r.id, title: r.title, icon: r.icon || 'star', cat: r.cat || 'Personal',
    freq: r.freq || { type: 'daily' }, time: r.time || '',
    completions: r.completions || [], createdAt: r.created_at
  };
}
function taskToRow(t, uidv, pid) {
  return {
    id: t.id, user_id: uidv, profile_id: pid || null, title: t.title, icon: t.icon || 'star', cat: t.cat || 'Personal',
    freq: t.freq || { type: 'daily' }, time: t.time || '', completions: t.completions || []
  };
}
function rowToPerson(r) {
  return {
    id: r.id, name: r.name, color: r.color, photo: r.photo || '',
    relationship: r.relationship || 'Amigo/a', birthday: r.birthday || '', notes: r.notes || '',
    details: r.details || {},
    createdAt: r.created_at
  };
}
function personToRow(p, uidv, pid) {
  return {
    id: p.id, user_id: uidv, profile_id: pid || null, name: p.name, color: p.color || '#2563EB', photo: p.photo || null,
    relationship: p.relationship || 'Amigo/a', birthday: p.birthday || null, notes: p.notes || '',
    details: p.details || {}
  };
}
function rowToNote(r) {
  return {
    id: r.id, text: r.text, kind: r.kind || 'nota', date: r.note_date || todayStr(), time: r.note_time || '',
    done: !!r.done, starred: !!r.starred,
    subjectId: r.subject_id || null, sessionId: r.session_id || null, createdAt: r.created_at
  };
}
function noteToRow(n, uidv, pid) {
  return {
    id: n.id, user_id: uidv, profile_id: pid || null, text: n.text, kind: n.kind || 'nota',
    note_date: n.date || todayStr(), note_time: n.time || '',
    done: !!n.done, starred: !!n.starred,
    subject_id: n.subjectId || null, session_id: n.sessionId || null
  };
}
/* ---------- Modo Clase: asignaturas, horario, Para después e historial ---------- */
function rowToSubject(r) {
  return { id: r.id, name: r.name, color: r.color || '#2563EB', icon: r.icon || 'book', createdAt: r.created_at };
}
function subjectToRow(s, uidv, pid) {
  return { id: s.id, user_id: uidv, profile_id: pid || null, name: s.name, color: s.color || '#2563EB', icon: s.icon || 'book' };
}
function rowToSlot(r) {
  return {
    id: r.id, subjectId: r.subject_id || null, day: r.day || 0,
    start: r.start_time || '09:00', end: r.end_time || '10:00', room: r.room || '',
    active: r.active !== false, createdAt: r.created_at
  };
}
function slotToRow(s, uidv, pid) {
  return {
    id: s.id, user_id: uidv, profile_id: pid || null, subject_id: s.subjectId || null, day: s.day || 0,
    start_time: s.start || '09:00', end_time: s.end || '10:00', room: s.room || '', active: s.active !== false
  };
}
function rowToInbox(r) {
  return {
    id: r.id, text: r.text, date: r.item_date || todayStr(), time: r.item_time || '',
    subjectId: r.subject_id || null, sessionId: r.session_id || null, createdAt: r.created_at
  };
}
function inboxToRow(x, uidv, pid) {
  return {
    id: x.id, user_id: uidv, profile_id: pid || null, text: x.text,
    item_date: x.date || todayStr(), item_time: x.time || '',
    subject_id: x.subjectId || null, session_id: x.sessionId || null
  };
}
function rowToSession(r) {
  return {
    id: r.id, subjectId: r.subject_id || null, slotId: r.slot_id || null,
    date: r.session_date || todayStr(), start: r.start_time || '', end: r.end_time || '',
    room: r.room || '', endedAt: r.ended_at || null, counts: r.counts || { inbox: 0, notes: 0, important: 0 },
    createdAt: r.created_at
  };
}
function sessionToRow(s, uidv, pid) {
  return {
    id: s.id, user_id: uidv, profile_id: pid || null, subject_id: s.subjectId || null, slot_id: s.slotId || null,
    session_date: s.date || todayStr(), start_time: s.start || '', end_time: s.end || '', room: s.room || '',
    ended_at: s.endedAt || null, counts: s.counts || {}
  };
}
function rowToGift(r) {
  return {
    id: r.id, title: r.title, personId: r.person_id || null, price: r.price === null ? '' : r.price,
    targetDate: r.target_date || '', link: r.link || '', occasion: r.occasion || 'Cumpleaños',
    status: r.status || 'Idea', notes: r.notes || '', image: r.image || '', createdAt: r.created_at
  };
}
function giftToRow(g, uidv, pid) {
  return {
    id: g.id, user_id: uidv, profile_id: pid || null, person_id: g.personId || null, title: g.title,
    price: g.price === '' || g.price == null ? null : Number(g.price),
    target_date: g.targetDate || null, link: g.link || '', occasion: g.occasion || 'Cumpleaños',
    status: g.status || 'Idea', notes: g.notes || '', image: g.image || null
  };
}

/* ---------- push: sube el estado local a Supabase (upsert + borrados) ---------- */
let __rtIgnore = false;   // anti-eco: no reaccionar a los cambios que subimos nosotros
function scheduleRealtimeResume() { setTimeout(() => { __rtIgnore = false; }, 3000); }
async function syncPushAll() {
  if (!syncIsOnline()) return false;
  const user = await syncGetUser();
  if (!user) return false;
  const uid = user.id;
  __rtIgnore = true;
  try {
    // Traer ids remotos para calcular borrados
    const reads = await Promise.all(SB_TABLES.map(t => window.sb.from(t).select('id, profile_id')));
    for (let i = 0; i < SB_TABLES.length; i++) {
      const table = SB_TABLES[i];
      const remoteIds = new Set((reads[i].data || []).map(r => r.id));
      // cada tabla de Supabase se corresponde con una lista del perfil activo
      const LOCAL_LISTS = {
        profiles: S.profiles, tasks: S.tasks, people: S.people, gifts: S.gifts, notes: S.notes,
        subjects: S.subjects, class_slots: S.slots, class_inbox: S.inbox, class_sessions: S.sessions
      };
      const localArr = LOCAL_LISTS[table] || [];
      const localIds = new Set(localArr.map(x => x.id));

      const del = [...remoteIds].filter(id => !localIds.has(id));
      if (del.length) await window.sb.from(table).delete().in('id', del);

      const pid = table === 'profiles' ? undefined : S.activeProfileId || null;   // filas etiquetadas con el perfil activo
      const ROW_MAP = {
        profiles: (x) => profileToRow(x, uid),
        tasks: (x) => taskToRow(x, uid, pid),
        people: (x) => personToRow(x, uid, pid),
        gifts: (x) => giftToRow(x, uid, pid),
        notes: (x) => noteToRow(x, uid, pid),
        subjects: (x) => subjectToRow(x, uid, pid),
        class_slots: (x) => slotToRow(x, uid, pid),
        class_inbox: (x) => inboxToRow(x, uid, pid),
        class_sessions: (x) => sessionToRow(x, uid, pid)
      };
      const rows = localArr.map(ROW_MAP[table]);
      // Subir en trozos para no pasarnos del límite de la petición
      for (let j = 0; j < rows.length; j += 50) {
        const chunk = rows.slice(j, j + 50);
        const { error } = await window.sb.from(table).upsert(chunk, { onConflict: 'id' });
        if (error) throw error;
      }
    }
    // Settings (un row por usuario)
    await window.sb.from('settings').upsert({ user_id: uid, data: S.settings, meta: S.meta, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    scheduleRealtimeResume();
    return true;
  } catch (e) {
    console.error('syncPushAll', e);
    scheduleRealtimeResume();
    return false;
  }
}

/* ---------- pull: baja el estado de Supabase al estado local ---------- */
async function syncPullAll() {
  if (!syncIsOnline()) return false;
  const user = await syncGetUser();
  if (!user) return false;
  // Guardamos lo local por si la nube está vacía (primer login): así no se pierde nada
  const localBefore = {
    profiles: S.profiles || [], tasks: S.tasks || [], people: S.people || [], gifts: S.gifts || [], notes: S.notes || [],
    subjects: S.subjects || [], slots: S.slots || [], inbox: S.inbox || [], sessions: S.sessions || []
  };
  let needPush = false;
  try {
    const [pr, ta, pe, gi, no, se, su, cs, ci, cse] = await Promise.all([
      window.sb.from('profiles').select('*').order('created_at'),
      window.sb.from('tasks').select('*').order('created_at'),
      window.sb.from('people').select('*').order('created_at'),
      window.sb.from('gifts').select('*').order('created_at'),
      window.sb.from('notes').select('*').order('created_at'),
      window.sb.from('settings').select('*').maybeSingle(),
      window.sb.from('subjects').select('*').order('created_at'),
      window.sb.from('class_slots').select('*').order('created_at'),
      window.sb.from('class_inbox').select('*').order('created_at'),
      window.sb.from('class_sessions').select('*').order('created_at')
    ]);
    const err = pr.error || ta.error || pe.error || gi.error || no.error || se.error;
    if (err) throw err;
    // las tablas de Modo Clase pueden no existir todavía en instalaciones antiguas: no bloquean la bajada
    const softErr = su.error || cs.error || ci.error || cse.error;
    if (softErr) console.warn('DailyHub: tablas de Modo Clase no disponibles todavía', softErr.message || softErr);
    const merge = (remoteRows, localArr) => {
      if (remoteRows.length === 0 && localArr.length > 0) { needPush = true; return localArr; }
      return null; // se usará el mapeo normal
    };
    S.profiles = merge(pr.data, localBefore.profiles) || (pr.data || []).map(rowToProfile);
    normalizeData();
    if (!S.activeProfileId || !S.profiles.some(p => p.id === S.activeProfileId)) {
      S.activeProfileId = S.profiles.length ? S.profiles[0].id : null;   // validar ANTES de repartir filas
    }
    // Reparto de filas remotas a su compartimento por perfil (filas viejas sin profile_id → perfil activo)
    const pid = S.activeProfileId;
    const bucketFor = (r) => {
      const k = r.profile_id && S.data[r.profile_id] ? r.profile_id : pid;
      return S.data[k] || null;
    };
    const dist = (rows, key, mapFn) => {
      for (const b of Object.values(S.data)) b[key] = [];
      for (const r of rows) { const b = bucketFor(r); if (b) b[key].push(mapFn(r)); }
    };
    dist(ta.data || [], 'tasks', rowToTask);
    dist(pe.data || [], 'people', rowToPerson);
    dist(gi.data || [], 'gifts', rowToGift);
    dist(no.data || [], 'notes', rowToNote);
    dist(su.data || [], 'subjects', rowToSubject);
    dist(cs.data || [], 'slots', rowToSlot);
    dist(ci.data || [], 'inbox', rowToInbox);
    dist(cse.data || [], 'sessions', rowToSession);
    // nube vacía → conserva lo local del perfil activo y marca para subir
    const cur = S.data[pid];
    if (cur) {
      if ((ta.data || []).length === 0 && localBefore.tasks.length) { cur.tasks = localBefore.tasks; needPush = true; }
      if ((pe.data || []).length === 0 && localBefore.people.length) { cur.people = localBefore.people; needPush = true; }
      if ((gi.data || []).length === 0 && localBefore.gifts.length) { cur.gifts = localBefore.gifts; needPush = true; }
      if ((no.data || []).length === 0 && localBefore.notes.length) { cur.notes = localBefore.notes; needPush = true; }
      if ((su.data || []).length === 0 && localBefore.subjects.length) { cur.subjects = localBefore.subjects; needPush = true; }
      if ((cs.data || []).length === 0 && localBefore.slots.length) { cur.slots = localBefore.slots; needPush = true; }
      if ((ci.data || []).length === 0 && localBefore.inbox.length) { cur.inbox = localBefore.inbox; needPush = true; }
      if ((cse.data || []).length === 0 && localBefore.sessions.length) { cur.sessions = localBefore.sessions; needPush = true; }
    }
    // las listas visibles apuntan al compartimento del perfil activo (incluido todo Modo Clase)
    if (cur) {
      S.tasks = cur.tasks; S.people = cur.people; S.gifts = cur.gifts; S.notes = cur.notes;
      S.subjects = cur.subjects; S.slots = cur.slots; S.inbox = cur.inbox; S.sessions = cur.sessions;
    }
    if (se.data) {
      S.settings = Object.assign(defaultState().settings, se.data.data || {});
      S.meta = Object.assign(defaultState().meta, se.data.meta || {});
    }
    save();
    if (needPush) await syncPushAll();   // primer login: sube lo que ya tenías local
    return true;
  } catch (e) {
    console.error('syncPullAll', e);
    return false;
  }
}

/* ---------- realtime: cambios instantáneos entre dispositivos ---------- */
let __rtChannel = null;
let __rtTimer = null;
function realtimeApply() {
  if (__rtIgnore) return;
  clearTimeout(__rtTimer);
  __rtTimer = setTimeout(async () => {
    const u = await syncGetUser();
    if (!u) return;
    const ok = await syncPullAll();
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

/* ---------- boot de sincronizacion (se llama desde index.html) ---------- */
async function syncBoot() {
  const user = await syncGetUser();
  if (!user) { SYNC_STATUS.state = 'loggedout'; realtimeStop(); save(); render(); return; }   // sin sesion
  const ok = await syncPullAll();
  SYNC_STATUS.state = ok ? 'online' : 'offline';
  if (ok) realtimeStart();
  render();
}

/* ---------- UI de estado de sincronizacion ---------- */
function syncBadge() {
  const map = {
    loading: { cls: 'sync-badge loading', label: 'Sincronizando…', dot: '…' },
    online:  { cls: 'sync-badge online',  label: 'Cuenta conectada', dot: '✓' },
    offline: { cls: 'sync-badge offline', label: 'Sin conexión · solo local', dot: '!' },
    loggedout: { cls: 'sync-badge out', label: 'Sin cuenta · solo este dispositivo', dot: '·' }
  };
  const m = map[SYNC_STATUS.state] || map.offline;
  return h('span', { class: m.cls }, h('i', { html: m.dot }), m.label);
}

/* ---------- export para index.html ---------- */
window.DailySync = { boot: syncBoot, push: syncPushAll, pull: syncPullAll, status: SYNC_STATUS, badge: syncBadge, getUser: syncGetUser, realtime: { start: realtimeStart, stop: realtimeStop } };
