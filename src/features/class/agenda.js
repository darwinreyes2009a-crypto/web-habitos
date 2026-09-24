export function registerClassAgenda(app) {
  const {
    h,
    uid,
    icon,
    todayStr,
    parseYmd,
    dowIdx,
    fmtShort,
    fmtLong,
    WEEK_FULL
  } = app.core;
  const { S, save } = app.state;
  const { route, ui, go, render } = app.domain;
  const { headBar, formHead, emptyState, openSheet, closeOverlays, toast } = app.components;

  const noteKinds = [
    { id: 'nota', label: 'Nota', icon: 'pencil' },
    { id: 'recordatorio', label: 'Recordatorio', icon: 'bell' },
    { id: 'deberes', label: 'Deberes', icon: 'book' },
    { id: 'material', label: 'Material', icon: 'folder' },
    { id: 'importante', label: 'Importante', icon: 'star' }
  ];
  const noteKindStyles = {
    nota: { c: 'var(--primary)', bg: 'var(--primary-soft)', br: 'var(--primary-softer)' },
    recordatorio: { c: 'var(--amber)', bg: 'var(--amber-soft)', br: 'var(--amber-border)' },
    deberes: { c: 'var(--violet)', bg: 'var(--violet-soft)', br: 'var(--violet-border)' },
    material: { c: 'var(--green)', bg: 'var(--green-soft)', br: 'var(--green-border)' },
    importante: { c: 'var(--danger)', bg: 'var(--danger-soft)', br: 'var(--danger-border)' }
  };
  const noteKindStyle = kind => noteKindStyles[kind] || noteKindStyles.nota;
  const noteTimeStr = note => note.time ? String(note.time).slice(0, 5) : '';
  const subjectIconsQuick = ['book', 'laptop', 'pencil', 'folder', 'music', 'heart', 'plant', 'star'];
  const subjectById = id => (S.subjects || []).find(subject => subject.id === id) || null;
  const slotsOfDay = day => (S.slots || []).filter(slot => slot.day === day).sort((first, second) => (first.start < second.start ? -1 : 1));
  const slotsOfSubject = id => (S.slots || []).filter(slot => slot.subjectId === id);
  const hm = time => {
    const parts = String(time || '0:00').split(':');
    return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
  };
  const timeTxt = time => time ? String(time).slice(0, 5) : '';
  const slotsOverlap = (first, second) => first.day === second.day && hm(first.start) < hm(second.end) && hm(second.start) < hm(first.end);
  const tintHex = (hex, alpha) => /^#[0-9a-f]{6}$/i.test(hex || '') ? hex + alpha : 'var(--surface-2)';

  ui.classTab = ui.classTab || 'hoy';
  ui.noteSubject = ui.noteSubject || 'todas';
  ui.noteState = ui.noteState || 'todas';
  const classTabs = [
    { id: 'hoy', label: 'Hoy' },
    { id: 'semana', label: 'Semana' },
    { id: 'despues', label: 'Para después' },
    { id: 'apuntes', label: 'Apuntes' },
    { id: 'asignaturas', label: 'Asignaturas' }
  ];

  const nowMin = () => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  };
  const minTxt = minutes => {
    const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
    return String(Math.floor(normalized / 60)).padStart(2, '0') + ':' + String(normalized % 60).padStart(2, '0');
  };
  const activeSlotsToday = () => slotsOfDay(dowIdx(todayStr()));
  const classNow = () => {
    const minutes = nowMin();
    return activeSlotsToday().find(slot => hm(slot.start) <= minutes && minutes < hm(slot.end)) || null;
  };
  const classNext = () => {
    const minutes = nowMin();
    return activeSlotsToday().find(slot => hm(slot.start) > minutes) || null;
  };

  function leftTxt(slot) {
    const left = hm(slot.end) - nowMin();
    if (left <= 0) return 'terminando';
    if (left < 60) return 'quedan ' + left + ' min';
    return 'quedan ' + Math.floor(left / 60) + ' h' + (left % 60 ? ' ' + (left % 60) + ' min' : '');
  }

  function inTxt(slot) {
    const minutes = hm(slot.start) - nowMin();
    if (minutes <= 0) return 'empieza ya';
    if (minutes < 60) return 'en ' + minutes + ' min';
    return 'en ' + Math.floor(minutes / 60) + ' h' + (minutes % 60 ? ' ' + (minutes % 60) + ' min' : '');
  }

  const slotLine = slot => timeTxt(slot.start) + ' — ' + timeTxt(slot.end) + (slot.room ? ' · ' + slot.room : '');
  function relDayTxt(ymd) {
    const difference = Math.round((parseYmd(ymd) - parseYmd(todayStr())) / 86400000);
    if (difference === 0) return 'Hoy';
    if (difference === 1) return 'Mañana';
    if (difference === -1) return 'Ayer';
    return fmtLong(ymd);
  }

  const activeSession = () => S.activeSession || null;
  const sessionItems = id => ({
    inbox: (S.inbox || []).filter(item => item.sessionId === id),
    notes: (S.notes || []).filter(note => note.sessionId === id)
  });

  function startSession(slot) {
    if (S.activeSession) {
      ui.classTab = 'hoy';
      render();
      return;
    }
    S.activeSession = {
      id: uid('ss'),
      slotId: slot ? slot.id : null,
      subjectId: slot ? slot.subjectId : null,
      date: todayStr(),
      start: slot ? slot.start : minTxt(nowMin()),
      end: slot ? slot.end : '',
      room: slot ? (slot.room || '') : ''
    };
    save();
    ui.classTab = 'hoy';
    render();
    const subject = subjectById(S.activeSession.subjectId);
    toast('Clase activa' + (subject ? ' · ' + subject.name : '') + ' · apunta lo que salga');
  }

  function finishSession() {
    const current = activeSession();
    if (!current) return;
    const items = sessionItems(current.id);
    const record = Object.assign({}, current, {
      end: current.end || minTxt(nowMin()),
      endedAt: new Date().toISOString(),
      counts: { inbox: items.inbox.length, notes: items.notes.length, important: items.notes.filter(note => note.starred).length }
    });
    if (!Array.isArray(S.sessions)) S.sessions = [];
    S.sessions.unshift(record);
    S.activeSession = null;
    save();
    render();
    sessionSummarySheet(record);
  }

  function sessionSummarySheet(record) {
    const subject = subjectById(record.subjectId);
    const counts = record.counts || { inbox: 0, notes: 0, important: 0 };
    const total = counts.inbox + counts.notes;
    openSheet('Clase terminada', () => h('div', null,
      h('div', { class: 'now-card', style: 'margin-bottom:14px;border-left-color:' + (subject ? subject.color : 'var(--border)') },
        h('span', { class: 'nw-ic', style: 'background:' + tintHex(subject ? subject.color : '', '22') + ';color:' + (subject ? subject.color : 'var(--text-2)'), html: icon(subject ? (subject.icon || 'book') : 'book', 24) }),
        h('div', { style: 'flex:1;min-width:0' },
          h('span', { class: 'nw-tag' }, 'Clase'),
          h('b', { class: 'nw-sub' }, subject ? subject.name : 'Clase sin asignatura'),
          h('span', { class: 'nw-meta' }, h('span', null, timeTxt(record.start) + ' — ' + timeTxt(record.end)), record.room ? h('span', null, '· ' + record.room) : null)
        )
      ),
      h('p', { class: 'field-hint', style: 'margin-bottom:10px' }, total ? 'Has apuntado durante esta clase:' : 'No has apuntado nada en esta clase. Todo tranquilo.'),
      total ? h('div', { class: 'set-card', style: 'margin-bottom:18px' },
        counts.inbox ? h('div', { class: 'set-row' }, h('span', { class: 'r-ic', html: icon('pin', 17) }), h('span', null, counts.inbox + ' en Para después')) : null,
        counts.notes ? h('div', { class: 'set-row' }, h('span', { class: 'r-ic', html: icon('pencil', 17) }), h('span', null, counts.notes === 1 ? '1 apunte guardado' : counts.notes + ' apuntes guardados')) : null,
        counts.important ? h('div', { class: 'set-row' }, h('span', { class: 'r-ic', style: 'background:var(--danger-soft);color:var(--danger)', html: icon('star', 17) }), h('span', null, counts.important + ' marcado' + (counts.important === 1 ? '' : 's') + ' importante' + (counts.important === 1 ? '' : 's'))) : null
      ) : null,
      h('div', { style: 'display:flex;gap:10px' },
        h('button', { class: 'btn btn-soft', style: 'flex:1', onclick: () => { closeOverlays(); render(); } }, 'Terminar'),
        h('button', { class: 'btn btn-primary', style: 'flex:1', onclick: () => { closeOverlays(); ui.classTab = counts.inbox ? 'despues' : 'apuntes'; render(); } }, 'Revisar')
      )
    ));
  }

  function inboxAdd(text, subjectId) {
    const current = activeSession();
    const item = {
      id: uid('i'),
      text,
      date: todayStr(),
      time: minTxt(nowMin()),
      subjectId: subjectId || (current ? current.subjectId : null),
      sessionId: current ? current.id : null,
      createdAt: new Date().toISOString()
    };
    if (!Array.isArray(S.inbox)) S.inbox = [];
    S.inbox.unshift(item);
    save();
    return item;
  }

  function captureBar(placeholder, onSaved) {
    const box = h('div', { class: 'qc' });
    const input = h('input', { class: 'input', type: 'text', autocomplete: 'off', maxlength: '240', placeholder: placeholder || 'Escribe algo y pulsa Enter…' });
    box.append(h('span', { html: icon('pin', 18) }), input);
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      const item = inboxAdd(text);
      input.value = '';
      const subject = subjectById(item.subjectId);
      toast('Guardado en Para después' + (subject ? ' · ' + subject.name : ''), { label: 'Organizar', fn: () => { ui.classTab = 'despues'; render(); } });
      if (onSaved) onSaved(item);
    });
    return box;
  }

  function inboxRow(item, redraw) {
    const subject = subjectById(item.subjectId);
    return h('button', { class: 'inbox-row', onclick: () => inboxMenu(item, redraw) },
      h('span', { class: 'ib-ic', html: icon('pin', 17) }),
      h('div', { style: 'flex:1;min-width:0' },
        h('p', null, item.text),
        h('div', { class: 'ib-meta' },
          h('span', null, fmtShort(item.date) + (item.time ? ' · ' + item.time : '')),
          subject ? h('span', { class: 'subj-chip', style: 'color:' + subject.color + ';background:' + tintHex(subject.color, '22') }, subject.name) : h('span', null, 'sin asignatura')
        )
      ),
      h('span', { class: 'chev', html: icon('chev', 16) })
    );
  }

  function inboxMenu(item, redraw) {
    closeOverlays();
    const overlay = h('div', { class: 'overlay', style: 'z-index:60', onclick: event => { if (event.target === overlay) overlay.remove(); } });
    const run = callback => () => { overlay.remove(); callback(); };
    const sheet = h('div', { class: 'sheet', style: 'max-width:360px', role: 'menu' },
      h('div', { style: 'padding:0 4px 14px' },
        h('p', { style: 'font-size:15px;font-weight:600;line-height:1.4' }, item.text),
        h('p', { class: 'field-hint' }, '¿Qué haces con esto?')
      ),
      h('button', { class: 'set-row', onclick: run(() => inboxToTask(item, redraw)) }, h('span', { class: 'r-ic', html: icon('checksq', 17) }), h('span', null, 'Convertir en tarea')),
      h('button', { class: 'set-row', onclick: run(() => pickSubject('¿Deberes de qué asignatura?', subject => inboxToNote(item, redraw, 'deberes', subject))) }, h('span', { class: 'r-ic', style: 'background:var(--violet-soft);color:var(--violet)', html: icon('book', 17) }), h('span', null, 'Deberes de una asignatura')),
      h('button', { class: 'set-row', onclick: run(() => inboxToNote(item, redraw, 'nota')) }, h('span', { class: 'r-ic', html: icon('pencil', 17) }), h('span', null, 'Convertir en apunte')),
      h('button', { class: 'set-row', onclick: run(() => inboxToNote(item, redraw, 'recordatorio')) }, h('span', { class: 'r-ic', style: 'background:var(--amber-soft);color:var(--amber)', html: icon('bell', 17) }), h('span', null, 'Convertir en recordatorio')),
      h('button', { class: 'set-row', onclick: run(() => inboxToNote(item, redraw, 'importante')) }, h('span', { class: 'r-ic', style: 'background:var(--danger-soft);color:var(--danger)', html: icon('star', 17) }), h('span', null, 'Marcar como importante')),
      h('button', { class: 'set-row', onclick: run(() => pickSubject('Asignatura', subject => {
        item.subjectId = subject ? subject.id : null;
        save();
        toast(subject ? 'Asignado a ' + subject.name : 'Sin asignatura');
        if (redraw) redraw();
        else render();
      })) }, h('span', { class: 'r-ic', style: 'background:var(--surface-2);color:var(--text-2)', html: icon('folder', 17) }), h('span', null, item.subjectId ? 'Cambiar de asignatura' : 'Asignar asignatura')),
      h('button', { class: 'set-row', onclick: run(() => inboxEdit(item, redraw)) }, h('span', { class: 'r-ic', style: 'background:var(--surface-2);color:var(--text-2)', html: icon('pencil', 17) }), h('span', null, 'Editar el texto')),
      h('button', { class: 'set-row', style: 'color:var(--danger)', onclick: run(() => inboxRemove(item, redraw)) }, h('span', { class: 'r-ic', style: 'background:var(--danger-soft);color:var(--danger)', html: icon('trash', 17) }), h('span', null, 'Eliminar'))
    );
    overlay.append(sheet);
    document.body.appendChild(overlay);
  }

  function inboxEdit(item, redraw) {
    openSheet('Editar', () => {
      const input = h('input', { class: 'input', type: 'text', value: item.text, maxlength: '240' });
      const accept = () => {
        const value = input.value.trim();
        if (!value) {
          input.focus();
          return;
        }
        item.text = value;
        save();
        closeOverlays();
        if (redraw) redraw();
        else render();
      };
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          accept();
        }
      });
      setTimeout(() => { input.focus(); input.select(); }, 60);
      return h('div', null, h('div', { class: 'field' }, input), h('button', { class: 'btn btn-primary btn-block', onclick: accept }, 'Guardar'));
    });
  }

  function inboxRemove(item, redraw) {
    const index = S.inbox.indexOf(item);
    if (index < 0) return;
    const [removed] = S.inbox.splice(index, 1);
    save();
    if (redraw) redraw();
    else render();
    toast('Elemento eliminado', { label: 'Deshacer', fn: () => { S.inbox.splice(Math.min(index, S.inbox.length), 0, removed); save(); render(); } });
  }

  function dropFromInbox(item) {
    const index = S.inbox.indexOf(item);
    if (index < 0) return -1;
    S.inbox.splice(index, 1);
    return index;
  }

  function inboxToTask(item, redraw) {
    const task = { id: uid('t'), title: item.text, icon: 'checksq', cat: 'Personal', freq: { type: 'once', date: item.date || todayStr() }, time: '', completions: [], createdAt: todayStr() };
    S.tasks.push(task);
    const index = dropFromInbox(item);
    save();
    if (redraw) redraw();
    else render();
    toast('Convertida en tarea · hoy', { label: 'Deshacer', fn: () => { S.tasks = S.tasks.filter(taskItem => taskItem.id !== task.id); if (index >= 0) S.inbox.splice(Math.min(index, S.inbox.length), 0, item); save(); render(); } });
  }

  function inboxToNote(item, redraw, kind, subject) {
    const current = activeSession();
    const note = {
      id: uid(),
      text: item.text,
      kind: kind || 'nota',
      date: item.date || todayStr(),
      time: '',
      done: false,
      starred: kind === 'importante',
      subjectId: subject ? subject.id : (item.subjectId || null),
      sessionId: (current && current.id === item.sessionId) ? current.id : null,
      createdAt: new Date().toISOString()
    };
    S.notes.unshift(note);
    const index = dropFromInbox(item);
    save();
    if (redraw) redraw();
    else render();
    const message = kind === 'deberes' ? 'Guardado como deberes' + (subject ? ' · ' + subject.name : '') : kind === 'importante' ? 'Marcado como importante' : kind === 'recordatorio' ? 'Guardado como recordatorio' : 'Guardado como apunte';
    toast(message, { label: 'Deshacer', fn: () => { S.notes = S.notes.filter(noteItem => noteItem.id !== note.id); if (index >= 0) S.inbox.splice(Math.min(index, S.inbox.length), 0, item); save(); render(); } });
  }

  function pickSubject(title, callback) {
    closeOverlays();
    const overlay = h('div', { class: 'overlay', style: 'z-index:65', onclick: event => { if (event.target === overlay) overlay.remove(); } });
    const subjects = S.subjects || [];
    const sheet = h('div', { class: 'sheet', style: 'max-width:360px', role: 'menu' },
      h('div', { class: 'grabber' }),
      h('h3', { style: 'font-size:17px;font-weight:800;margin-bottom:14px' }, title)
    );
    if (!subjects.length) {
      sheet.append(
        h('p', { class: 'field-hint', style: 'margin-bottom:14px' }, 'Todavía no tienes asignaturas creadas.'),
        h('button', { class: 'btn btn-primary btn-block', onclick: () => { overlay.remove(); go('subjectForm'); } }, 'Crear asignatura')
      );
    }
    for (const subject of subjects) {
      sheet.append(h('button', { class: 'set-row', onclick: () => { overlay.remove(); callback(subject); } },
        h('span', { class: 'r-ic', style: 'background:' + tintHex(subject.color, '22') + ';color:' + subject.color, html: icon(subject.icon || 'book', 17) }),
        h('span', null, subject.name)
      ));
    }
    sheet.append(h('button', { class: 'set-row', onclick: () => { overlay.remove(); callback(null); } },
      h('span', { class: 'r-ic', style: 'background:var(--surface-2);color:var(--text-2)', html: icon('x', 17) }),
      h('span', null, 'Sin asignatura')
    ));
    overlay.append(sheet);
    document.body.appendChild(overlay);
  }

  function pickSlotSubject(slot) {
    closeOverlays();
    const overlay = h('div', { class: 'overlay', style: 'z-index:65', onclick: event => { if (event.target === overlay) overlay.remove(); } });
    const subjects = S.subjects || [];
    const sheet = h('div', { class: 'sheet', style: 'max-width:390px', role: 'menu' },
      h('div', { class: 'grabber' }),
      h('h3', { style: 'font-size:17px;font-weight:800;margin-bottom:4px' }, timeTxt(slot.start) + ' — ' + timeTxt(slot.end)),
      h('p', { class: 'field-hint', style: 'margin-bottom:14px' }, WEEK_FULL[slot.day] + ' · toca una asignatura para ponerla en este hueco.')
    );
    if (!subjects.length) {
      sheet.append(
        h('p', { class: 'field-hint', style: 'margin-bottom:14px' }, 'Todavía no tienes asignaturas creadas. Puedes dejar el hueco vacío y crearlas luego.'),
        h('button', { class: 'btn btn-primary btn-block', onclick: () => { overlay.remove(); go('subjectForm'); } }, 'Crear asignatura')
      );
    }
    for (const subject of subjects) {
      sheet.append(h('button', { class: 'set-row', onclick: () => {
        slot.subjectId = subject.id;
        save();
        overlay.remove();
        render();
        toast('Asignado a ' + subject.name);
      } },
        h('span', { class: 'r-ic', style: 'background:' + tintHex(subject.color, '22') + ';color:' + subject.color, html: icon(subject.icon || 'book', 17) }),
        h('span', null, subject.name),
        slot.subjectId === subject.id ? h('span', { class: 'nav-badge' }, 'actual') : null
      ));
    }
    sheet.append(h('button', { class: 'set-row', onclick: () => {
      slot.subjectId = null;
      save();
      overlay.remove();
      render();
      toast('Hueco sin asignatura');
    } },
      h('span', { class: 'r-ic', style: 'background:var(--surface-2);color:var(--text-2)', html: icon('x', 17) }),
      h('span', null, 'Sin asignatura'),
      !slot.subjectId ? h('span', { class: 'nav-badge', style: 'background:var(--surface-2);color:var(--text-2)' }, 'actual') : null
    ));
    sheet.append(h('button', { class: 'set-row', onclick: () => { overlay.remove(); go('slotForm', { id: slot.id }); } },
      h('span', { class: 'r-ic', style: 'background:var(--surface-2);color:var(--text-2)', html: icon('pencil', 17) }),
      h('span', null, 'Editar hora, día o aula')
    ));
    overlay.append(sheet);
    document.body.appendChild(overlay);
  }

  function slotRowEl(slot, options) {
    const opts = options || {};
    const patio = slot.kind === 'patio' || slot.room === 'patio';
    const subject = patio ? null : subjectById(slot.subjectId);
    const label = patio ? 'Patio' : (subject ? subject.name : 'Sin asignatura');
    const color = patio ? 'var(--amber)' : (subject ? subject.color : 'var(--border)');
    return h('button', {
      class: 'row slot-row' + (patio ? ' patio-row' : ''),
      style: 'border-left-color:' + color,
      onclick: () => opts.quickSubject ? (patio ? app.class.blockMenu(slot) : pickSlotSubject(slot)) : app.class.blockMenu(slot)
    },
      h('span', { class: 'slot-time' }, h('b', null, timeTxt(slot.start)), h('span', null, timeTxt(slot.end))),
      h('span', { style: 'flex:1;min-width:0;text-align:left' },
        patio
          ? h('b', { style: 'display:inline-flex;align-items:center;gap:7px' }, h('span', { class: 'ic', html: icon('coffee', 15) }), 'Patio')
          : h('b', null, label),
        h('span', { class: 'r-sub' }, (slot.room || '') && !patio ? slot.room : '')
      ),
      opts.live ? h('span', { class: 'nav-badge' }, 'ahora') : h('span', { class: 'chev', html: icon('chev', 16) })
    );
  }

  function drawNowZone(zone) {
    zone.innerHTML = '';
    const current = activeSession();
    const now = classNow();
    const next = classNext();
    const today = activeSlotsToday();
    if (current) {
      const subject = subjectById(current.subjectId);
      const color = subject ? subject.color : '#16A34A';
      zone.append(h('div', { class: 'now-card live', style: 'border-left-color:' + color },
        h('span', { class: 'nw-ic', style: 'background:' + tintHex(subject ? subject.color : '', '22') + ';color:' + color, html: icon(subject ? (subject.icon || 'book') : 'book', 24) }),
        h('div', { style: 'flex:1;min-width:0' },
          h('span', { class: 'nw-tag' }, 'Clase activa'),
          h('b', { class: 'nw-sub' }, subject ? subject.name : 'Clase sin asignatura'),
          h('span', { class: 'nw-meta' },
            h('span', null, timeTxt(current.start) + (current.end ? ' — ' + timeTxt(current.end) : '')),
            current.room ? h('span', null, '· ' + current.room) : null,
            current.end ? h('span', { style: 'color:var(--green);font-weight:700' }, '· ' + leftTxt({ end: current.end })) : null
          )
        ),
        h('button', { class: 'btn btn-soft', style: 'flex:none', onclick: finishSession }, 'Terminar')
      ));
    } else if (now) {
      const patio = now.kind === 'patio' || now.room === 'patio';
      const subject = patio ? null : subjectById(now.subjectId);
      const label = patio ? 'Patio' : (subject ? subject.name : 'Clase sin asignatura');
      const color = patio ? 'var(--amber)' : (subject ? subject.color : 'var(--green)');
      zone.append(h('div', { class: 'now-card live', style: 'border-left-color:' + color },
        h('span', { class: 'nw-ic', style: 'background:' + tintHex(subject ? subject.color : '', '22') + ';color:' + color, html: icon(patio ? 'coffee' : (subject ? (subject.icon || 'book') : 'book'), 24) }),
        h('div', { style: 'flex:1;min-width:0' },
          h('span', { class: 'nw-tag' }, patio ? 'Descanso' : 'Ahora'),
          h('b', { class: 'nw-sub' }, label),
          h('span', { class: 'nw-meta' }, h('span', null, slotLine(now)), h('span', { style: 'color:var(--green);font-weight:700' }, '· ' + leftTxt(now)))
        ),
        patio ? null : h('button', { class: 'btn btn-primary', style: 'flex:none', onclick: () => startSession(now) }, 'Empezar')
      ));
    } else if (next) {
      const patio = next.kind === 'patio' || next.room === 'patio';
      const subject = patio ? null : subjectById(next.subjectId);
      const label = patio ? 'Patio' : (subject ? subject.name : 'Clase sin asignatura');
      const color = patio ? 'var(--amber)' : (subject ? subject.color : 'var(--border)');
      zone.append(h('div', { class: 'idle-card' }, h('b', null, 'Ahora no tienes ninguna clase'), h('p', null, 'Lo siguiente empieza ' + inTxt(next) + '.')));
      zone.append(h('div', { class: 'now-card', style: 'border-left-color:' + color },
        h('span', { class: 'nw-ic', style: 'background:' + tintHex(subject ? subject.color : '', '22') + ';color:' + (patio ? 'var(--amber)' : (subject ? subject.color : 'var(--text-2)')), html: icon(patio ? 'coffee' : (subject ? (subject.icon || 'book') : 'book'), 24) }),
        h('div', { style: 'flex:1;min-width:0' },
          h('span', { class: 'nw-tag' }, 'Después'),
          h('b', { class: 'nw-sub' }, label),
          h('span', { class: 'nw-meta' }, h('span', null, slotLine(next)), h('span', { style: 'color:var(--primary);font-weight:700' }, '· ' + inTxt(next)))
        ),
        patio ? null : h('button', { class: 'btn btn-soft', style: 'flex:none', onclick: () => startSession(next) }, 'Empezar')
      ));
    } else if (today.length) {
      zone.append(h('div', { class: 'idle-card' }, h('b', null, 'Has terminado las clases de hoy'), h('p', null, 'Buen trabajo. Revisa lo que apuntaste y organízalo cuando quieras.')));
    } else {
      zone.append(h('div', { class: 'idle-card' }, h('b', null, 'Hoy no tienes clases'), h('p', null, (S.slots || []).length ? 'Tu horario no tiene ninguna clase para hoy.' : 'Configura tu horario y aquí verás qué clase toca en cada momento.')));
      if (!(S.slots || []).length) zone.append(h('button', { class: 'btn btn-soft btn-block', style: 'margin-bottom:12px', onclick: () => go('classSchedule') }, 'Configurar horario'));
    }
    const rest = today.filter(slot => (now ? hm(slot.start) > hm(now.start) : next ? hm(slot.start) > hm(next.start) : false));
    if (rest.length) {
      zone.append(h('div', { class: 'section-title' }, h('span', null, (next && !now && !current) ? 'Más tarde' : 'Después')));
      for (const slot of rest) zone.append(slotRowEl(slot));
    }
  }

  setInterval(() => {
    const zone = document.getElementById('cls-now');
    if (zone && route.name === 'class' && ui.classTab === 'hoy') drawNowZone(zone);
  }, 30000);

  function classSubTxt() {
    if (activeSession()) {
      const subject = subjectById((activeSession() || {}).subjectId);
      return (subject ? subject.name + ' · ' : '') + 'clase activa';
    }
    const now = classNow();
    if (now) {
      const patio = now.kind === 'patio' || now.room === 'patio';
      return 'Ahora: ' + (patio ? 'Patio' : ((subjectById(now.subjectId) || {}).name || 'clase')) + ' · ' + leftTxt(now);
    }
    const next = classNext();
    if (next) {
      const patio = next.kind === 'patio' || next.room === 'patio';
      return 'Después: ' + (patio ? 'Patio' : ((subjectById(next.subjectId) || {}).name || 'clase')) + ' · ' + inTxt(next);
    }
    return activeSlotsToday().length ? 'Has terminado las clases de hoy' : 'Tu agenda de clase';
  }

  function classHoyBody() {
    const wrap = h('div');
    const nowZone = h('div', { id: 'cls-now' });
    drawNowZone(nowZone);
    wrap.append(nowZone);
    const live = !!activeSession();
    wrap.append(h('p', { class: 'field-hint', style: 'margin-bottom:8px' }, live ? 'Apunta aquí lo que diga el profe. No hace falta organizarlo ahora.' : 'Escribe y pulsa Enter: se guarda en Para después y lo organizas cuando quieras.'));
    const preview = h('div');
    function drawPreview() {
      preview.innerHTML = '';
      const items = S.inbox || [];
      if (!items.length) return;
      preview.append(h('div', { class: 'section-title' },
        h('span', null, 'Para después'),
        h('button', { class: 'link', onclick: () => { ui.classTab = 'despues'; render(); } }, 'Ver los ' + items.length)
      ));
      for (const item of items.slice(0, 3)) preview.append(inboxRow(item, drawPreview));
    }
    wrap.append(captureBar('Escribe algo y pulsa Enter…', drawPreview));
    drawPreview();
    wrap.append(preview);
    if (!live) {
      const todayNotes = (S.notes || []).filter(note => note.date === todayStr()).slice(0, 3);
      if (todayNotes.length) {
        wrap.append(h('div', { class: 'section-title' },
          h('span', null, 'Apuntes de hoy'),
          h('button', { class: 'link', onclick: () => { ui.classTab = 'apuntes'; render(); } }, 'Ver todos')
        ));
        for (const note of todayNotes) wrap.append(app.class.noteCard(note));
      }
    }
    wrap.append(h('div', { class: 'section-title' }, h('span', null, 'Concentración')));
    wrap.append(app.class.pomodoroCard());
    return wrap;
  }

  function scheduleSections(options) {
    const opts = options || {};
    const fragment = h('div');
    const current = classNow();
    const today = dowIdx(todayStr());
    for (let day = 0; day < 7; day++) {
      const daySlots = slotsOfDay(day);
      if (!daySlots.length) continue;
      const card = h('div', { class: 'day-card' + (day === today ? ' today' : '') },
        h('div', { class: 'day-head' },
          h('b', null, WEEK_FULL[day] + (day === today ? ' · hoy' : '')),
          h('span', { style: 'display:flex;align-items:center;gap:8px' },
            h('span', { class: 'nav-badge', style: 'background:var(--surface-2);color:var(--text-2)' }, daySlots.filter(slot => slot.kind !== 'patio' && slot.room !== 'patio').length)
          )
        )
      );
      daySlots.forEach(slot => {
        card.append(slotRowEl(slot, { live: !!(current && current.id === slot.id), quickSubject: !!opts.quickSubject }));
      });
      fragment.append(card);
    }
    return fragment;
  }

  function classWeekBody() {
    const wrap = h('div');
    if (!(S.slots || []).length) {
      wrap.append(emptyState('calendar', 'Sin horario todavía', 'Añade tus clases con su asignatura, su día y su hora para saber siempre qué toca.', 'Añadir clase', () => go('slotForm')));
      return wrap;
    }
    wrap.append(scheduleSections());
    wrap.append(h('button', { class: 'btn btn-soft btn-block', style: 'margin-top:6px', onclick: () => go('classSchedule') }, 'Gestionar horario'));
    return wrap;
  }

  function classInboxBody() {
    const wrap = h('div');
    const zone = h('div');
    function draw() {
      zone.innerHTML = '';
      const items = S.inbox || [];
      if (!items.length) {
        zone.append(emptyState('pin', 'Nada en Para después', 'Aquí cae todo lo que apuntes en clase. Cuando quieras, conviértelo en tarea, deberes o apunte.'));
        return;
      }
      for (const item of items) zone.append(inboxRow(item, draw));
      zone.append(h('p', { class: 'field-hint', style: 'text-align:center' }, 'Toca un elemento para convertirlo en tarea, deberes, apunte o recordatorio.'));
    }
    draw();
    wrap.append(captureBar('Escribe algo y pulsa Enter…', draw), zone);
    return wrap;
  }

  function subjectsGrid() {
    const subjects = S.subjects || [];
    if (!subjects.length) {
      return emptyState('folder', 'Sin asignaturas todavía', 'Crea una asignatura para agrupar sus clases, sus deberes y sus apuntes.', 'Nueva asignatura', () => go('subjectForm'));
    }
    const grid = h('div', { class: 'person-grid' });
    for (const subject of subjects) {
      const notes = (S.notes || []).filter(note => note.subjectId === subject.id);
      const pending = notes.filter(note => !note.done).length;
      const classCount = slotsOfSubject(subject.id).length;
      grid.append(h('button', { class: 'person-card', onclick: () => go('subjectView', { id: subject.id }) },
        h('span', { class: 'subject-folder', style: 'background:' + tintHex(subject.color, '22') + ';color:' + subject.color, html: icon(subject.icon || 'book', 26) }),
        h('b', null, subject.name),
        h('span', null, classCount + (classCount === 1 ? ' clase' : ' clases') + ' · ' + notes.length + (notes.length === 1 ? ' apunte' : ' apuntes') + (pending ? ' · ' + pending + ' abiertos' : ''))
      ));
    }
    grid.append(h('button', { class: 'person-card add', onclick: () => go('subjectForm') }, h('span', { html: icon('plus', 22) }), h('b', null, 'Añadir asignatura')));
    return grid;
  }

  function scrClass() {
    const wrap = h('div');
    const body = {
      hoy: classHoyBody,
      semana: classWeekBody,
      despues: classInboxBody,
      apuntes: () => app.class.classNotesBody(),
      asignaturas: subjectsGrid
    }[ui.classTab] || classHoyBody;
    wrap.append(headBar('Modo Clase', classSubTxt(),
      h('button', { class: 'icon-btn', 'aria-label': 'Historial de clases', onclick: () => go('classHistory'), html: icon('clock', 20) }),
      h('button', { class: 'icon-btn', 'aria-label': 'Horario', onclick: () => go('classSchedule'), html: icon('calendar', 20) }),
      h('button', { class: 'icon-btn', 'aria-label': 'Nueva nota completa', onclick: () => go('noteForm'), html: icon('plus', 20) })
    ));
    const tabs = h('div', { class: 'cls-tabs' });
    const pending = (S.inbox || []).length;
    for (const tab of classTabs) {
      tabs.append(h('button', {
        class: 'cls-tab' + (ui.classTab === tab.id ? ' on' : ''),
        onclick: () => { ui.classTab = tab.id; render(); }
      }, tab.label + (tab.id === 'despues' && pending ? ' · ' + pending : '')));
    }
    wrap.append(tabs, body());
    return wrap;
  }

  function scrSubjectView() {
    const subject = subjectById(route.params.id);
    const back = () => {
      if (app.domain.routeStack.length) {
        app.domain.goBack();
        return;
      }
      ui.classTab = 'asignaturas';
      go('class', undefined, { replace: true });
    };
    if (!subject) return emptyState('folder', 'Asignatura no encontrada', 'Puede que la hayas eliminado.', 'Ver asignaturas', back);
    const wrap = h('div');
    wrap.append(formHead(subject.name, back,
      h('div', { style: 'display:contents' },
        h('button', { class: 'icon-btn', 'aria-label': 'Nuevo apunte de esta asignatura', onclick: () => go('noteForm', { subjectId: subject.id }), html: icon('plus', 18) }),
        h('button', { class: 'icon-btn', 'aria-label': 'Editar asignatura', onclick: () => go('subjectForm', { id: subject.id }), html: icon('pencil', 18) })
      )
    ));
    const notes = (S.notes || []).filter(note => note.subjectId === subject.id);
    const subjectSlots = (S.slots || []).filter(slot => slot.subjectId === subject.id).sort((first, second) => (first.day - second.day) || (first.start < second.start ? -1 : 1));
    const open = notes.filter(note => !note.done).length;
    wrap.append(h('div', { class: 'card', style: 'display:flex;align-items:center;gap:14px;margin-bottom:8px' },
      h('span', { class: 'subject-folder', style: 'background:' + tintHex(subject.color, '22') + ';color:' + subject.color, html: icon(subject.icon || 'book', 26) }),
      h('div', { style: 'min-width:0' },
        h('b', { style: 'font-size:16px;display:block' }, subject.name),
        h('span', { style: 'font-size:12.5px;color:var(--text-2)' }, notes.length + (notes.length === 1 ? ' apunte' : ' apuntes') + (open ? ' · ' + open + ' abiertos' : '') + ' · ' + subjectSlots.length + (subjectSlots.length === 1 ? ' clase' : ' clases') + ' a la semana')
      )
    ));
    if (subjectSlots.length) {
      wrap.append(h('div', { class: 'section-title' }, h('span', null, 'Horario')));
      for (const slot of subjectSlots) wrap.append(slotRowEl(slot));
    }
    const sections = [['nota', 'Apuntes'], ['deberes', 'Deberes'], ['recordatorio', 'Recordatorios'], ['material', 'Material'], ['importante', 'Importante']];
    let any = false;
    for (const [kind, label] of sections) {
      const matching = notes.filter(note => (note.kind || 'nota') === kind).sort((first, second) => first.date === second.date ? (first.done - second.done) : (first.date < second.date ? 1 : -1));
      if (!matching.length) continue;
      any = true;
      wrap.append(h('div', { class: 'section-title' },
        h('span', null, label),
        h('span', { class: 'nav-badge', style: 'background:var(--surface-2);color:var(--text-2)' }, matching.length)
      ));
      for (const note of matching) wrap.append(app.class.noteCard(note));
    }
    if (!any) wrap.append(emptyState('pencil', 'Sin apuntes todavía', 'Añade el primer apunte, deber o recordatorio de ' + subject.name + '.', 'Nuevo apunte', () => go('noteForm', { subjectId: subject.id })));
    return wrap;
  }

  function scrClassHistory() {
    const wrap = h('div');
    const back = () => {
      if (app.domain.routeStack.length) {
        app.domain.goBack();
        return;
      }
      ui.classTab = 'hoy';
      go('class', undefined, { replace: true });
    };
    const sessions = (S.sessions || []).slice().sort((first, second) => {
      if (first.date !== second.date) return first.date < second.date ? 1 : -1;
      return (first.start || '') < (second.start || '') ? 1 : -1;
    });
    wrap.append(formHead('Historial de clases', back));
    if (!sessions.length) {
      wrap.append(emptyState('clock', 'Sin clases registradas', 'Cuando uses «Empezar» y luego «Terminar clase», aquí quedará el resumen de lo que apuntaste.', 'Ir a Hoy', back));
      return wrap;
    }
    let currentDay = null;
    for (const session of sessions) {
      if (session.date !== currentDay) {
        currentDay = session.date;
        wrap.append(h('div', { class: 'section-title' }, h('span', null, relDayTxt(currentDay))));
      }
      const subject = subjectById(session.subjectId);
      const counts = session.counts || { inbox: 0, notes: 0, important: 0 };
      const total = (counts.inbox || 0) + (counts.notes || 0);
      wrap.append(h('div', { class: 'hist-row' },
        h('span', { class: 'r-ic', style: 'background:' + tintHex(subject ? subject.color : '', '22') + ';color:' + (subject ? subject.color : 'var(--text-2)'), html: icon(subject ? (subject.icon || 'book') : 'book', 18) }),
        h('div', { style: 'flex:1;min-width:0' },
          h('b', null, subject ? subject.name : 'Clase sin asignatura'),
          h('span', { class: 'r-sub' }, timeTxt(session.start) + ' — ' + timeTxt(session.end || session.start) + (session.room ? ' · ' + session.room : ''))
        ),
        h('span', { style: 'font-size:12px;font-weight:700;color:var(--text-2);flex:none' }, total + (total === 1 ? ' elemento' : ' elementos'))
      ));
    }
    return wrap;
  }

  Object.assign(app.class, {
    noteKinds,
    noteKindStyle,
    noteTimeStr,
    subjectIconsQuick,
    subjectById,
    slotsOfDay,
    slotsOfSubject,
    hm,
    minTxt,
    timeTxt,
    slotsOverlap,
    tintHex,
    activeSlotsToday,
    classNow,
    classNext,
    leftTxt,
    inTxt,
    slotLine,
    relDayTxt,
    activeSession,
    sessionItems,
    startSession,
    finishSession,
    sessionSummarySheet,
    inboxAdd,
    captureBar,
    inboxRow,
    inboxMenu,
    inboxEdit,
    inboxRemove,
    inboxToTask,
    inboxToNote,
    pickSubject,
    pickSlotSubject,
    slotRowEl,
    drawNowZone,
    classSubTxt,
    classHoyBody,
    scheduleSections,
    classWeekBody,
    classInboxBody,
    subjectsGrid,
    scrClass,
    scrSubjectView,
    scrClassHistory
  });
}
