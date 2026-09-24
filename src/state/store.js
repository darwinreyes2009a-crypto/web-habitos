export function registerStore(app) {
  const { todayStr, DEFAULT_CATEGORIES, DEFAULT_RELATIONSHIPS } = app.core;

  const LS_KEY = 'dailyhub_v2';
  const ACC_PREFIX = 'dailyhub_v2:acc:';
  const ACC_INDEX = 'dailyhub_v2:accounts';
  const ACC_ACTIVE = 'dailyhub_v2:active';
  const SYNC_KEYS = ['tasks', 'people', 'gifts', 'notes', 'subjects', 'slots', 'inbox', 'sessions'];

  // El objeto no se reemplaza: los módulos conservan una referencia estable.
  const S = {};

  function replaceState(nextState) {
    for (const key of Object.keys(S)) delete S[key];
    Object.assign(S, nextState || defaultState());
    return S;
  }

  function defaultState() {
    return {
      profiles: [], activeProfileId: null,
      people: [], tasks: [], gifts: [], notes: [],
      subjects: [], slots: [], inbox: [], sessions: [], activeSession: null,
      settings: {
        hideCompleted: false,
        theme: 'auto',
        categories: [...DEFAULT_CATEGORIES],
        relationships: [...DEFAULT_RELATIONSHIPS],
        notif: { reminders: true, gifts: true, daily: false, quietFrom: '22:00', quietTo: '08:00' }
      },
      meta: { onboarded: false, created: todayStr(), lastNotified: null },
      data: {}
    };
  }

  function emptyData() {
    return { tasks: [], people: [], gifts: [], notes: [], subjects: [], slots: [], inbox: [], sessions: [], activeSession: null };
  }

  function normalizeData(state) {
    const target = state || S;
    if (!target.data || typeof target.data !== 'object') target.data = {};
    for (const profileId of Object.keys(target.data)) {
      if (!target.profiles.some(profile => profile.id === profileId)) delete target.data[profileId];
    }
    for (const profile of target.profiles) {
      if (!target.data[profile.id]) target.data[profile.id] = emptyData();
    }
    for (const profileId of Object.keys(target.data)) {
      const bucket = target.data[profileId];
      if (!Array.isArray(bucket.subjects)) bucket.subjects = [];
      if (!Array.isArray(bucket.slots)) bucket.slots = [];
      if (!Array.isArray(bucket.inbox)) bucket.inbox = [];
      if (!Array.isArray(bucket.sessions)) bucket.sessions = [];
      if (bucket.activeSession === undefined) bucket.activeSession = null;
    }
    const hasData = Object.keys(target.data).some(profileId =>
      (target.data[profileId].tasks || []).length ||
      (target.data[profileId].people || []).length ||
      (target.data[profileId].gifts || []).length ||
      (target.data[profileId].notes || []).length
    );
    if (!hasData && ((target.tasks || []).length || (target.people || []).length || (target.gifts || []).length || (target.notes || []).length)) {
      const bucket = (target.activeProfileId && target.data[target.activeProfileId]) || target.data[target.profiles[0] && target.profiles[0].id];
      if (bucket) {
        bucket.tasks = target.tasks || [];
        bucket.people = target.people || [];
        bucket.gifts = target.gifts || [];
        bucket.notes = target.notes || [];
      }
    }
  }

  function switchProfileData() {
    normalizeData();
    const bucket = S.activeProfileId && S.data[S.activeProfileId];
    if (bucket) {
      S.tasks = bucket.tasks;
      S.people = bucket.people;
      S.gifts = bucket.gifts;
      S.notes = bucket.notes;
      S.subjects = bucket.subjects;
      S.slots = bucket.slots;
      S.inbox = bucket.inbox;
      S.sessions = bucket.sessions;
      S.activeSession = bucket.activeSession;
    } else {
      S.tasks = [];
      S.people = [];
      S.gifts = [];
      S.notes = [];
      S.subjects = [];
      S.slots = [];
      S.inbox = [];
      S.sessions = [];
      S.activeSession = null;
    }
  }

  function stateFromRaw(raw) {
    const state = Object.assign(defaultState(), JSON.parse(raw));
    state.settings = Object.assign(defaultState().settings, state.settings || {});
    state.settings.categories = Array.isArray(state.settings.categories) && state.settings.categories.length ? state.settings.categories : [...DEFAULT_CATEGORIES];
    state.settings.relationships = Array.isArray(state.settings.relationships) && state.settings.relationships.length ? state.settings.relationships : [...DEFAULT_RELATIONSHIPS];
    state.settings.notif = Object.assign(defaultState().settings.notif, state.settings.notif || {});
    state.notes = Array.isArray(state.notes) ? state.notes : [];
    for (const profileId of Object.keys(state.data || {})) {
      const bucket = state.data[profileId];
      delete bucket.__prev;
      delete bucket.__prevRows;
    }
    normalizeData(state);
    return state;
  }

  function accountsIndex() {
    try {
      const accounts = JSON.parse(localStorage.getItem(ACC_INDEX) || '[]');
      return Array.isArray(accounts) ? accounts : [];
    } catch (error) {
      return [];
    }
  }

  function saveAccountsIndex(accounts) {
    try { localStorage.setItem(ACC_INDEX, JSON.stringify(accounts)); } catch (error) {}
  }

  function activeAccountUid() {
    return localStorage.getItem(ACC_ACTIVE);
  }

  function load() {
    try {
      const accountUid = activeAccountUid();
      if (accountUid) {
        const raw = localStorage.getItem(ACC_PREFIX + accountUid);
        if (raw) return stateFromRaw(raw);
      }
      const legacy = localStorage.getItem(LS_KEY);
      if (legacy) return stateFromRaw(legacy);
    } catch (error) {
      console.error(error);
    }
    return defaultState();
  }

  function updateAccountIndex(uid, email) {
    if (!uid) return;
    const accounts = accountsIndex();
    const profile = S.profiles.find(item => item.id === S.activeProfileId) || S.profiles[0] || null;
    const entry = {
      uid,
      email: email || '',
      name: profile ? profile.name : '',
      color: profile ? profile.color : '#2563EB',
      photo: profile ? profile.photo : '',
      pin: profile ? !!profile.pin : false,
      updatedAt: Date.now()
    };
    const index = accounts.findIndex(account => account.uid === uid);
    if (index >= 0) accounts[index] = entry;
    else accounts.push(entry);
    saveAccountsIndex(accounts);
    localStorage.setItem(ACC_ACTIVE, uid);
  }

  function claimAccount(uid, email) {
    if (!uid || !app.services.sync) return;
    const accounts = accountsIndex();
    const raw = localStorage.getItem(ACC_PREFIX + uid);
    if (raw) {
      replaceState(stateFromRaw(raw));
      S.meta.onboarded = true;
      switchProfileData();
    } else if (!accounts.length) {
      localStorage.setItem(ACC_PREFIX + uid, serializeState());
    } else {
      replaceState(defaultState());
      S.meta.onboarded = false;
      switchProfileData();
      localStorage.setItem(ACC_PREFIX + uid, serializeState());
    }
    if (window.__rebuildPrevCaches) window.__rebuildPrevCaches();
    updateAccountIndex(uid, email);
  }

  function rememberPendingDeletes(table, ids) {
    if (!ids || !ids.length) return;
    if (!S.__pendingDeletes) S.__pendingDeletes = {};
    if (!Array.isArray(S.__pendingDeletes[table])) S.__pendingDeletes[table] = [];
    for (const id of ids) {
      if (id != null && !S.__pendingDeletes[table].includes(id)) S.__pendingDeletes[table].push(id);
    }
  }

  function trackDeletes(bucket) {
    if (!bucket.__prev) bucket.__prev = {};
    if (!bucket.__del) bucket.__del = {};
    for (const key of SYNC_KEYS) {
      const localIds = (bucket[key] || []).map(row => row.id);
      for (const row of bucket[key] || []) {
        if (row && bucket.__del[key] && bucket.__del[key].includes(row.id)) row.updatedAt = Date.now();
        if (row && S.__pendingDeletes && Array.isArray(S.__pendingDeletes[key]) && S.__pendingDeletes[key].includes(row.id)) {
          row.updatedAt = Date.now();
          S.__pendingDeletes[key] = S.__pendingDeletes[key].filter(id => id !== row.id);
        }
      }
      bucket.__del[key] = (bucket.__del[key] || []).filter(id => !localIds.includes(id));
      const removed = (bucket.__prev[key] || []).filter(id => !localIds.includes(id));
      for (const id of removed) if (!bucket.__del[key].includes(id)) bucket.__del[key].push(id);
      bucket.__prev[key] = localIds;
    }
  }

  function serializeState() {
    const output = Object.assign({}, S);
    delete output.__prevProfileMap;
    delete output.__prevSettingsJson;
    if (output.data) {
      const data = {};
      for (const profileId of Object.keys(output.data)) {
        const bucket = output.data[profileId];
        const cleanBucket = {};
        for (const key of Object.keys(bucket)) {
          if (key !== '__prev' && key !== '__prevRows') cleanBucket[key] = bucket[key];
        }
        data[profileId] = cleanBucket;
      }
      output.data = data;
    }
    return JSON.stringify(output);
  }

  function stampDirtyRows(bucket) {
    if (!bucket.__prevRows) bucket.__prevRows = {};
    for (const key of SYNC_KEYS) {
      const rows = bucket[key] || [];
      const previous = bucket.__prevRows[key] || (bucket.__prevRows[key] = {});
      for (const row of rows) {
        if (!row || row.id == null) continue;
        const { updatedAt, ...rest } = row;
        const json = JSON.stringify(rest);
        if (previous[row.id] !== undefined && previous[row.id] !== json) row.updatedAt = Date.now();
        previous[row.id] = json;
      }
    }
  }

  function stampDirtyProfiles() {
    const previousMap = S.__prevProfileMap || (S.__prevProfileMap = {});
    for (const profile of S.profiles) {
      if (!profile || !profile.id) continue;
      const { updatedAt, ...rest } = profile;
      const json = JSON.stringify(rest);
      if (previousMap[profile.id] !== undefined && previousMap[profile.id] !== json) profile.updatedAt = Date.now();
      previousMap[profile.id] = json;
    }
    const ids = new Set(S.profiles.map(profile => profile && profile.id));
    for (const id of Object.keys(previousMap)) if (!ids.has(id)) delete previousMap[id];
  }

  function settingsClockJson() {
    const settings = Object.assign({}, S.settings || {});
    delete settings.updatedAt;
    return JSON.stringify({ settings, meta: S.meta || {} });
  }

  function stampSettingsClock() {
    const json = settingsClockJson();
    if (S.__prevSettingsJson !== undefined && S.__prevSettingsJson !== json && S.settings) S.settings.updatedAt = Date.now();
    S.__prevSettingsJson = json;
  }

  function rebuildPrevCaches() {
    if (!S.data) return;
    for (const profileId of Object.keys(S.data)) {
      const bucket = S.data[profileId];
      bucket.__prev = {};
      bucket.__prevRows = {};
      for (const key of SYNC_KEYS) {
        const previous = {};
        for (const row of bucket[key] || []) {
          if (row && row.id != null) {
            const { updatedAt, ...rest } = row;
            previous[row.id] = JSON.stringify(rest);
          }
        }
        bucket.__prevRows[key] = previous;
        bucket.__prev[key] = (bucket[key] || []).map(row => row.id);
      }
    }
    S.__prevProfileMap = {};
    for (const profile of S.profiles) {
      if (!profile || !profile.id) continue;
      const { updatedAt, ...rest } = profile;
      S.__prevProfileMap[profile.id] = JSON.stringify(rest);
    }
    S.__prevSettingsJson = settingsClockJson();
  }

  let pushTimer = null;

  function clearPushTimer() {
    clearTimeout(pushTimer);
    pushTimer = null;
  }

  function save() {
    try {
      const bucket = (S.activeProfileId && S.data && S.data[S.activeProfileId]) || null;
      if (bucket) {
        // Sincronizamos primero los arrays activos —algunas acciones los
        // reemplazan mediante filter/slice— y después detectamos borrados.
        // Así trackDeletes también ve esas eliminaciones y genera tombstones.
        bucket.tasks = S.tasks || [];
        bucket.people = S.people || [];
        bucket.gifts = S.gifts || [];
        bucket.notes = S.notes || [];
        bucket.subjects = S.subjects || [];
        bucket.slots = S.slots || [];
        bucket.inbox = S.inbox || [];
        bucket.sessions = S.sessions || [];
        bucket.activeSession = S.activeSession || null;
        trackDeletes(bucket);
        stampDirtyRows(bucket);
      }
      stampDirtyProfiles();
      stampSettingsClock();
      const uid = activeAccountUid();
      if (uid) {
        localStorage.setItem(ACC_PREFIX + uid, serializeState());
        const known = accountsIndex().find(account => account.uid === uid);
        if (known) updateAccountIndex(uid, known.email);
      }
    } catch (error) {
      if (app.components.toast) app.components.toast('No se pudo guardar: almacenamiento lleno');
      else console.error(error);
    }
    const sync = app.services.sync;
    if (sync && sync.status.state === 'online') {
      clearPushTimer();
      pushTimer = setTimeout(() => {
        if (sync.status.state === 'online') sync.push();
      }, 1200);
    }
  }

  function theme() {
    return (S.settings && S.settings.theme) || 'auto';
  }

  function applyTheme() {
    let selectedTheme = theme();
    if (selectedTheme === 'auto') {
      selectedTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    if (document.documentElement.getAttribute('data-theme') !== selectedTheme) {
      document.documentElement.setAttribute('data-theme', selectedTheme);
    }
  }

  replaceState(load());
  switchProfileData();
  applyTheme();

  if (window.matchMedia) {
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (theme() === 'auto') applyTheme();
      });
    } catch (error) {}
  }

  window.__rebuildPrevCaches = rebuildPrevCaches;

  Object.assign(app.state, {
    S,
    replaceState,
    defaultState,
    normalizeData,
    switchProfileData,
    stateFromRaw,
    accountsIndex,
    saveAccountsIndex,
    activeAccountUid,
    updateAccountIndex,
    claimAccount,
    rememberPendingDeletes,
    serializeState,
    rebuildPrevCaches,
    clearPushTimer,
    save,
    theme,
    applyTheme,
    SYNC_KEYS,
    LS_KEY,
    ACC_PREFIX,
    ACC_INDEX,
    ACC_ACTIVE
  });
}
