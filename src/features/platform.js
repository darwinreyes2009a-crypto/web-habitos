// Servicios de plataforma: aviso de versión nueva, banner de instalación y
// copia de seguridad portable en un JSON.

export function registerPlatform(app) {
  const { h, icon, todayStr, cap, uid } = app.core;
  const { S, save } = app.state;
  const { toast, confirmDialog, openSheet } = app.components;

  /* --- Aviso de versión nueva --------------------------------------------- */

  // El service worker precachea todo y solo cambia de caché cuando cambia el
  // nombre en sw.js. Cuando hay uno nuevo esperando, se avisa en vez de
  // recargar solo y perder lo que el usuario estaba haciendo.
  function watchUpdates() {
    if (!('serviceWorker' in navigator)) return;
    const offer = (registration) => {
      if (!registration || !registration.waiting) return;
      if (document.querySelector('.update-bar')) return;
      const bar = h('div', { class: 'update-bar', role: 'status' },
        h('span', null, 'Hay una versión nueva de DailyHub'),
        h('button', {
          class: 'btn btn-primary',
          style: 'padding:7px 13px;font-size:12.5px',
          onclick: () => {
            registration.waiting.postMessage({ type: 'skip-waiting' });
            navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
          }
        }, 'Actualizar')
      );
      document.body.append(bar);
    };
    navigator.serviceWorker.ready.then(registration => {
      offer(registration);
      // Cada vez que se instala uno nuevo, aparece el aviso.
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) offer(registration);
        });
      });
    }).catch(() => {});
  }

  /* --- Banner de instalación ---------------------------------------------- */

  let deferredPrompt = null;
  function watchInstall() {
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      deferredPrompt = event;
      showInstallBar();
    });
    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      const bar = document.querySelector('.install-bar');
      if (bar) bar.remove();
      toast('DailyHub instalado');
    });
  }

  function showInstallBar() {
    if (!deferredPrompt || document.querySelector('.install-bar')) return;
    const bar = h('div', { class: 'update-bar install-bar' },
      h('span', null, 'Añade DailyHub a tu pantalla de inicio'),
      h('button', {
        class: 'btn btn-primary',
        style: 'padding:7px 13px;font-size:12.5px',
        onclick: async () => {
          bar.remove();
          const prompt = deferredPrompt;
          deferredPrompt = null;
          if (!prompt) return;
          prompt.prompt();
          try { await prompt.userChoice; } catch (error) {}
        }
      }, 'Instalar'),
      h('button', { class: 'mini-btn', 'aria-label': 'Ahora no', onclick: () => { bar.remove(); deferredPrompt = null; }, html: icon('x', 16) })
    );
    document.body.append(bar);
  }

  /* --- Copia de seguridad -------------------------------------------------- */

  const BACKUP_VERSION = 1;

  // Un solo fichero con todos los perfiles y sus datos. Sirve para mudarse de
  // dispositivo, para no depender de la nube y para tener un respaldo.
  function buildBackup() {
    return {
      app: 'DailyHub',
      kind: 'backup',
      version: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      profiles: (S.profiles || []).map(profile => ({
        id: profile.id,
        name: profile.name,
        color: profile.color,
        photo: profile.photo || '',
        createdAt: profile.createdAt
      })),
      data: Object.fromEntries(Object.entries(S.data || {}).map(([profileId, bucket]) => {
        const copy = {};
        for (const [key, value] of Object.entries(bucket || {})) {
          if (key === '__prev' || key === '__prevRows' || key === '__del' || key === '__backupIds') continue;
          if (Array.isArray(value)) copy[key] = value.map(row => {
            if (!row || typeof row !== 'object') return row;
            const item = cloneValue(row);
            delete item._lastNotified;
            return item;
          });
          else if (value && typeof value === 'object') copy[key] = JSON.parse(JSON.stringify(value));
          else copy[key] = value;
        }
        return [profileId, copy];
      })),
      // Mantiene el mapa de identidad al mover una copia ya fusionada a otro
      // dispositivo, de modo que una reimportación posterior siga siendo idempotente.
      ...(Object.entries(S.data || {}).some(([, bucket]) => Object.keys((bucket && bucket.__backupIds) || {}).length)
        ? { identity: Object.fromEntries(Object.entries(S.data || {}).filter(([, bucket]) => Object.keys((bucket && bucket.__backupIds) || {}).length).map(([profileId, bucket]) => [profileId, cloneValue(bucket.__backupIds)])) }
        : {}),
      settings: cloneValue(S.settings || {})
    };
  }

  function downloadBackup() {
    const json = JSON.stringify(buildBackup(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dailyhub-copia-' + todayStr() + '.json';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return json.length;
  }

  function readBackupFile() {
    return new Promise((resolve, reject) => {
      const input = h('input', { type: 'file', accept: 'application/json,.json' });
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) { reject(new Error('sin fichero')); return; }
        const reader = new FileReader();
        reader.onload = () => {
          try { resolve(JSON.parse(String(reader.result))); }
          catch (error) { reject(new Error('El fichero no es una copia válida')); }
        };
        reader.onerror = () => reject(new Error('No se pudo leer el fichero'));
        reader.readAsText(file);
      });
      input.click();
    });
  }

  const BACKUP_COLLECTIONS = ['tasks', 'notes', 'people', 'gifts', 'subjects', 'slots', 'inbox', 'sessions', 'breaks', 'offs'];

  function defaultSettings() {
    try { return app.state.defaultState().settings || {}; } catch (error) {
      return { hideCompleted: false, theme: 'auto', categories: [], relationships: [], notif: {}, taskTemplates: [], scheduleTemplates: [] };
    }
  }

  function cloneValue(value) {
    if (value === undefined) return undefined;
    try { return JSON.parse(JSON.stringify(value)); } catch (error) { return value; }
  }

  // Settings add missing/default values and union user-defined lists; they do
  // not overwrite an explicit choice already made on the receiving device.
  function mergeSettings(target, incoming, defaults) {
    const result = Object.assign({}, target || {});
    const base = defaults || {};
    for (const [key, value] of Object.entries(incoming || {})) {
      if (key === 'updatedAt' || value === undefined) continue;
      const current = result[key];
      if (Array.isArray(value)) {
        const existing = Array.isArray(current) ? current : [];
        if (key === 'categories' || key === 'relationships') {
          result[key] = [...new Set([...existing, ...value].filter(item => typeof item === 'string' && item.trim()))];
        } else if (key === 'taskTemplates' || key === 'scheduleTemplates') {
          const merged = existing.slice();
          for (const item of value) {
            const name = String(item && item.name || '').trim().toLocaleLowerCase();
            if (!name || !merged.some(existingItem => String(existingItem && existingItem.name || '').trim().toLocaleLowerCase() === name)) merged.push(cloneValue(item));
          }
          result[key] = merged;
        } else if (current == null || JSON.stringify(current) === JSON.stringify(base[key])) result[key] = cloneValue(value);
      } else if (value && typeof value === 'object') {
        result[key] = mergeSettings(current && typeof current === 'object' ? current : {}, value, base[key] || {});
      } else if (current === undefined || JSON.stringify(current) === JSON.stringify(base[key])) {
        result[key] = value;
      }
    }
    return result;
  }

  function allRowIds(table) {
    const ids = new Set();
    for (const bucket of Object.values(S.data || {})) {
      for (const row of (bucket && bucket[table]) || []) if (row && row.id) ids.add(row.id);
    }
    return ids;
  }

  function freshImportId(occupied) {
    const generate = () => {
      if (typeof uid === 'function') return uid('imp');
      if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
      return 'imp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    };
    let id = generate();
    while (occupied.has(id)) id = generate();
    return id;
  }

  // Fusionar por identidad estable (perfil + id de fila). Si un id choca con
  // otra entidad local se guarda un mapa de origen para que reimportar el mismo
  // fichero no genere copias nuevas. El contenido existente nunca se pisa.
  function mergeBackup(backup) {
    if (!backup || backup.kind !== 'backup' || !backup.data || typeof backup.data !== 'object' || !Array.isArray(backup.profiles)) {
      throw new Error('El fichero no es una copia válida de DailyHub');
    }
    const created = { profiles: 0, tasks: 0, notes: 0, people: 0, gifts: 0, subjects: 0, slots: 0, inbox: 0, sessions: 0, breaks: 0, offs: 0 };
    let updated = 0;
    let skippedDuplicates = 0;

    for (const profile of backup.profiles) {
      if (!profile || !profile.id) continue;
      const incoming = backup.data[profile.id];
      if (!incoming || typeof incoming !== 'object') continue;
      let targetProfile = (S.profiles || []).find(item => item.id === profile.id);
      if (!targetProfile) {
        targetProfile = {
          id: profile.id,
          name: profile.name || 'Perfil importado',
          color: profile.color || '#2563EB',
          photo: profile.photo || '',
          pin: null,
          pinLen: null,
          createdAt: profile.createdAt || todayStr(),
          updatedAt: Date.now()
        };
        // Evita apropiarse de un bucket huérfano con el mismo id. El PIN no se
        // exporta ni importa: cada perfil decide su protección localmente.
        if ((S.data && S.data[targetProfile.id]) || (S.profiles || []).some(item => item.id === targetProfile.id)) {
          const occupiedProfiles = new Set([...(S.profiles || []).map(item => item.id), ...Object.keys(S.data || {})]);
          targetProfile.id = freshImportId(occupiedProfiles);
        }
        S.profiles.push(targetProfile);
        created.profiles++;
      }
      const targetId = targetProfile.id;
      if (!S.data) S.data = {};
      if (!S.data[targetId]) S.data[targetId] = { tasks: [], people: [], gifts: [], notes: [], subjects: [], slots: [], inbox: [], sessions: [], breaks: [], offs: [], activeSession: null, __del: {} };
      const bucket = S.data[targetId];
      for (const key of BACKUP_COLLECTIONS) if (!Array.isArray(bucket[key])) bucket[key] = [];
      if (!bucket.__backupIds || typeof bucket.__backupIds !== 'object') bucket.__backupIds = {};
      const maps = Object.fromEntries(BACKUP_COLLECTIONS.map(key => [key, new Map()]));
      const added = Object.fromEntries(BACKUP_COLLECTIONS.map(key => [key, []]));
      let profileHadOnlyDuplicates = true;
      let incomingCount = 0;

      const incomingIdentity = backup.identity && backup.identity[profile.id] && typeof backup.identity[profile.id] === 'object' ? backup.identity[profile.id] : {};
      for (const key of BACKUP_COLLECTIONS) {
        const rows = Array.isArray(incoming[key]) ? incoming[key] : [];
        const origins = bucket.__backupIds[key] || (bucket.__backupIds[key] = {});
        const aliases = incomingIdentity[key] && typeof incomingIdentity[key] === 'object' ? incomingIdentity[key] : {};
        const occupied = allRowIds(key);
        for (const row of rows) {
          if (!row || typeof row !== 'object' || !row.id) continue;
          incomingCount++;
          const sourceId = String(row.id);
          let targetRowId = origins[sourceId];
          if (targetRowId && bucket[key].some(item => item.id === targetRowId)) {
            maps[key].set(sourceId, targetRowId);
            updated++;
            continue;
          }
          const sameId = bucket[key].find(item => item && item.id === sourceId);
          if (sameId) {
            origins[sourceId] = sameId.id;
            maps[key].set(sourceId, sameId.id);
            updated++;
            continue;
          }
          if (occupied.has(sourceId)) targetRowId = freshImportId(occupied);
          else targetRowId = sourceId;
          const copy = Object.assign({}, cloneValue(row), { id: targetRowId, createdAt: row.createdAt || todayStr() });
          bucket[key].push(copy);
          occupied.add(targetRowId);
          origins[sourceId] = targetRowId;
          for (const [originId, exportedTargetId] of Object.entries(aliases)) {
            if (String(exportedTargetId) === sourceId) origins[originId] = targetRowId;
          }
          maps[key].set(sourceId, targetRowId);
          added[key].push(copy);
          created[key]++;
          profileHadOnlyDuplicates = false;
        }
      }

      const mapped = (table, id) => id == null ? id : maps[table].get(String(id)) || id;
      for (const slot of added.slots) if (slot.subjectId) slot.subjectId = mapped('subjects', slot.subjectId);
      for (const note of added.notes) {
        if (note.subjectId) note.subjectId = mapped('subjects', note.subjectId);
        if (note.sessionId) note.sessionId = mapped('sessions', note.sessionId);
      }
      for (const gift of added.gifts) if (gift.personId) gift.personId = mapped('people', gift.personId);
      for (const item of added.inbox) {
        if (item.subjectId) item.subjectId = mapped('subjects', item.subjectId);
        if (item.sessionId) item.sessionId = mapped('sessions', item.sessionId);
      }
      for (const session of added.sessions) {
        if (session.subjectId) session.subjectId = mapped('subjects', session.subjectId);
        if (session.slotId) session.slotId = mapped('slots', session.slotId);
      }
      for (const off of added.offs) if (off.slotId) off.slotId = mapped('slots', off.slotId);
      if (!bucket.activeSession && incoming.activeSession) {
        bucket.activeSession = cloneValue(incoming.activeSession);
        if (bucket.activeSession.subjectId) bucket.activeSession.subjectId = mapped('subjects', bucket.activeSession.subjectId);
        if (bucket.activeSession.slotId) bucket.activeSession.slotId = mapped('slots', bucket.activeSession.slotId);
      }
      if (incomingCount && profileHadOnlyDuplicates) skippedDuplicates++;
    }

    S.settings = mergeSettings(S.settings, backup.settings, defaultSettings());
    save();
    return { created, updated, skippedDuplicates };
  }

  async function importBackupFlow() {
    let backup = null;
    try {
      backup = await readBackupFile();
    } catch (error) {
      toast(error.message || 'No se pudo leer el fichero');
      return;
    }
    const count = (backup.profiles || []).length;
    const people = Object.values(backup.data || {}).reduce((total, bucket) => total + ((bucket && bucket.tasks || []).length + (bucket.notes || []).length), 0);
    confirmDialog({
      title: '¿Fusionar esta copia?',
      message: 'La copia tiene ' + count + (count === 1 ? ' perfil' : ' perfiles') + ' y unas ' + people + ' tareas y notas. Se añadirá lo que no tengas ya; no se pisa nada de lo que tienes.',
      confirmText: 'Fusionar',
      onConfirm: () => {
        try {
          const r = mergeBackup(backup);
          const total = Object.values(r.created).reduce((a, b) => a + b, 0);
          save();
          app.domain.switchProfileData();
          app.render();
          if (r.skippedDuplicates) toast('Ya tenías esa copia: no se ha duplicado nada');
          else toast('Fusionada · ' + total + ' elementos nuevos' + (r.updated ? ' · ' + r.updated + ' ya estaban' : ''));
        } catch (error) {
          toast(error.message || 'La copia no se pudo leer');
        }
      }
    });
  }

  function backupSheet() {
    openSheet('Copia de seguridad', () => {
      const box = h('div');
      const counts = ['tasks', 'notes', 'people', 'gifts', 'subjects', 'slots'].map(key => {
        const total = Object.values(S.data || {}).reduce((sum, bucket) => sum + ((bucket && bucket[key] || []).length), 0);
        const label = { tasks: 'tareas', notes: 'notas', people: 'personas', gifts: 'regalos', subjects: 'asignaturas', slots: 'bloques de horario' }[key];
        return h('div', { class: 'row' }, h('span', { style: 'flex:1' }, label), h('b', null, String(total)));
      });
      box.append(h('p', { class: 'field-hint', style: 'margin-bottom:12px' },
        'Todo vive en tu cuenta, pero tener un fichero tuyo evita perder nada si algo va mal. El archivo se abre en cualquier navegador y se puede volver a importar en otro dispositivo.'));
      for (const row of counts) box.append(row);
      box.append(h('div', { style: 'display:flex;gap:8px;margin-top:16px' },
        h('button', { class: 'btn btn-primary', style: 'flex:1', onclick: () => { const size = downloadBackup(); closeOverlays(); toast('Copia descargada · ' + Math.round(size / 1024) + ' KB'); } },
          h('span', { class: 'ic', html: icon('upload', 16) }), 'Descargar copia'),
        h('button', { class: 'btn btn-soft', style: 'flex:1', onclick: () => { closeOverlays(); importBackupFlow(); } },
          h('span', { class: 'ic', html: icon('download', 16) }), 'Importar copia')
      ));
      return box;
    });
  }

  function closeOverlays() {
    app.components.closeOverlays();
  }

  Object.assign(app.features, {
    watchUpdates,
    watchInstall,
    showInstallBar,
    buildBackup,
    downloadBackup,
    mergeBackup,
    importBackupFlow,
    backupSheet,
    installPrompt: () => deferredPrompt
  });
}
