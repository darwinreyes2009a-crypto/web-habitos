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
    WEEK_FULL,
    COLORS,
    ICON_CHOICES
  } = app.core;
  const { S, save } = app.state;
  const { route, ui, go, render } = app.domain;
  const { headBar, formHead, emptyState, openSheet, closeOverlays, confirmDialog, smartBack, toast } = app.components;

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

  ui.classTab = ['semana', 'hoy'].includes(ui.classTab) ? ui.classTab : 'hoy';
  const classTabs = [
    { id: 'hoy', label: 'Hoy' },
    { id: 'semana', label: 'Semana' }
  ];

  const nowMin = () => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  };
  const minTxt = minutes => {
    const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
    return String(Math.floor(normalized / 60)).padStart(2, '0') + ':' + String(normalized % 60).padStart(2, '0');
  };
  // Los bloques de hoy, ya descontando los desactivados, los cancelados para
  // esta fecha y los días no lectivos (vacaciones, exámenes).
  const activeSlotsToday = () => app.class.slotsOnDate(todayStr());
  // Motivo por el que hoy no hay horario, o '' si es un día lectivo normal.
  const todayBreak = () => app.class.breakOn(todayStr());
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
    notes: (S.notes || []).filter(note => note.sessionId === id && !note.deletedAt)
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
    const total = (counts.inbox || 0) + (counts.notes || 0);
    openSheet('Clase terminada', () => h('div', null,
      h('div', { class: 'now-card', style: 'margin-bottom:14px;border-left-color:' + (subject ? subject.color : 'var(--border)') },
        h('span', { class: 'nw-ic', style: 'background:' + tintHex(subject ? subject.color : '', '22') + ';color:' + (subject ? subject.color : 'var(--text-2)'), html: icon(subject ? (subject.icon || 'book') : 'book', 24) }),
        h('div', { style: 'flex:1;min-width:0' },
          h('span', { class: 'nw-tag' }, 'Clase'),
          h('b', { class: 'nw-sub' }, subject ? subject.name : 'Clase sin asignatura'),
          h('span', { class: 'nw-meta' }, h('span', null, timeTxt(record.start) + ' — ' + timeTxt(record.end)), record.room ? h('span', null, '· ' + record.room) : null)
        )
      ),
      h('p', { class: 'field-hint', style: 'margin-bottom:10px' }, total ? 'Has guardado durante esta clase:' : 'No has guardado notas en esta clase. Todo tranquilo.'),
      total ? h('div', { class: 'set-card', style: 'margin-bottom:18px' },
        counts.inbox ? h('div', { class: 'set-row' }, h('span', { class: 'r-ic', html: icon('pin', 17) }), h('span', null, counts.inbox + ' en Para después')) : null,
        counts.notes ? h('div', { class: 'set-row' }, h('span', { class: 'r-ic', html: icon('pencil', 17) }), h('span', null, counts.notes === 1 ? '1 apunte guardado' : counts.notes + ' apuntes guardados')) : null,
        counts.important ? h('div', { class: 'set-row' }, h('span', { class: 'r-ic', style: 'background:var(--danger-soft);color:var(--danger)', html: icon('star', 17) }), h('span', null, counts.important + ' marcado' + (counts.important === 1 ? '' : 's') + ' importante' + (counts.important === 1 ? '' : 's'))) : null
      ) : null,
      h('div', { style: 'display:flex;gap:10px' },
        h('button', { class: 'btn btn-soft', style: 'flex:1', onclick: () => { closeOverlays(); render(); } }, 'Terminar'),
        h('button', { class: 'btn btn-primary', style: 'flex:1', onclick: () => { closeOverlays(); ui.classTab = 'hoy'; render(); } }, 'Volver al horario')
      )
    ));
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
    const descanso = todayBreak();
    if (descanso) return descanso.label + ' · hoy no hay clases';
    return activeSlotsToday().length ? 'Has terminado las clases de hoy' : 'Tu agenda de clase';
  }

  function classHoyBody() {
    const wrap = h('div');
    // Si hoy es un día no lectivo se dice arriba del todo, en vez de dejar
    // una lista vacía sin explicación.
    const descanso = todayBreak();
    if (descanso) {
      wrap.append(h('div', { class: 'card', style: 'border-left:3px solid var(--amber);margin-bottom:16px' },
        h('div', { class: 'row' },
          h('span', { class: 'r-ic', style: 'background:var(--surface-2);color:var(--amber)', html: icon('moon', 18) }),
          h('span', { style: 'flex:1;min-width:0' },
            h('b', null, descanso.label),
            h('span', { class: 'r-sub' }, 'Hoy no tienes clases')),
          h('button', { class: 'btn btn-soft', style: 'padding:8px 12px;font-size:13px', onclick: () => go('nonSchool') }, 'Ver')
        )
      ));
    }
    const nowZone = h('div', { id: 'cls-now' });
    drawNowZone(nowZone);
    wrap.append(nowZone);
    const quickNotes = h('div');
    const drawNotes = () => {
      quickNotes.innerHTML = '';
      quickNotes.append(app.class.quickNotesPreview());
    };
    wrap.append(h('div', { class: 'section-title' }, h('span', null, 'Notas rápidas')));
    wrap.append(app.class.classNotesCapture(drawNotes), quickNotes);
    drawNotes();
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

  function subjectsGrid() {
    const subjects = S.subjects || [];
    if (!subjects.length) {
      return emptyState('folder', 'Sin asignaturas todavía', 'Añade asignaturas al configurar el horario.', 'Configurar horario', () => go('classSchedule'));
    }
    const grid = h('div', { class: 'person-grid stagger' });
    subjects.forEach((subject, index) => {
      const classCount = slotsOfSubject(subject.id).length;
      grid.append(h('button', { class: 'person-card', style: '--i:' + index, onclick: () => go('subjectView', { id: subject.id }) },
        h('span', { class: 'subject-folder', style: 'background:' + tintHex(subject.color, '22') + ';color:' + subject.color, html: icon(subject.icon || 'book', 26) }),
        h('b', null, subject.name),
        h('span', null, classCount + (classCount === 1 ? ' clase' : ' clases'))
      ));
    });
    grid.append(h('button', { class: 'person-card add', onclick: () => go('subjectForm') }, h('span', { html: icon('plus', 22) }), h('b', null, 'Añadir asignatura')));
    return grid;
  }

  function scrClassSubjects() {
    const wrap = h('div');
    wrap.append(formHead('Asignaturas', smartBack('class'),
      h('button', { class: 'icon-btn', 'aria-label': 'Nueva asignatura', onclick: () => go('subjectForm'), html: icon('plus', 20) })
    ));
    wrap.append(subjectsGrid());
    return wrap;
  }

  function scrSubjectForm() {
    const editing = route.params.id ? subjectById(route.params.id) : null;
    const back = smartBack('classSubjects');
    const wrap = h('div');
    wrap.append(formHead(editing ? 'Editar asignatura' : 'Nueva asignatura', back,
      editing ? h('button', { class: 'icon-btn', 'aria-label': 'Eliminar asignatura', onclick: () => deleteSubject(editing), html: icon('trash', 18) }) : null
    ));
    let color = editing ? (editing.color || COLORS[0]) : COLORS[(S.subjects || []).length % COLORS.length];
    let iconId = editing ? (editing.icon || 'book') : 'book';
    const nameInput = h('input', { class: 'input', type: 'text', placeholder: 'Ej. Redes, Sistemas, Ofimática…', value: editing ? editing.name : '', maxlength: '30' });
    const preview = h('div', { style: 'display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:20px' });
    function drawPreview() {
      preview.innerHTML = '';
      preview.append(
        h('span', { class: 'subject-folder', style: 'width:66px;height:66px;border-radius:22px;background:' + tintHex(color, '22') + ';color:' + color, html: icon(iconId, 30) }),
        h('b', { style: 'font-size:15px;font-weight:700' }, nameInput.value.trim() || 'Sin nombre')
      );
    }
    nameInput.addEventListener('input', drawPreview);
    drawPreview();
    wrap.append(preview, h('div', { class: 'field' }, h('label', null, 'Nombre de la asignatura'), nameInput));
    const swatches = h('div', { class: 'swatches' });
    for (const swatchColor of COLORS) {
      swatches.append(h('button', {
        type: 'button',
        class: 'swatch' + (swatchColor === color ? ' on' : ''),
        style: 'background:' + swatchColor,
        onclick: event => {
          color = swatchColor;
          [...swatches.children].forEach(item => item.classList.remove('on'));
          event.currentTarget.classList.add('on');
          drawPreview();
        }
      }));
    }
    wrap.append(h('div', { class: 'field' }, h('label', null, 'Color'), swatches));
    let showingAll = !subjectIconsQuick.includes(iconId);
    const iconGrid = h('div', { class: 'icon-grid' });
    function drawIcons() {
      iconGrid.innerHTML = '';
      const choices = showingAll ? ICON_CHOICES : ICON_CHOICES.filter(choice => subjectIconsQuick.includes(choice.id));
      for (const choice of choices) {
        iconGrid.append(h('button', {
          type: 'button',
          class: 'icon-opt' + (choice.id === iconId ? ' on' : ''),
          onclick: event => {
            iconId = choice.id;
            [...iconGrid.children].forEach(item => item.classList.remove('on'));
            event.currentTarget.classList.add('on');
            drawPreview();
          }
        }, h('span', { html: icon(choice.id, 22) }), h('span', null, choice.label)));
      }
    }
    drawIcons();
    const iconToggle = h('button', {
      class: 'btn btn-soft',
      style: 'width:100%;margin:-10px 0 18px;font-size:13px',
      onclick: () => {
        showingAll = !showingAll;
        drawIcons();
        iconToggle.textContent = showingAll ? 'Mostrar menos' : 'Mostrar más iconos';
      }
    }, showingAll ? 'Mostrar menos' : 'Mostrar más iconos');
    wrap.append(h('p', { class: 'big-q' }, 'Icono'), iconGrid, iconToggle);
    wrap.append(h('button', {
      class: 'btn btn-primary btn-block btn-lg',
      onclick: () => {
        const name = nameInput.value.trim();
        if (!name) {
          nameInput.focus();
          toast('Escribe un nombre');
          return;
        }
        const data = { name, color, icon: iconId };
        const subjectId = editing ? editing.id : uid('s');
        if (editing) Object.assign(editing, data);
        else S.subjects.push({ id: subjectId, createdAt: todayStr(), ...data });
        save();
        toast(editing ? 'Asignatura actualizada' : 'Asignatura creada');
        if (route.params.from === 'slotForm') go('slotForm', { subjectId }, { replace: true });
        else back();
      }
    }, editing ? 'Guardar cambios' : 'Crear asignatura'));
    const submitButton = wrap.querySelector('.btn-primary');
    if (submitButton) {
      wrap.querySelectorAll('input:not([type="file"]):not([type="date"]), select').forEach(input => input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submitButton.click();
        }
      }));
    }
    return wrap;
  }

  function deleteSubject(subject) {
    const subjectSlots = slotsOfSubject(subject.id);
    confirmDialog({
      title: '¿Eliminar «' + subject.name + '»?',
      message: 'Se quitará esta asignatura' + (subjectSlots.length ? (subjectSlots.length === 1 ? ' y su clase del horario' : ' y sus ' + subjectSlots.length + ' clases del horario') : '') + '. Las notas existentes se conservarán y pasarán a «Sin asignatura». Podrás deshacerlo desde el aviso.',
      confirmText: 'Eliminar',
      onConfirm: () => {
        const index = S.subjects.findIndex(item => item.id === subject.id);
        if (index < 0) return;
        const [removed] = S.subjects.splice(index, 1);
        const touched = (S.notes || []).filter(note => note.subjectId === subject.id && !note.deletedAt);
        touched.forEach(note => { note.subjectId = null; });
        const removedSlots = [];
        for (let slotIndex = (S.slots || []).length - 1; slotIndex >= 0; slotIndex--) {
          if (S.slots[slotIndex].subjectId === subject.id) removedSlots.push(S.slots.splice(slotIndex, 1)[0]);
        }
        save();
        toast('Asignatura eliminada', { label: 'Deshacer', fn: () => {
          S.subjects.splice(Math.min(index, S.subjects.length), 0, removed);
          touched.forEach(note => { note.subjectId = subject.id; });
          removedSlots.forEach(slot => S.slots.push(slot));
          save();
          render();
        } });
        go('classSubjects', undefined, { replace: true });
      }
    });
  }

  function scrClass() {
    const wrap = h('div');
    const body = {
      hoy: classHoyBody,
      semana: classWeekBody
    }[ui.classTab] || classHoyBody;
    wrap.append(headBar('Modo Clase', classSubTxt(),
      h('button', { class: 'icon-btn', 'aria-label': 'Gestionar horario', onclick: () => go('classSchedule'), html: icon('calendar', 20) })
    ));
    const tabs = h('div', { class: 'cls-tabs' });
    for (const tab of classTabs) {
      tabs.append(h('button', {
        class: 'cls-tab' + (ui.classTab === tab.id ? ' on' : ''),
        onclick: () => { ui.classTab = tab.id; render(); }
      }, tab.label));
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
      ui.classTab = 'semana';
      go('class', undefined, { replace: true });
    };
    if (!subject) return emptyState('folder', 'Asignatura no encontrada', 'Puede que la hayas eliminado.', 'Ver asignaturas', back);
    const wrap = h('div');
    wrap.append(formHead(subject.name, back,
      h('button', { class: 'icon-btn', 'aria-label': 'Editar asignatura', onclick: () => go('subjectForm', { id: subject.id }), html: icon('pencil', 18) })
    ));
    const subjectSlots = (S.slots || []).filter(slot => slot.subjectId === subject.id).sort((first, second) => (first.day - second.day) || (first.start < second.start ? -1 : 1));
    wrap.append(h('div', { class: 'card', style: 'display:flex;align-items:center;gap:14px;margin-bottom:8px' },
      h('span', { class: 'subject-folder', style: 'background:' + tintHex(subject.color, '22') + ';color:' + subject.color, html: icon(subject.icon || 'book', 26) }),
      h('div', { style: 'min-width:0' },
        h('b', { style: 'font-size:16px;display:block' }, subject.name),
        h('span', { style: 'font-size:12.5px;color:var(--text-2)' }, subjectSlots.length + (subjectSlots.length === 1 ? ' clase' : ' clases') + ' a la semana')
      )
    ));
    if (subjectSlots.length) {
      wrap.append(h('div', { class: 'section-title' }, h('span', null, 'Horario')));
      for (const slot of subjectSlots) wrap.append(slotRowEl(slot));
    }
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
    todayBreak,
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
    pickSubject,
    pickSlotSubject,
    slotRowEl,
    drawNowZone,
    classSubTxt,
    classHoyBody,
    scheduleSections,
    classWeekBody,
    subjectsGrid,
    scrClass,
    scrClassSubjects,
    scrSubjectForm,
    deleteSubject,
    scrSubjectView,
    scrClassHistory
  });
}
