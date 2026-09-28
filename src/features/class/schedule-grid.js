// Rejilla semanal del horario: 7 columnas (una por día) y franjas de 5 minutos.
// Arrastrando un bloque se le cambia la hora (vertical) y el día (horizontal),
// y con los tiradores de arriba y abajo se le cambia la duración. Es la misma
// idea que el arrastre entre tarjetas, pero positioning vertical continuo.

export function registerClassScheduleGrid(app) {
  const { h, icon, todayStr, dowIdx, WEEK_L, WEEK_FULL } = app.core;
  const { S, save } = app.state;
  const { render } = app.domain;
  const { toast, confirmDialog } = app.components;
  const { hm, minTxt, timeTxt, subjectById, blockMenu, fitsSlotInDay, blockNameOf, isPatioOf, dayGaps, dayOverlaps } = app.class;

  const PX_PER_MIN = 1.15;   // altura de cada minuto en la rejilla
  const HOUR_H = 60 * PX_PER_MIN;

  const blockColor = slot => {
    if (isPatioOf(slot)) return 'var(--amber)';
    const subject = subjectById(slot.subjectId);
    return subject ? subject.color : 'var(--border)';
  };

  // Días con bloques; si no hay ninguno se muestran todos para poder crear.
  function gridDays() {
    const used = new Set((S.slots || []).map(slot => slot.day));
    const days = [0, 1, 2, 3, 4, 5, 6].filter(day => used.has(day));
    return days.length ? days : [0, 1, 2, 3, 4];
  }

  function snap(minutes, step) {
    const s = step || 5;
    return Math.round(minutes / s) * s;
  }

  /* --- Arrastre y redimensión --------------------------------------------- */

  // Un solo manejador para todos los bloques: se guarda el estado del gesto en
  // `gesture` y se aplica en cada pointermove (vista previa) y al soltar.
  let gesture = null;

  function startGesture(event, slot, mode) {
    if (event.button != null && event.button !== 0) return;
    const surface = event.currentTarget.closest('.grid-body');
    if (!surface) return;
    event.preventDefault();
    event.stopPropagation();
    const origin = {
      start: hm(slot.start),
      end: hm(slot.end),
      day: slot.day
    };
    const rect = surface.getBoundingClientRect();
    gesture = {
      slot,
      mode,             // 'move' | 'top' | 'bottom'
      origin,
      surface,
      surfaceTop: rect.top,
      moved: false,
      startY: event.clientY,
      startX: event.clientX,
      deltaMin: 0,
      day: slot.day
    };
    try { surface.setPointerCapture(event.pointerId); } catch (e) {}
    surface.classList.add('grid-dragging');
    slotRow(slot).classList.add('dragging');
    showPreview();
  }

  function onMove(event) {
    if (!gesture) return;
    const dy = event.clientY - gesture.startY;
    const dx = event.clientX - gesture.startX;
    if (!gesture.moved && Math.abs(dy) < 4 && Math.abs(dx) < 4) return;
    gesture.moved = true;
    const rawMin = dy / PX_PER_MIN;
    const step = gesture.mode === 'move' ? 5 : 5;
    let delta = snap(rawMin, step);
    let from = gesture.origin.start;
    let to = gesture.origin.end;
    if (gesture.mode === 'move') {
      delta = clamp(delta, -from, 1440 - to);
      from += delta;
      to += delta;
    } else if (gesture.mode === 'top') {
      const next = clamp(snap(gesture.origin.start + rawMin, step), 0, gesture.origin.end - 5);
      delta = next - gesture.origin.start;
      from = next;
    } else {
      const next = clamp(snap(gesture.origin.end + rawMin, step), gesture.origin.start + 5, 1440);
      delta = next - gesture.origin.end;
      to = next;
    }
    gesture.deltaMin = delta;
    gesture.from = from;
    gesture.to = to;
    // Día destino: la columna que hay bajo el puntero.
    const under = document.elementFromPoint(event.clientX, event.clientY);
    const column = under ? under.closest('.grid-col') : null;
    const day = column ? Number(column.dataset.day) : gesture.day;
    if (!Number.isNaN(day) && day != null) gesture.day = day;
    showPreview();
  }

  function onUp() {
    if (!gesture) return;
    const current = gesture;
    gesture = null;
    current.surface.classList.remove('grid-dragging');
    const row = slotRow(current.slot);
    if (row) row.classList.remove('dragging');
    hidePreview();
    if (!current.moved) {
      blockMenu(current.slot);
      return;
    }
    const start = minTxt(current.from);
    const end = minTxt(current.to);
    const dayChanged = current.day !== current.origin.day;
    if (start === current.slot.start && end === current.slot.end && !dayChanged) return;
    const probe = Object.assign({}, current.slot, { start, end, day: current.day });
    const reason = fitsSlotInDay(probe, current.day, current.slot.id);
    if (reason) {
      toast(reason);
      render();
      return;
    }
    current.slot.start = start;
    current.slot.end = end;
    current.slot.day = current.day;
    current.slot.updatedAt = Date.now();
    save();
    render();
    const parts = [];
    if (start !== current.origin.start || end !== current.origin.end) parts.push('a ' + timeTxt(start) + '–' + timeTxt(end));
    if (dayChanged) parts.push(WEEK_FULL[current.day]);
    toast((parts.length ? parts.join(' · ') : 'Bloque movido'));
  }

  function onCancel() {
    if (!gesture) return;
    const current = gesture;
    gesture = null;
    current.surface.classList.remove('grid-dragging');
    const row = slotRow(current.slot);
    if (row) row.classList.remove('dragging');
    hidePreview();
  }

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  let previewEl = null;
  function showPreview() {
    if (!gesture) return;
    if (!previewEl) {
      previewEl = h('div', { class: 'grid-preview' });
      document.body.append(previewEl);
    }
    const { from, to, day } = gesture;
    previewEl.textContent = blockNameOf(gesture.slot) + ' · ' + timeTxt(minTxt(from)) + '–' + timeTxt(minTxt(to)) + ' · ' + WEEK_FULL[day];
  }
  function hidePreview() {
    if (previewEl) {
      previewEl.remove();
      previewEl = null;
    }
  }

  const slotRow = slot => document.querySelector('.grid-block[data-slot="' + slot.id + '"]');

  /* --- Pintado de la rejilla ---------------------------------------------- */

  function gridBlock(slot, winFrom) {
    const from = hm(slot.start);
    const to = hm(slot.end);
    // La posición es relativa al inicio de la ventana, no a medianoche: la
    // rejilla no suele empezar a las 00:00.
    const top = (from - (winFrom || 0)) * PX_PER_MIN;
    const height = Math.max(18, (to - from) * PX_PER_MIN);
    const patio = isPatioOf(slot);
    const overlaps = dayOverlaps(slot.day).some(pair => pair[0].id === slot.id || pair[1].id === slot.id);
    const el = h('div', {
      class: 'grid-block' + (patio ? ' patio' : '') + (overlaps ? ' clash' : '') + (slot.active === false ? ' off' : ''),
      'data-slot': slot.id,
      style: 'top:' + top + 'px;height:' + height + 'px;border-left-color:' + blockColor(slot),
      title: blockNameOf(slot) + ' · ' + timeTxt(slot.start) + '–' + timeTxt(slot.end)
    },
      h('button', { class: 'grid-grip grid-grip-t', 'aria-label': 'Cambiar la hora de inicio', onpointerdown: event => startGesture(event, slot, 'top') }),
      h('div', { class: 'grid-inner', onpointerdown: event => startGesture(event, slot, 'move') },
        h('b', null, patio ? 'Patio' : blockNameOf(slot)),
        height > 42 ? h('span', null, timeTxt(slot.start) + '–' + timeTxt(slot.end)) : null
      ),
      h('button', { class: 'grid-grip grid-grip-b', 'aria-label': 'Cambiar la hora de fin', onpointerdown: event => startGesture(event, slot, 'bottom') })
    );
    return el;
  }

  function weekGrid() {
    const days = gridDays();
    const win = app.class.gridWindow(5);
    const height = (win.to - win.from) * PX_PER_MIN;
    const today = dowIdx(todayStr());
    const wrap = h('div', { class: 'grid-wrap' });

    // Cabecera de días
    const head = h('div', { class: 'grid-head' }, h('div', { class: 'grid-gutter-head' }));
    for (const day of days) {
      head.append(h('div', { class: 'grid-head-day' + (day === today ? ' today' : ''), 'data-day': day },
        h('b', null, WEEK_FULL[day]),
        h('span', null, WEEK_L[day] + ' · ' + (S.slots || []).filter(slot => slot.day === day).length + ' bloques')
      ));
    }
    wrap.append(head);

    const gutter = h('div', { class: 'grid-gutter', style: 'height:' + height + 'px' });
    for (let minute = win.from; minute <= win.to; minute += 60) {
      gutter.append(h('div', { class: 'grid-hour', style: 'top:' + ((minute - win.from) * PX_PER_MIN) + 'px' }, minTxt(minute)));
    }
    const body = h('div', { class: 'grid-body', style: 'height:' + height + 'px' },
      gutter,
      h('div', { class: 'grid-cols' })
    );
    const cols = body.querySelector('.grid-cols');
    for (const day of days) {
      const column = h('div', { class: 'grid-col' + (day === today ? ' today' : ''), 'data-day': day });
      for (let minute = win.from; minute <= win.to; minute += 60) {
        column.append(h('div', { class: 'grid-line', style: 'top:' + ((minute - win.from) * PX_PER_MIN) + 'px' }));
        column.append(h('div', { class: 'grid-line half', style: 'top:' + ((minute - win.from) * PX_PER_MIN + HOUR_H / 2) + 'px' }));
      }
      for (const slot of (S.slots || []).filter(s => s.day === day).sort(app.class.sortByTime)) {
        column.append(gridBlock(slot, win.from));
      }
      // Línea de "ahora" en la columna de hoy
      if (day === today) {
        const now = new Date();
        const minutes = now.getHours() * 60 + now.getMinutes();
        if (minutes >= win.from && minutes <= win.to) {
          column.append(h('div', { class: 'grid-now', style: 'top:' + ((minutes - win.from) * PX_PER_MIN) + 'px' }));
        }
      }
      cols.append(column);
    }
    body.addEventListener('pointermove', onMove);
    body.addEventListener('pointerup', onUp);
    body.addEventListener('pointercancel', onCancel);
    wrap.append(body);

    // Leyenda de huecos y solapes del patrón semanal
    const gaps = days.map(day => ({ day, list: dayGaps(day) })).filter(entry => entry.list.length);
    if (gaps.length) {
      const summary = gaps.map(entry => WEEK_FULL[entry.day] + ' (' + entry.list.length + ')').join(', ');
      wrap.append(h('div', { class: 'grid-note' },
        h('span', { class: 'ic', html: icon('clock', 15) }),
        h('span', null, 'Huecos largos: ' + summary + '. Arrastra un bloque para taparlos.')
      ));
    }
    return wrap;
  }

  // Vista de rejilla del horario: la misma que la de tarjetas pero en rejilla.
  function scrClassGrid() {
    const { go } = app.domain;
    const wrap = h('div');
    const days = gridDays();
    const { classMinutes, humanMinutes } = app.class;
    const load = app.class.weekLoad();
    wrap.append(app.components.formHead('Horario · rejilla', app.components.smartBack('classSchedule'),
      h('button', { class: 'icon-btn', 'aria-label': 'Ver como tarjetas', onclick: () => go('classSchedule'), html: icon('list', 20) }),
      h('button', { class: 'icon-btn', 'aria-label': 'Cargar del horario', onclick: () => go('classSchedule'), html: icon('clock', 20) })
    ));
    wrap.append(h('p', { class: 'grid-tip' },
      h('span', { class: 'ic', html: icon('info', 14) }),
      'Arrastra un bloque para cambiarle la hora y el día. Tira de los bordes de arriba o de abajo para alargar o acortar.'
    ));
    wrap.append(h('div', { class: 'grid-sum' },
      h('div', null, h('b', null, humanMinutes(load.classMinutes)), h('span', null, 'de clase a la semana')),
      h('div', null, h('b', null, humanMinutes(load.patioMinutes)), h('span', null, 'de patio')),
      h('div', null, h('b', null, days.length), h('span', null, days.length === 1 ? 'día con clases' : 'días con clases'))
    ));
    if (!load.subjects.length) {
      wrap.append(app.components.emptyState('calendar', 'Sin horario todavía', 'Crea días y clases desde la vista de tarjetas.', 'Ver tarjetas', () => go('classSchedule')));
      return wrap;
    }
    wrap.append(weekGrid());
    return wrap;
  }

  Object.assign(app.class, { scrClassGrid, weekGrid, gridBlock, PX_PER_MIN });
}
