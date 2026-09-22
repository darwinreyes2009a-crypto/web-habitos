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
const SB_TABLES = ['profiles', 'tasks', 'people', 'gifts'];

function rowToProfile(r) {
  return {
    id: r.id, name: r.name, color: r.color, photo: r.photo || '', pin: r.pin || null,
    createdAt: r.created_at
  };
}
function profileToRow(p, uidv) {
  return {
    id: p.id, user_id: uidv, name: p.name, color: p.color || '#2563EB',
    photo: p.photo || null, pin: p.pin || null
  };
}
function rowToTask(r) {
  return {
    id: r.id, title: r.title, icon: r.icon || 'star', cat: r.cat || 'Personal',
    freq: r.freq || { type: 'daily' }, time: r.time || '',
    completions: r.completions || [], createdAt: r.created_at
  };
}
function taskToRow(t, uidv) {
  return {
    id: t.id, user_id: uidv, title: t.title, icon: t.icon || 'star', cat: t.cat || 'Personal',
    freq: t.freq || { type: 'daily' }, time: t.time || '', completions: t.completions || []
  };
}
function rowToPerson(r) {
  return {
    id: r.id, name: r.name, color: r.color, photo: r.photo || '',
    relationship: r.relationship || 'Amigo/a', birthday: r.birthday || '', notes: r.notes || '',
    createdAt: r.created_at
  };
}
function personToRow(p, uidv) {
  return {
    id: p.id, user_id: uidv, name: p.name, color: p.color || '#2563EB', photo: p.photo || null,
    relationship: p.relationship || 'Amigo/a', birthday: p.birthday || null, notes: p.notes || ''
  };
}
function rowToGift(r) {
  return {
    id: r.id, title: r.title, personId: r.person_id || null, price: r.price === null ? '' : r.price,
    targetDate: r.target_date || '', link: r.link || '', occasion: r.occasion || 'Cumpleaños',
    status: r.status || 'Idea', notes: r.notes || '', image: r.image || '', createdAt: r.created_at
  };
}
function giftToRow(g, uidv) {
  return {
    id: g.id, user_id: uidv, person_id: g.personId || null, title: g.title,
    price: g.price === '' || g.price == null ? null : Number(g.price),
    target_date: g.targetDate || null, link: g.link || '', occasion: g.occasion || 'Cumpleaños',
    status: g.status || 'Idea', notes: g.notes || '', image: g.image || null
  };
}

/* ---------- push: sube el estado local a Supabase (upsert + borrados) ---------- */
async function syncPushAll() {
  if (!syncIsOnline()) return false;
  const user = await syncGetUser();
  if (!user) return false;
  const uid = user.id;
  try {
    // Traer ids remotos para calcular borrados
    const reads = await Promise.all(SB_TABLES.map(t => window.sb.from(t).select('id')));
    for (let i = 0; i < SB_TABLES.length; i++) {
      const table = SB_TABLES[i];
      const remoteIds = new Set((reads[i].data || []).map(r => r.id));
      const localArr = table === 'profiles' ? S.profiles : table === 'tasks' ? S.tasks : table === 'people' ? S.people : S.gifts;
      const localIds = new Set(localArr.map(x => x.id));

      const del = [...remoteIds].filter(id => !localIds.has(id));
      if (del.length) await window.sb.from(table).delete().in('id', del);

      const rows = localArr.map(x =>
        table === 'profiles' ? profileToRow(x, uid) :
        table === 'tasks' ? taskToRow(x, uid) :
        table === 'people' ? personToRow(x, uid) : giftToRow(x, uid));
      // Subir en trozos para no pasarnos del límite de la petición
      for (let j = 0; j < rows.length; j += 50) {
        const chunk = rows.slice(j, j + 50);
        const { error } = await window.sb.from(table).upsert(chunk, { onConflict: 'id' });
        if (error) throw error;
      }
    }
    // Settings (un row por usuario)
    await window.sb.from('settings').upsert({ user_id: uid, data: S.settings, meta: S.meta, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    return true;
  } catch (e) {
    console.error('syncPushAll', e);
    return false;
  }
}

/* ---------- pull: baja el estado de Supabase al estado local ---------- */
async function syncPullAll() {
  if (!syncIsOnline()) return false;
  const user = await syncGetUser();
  if (!user) return false;
  // Guardamos lo local por si la nube está vacía (primer login): así no se pierde nada
  const localBefore = { profiles: S.profiles || [], tasks: S.tasks || [], people: S.people || [], gifts: S.gifts || [] };
  let needPush = false;
  try {
    const [pr, ta, pe, gi, se] = await Promise.all([
      window.sb.from('profiles').select('*').order('created_at'),
      window.sb.from('tasks').select('*').order('created_at'),
      window.sb.from('people').select('*').order('created_at'),
      window.sb.from('gifts').select('*').order('created_at'),
      window.sb.from('settings').select('*').maybeSingle()
    ]);
    const err = pr.error || ta.error || pe.error || gi.error || se.error;
    if (err) throw err;
    const merge = (remoteRows, localArr) => {
      if (remoteRows.length === 0 && localArr.length > 0) { needPush = true; return localArr; }
      return null; // se usará el mapeo normal
    };
    S.profiles = merge(pr.data, localBefore.profiles) || (pr.data || []).map(rowToProfile);
    S.tasks = merge(ta.data, localBefore.tasks) || (ta.data || []).map(rowToTask);
    S.people = merge(pe.data, localBefore.people) || (pe.data || []).map(rowToPerson);
    S.gifts = merge(gi.data, localBefore.gifts) || (gi.data || []).map(rowToGift);
    if (se.data) {
      S.settings = Object.assign(defaultState().settings, se.data.data || {});
      S.meta = Object.assign(defaultState().meta, se.data.meta || {});
    }
    if (!S.activeProfileId || !S.profiles.some(p => p.id === S.activeProfileId)) {
      S.activeProfileId = S.profiles.length ? S.profiles[0].id : null;
    }
    save();
    if (needPush) await syncPushAll();   // primer login: sube lo que ya tenías local
    return true;
  } catch (e) {
    console.error('syncPullAll', e);
    return false;
  }
}

/* ---------- boot de sincronizacion (se llama desde index.html) ---------- */
async function syncBoot() {
  const user = await syncGetUser();
  if (!user) { SYNC_STATUS.state = 'loggedout'; save(); render(); return; }   // sin sesion
  const ok = await syncPullAll();
  SYNC_STATUS.state = ok ? 'online' : 'offline';
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
window.DailySync = { boot: syncBoot, push: syncPushAll, pull: syncPullAll, status: SYNC_STATUS, badge: syncBadge, getUser: syncGetUser };
