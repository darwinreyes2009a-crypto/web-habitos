export function registerClassSchedule(app) {
  const { h, uid, icon, todayStr, dowIdx, WEEK_L, WEEK_FULL } = app.core;
  const { S, save } = app.state;
  const { route, go, render } = app.domain;
  const { headBar, formHead, emptyState, confirmDialog, toast, closeOverlays } = app.components;
  const { hm, minTxt, slotsOfDay, slotsOverlap, subjectById, timeTxt, pickSubject } = app.class;

  const DAY_ORDER = [0, 1, 2, 3, 4, 5, 6];
  const CLASS_DEFAULT_MIN = 55;
  const PATIO_DEFAULT_MIN = 30;

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

  function blockRow(slot) {
    const patio = isPatio(slot);
    return h('button', {
      class: 'row slot-row',
      style: 'border-left-color:' + blockColor(slot),
      onclick: () => blockMenu(slot)
    },
      h('span', { class: 'slot-time' }, h('b', null, timeTxt(slot.start)), h('span', null, timeTxt(slot.end))),
      h('span', { style: 'flex:1;min-width:0;text-align:left' },
        patio
          ? h('b', { style: 'display:inline-flex;align-items:center;gap:7px' }, h('span', { class: 'ic', html: icon('coffee', 15) }), 'Patio')
          : h('b', null, blockName(slot)),
        h('span', { class: 'r-sub' }, durationTxt(slot))
      ),
      h('span', { class: 'chev', html: icon('chev', 16) })
    );
  }

  function menuRow(iconName, label, action, danger) {
    return h('button', { class: 'set-row', style: danger ? 'color:var(--danger)' : '', onclick: action },
      h('span', { class: 'r-ic', style: danger ? 'background:var(--danger-soft);color:var(--danger)' : '', html: icon(iconName, 17) }),
      h('span', null, label)
    );
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
      menuRow('pencil', 'Editar hora' + (patio ? '' : ' y asignatura'), run(() => go('slotForm', { id: slot.id }))),
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

  function dayCard(day) {
    const blocks = sortedBlocks(day);
    const today = dowIdx(todayStr());
    const classCount = blocks.filter(block => !isPatio(block)).length;
    const card = h('div', { class: 'day-card' + (day === today ? ' today' : '') },
      h('div', { class: 'day-head' },
        h('b', null, WEEK_FULL[day] + (day === today ? ' · hoy' : '')),
        h('span', { style: 'display:flex;align-items:center;gap:10px' },
          h('span', { class: 'nav-badge', style: 'background:var(--surface-2);color:var(--text-2)' }, classCount),
          h('button', { class: 'icon-btn', style: 'width:32px;height:32px', 'aria-label': 'Quitar ' + WEEK_FULL[day] + ' del horario', onclick: () => deleteSlotsOfDay(day), html: icon('trash', 15) })
        )
      )
    );
    if (!blocks.length) {
      card.append(h('p', { class: 'field-hint', style: 'text-align:center;padding:4px 0 8px' }, 'Día sin bloques todavía.'));
    } else {
      for (const block of blocks) card.append(blockRow(block));
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
    wrap.append(formHead('Horario', app.components.smartBack('class'),
      h('span', { class: 'sub', style: 'font-size:13px;color:var(--text-2);font-weight:500;align-self:center;margin-right:2px' }, classCount ? classCount + (classCount === 1 ? ' clase' : ' clases') + ' a la semana' : ''),
      h('button', { class: 'icon-btn', 'aria-label': 'Asignaturas', onclick: () => go('classSubjects'), html: icon('folder', 20) }),
      h('button', { class: 'btn btn-primary', style: 'padding:9px 14px;font-size:13px', onclick: addDayFlow },
        h('span', { class: 'ic', html: icon('plus', 16) }), 'Día')
    ));
    if (!days.length) {
      wrap.append(emptyState('calendar', 'Sin horario todavía',
        'Añade un día, crea sus clases con su hora de inicio y fin, y añade el patio donde toque. Sábado y domingo también pueden ser días de clase.',
        'Añadir día', addDayFlow));
      return wrap;
    }
    for (const day of days) wrap.append(dayCard(day));
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
      subjectSelect = h('select', { class: 'input' },
        h('option', { value: '', selected: !subjectId }, 'Sin asignatura'),
        subjects.map(subject => h('option', { value: subject.id, selected: subject.id === subjectId }, subject.name))
      );
      wrap.append(h('div', { class: 'field' }, h('label', null, 'Asignatura'), subjectSelect));
      if (!subjects.length) wrap.append(h('button', { class: 'btn btn-soft btn-block', style: 'margin:-4px 0 18px', onclick: () => go('subjectForm', { from: 'slotForm' }) }, 'Crear una asignatura'));
    } else {
      wrap.append(h('p', { class: 'field-hint', style: 'margin:-4px 0 18px' }, 'El patio es un descanso entre clases: fija su hora de inicio y de fin.'));
    }

    let day = editing ? editing.day : (Number.isInteger(route.params.day) ? route.params.day : dowIdx(todayStr()));
    const dayRow = h('div', { class: 'wchips' });
    DAY_ORDER.forEach(index => dayRow.append(h('button', {
      type: 'button',
      class: 'wchip' + (index === day ? ' on' : ''),
      onclick: event => {
        day = index;
        [...dayRow.children].forEach(item => item.classList.remove('on'));
        event.currentTarget.classList.add('on');
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
    const startInput = h('input', { class: 'input', type: 'time', value: startValue });
    const endInput = h('input', { class: 'input', type: 'time', value: endValue });
    wrap.append(h('p', { class: 'big-q' }, '¿A qué hora?'),
      h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px' },
        h('div', { class: 'field' }, h('label', null, 'Empieza'), startInput),
        h('div', { class: 'field' }, h('label', null, 'Termina'), endInput)
      ),
      h('p', { class: 'field-hint', style: 'margin-top:-8px' }, 'La duración se ajusta cambiando la hora de fin.')
    );

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
        const data = {
          day,
          start,
          end,
          subjectId: kind === 'patio' ? null : ((subjectSelect && subjectSelect.value) || null),
          room: '',
          kind
        };
        const sameBlock = slot => (editing ? slot.id !== editing.id : true) && slot.day === day && slot.start === start && slot.end === end;
        if ((S.slots || []).some(sameBlock)) {
          toast('Ya existe un bloque de ' + timeTxt(start) + ' a ' + timeTxt(end) + ' el ' + WEEK_FULL[day]);
          return;
        }
        const clash = (S.slots || []).find(slot => (editing ? slot.id !== editing.id : true) && slotsOverlap(slot, data));
        if (clash) {
          toast('Se solapa con ' + (isPatio(clash) ? 'el patio' : blockName(clash)) + ' (' + timeTxt(clash.start) + '–' + timeTxt(clash.end) + ')');
          return;
        }
        if (editing) Object.assign(editing, data);
        else S.slots.push({ id: uid('c'), createdAt: todayStr(), updatedAt: Date.now(), ...data });
        save();
        toast(editing ? 'Cambios guardados' : (kind === 'patio' ? 'Patio añadido' : 'Clase añadida'));
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

  Object.assign(app.class, { scrClassSchedule, deleteSlotsOfDay, scrSlotForm, deleteSlot, blockMenu, addDayFlow });
}
