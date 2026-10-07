export function registerClassSchedule(app) {
  const { h, uid, icon, todayStr, dowIdx, WEEK_L, WEEK_FULL } = app.core;
  const { S, save } = app.state;
  const { route, go, render, ui } = app.domain;
  const { headBar, formHead, emptyState, confirmDialog, toast, closeOverlays } = app.components;
  const { hm, minTxt, slotsOfDay, slotsOverlap, subjectById, timeTxt, pickSubject } = app.class;

  const DAY_ORDER = [0, 1, 2, 3, 4, 5, 6];
  const CLASS_DEFAULT_MIN = 55;
  const PATIO_DEFAULT_MIN = 30;
  // Lista de ids marcados en el modo selección del horario; null = modo normal.
  if (ui.scheduleSel === undefined) ui.scheduleSel = null;
  if (ui.scheduleView === undefined) ui.scheduleView = 'cards';

  function isPatio(slot) {
    return slot.kind === 'patio' || slot.room === 'patio';
  }

  function daysInSchedule() {
    const days = new Set((S.slots || []).map(slot => slot.day));
    return DAY_ORDER.filter(day => days.has(day));
  }

  function sortedBlocks(day) {
    return slotsOfDay(day).slice().sort((first, second) => hm(first.start) - hm(second.start) || hm(first.end) - hm(second.end));
  }

  function blockName(slot) {
    if (isPatio(slot)) return 'Patio';
    const subject = subjectById(slot.subjectId);
    return subject ? subject.name : 'Sin asignatura';
  }

  function blockColor(slot) {
    if (isPatio(slot)) return 'var(--amber)';
    const subject = subjectById(slot.subjectId);
    return subject ? subject.color : 'var(--border)';
  }

  function durationTxt(slot) {
    const minutes = hm(slot.end) - hm(slot.start);
    if (minutes <= 0) return '';
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    const parts = [];
    if (hours) parts.push(hours + ' h');
    if (rest) parts.push(rest + ' min');
    return parts.join(' ');
  }

  /* --- Mover, duplicar y seleccionar bloques ------------------------------- */

  // ¿Cabe un bloque en ese día? Devuelve '' si cabe o el motivo por el que no
  // (duplicado exacto o solape). `ignoreId` deja comprobar sobre el propio
  // bloque que se está moviendo o duplicando.
  function fitsInDay(candidate, day, ignoreId) {
    const probe = Object.assign({}, candidate, { day });
    const others = (S.slots || []).filter(slot => slot.id !== ignoreId);
    if (others.some(slot => slot.day === day && slot.start === probe.start && slot.end === probe.end)) {
      return 'Ya hay un bloque de ' + timeTxt(probe.start) + ' a ' + timeTxt(probe.end);
    }
    const clash = others.find(slot => slotsOverlap(slot, probe));
    if (clash) return 'Se solapa con ' + (isPatio(clash) ? 'el patio' : blockName(clash)) + ' (' + timeTxt(clash.start) + '–' + timeTxt(clash.end) + ')';
    return '';
  }

  const slotData = (slot, day) => ({
    day,
    start: slot.start,
    end: slot.end,
    subjectId: slot.subjectId || null,
    room: slot.room || '',
    kind: isPatio(slot) ? 'patio' : 'class',
    active: slot.active === false ? false : true
  });

  function copySlot(slot, day) {
    if (fitsInDay(slot, day, slot.id)) return false;
    S.slots.push(Object.assign({ id: uid('c'), createdAt: todayStr(), updatedAt: Date.now() }, slotData(slot, day)));
    return true;
  }

  function moveSlot(slot, day) {
    if (day === slot.day) return;
    const reason = fitsInDay(slot, day, slot.id);
    if (reason) {
      toast(reason + ' el ' + WEEK_FULL[day]);
      return;
    }
    slot.day = day;
    slot.updatedAt = Date.now();
    save();
    render();
    toast('Movido al ' + WEEK_FULL[day]);
  }

  // Adelanta o atrasa el bloque conservando su duración.
  function shiftSlot(slot, minutes) {
    const start = hm(slot.start) + minutes;
    const end = hm(slot.end) + minutes;
    if (start < 0 || end > 1439) {
      toast('Se saldría del día');
      return;
    }
    const moved = Object.assign({}, slot, { start: minTxt(start), end: minTxt(end) });
    const reason = fitsInDay(moved, slot.day, slot.id);
    if (reason) {
      toast(reason);
      return;
    }
    slot.start = moved.start;
    slot.end = moved.end;
    slot.updatedAt = Date.now();
    save();
    render();
    toast('Ahora de ' + timeTxt(moved.start) + ' a ' + timeTxt(moved.end));
  }

  // Hoja reutilizada por "duplicar" y "movar": mismo listado de días, cambia
  // lo que hace al elegir uno.
  function dayPickerSheet(slot, action) {
    closeOverlays();
    const overlay = h('div', { class: 'overlay', style: 'z-index:65', onclick: event => { if (event.target === overlay) overlay.remove(); } });
    const sheet = h('div', { class: 'sheet', style: 'max-width:380px', role: 'menu' },
      h('div', { class: 'grabber' }),
      h('h3', { style: 'font-size:17px;font-weight:800;margin-bottom:2px' }, action === 'copy' ? 'Duplicar en otro día' : 'Mover a otro día'),
      h('p', { class: 'field-hint', style: 'margin-bottom:14px' }, blockName(slot) + ' · ' + timeTxt(slot.start) + '–' + timeTxt(slot.end))
    );
    const free = DAY_ORDER.filter(day => day !== slot.day && !fitsInDay(slot, day, slot.id));
    if (action === 'copy' && free.length > 1) {
      sheet.append(h('button', {
        class: 'btn btn-soft btn-block',
        style: 'margin-bottom:10px',
        onclick: () => {
          overlay.remove();
          let made = 0;
          for (const day of free) if (copySlot(slot, day)) made++;
          save();
          render();
          toast(made ? made + ' copias creadas' : 'No hay días libres a esa hora');
        }
      }, h('span', { class: 'ic', html: icon('copy', 16) }), 'Copiar en los ' + free.length + ' días libres'));
    }
    for (const day of DAY_ORDER) {
      if (day === slot.day) continue;
      const reason = fitsInDay(slot, day, slot.id);
      sheet.append(h('button', {
        class: 'set-row',
        disabled: !!reason,
        style: reason ? 'opacity:.45' : '',
        onclick: () => {
          if (reason) return;
          overlay.remove();
          if (action === 'copy') {
            copySlot(slot, day);
            save();
            render();
            toast('Copiado al ' + WEEK_FULL[day]);
          } else {
            moveSlot(slot, day);
          }
        }
      },
        h('span', { class: 'r-ic', html: icon(reason ? 'x' : (action === 'copy' ? 'copy' : 'calendar'), 17) }),
        h('span', null, WEEK_FULL[day]),
        h('span', { style: 'margin-left:auto;font-size:11.5px;color:var(--text-3)' }, reason ? 'ocupado' : timeTxt(slot.start) + '–' + timeTxt(slot.end))
      ));
    }
    if (!free.length) {
      sheet.append(h('p', { class: 'field-hint', style: 'text-align:center;padding:10px 0 4px' },
        'No hay ningún día libre a esa hora. Muévelo de hora o libéralo primero.'));
    }
    overlay.append(sheet);
    document.body.append(overlay);
  }

  // Arrastre con eventos de puntero: sirve con ratón y con dedo. Se agarra por
  // el asa de la izquierda (no por toda la fila) para nocaler el scroll.
  function attachDrag(lead, row, slot) {
    let ghost = null;
    let offsetX = 0;
    let offsetY = 0;
    let overCard = null;

    const clear = () => {
      if (ghost) ghost.remove();
      ghost = null;
      if (overCard) overCard.classList.remove('drop');
      overCard = null;
      row.classList.remove('dragging');
    };

    lead.addEventListener('pointerdown', event => {
      if (event.button != null && event.button !== 0) return;
      event.preventDefault();
      const rect = row.getBoundingClientRect();
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      ghost = h('div', { class: 'slot-ghost' }, timeTxt(slot.start) + ' · ' + blockName(slot));
      ghost.style.width = Math.max(190, rect.width) + 'px';
      document.body.append(ghost);
      row.classList.add('dragging');
      try { lead.setPointerCapture(event.pointerId); } catch (e) {}
      moveGhost(event);
    });

    const moveGhost = event => {
      if (!ghost) return;
      ghost.style.transform = 'translate3d(' + (event.clientX - offsetX) + 'px,' + (event.clientY - offsetY) + 'px,0)';
      const under = document.elementFromPoint(event.clientX, event.clientY);
      const card = under ? under.closest('.day-card') : null;
      if (card !== overCard) {
        if (overCard) overCard.classList.remove('drop');
        overCard = card;
        if (card) card.classList.add('drop');
      }
    };

    lead.addEventListener('pointermove', moveGhost);
    lead.addEventListener('pointerup', event => {
      const target = overCard;
      const day = target ? Number(target.dataset.day) : null;
      clear();
      if (day != null && !Number.isNaN(day) && day !== slot.day) moveSlot(slot, day);
    });
    lead.addEventListener('pointercancel', clear);
  }

  function blockRow(slot, ctx) {
    const patio = isPatio(slot);
    const selecting = !!(ctx && ctx.selecting);
    const selected = !!(ctx && ctx.selected && ctx.selected.has(slot.id));
    const lead = selecting
      ? h('span', { class: 'row-check' + (selected ? ' done' : '') })
      : h('span', { class: 'slot-grip', 'aria-label': 'Arrastra para cambiarlo de día' });
    const row = h('button', {
      class: 'row slot-row' + (selected ? ' sel' : '') + (slot.active === false ? ' off' : ''),
      style: 'border-left-color:' + blockColor(slot),
      onclick: () => { if (selecting) ctx.toggle(slot.id); else blockMenu(slot); }
    },
      lead,
      h('span', { class: 'slot-time' }, h('b', null, timeTxt(slot.start)), h('span', null, timeTxt(slot.end))),
      h('span', { style: 'flex:1;min-width:0;text-align:left' },
        patio
          ? h('b', { style: 'display:inline-flex;align-items:center;gap:7px' }, h('span', { class: 'ic', html: icon('coffee', 15) }), 'Patio')
          : h('b', null, blockName(slot)),
        h('span', { class: 'r-sub' }, durationTxt(slot) + (slot.active === false ? ' · desactivado' : '') + (roomTxt(slot) ? ' · ' + roomTxt(slot) : ''))
      ),
      selecting ? null : h('span', { class: 'chev', html: icon('chev', 16) })
    );
    if (!selecting) attachDrag(lead, row, slot);
    return row;
  }

  function menuRow(iconName, label, action, danger) {
    return h('button', { class: 'set-row', style: danger ? 'color:var(--danger)' : '', onclick: action },
      h('span', { class: 'r-ic', style: danger ? 'background:var(--danger-soft);color:var(--danger)' : '', html: icon(iconName, 17) }),
      h('span', null, label)
    );
  }

  // Enlace a la videollamada del bloque, si el aula contiene una URL conocida.
  function linkRow(slot) {
    const link = app.class.videoLink(slot);
    if (!link || !link.url) return null;
    return h('a', { class: 'set-row', href: link.url, target: '_blank', rel: 'noopener noreferrer' },
      h('span', { class: 'r-ic', html: icon('external', 17) }),
      h('span', null, 'Entrar a ' + link.label),
      h('span', { class: 'chev', html: icon('chev', 16) })
    );
  }

  // El aula se muestra corta: si parece una URL se queda con el dominio, que
  // si no llena la fila entera del bloque.
  function roomTxt(slot) {
    const room = String(slot.room || '').trim();
    if (!room) return '';
    const link = app.class.videoLink(slot);
    if (link) return link.label;
    return room.length > 18 ? room.slice(0, 17) + '…' : room;
  }

  function blockMenu(slot) {
    closeOverlays();
    const patio = isPatio(slot);
    const overlay = h('div', { class: 'overlay', style: 'z-index:60', onclick: event => { if (event.target === overlay) overlay.remove(); } });
    const run = callback => () => { overlay.remove(); callback(); };
    const sheet = h('div', { class: 'sheet', style: 'max-width:380px', role: 'menu' },
      h('div', { style: 'padding:0 4px 14px' },
        h('p', { style: 'font-size:15px;font-weight:600;line-height:1.4' }, blockName(slot) + ' · ' + WEEK_FULL[slot.day] + ' · ' + timeTxt(slot.start) + '—' + timeTxt(slot.end)),
        h('p', { class: 'field-hint' }, '¿Qué quieres hacer?')
      ),
      !patio && menuRow('folder', 'Cambiar asignatura', run(() => {
        pickSubject('Asignatura de ' + WEEK_FULL[slot.day], subject => {
          slot.subjectId = subject ? subject.id : null;
          save();
          render();
          toast(subject ? 'Asignado a ' + subject.name : 'Sin asignatura');
        });
      })),
      linkRow(slot),
      menuRow('pencil', 'Editar hora' + (patio ? '' : ' y asignatura'), run(() => go('slotForm', { id: slot.id }))),
      menuRow('copy', 'Duplicar en otro día', run(() => dayPickerSheet(slot, 'copy'))),
      menuRow('calendar', 'Mover a otro día', run(() => dayPickerSheet(slot, 'move'))),
      menuRow('back', 'Atrasar 15 minutos', run(() => shiftSlot(slot, -15))),
      menuRow('chev', 'Adelantar 15 minutos', run(() => shiftSlot(slot, 15))),
      // Cancelar solo hoy: el bloque sigue en el horario semanal. Si ya está
      // cancelado, la fila ofrece volver a ponerlo.
      app.class.isOffToday(slot)
        ? menuRow('check', 'Hoy sí hay ' + (patio ? 'patio' : 'clase') + ' · restaurar', run(() => {
          app.class.setOff(slot.id, todayStr(), false);
          render();
          toast(blockName(slot) + ' vuelve hoy');
        }))
        : menuRow('x', 'Hoy no hay ' + (patio ? 'patio' : 'clase'), run(() => {
          app.class.setOff(slot.id, todayStr(), true);
          render();
          toast('Hoy se salta ' + blockName(slot) + ' · puedes restaurarlo desde su menú');
        })),
      menuRow(slot.active === false ? 'check' : 'archive', slot.active === false ? 'Reactivar en el horario' : 'Desactivar en el horario', run(() => {
        slot.active = slot.active === false;
        slot.updatedAt = Date.now();
        save();
        render();
        toast(slot.active === false ? 'Desactivado · sigue guardado' : 'Reactivado');
      })),
      menuRow('trash', patio ? 'Eliminar patio' : 'Eliminar clase', run(() => deleteSlot(slot)), true)
    );
    overlay.append(sheet);
    document.body.appendChild(overlay);
  }

  function addDayFlow() {
    const used = new Set(daysInSchedule());
    const free = DAY_ORDER.filter(day => !used.has(day));
    if (!free.length) {
      toast('Ya tienes los 7 días en el horario');
      return;
    }
    closeOverlays();
    const overlay = h('div', { class: 'overlay', style: 'z-index:60', onclick: event => { if (event.target === overlay) overlay.remove(); } });
    const sheet = h('div', { class: 'sheet', style: 'max-width:380px', role: 'menu' },
      h('h3', { style: 'font-size:17px;font-weight:800;margin-bottom:4px' }, '¿Qué día quieres añadir?'),
      h('p', { class: 'field-hint', style: 'margin-bottom:12px' }, 'Después añades dentro sus clases y el patio.')
    );
    for (const day of free) {
      sheet.append(h('button', { class: 'set-row', onclick: () => { overlay.remove(); go('slotForm', { day }); } },
        h('span', { class: 'r-ic', html: icon('calendar', 17) }),
        h('span', null, WEEK_FULL[day])
      ));
    }
    overlay.append(sheet);
    document.body.appendChild(overlay);
  }

  // Hoja "más": carga del horario, exportación, días no lectivos y plantillas.
  function moreSheet() {
    closeOverlays();
    const overlay = h('div', { class: 'overlay', style: 'z-index:60', onclick: event => { if (event.target === overlay) overlay.remove(); } });
    const run = callback => () => { overlay.remove(); callback(); };
    const sheet = h('div', { class: 'sheet', style: 'max-width:400px', role: 'menu' },
      h('div', { class: 'grabber' }),
      h('h3', { style: 'font-size:17px;font-weight:800;margin-bottom:10px' }, 'Horario')
    );
    const load = app.class.weekLoad();
    sheet.append(
      menuRow('chart', 'Carga y huecos de la semana', run(() => go('classLoad'))),
      menuRow('calendar', 'Días no lectivos', run(() => go('nonSchool'))),
      menuRow('download', 'Exportar a Google Calendar (.ics)', run(() => {
        app.class.download('horario-dailyhub.ics', app.class.buildICS(), 'text/calendar;charset=utf-8');
        toast('Archivo .ics descargado');
      })),
      menuRow('upload', 'Importar desde una tabla pegada', run(app.class.importScheduleFlow)),
      menuRow('upload', 'Imprimir el horario', run(printSchedule)),
      menuRow('copy', 'Plantillas de horario', run(() => go('classTemplates')))
    );
    sheet.append(h('p', { class: 'field-hint', style: 'padding:10px 4px 0' },
      load.classMinutes ? 'Esta semana: ' + app.class.humanMinutes(load.classMinutes) + ' de clase y ' + app.class.humanMinutes(load.patioMinutes) + ' de patio.' : 'Todavía no hay horas de clase.'));
    overlay.append(sheet);
    document.body.append(overlay);
  }

  // Hoja de impresión: una fila por franja de 30 minutos y una celda por
  // bloque, con rowspan para que ocupe su duración real.
  function printSchedule() {
    const days = daysInSchedule();
    const win = app.class.gridWindow(15);
    const byDay = days.map(day => sortedBlocks(day).filter(block => block.active !== false));
    const table = h('table');
    const headRow = h('tr', null, h('th', null, ''));
    for (const day of days) headRow.append(h('th', { key: day }, WEEK_FULL[day]));
    table.append(h('thead', null, headRow));
    const tbody = h('tbody');
    for (let minute = win.from; minute < win.to; minute += 30) {
      const row = h('tr', null, h('td', { class: 'print-hour' }, minTxt(minute)));
      days.forEach((day, index) => {
        const blocks = byDay[index];
        const start = blocks.find(item => hm(item.start) === minute);
        const covered = blocks.some(item => hm(item.start) < minute && hm(item.end) > minute);
        if (start) {
          const span = Math.max(1, Math.round((hm(start.end) - hm(start.start)) / 30));
          row.append(h('td', { rowspan: span, class: 'print-cell' },
            h('b', null, isPatio(start) ? 'Patio' : blockName(start)),
            h('span', null, start.room || '')
          ));
        } else if (!covered) {
          row.append(h('td', null, ''));
        }
      });
      tbody.append(row);
    }
    table.append(tbody);
    const holder = h('div', { class: 'print-holder' }, h('div', { class: 'print-schedule' },
      h('h1', null, 'Horario'),
      table
    ));
    document.body.append(holder);
    const cleanup = () => { holder.remove(); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    window.print();
    setTimeout(cleanup, 1500);
  }

  function dayCard(day, ctx) {
    const blocks = sortedBlocks(day);
    const today = dowIdx(todayStr());
    const classCount = blocks.filter(block => !isPatio(block) && block.active !== false).length;
    const gaps = app.class.dayGaps(day, 45);
    const clashes = app.class.dayOverlaps(day);
    const card = h('div', { class: 'day-card' + (day === today ? ' today' : ''), 'data-day': day },
      h('div', { class: 'day-head' },
        h('b', null, WEEK_FULL[day] + (day === today ? ' · hoy' : '')),
        h('span', { style: 'display:flex;align-items:center;gap:8px' },
          clashes.length ? h('span', { class: 'day-flag', title: 'Hay bloques que se pisan' }, 'solape') : null,
          gaps.length ? h('span', { class: 'day-flag', title: gaps.map(g => timeTxt(g.from) + '–' + timeTxt(g.to)).join(', ') }, gaps.length + (gaps.length === 1 ? ' hueco' : ' huecos')) : null,
          h('span', { class: 'nav-badge', style: 'background:var(--surface-2);color:var(--text-2)' }, classCount),
          h('button', { class: 'icon-btn', style: 'width:32px;height:32px', 'aria-label': 'Quitar ' + WEEK_FULL[day] + ' del horario', onclick: () => deleteSlotsOfDay(day), html: icon('trash', 15) })
        )
      )
    );
    if (!blocks.length) {
      card.append(h('p', { class: 'field-hint', style: 'text-align:center;padding:4px 0 8px' }, 'Día sin bloques todavía.'));
    } else {
      for (const block of blocks) card.append(blockRow(block, ctx));
    }
    card.append(h('div', { style: 'display:flex;gap:8px;margin-top:12px' },
      h('button', { class: 'btn btn-soft', style: 'flex:1;font-size:13px', onclick: () => go('slotForm', { day }) },
        h('span', { class: 'ic', html: icon('plus', 15) }), 'Clase'),
      h('button', { class: 'btn btn-soft', style: 'flex:1;font-size:13px', onclick: () => go('slotForm', { day, kind: 'patio' }) },
        h('span', { class: 'ic', html: icon('coffee', 15) }), 'Patio')
    ));
    return card;
  }

  function scrClassSchedule() {
    const wrap = h('div');
    const days = daysInSchedule();
    const classCount = (S.slots || []).filter(slot => !isPatio(slot)).length;
    // Modo selección: `ui.scheduleSel` es la lista de ids marcados (vacía o
    // null = modo normal).
    const selecting = Array.isArray(ui.scheduleSel);
    const selected = new Set(selecting ? ui.scheduleSel : []);
    const ctx = {
      selecting,
      selected,
      toggle: id => {
        const list = ui.scheduleSel;
        const at = list.indexOf(id);
        if (at >= 0) list.splice(at, 1);
        else list.push(id);
        render();
      }
    };
    wrap.append(formHead('Horario', app.components.smartBack('class'),
      h('span', { class: 'sub', style: 'font-size:13px;color:var(--text-2);font-weight:500;align-self:center;margin-right:2px' }, classCount ? classCount + (classCount === 1 ? ' clase' : ' clases') + ' a la semana' : ''),
      h('button', {
        class: 'icon-btn',
        'aria-label': selecting ? 'Terminar la selección' : 'Seleccionar bloques',
        style: selecting ? 'background:var(--primary);color:#fff;border-color:var(--primary)' : '',
        onclick: () => { ui.scheduleSel = selecting ? null : []; render(); },
        html: icon(selecting ? 'x' : 'checksq', 20)
      }),
      h('button', { class: 'icon-btn', 'aria-label': 'Asignaturas', onclick: () => go('classSubjects'), html: icon('folder', 20) }),
      h('button', { class: 'icon-btn', 'aria-label': 'Más opciones del horario', onclick: moreSheet, html: icon('more', 20) }),
      h('button', { class: 'btn btn-primary', style: 'padding:9px 14px;font-size:13px', onclick: addDayFlow },
        h('span', { class: 'ic', html: icon('plus', 16) }), 'Día')
    ));
    // Tarjetas ⇄ rejilla semanal
    wrap.append(h('div', { class: 'seg', style: 'margin:2px 0 14px' },
      h('button', { class: 'seg-btn' + (ui.scheduleView !== 'grid' ? ' on' : ''), onclick: () => { ui.scheduleView = 'cards'; render(); } }, 'Tarjetas'),
      h('button', { class: 'seg-btn' + (ui.scheduleView === 'grid' ? ' on' : ''), onclick: () => { ui.scheduleView = 'grid'; go('classGrid'); } }, 'Rejilla')
    ));
    if (selecting) {
      wrap.append(h('div', { class: 'selbar' },
        h('span', { class: 'sel-n' }, selected.size
          ? selected.size + (selected.size === 1 ? ' bloque marcado' : ' bloques marcados')
          : 'Toca los bloques para marcarlos'),
        h('button', { class: 'btn btn-soft', style: 'padding:8px 12px;font-size:13px', onclick: () => { ui.scheduleSel = null; render(); } }, 'Cancelar'),
        h('button', {
          class: 'btn',
          style: 'padding:8px 14px;font-size:13px;font-weight:700;background:var(--danger);color:#fff' + (selected.size ? '' : ';opacity:.45'),
          onclick: () => deleteSelected()
        }, h('span', { class: 'ic', html: icon('trash', 15) }), 'Eliminar')
      ));
    }
    if (!days.length) {
      wrap.append(emptyState('calendar', 'Sin horario todavía',
        'Añade un día, crea sus clases con su hora de inicio y fin, y añade el patio donde toque. Sábado y domingo también pueden ser días de clase.',
        'Añadir día', addDayFlow));
      return wrap;
    }
    for (const day of days) wrap.append(dayCard(day, ctx));
    wrap.append(h('button', { class: 'btn btn-soft btn-block', style: 'margin-top:6px', onclick: addDayFlow },
      h('span', { class: 'ic', html: icon('plus', 16) }), 'Añadir día'));
    return wrap;
  }

  function deleteSlotsOfDay(day) {
    const daySlots = slotsOfDay(day);
    if (!daySlots.length) return;
    confirmDialog({
      title: '¿Quitar ' + WEEK_FULL[day] + ' del horario?',
      message: 'Se eliminarán sus ' + daySlots.length + (daySlots.length === 1 ? ' bloque' : ' bloques') + ' (clases y patio). Las asignaturas y apuntes no se borran.',
      confirmText: 'Quitar día',
      onConfirm: () => {
        const removed = [];
        for (let index = (S.slots || []).length - 1; index >= 0; index--) {
          if (S.slots[index].day === day) removed.push({ item: S.slots.splice(index, 1)[0], index });
        }
        removed.reverse();
        save();
        toast(WEEK_FULL[day] + ' quitado del horario', { label: 'Deshacer', fn: () => {
          removed.forEach(entry => S.slots.splice(Math.min(entry.index, S.slots.length), 0, entry.item));
          save();
          render();
        } });
        render();
      }
    });
  }

  // Borrado en bloque de lo marcado en el modo selección, con deshacer.
  function deleteSelected() {
    const ids = new Set(ui.scheduleSel || []);
    const chosen = (S.slots || []).filter(slot => ids.has(slot.id));
    if (!chosen.length) {
      toast('No hay bloques marcados');
      return;
    }
    confirmDialog({
      title: '¿Eliminar ' + chosen.length + (chosen.length === 1 ? ' bloque?' : ' bloques?'),
      message: chosen.length === 1
        ? 'Se eliminará ' + blockName(chosen[0]) + ' del ' + WEEK_FULL[chosen[0].day] + '.'
        : 'Se quitarán del horario (clases y patio). Las asignaturas y los apuntes no se borran.',
      confirmText: 'Eliminar',
      onConfirm: () => {
        const removed = [];
        for (let index = (S.slots || []).length - 1; index >= 0; index--) {
          if (ids.has(S.slots[index].id)) removed.push({ item: S.slots.splice(index, 1)[0], index });
        }
        removed.reverse();
        ui.scheduleSel = null;
        save();
        toast(chosen.length + (chosen.length === 1 ? ' bloque eliminado' : ' bloques eliminados'), { label: 'Deshacer', fn: () => {
          removed.forEach(entry => S.slots.splice(Math.min(entry.index, S.slots.length), 0, entry.item));
          save();
          render();
        } });
        render();
      }
    });
  }

  function scrSlotForm() {
    const editing = route.params.id ? (S.slots || []).find(slot => slot.id === route.params.id) : null;
    const kind = editing ? (isPatio(editing) ? 'patio' : 'class') : (route.params.kind === 'patio' ? 'patio' : 'class');
    const back = app.components.smartBack('classSchedule');
    const wrap = h('div');
    wrap.append(formHead(
      editing ? (kind === 'patio' ? 'Editar patio' : 'Editar clase') : (kind === 'patio' ? 'Añadir patio' : 'Añadir clase'),
      back,
      editing ? h('button', { class: 'icon-btn', 'aria-label': 'Eliminar', onclick: () => deleteSlot(editing), html: icon('trash', 18) }) : null
    ));

    const subjects = S.subjects || [];
    let subjectSelect = null;
    if (kind === 'class') {
      let subjectId = editing ? (editing.subjectId || '') : (route.params.subjectId || '');
      if (subjectId && !subjectById(subjectId)) subjectId = '';
      subjectSelect = h('select', { class: 'input', id: 'slot-subject' },
        h('option', { value: '', selected: !subjectId }, 'Sin asignatura'),
        subjects.map(subject => h('option', { value: subject.id, selected: subject.id === subjectId }, subject.name))
      );
      wrap.append(h('div', { class: 'field' }, h('label', { for: 'slot-subject' }, 'Asignatura'), subjectSelect));
      if (!subjects.length) wrap.append(h('button', { class: 'btn btn-soft btn-block', style: 'margin:-4px 0 18px', onclick: () => go('subjectForm', { from: 'slotForm' }) }, 'Crear una asignatura'));
    } else {
      wrap.append(h('p', { class: 'field-hint', style: 'margin:-4px 0 18px' }, 'El patio es un descanso entre clases: fija su hora de inicio y de fin.'));
    }

    // Aula o enlace de videollamada: si contiene una URL conocida, el menú del
    // bloque ofrece "Entrar a ...".
    const roomInput = h('input', {
      class: 'input',
      type: 'text',
      id: 'slot-room',
      value: editing ? (editing.room || '') : '',
      placeholder: kind === 'patio' ? 'Patio del centro' : 'Aula 2B · o pega el enlace de lavideollamada'
    });
    wrap.append(h('div', { class: 'field' },
      h('label', { for: 'slot-room' }, kind === 'patio' ? 'Sitio' : 'Aula o enlace'),
      roomInput,
      h('p', { class: 'field-hint' }, 'Si pegas un enlace de Classroom, Meet o Zoom, aparecerá un botón para entrar desde el bloque.')
    ));

    // Días extra: al añadir se crea una copia del bloque en cada uno de ellos
    // (una clase que se repite toda la semana, por ejemplo).
    const repeat = new Set();
    let repeatRow = null;
    const drawRepeat = () => {
      repeatRow.innerHTML = '';
      for (const index of DAY_ORDER) {
        if (index === day) continue;
        repeatRow.append(h('button', {
          type: 'button',
          class: 'wchip' + (repeat.has(index) ? ' on' : ''),
          onclick: () => {
            if (repeat.has(index)) repeat.delete(index);
            else repeat.add(index);
            drawRepeat();
          }
        }, WEEK_L[index]));
      }
    };
    const setRepeat = days => {
      repeat.clear();
      for (const target of days) if (target !== day) repeat.add(target);
      drawRepeat();
    };

    let day = editing ? editing.day : (Number.isInteger(route.params.day) ? route.params.day : dowIdx(todayStr()));
    const dayRow = h('div', { class: 'wchips' });
    DAY_ORDER.forEach(index => dayRow.append(h('button', {
      type: 'button',
      class: 'wchip' + (index === day ? ' on' : ''),
      onclick: event => {
        day = index;
        [...dayRow.children].forEach(item => item.classList.remove('on'));
        event.currentTarget.classList.add('on');
        if (repeatRow) {
          // El día principal ya no puede ser también día repetido
          repeat.delete(day);
          drawRepeat();
        }
      }
    }, WEEK_L[index])));
    wrap.append(h('p', { class: 'big-q' }, '¿Qué día?'), dayRow);

    let startValue;
    let endValue;
    if (editing) {
      startValue = editing.start;
      endValue = editing.end;
    } else {
      const blocks = sortedBlocks(day);
      const lastEnd = blocks.length ? blocks[blocks.length - 1].end : null;
      startValue = lastEnd || '09:00';
      endValue = minTxt(hm(startValue) + (kind === 'patio' ? PATIO_DEFAULT_MIN : CLASS_DEFAULT_MIN));
    }
    const startInput = h('input', { class: 'input', type: 'time', id: 'slot-start', value: startValue });
    const endInput = h('input', { class: 'input', type: 'time', id: 'slot-end', value: endValue });
    wrap.append(h('p', { class: 'big-q' }, '¿A qué hora?'),
      h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px' },
        h('div', { class: 'field' }, h('label', { for: 'slot-start' }, 'Empieza'), startInput),
        h('div', { class: 'field' }, h('label', { for: 'slot-end' }, 'Termina'), endInput)
      ),
      h('p', { class: 'field-hint', style: 'margin-top:-8px' }, 'La duración se ajusta cambiando la hora de fin.')
    );

    if (!editing) {
      repeatRow = h('div', { class: 'wchips', style: 'margin-bottom:6px' });
      wrap.append(
        h('p', { class: 'big-q', style: 'margin-top:26px' }, '¿Repetir en más días?'),
        h('div', { class: 'chips', style: 'margin-bottom:12px' },
          h('button', { class: 'chip', onclick: () => setRepeat([0, 1, 2, 3, 4]) }, 'Toda la semana'),
          h('button', { class: 'chip', onclick: () => setRepeat(DAY_ORDER) }, 'Los 7 días'),
          h('button', { class: 'chip', onclick: () => setRepeat([]) }, 'Solo este día')
        ),
        repeatRow,
        h('p', { class: 'field-hint', style: 'margin:-4px 0 20px' }, 'Toca las letras para crear el mismo bloque en más días de una vez. Los días ya ocupados a esa hora se saltan solos.')
      );
      drawRepeat();
    }

    wrap.append(h('button', {
      class: 'btn btn-primary btn-block btn-lg',
      onclick: () => {
        const start = startInput.value;
        const end = endInput.value;
        if (!start || !end) {
          toast('Pon la hora de inicio y la de fin');
          return;
        }
        if (hm(end) <= hm(start)) {
          toast('La hora de fin debe ser posterior a la de inicio');
          return;
        }
        const base = {
          start,
          end,
          subjectId: kind === 'patio' ? null : ((subjectSelect && subjectSelect.value) || null),
          room: roomInput.value.trim(),
          kind
        };
        // Motivo por el que un bloque no cabe en un día (o '' si cabe)
        const reason = target => {
          const data = Object.assign({ day: target }, base);
          if ((S.slots || []).some(slot => slot.day === target && slot.start === start && slot.end === end)) {
            return 'Ya existe un bloque de ' + timeTxt(start) + ' a ' + timeTxt(end);
          }
          const clash = (S.slots || []).find(slot => slotsOverlap(slot, data));
          if (clash) return 'Se solapa con ' + (isPatio(clash) ? 'el patio' : blockName(clash)) + ' (' + timeTxt(clash.start) + '–' + timeTxt(clash.end) + ')';
          return '';
        };

        if (editing) {
          const other = (S.slots || []).some(slot => slot.id !== editing.id && slotsOverlap(slot, Object.assign({ day }, base)));
          if ((S.slots || []).some(slot => slot.id !== editing.id && slot.day === editing.day && slot.start === start && slot.end === end) || other) {
            toast(reason(editing.day) || 'Ese hueco ya está ocupado');
            return;
          }
          Object.assign(editing, base, { day });
          save();
          toast('Cambios guardados');
          back();
          return;
        }

        // Alta: se crea en el día principal y en los días repetidos que estén
        // libres; los ocupados se avisan al final en vez de frenar la creación.
        const targets = [day, ...DAY_ORDER.filter(index => repeat.has(index))];
        const created = [];
        const skipped = [];
        for (const target of targets) {
          const why = reason(target);
          if (why) {
            skipped.push(WEEK_FULL[target]);
            continue;
          }
          S.slots.push(Object.assign({ id: uid('c'), createdAt: todayStr(), updatedAt: Date.now() }, base, { day: target }));
          created.push(target);
        }
        if (!created.length) {
          toast(reason(day) + ' el ' + WEEK_FULL[day]);
          return;
        }
        save();
        if (skipped.length) toast('Añadido en ' + created.length + (created.length === 1 ? ' día' : ' días') + ' · saltado: ' + skipped.join(', '));
        else if (created.length > 1) toast(created.length + (kind === 'patio' ? ' patios añadidos' : ' clases añadidas'));
        else toast(kind === 'patio' ? 'Patio añadido' : 'Clase añadida');
        back();
      }
    }, editing ? 'Guardar cambios' : (kind === 'patio' ? 'Añadir patio' : 'Añadir clase')));
    const submitButton = wrap.querySelector('.btn-primary');
    if (submitButton) {
      [startInput, endInput].forEach(input => input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submitButton.click();
        }
      }));
    }
    return wrap;
  }

  function deleteSlot(slot) {
    const patio = isPatio(slot);
    confirmDialog({
      title: patio ? '¿Eliminar el patio?' : '¿Eliminar esta clase?',
      message: WEEK_FULL[slot.day] + ' · ' + timeTxt(slot.start) + ' a ' + timeTxt(slot.end) + (patio ? '' : ' · ' + blockName(slot)),
      confirmText: 'Eliminar',
      onConfirm: () => {
        const index = S.slots.findIndex(item => item.id === slot.id);
        if (index < 0) return;
        const [removed] = S.slots.splice(index, 1);
        save();
        toast(patio ? 'Patio eliminado' : 'Clase eliminada', { label: 'Deshacer', fn: () => { S.slots.splice(Math.min(index, S.slots.length), 0, removed); save(); render(); } });
        if (route.name === 'slotForm') go('classSchedule', undefined, { replace: true });
        else render();
      }
    });
  }

  Object.assign(app.class, {
    scrClassSchedule,
    deleteSlotsOfDay,
    scrSlotForm,
    deleteSlot,
    blockMenu,
    addDayFlow,
    // Alias con prefijo para no chocar con nombres iguales en otros módulos.
    fitsSlotInDay: fitsInDay,
    blockNameOf: blockName,
    isPatioOf: isPatio,
    blockColorOf: blockColor,
    roomTxt,
    sortedBlocks
  });
}
