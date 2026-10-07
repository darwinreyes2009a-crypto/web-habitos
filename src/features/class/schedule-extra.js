// Pantallas auxiliares del horario: carga y huecos de la semana, días no
// lectivos (vacaciones, exámenes) y plantillas para reutilizar un patrón.

export function registerClassScheduleExtra(app) {
  const { h, icon, todayStr, addDaysYmd, fmtRange, WEEK_FULL, WEEK_L, uid } = app.core;
  const { S, save } = app.state;
  const { route, go, render } = app.domain;
  const { formHead, emptyState, confirmDialog, toast, openSheet, closeOverlays } = app.components;
  const { hm, minTxt, timeTxt, subjectById, blockNameOf, isPatioOf, blockColorOf } = app.class;

  const BREAK_KINDS = [
    { id: 'vacaciones', label: 'Vacaciones' },
    { id: 'examenes', label: 'Exámenes' },
    { id: 'puente', label: 'Puente' },
    { id: 'libre', label: 'No lectivo' }
  ];
  const kindLabel = id => (BREAK_KINDS.find(kind => kind.id === id) || BREAK_KINDS[3]).label;
  const KIND_COLOR = { vacaciones: 'var(--green)', examenes: 'var(--danger)', puente: 'var(--amber)', libre: 'var(--text-3)' };

  /* --- Carga y huecos ------------------------------------------------------ */

  function scrClassLoad() {
    const { go } = app.domain;
    const load = app.class.weekLoad();
    const wrap = h('div');
    wrap.append(formHead('Carga del horario', smartBack()));

    const total = load.total || 1;
    wrap.append(h('div', { class: 'card' },
      h('div', { class: 'row' },
        h('span', { class: 'r-ic', html: icon('clock', 18) }),
        h('span', { style: 'flex:1' }, h('b', null, 'En el centro'), h('span', { class: 'r-sub' }, 'Suma de todos los días del patrón semanal')),
        h('span', { style: 'font-weight:800;font-size:15px' }, app.class.humanMinutes(load.total))
      ),
      h('div', { class: 'bar' }, h('i', { class: 'mini', style: 'width:' + Math.round(load.classMinutes / total * 100) + '%' }))
    ));

    wrap.append(h('p', { class: 'section-title', style: 'margin-top:20px' }, h('span', null, 'Reparto por asignatura')));
    if (!load.subjects.length) {
      wrap.append(emptyState('folder', 'Sin clases en el horario', 'Crea clases para ver cómo se reparten tus horas.', 'Crear clase', () => go('slotForm', { day: 0 })));
      return wrap;
    }
    for (const entry of load.subjects) {
      const share = Math.round(entry.minutes / total * 100);
      wrap.append(h('div', { class: 'card' },
        h('div', { class: 'row' },
          h('span', { style: 'flex:1;min-width:0' },
            h('b', null, entry.name),
            h('span', { class: 'r-sub' }, entry.blocks + (entry.blocks === 1 ? ' bloque' : ' bloques') + ' · ' + share + '% del tiempo')),
          h('span', { style: 'font-weight:700;font-size:13px;color:var(--text-2)' }, app.class.humanMinutes(entry.minutes))
        ),
        h('div', { class: 'bar' }, h('i', { style: 'width:' + share + '%;background:' + blockColorOf({ subjectId: entry.subjectId, kind: 'class' }) }))
      ));
    }

    wrap.append(h('p', { class: 'section-title', style: 'margin-top:20px' }, h('span', null, 'Día a día')));
    const maxDay = Math.max(1, ...load.byDay);
    for (let day = 0; day < 7; day++) {
      const minutes = load.byDay[day];
      wrap.append(h('div', { class: 'card' },
        h('div', { class: 'row' },
          h('span', { style: 'flex:1' }, h('b', null, WEEK_FULL[day])),
          h('span', { style: 'font-weight:700;font-size:13px;color:var(--text-2)' }, minutes ? app.class.humanMinutes(minutes) : 'Libre')
        ),
        h('div', { class: 'bar' }, h('i', { class: 'green', style: 'width:' + Math.round(minutes / maxDay * 100) + '%' }))
      ));
    }

    // Huecos y solapes concretos
    const days = [0, 1, 2, 3, 4, 5, 6].filter(day => (S.slots || []).some(slot => slot.day === day && slot.active !== false));
    const gapRows = [];
    const clashRows = [];
    for (const day of days) {
      for (const gap of app.class.dayGaps(day, 45)) gapRows.push({ day, gap });
      for (const pair of app.class.dayOverlaps(day)) clashRows.push({ day, pair });
    }
    wrap.append(h('p', { class: 'section-title', style: 'margin-top:20px' }, h('span', null, 'Huecos y solapes')));
    if (!gapRows.length && !clashRows.length) {
      wrap.append(h('p', { class: 'field-hint' }, 'No hay huecos de más de 45 minutos ni bloques que se pisen.'));
    }
    for (const { day, gap } of gapRows) {
      wrap.append(h('button', { class: 'set-row', onclick: () => go('classGrid') },
        h('span', { class: 'r-ic', html: icon('clock', 17) }),
        h('span', null, WEEK_FULL[day] + ' · libre de ' + timeTxt(gap.from) + ' a ' + timeTxt(gap.to)),
        h('span', { style: 'margin-left:auto;font-size:12px;color:var(--text-3)' }, app.class.humanMinutes(gap.minutes))
      ));
    }
    for (const { day, pair } of clashRows) {
      wrap.append(h('button', { class: 'set-row', style: 'color:var(--danger)', onclick: () => go('classGrid') },
        h('span', { class: 'r-ic', style: 'background:var(--danger-soft);color:var(--danger)', html: icon('x', 17) }),
        h('span', null, WEEK_FULL[day] + ': ' + blockNameOf(pair[0]) + ' se pisa con ' + blockNameOf(pair[1]))
      ));
    }
    if (gapRows.length) {
      wrap.append(h('button', { class: 'btn btn-soft btn-block', style: 'margin-top:12px', onclick: () => go('classGrid') },
        h('span', { class: 'ic', html: icon('calendar', 16) }), 'Abrir la rejilla para taparlos'));
    }
    return wrap;
  }

  function smartBack() {
    return app.components.smartBack('classSchedule');
  }

  /* --- Días no lectivos ---------------------------------------------------- */

  function scrNonSchool() {
    const { addBreak, removeBreak, breaks, breakOn } = app.class;
    const wrap = h('div');
    wrap.append(formHead('Días no lectivos', smartBack(),
      h('button', { class: 'btn btn-primary', style: 'padding:9px 14px;font-size:13px', onclick: addFlow }, h('span', { class: 'ic', html: icon('plus', 16) }), 'Añadir')
    ));
    wrap.append(h('p', { class: 'field-hint', style: 'margin:-2px 0 16px' },
      'En estos días la app no muestra clases, aunque el horario semanal siga guardado. Sirve para vacaciones, exámenes y puentes.'));

    const today = todayStr();
    const current = breakOn(today);
    if (current) {
      wrap.append(h('div', { class: 'card', style: 'border-color:' + KIND_COLOR[current.kind] },
        h('div', { class: 'row' },
          h('span', { class: 'r-ic', style: 'background:var(--surface-2);color:' + KIND_COLOR[current.kind], html: icon('moon', 18) }),
          h('span', { style: 'flex:1' }, h('b', null, 'Hoy: ' + current.label), h('span', { class: 'r-sub' }, 'No tienes clases hoy')))
      ));
    }

    const list = breaks().slice().sort((first, second) => (first.from < second.from ? 1 : -1));
    if (!list.length) {
      wrap.append(emptyState('moon', 'Sin días no lectivos', 'Añade vacaciones o semanas de exámenes y el horario se apagará solo en esos días.', 'Añadir periodo', addFlow));
      return wrap;
    }
    for (const item of list) {
      const ongoing = today >= item.from && today <= item.to;
      wrap.append(h('div', { class: 'card' + (ongoing ? ' on' : '') },
        h('div', { class: 'row' },
          h('span', { class: 'r-ic', style: 'background:var(--surface-2);color:' + KIND_COLOR[item.kind], html: icon('moon', 18) }),
          h('span', { style: 'flex:1;min-width:0' },
            h('b', null, item.label),
            h('span', { class: 'r-sub' }, fmtRange(item.from, item.to) + ' · ' + kindLabel(item.kind) + ' · ' + daysOf(item.from, item.to) + (daysOf(item.from, item.to) === 1 ? ' día' : ' días'))
          ),
          h('button', { class: 'icon-btn', style: 'width:32px;height:32px', 'aria-label': 'Eliminar ' + item.label, onclick: () => removeFlow(item), html: icon('trash', 15) })
        )
      ));
    }
    return wrap;
  }

  function daysOf(from, to) {
    let count = 0;
    let cursor = from;
    for (let guard = 0; guard < 400 && cursor <= to; guard++) {
      count++;
      cursor = addDaysYmd(cursor, 1);
    }
    return count;
  }

  function addFlow() {
    closeOverlays();
    const overlay = h('div', { class: 'overlay', style: 'z-index:65', onclick: event => { if (event.target === overlay) overlay.remove(); } });
    let kind = 'vacaciones';
    const fromInput = h('input', { class: 'input', type: 'date', id: 'break-from', value: todayStr() });
    const toInput = h('input', { class: 'input', type: 'date', id: 'break-to', value: addDaysYmd(todayStr(), 6) });
    const labelInput = h('input', { class: 'input', type: 'text', id: 'break-name', value: '', placeholder: 'Vacaciones de Navidad' });
    const chips = h('div', { class: 'chips', style: 'margin-bottom:16px' });
    const drawChips = () => {
      chips.innerHTML = '';
      for (const item of BREAK_KINDS) {
        chips.append(h('button', {
          class: 'chip' + (kind === item.id ? ' on' : ''),
          onclick: () => { kind = item.id; drawChips(); }
        }, item.label));
      }
    };
    drawChips();
    const quick = h('div', { class: 'chips', style: 'margin:-6px 0 18px' },
      h('button', { class: 'chip', onclick: () => { fromInput.value = todayStr(); toInput.value = addDaysYmd(todayStr(), 6); } }, 'Esta semana'),
      h('button', { class: 'chip', onclick: () => { fromInput.value = todayStr(); toInput.value = addDaysYmd(todayStr(), 29); } }, 'Este mes'),
      h('button', { class: 'chip', onclick: () => { fromInput.value = todayStr(); toInput.value = addDaysYmd(todayStr(), 89); } }, 'Trimestre')
    );
    overlay.append(h('div', { class: 'sheet', style: 'max-width:420px' },
      h('div', { class: 'grabber' }),
      h('h3', { style: 'font-size:17px;font-weight:800;margin-bottom:12px' }, 'Añadir días no lectivos'),
      chips,
      h('div', { class: 'field' }, h('label', { for: 'break-name' }, 'Nombre'), labelInput),
      h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px' },
        h('div', { class: 'field' }, h('label', { for: 'break-from' }, 'Desde'), fromInput),
        h('div', { class: 'field' }, h('label', { for: 'break-to' }, 'Hasta'), toInput)
      ),
      quick,
      h('button', {
        class: 'btn btn-primary btn-block btn-lg',
        onclick: () => {
          const from = fromInput.value;
          const to = toInput.value || from;
          if (!from) { toast('Elige la fecha de inicio'); return; }
          if (to < from) { toast('La fecha de fin va después de la de inicio'); return; }
          app.class.addBreak(from, to, labelInput.value.trim() || kindLabel(kind), kind);
          overlay.remove();
          render();
          toast('Añadido · no se mostrarán clases esas fechas');
        }
      }, 'Añadir periodo')
    ));
    document.body.append(overlay);
  }

  function removeFlow(item) {
    confirmDialog({
      title: '¿Eliminar «' + item.label + '»?',
      message: 'Dejarán de ocultarse las clases entre el ' + fmtRange(item.from, item.to) + '. El horario semanal no se toca.',
      confirmText: 'Eliminar',
      onConfirm: () => { app.class.removeBreak(item.id); render(); }
    });
  }

  /* --- Plantillas --------------------------------------------------------- */

  function templates() {
    if (!Array.isArray(S.settings.scheduleTemplates)) S.settings.scheduleTemplates = [];
    return S.settings.scheduleTemplates;
  }

  function scrClassTemplates() {
    const wrap = h('div');
    wrap.append(formHead('Plantillas de horario', smartBack(),
      h('button', { class: 'btn btn-primary', style: 'padding:9px 14px;font-size:13px', onclick: saveFlow }, h('span', { class: 'ic', html: icon('plus', 16) }), 'Guardar')
    ));
    wrap.append(h('p', { class: 'field-hint', style: 'margin:-2px 0 16px' },
      'Guarda el horario actual como una plantilla y aplícala cuando cambies de curso o de trimestre. Sustituye los días que marques.'));

    const list = templates();
    if (!list.length) {
      wrap.append(emptyState('copy', 'Sin plantillas', 'Crea tu horario, guárdalo como plantilla y aplícalo en un solo toque.', 'Guardar el horario actual', saveFlow));
      return wrap;
    }
    for (const item of list) {
      // Los días se deducen de los bloques: así una plantilla antigua, guardada
      // sin el campo `days`, sigue mostrando bien su resumen.
      const itemDays = Array.isArray(item.days) && item.days.length
        ? item.days
        : [...new Set((item.blocks || []).map(block => block.day))].sort();
      wrap.append(h('div', { class: 'card' },
        h('div', { class: 'row' },
          h('span', { class: 'r-ic', html: icon('copy', 18) }),
          h('span', { style: 'flex:1;min-width:0' },
            h('b', null, item.name),
            h('span', { class: 'r-sub' }, (item.blocks || []).length + ((item.blocks || []).length === 1 ? ' bloque' : ' bloques') + ' · ' + itemDays.map(day => WEEK_L[day]).join(' '))
          ),
          h('button', { class: 'icon-btn', style: 'width:32px;height:32px', 'aria-label': 'Eliminar ' + item.name, onclick: () => removeTemplate(item), html: icon('trash', 15) })
        ),
        h('div', { style: 'display:flex;gap:8px;margin-top:12px' },
          h('button', { class: 'btn btn-soft', style: 'flex:1;font-size:13px', onclick: () => applyFlow(item, 'replace') }, 'Reemplazar todo'),
          h('button', { class: 'btn btn-primary', style: 'flex:1;font-size:13px', onclick: () => applyFlow(item, 'fill') }, 'Solo días vacíos')
        )
      ));
    }
    return wrap;
  }

  function saveFlow() {
    const blocks = (S.slots || []).filter(slot => slot.active !== false);
    if (!blocks.length) { toast('No hay horario que guardar'); return; }
    closeOverlays();
    const overlay = h('div', { class: 'overlay', style: 'z-index:65', onclick: event => { if (event.target === overlay) overlay.remove(); } });
    const nameInput = h('input', { class: 'input', type: 'text', id: 'tpl-name', value: '', placeholder: '2.º de Bachillerato' });
    overlay.append(h('div', { class: 'sheet', style: 'max-width:400px' },
      h('div', { class: 'grabber' }),
      h('h3', { style: 'font-size:17px;font-weight:800;margin-bottom:6px' }, 'Guardar plantilla'),
      h('p', { class: 'field-hint', style: 'margin-bottom:14px' }, blocks.length + ' bloques guardados.'),
      h('div', { class: 'field' }, h('label', { for: 'tpl-name' }, 'Nombre'), nameInput),
      h('button', {
        class: 'btn btn-primary btn-block btn-lg',
        onclick: () => {
          const name = nameInput.value.trim();
          if (!name) { toast('Ponle un nombre'); return; }
          const days = [...new Set(blocks.map(slot => slot.day))].sort();
          templates().push({
            id: uid('t'),
            name,
            days: [...new Set(blocks.map(slot => slot.day))].sort(),
            createdAt: todayStr(),
            blocks: blocks.map(slot => ({ day: slot.day, start: slot.start, end: slot.end, subjectId: slot.subjectId || null, room: slot.room || '', kind: isPatioOf(slot) ? 'patio' : 'class' }))
          });
          save();
          overlay.remove();
          render();
          toast('Plantilla guardada');
        }
      }, 'Guardar')
    ));
    document.body.append(overlay);
  }

  function removeTemplate(item) {
    confirmDialog({
      title: '¿Eliminar «' + item.name + '»?',
      message: 'Solo se borra la plantilla. Tu horario actual no cambia.',
      confirmText: 'Eliminar',
      onConfirm: () => {
        const list = templates();
        const at = list.findIndex(entry => entry.id === item.id);
        if (at >= 0) list.splice(at, 1);
        save();
        render();
      }
    });
  }

  function applyFlow(item, mode) {
    const blocks = item.blocks || [];
    const days = [...new Set(blocks.map(block => block.day))];
    const title = mode === 'replace' ? '¿Reemplazar el horario?' : '¿Rellenar los días vacíos?';
    const message = mode === 'replace'
      ? 'Se borrarán los bloques de ' + days.map(day => WEEK_FULL[day]).join(', ') + ' y se pondrán los ' + blocks.length + ' de «' + item.name + '».'
      : 'Se añadirán los ' + blocks.length + ' bloques de «' + item.name + '» solo en los días que estén vacíos.';
    confirmDialog({
      title,
      message,
      confirmText: mode === 'replace' ? 'Reemplazar' : 'Rellenar',
      onConfirm: () => {
        const removed = [];
        if (mode === 'replace') {
          for (let index = (S.slots || []).length - 1; index >= 0; index--) {
            if (days.includes(S.slots[index].day)) removed.push({ item: S.slots.splice(index, 1)[0], index });
          }
          removed.reverse();
        }
        let created = 0;
        for (const block of blocks) {
          if (mode === 'fill' && (S.slots || []).some(slot => slot.day === block.day)) continue;
          S.slots.push(Object.assign({ id: uid('c'), createdAt: todayStr(), updatedAt: Date.now() }, block));
          created++;
        }
        save();
        render();
        toast(created ? created + (created === 1 ? ' bloque creado' : ' bloques creados') : 'No había nada que crear');
        if (removed.length) {
          toast('Antes se quitaron ' + removed.length + ' bloques', { label: 'Deshacer', fn: () => {
            removed.forEach(entry => S.slots.splice(Math.min(entry.index, S.slots.length), 0, entry.item));
            save();
            render();
          } });
        }
      }
    });
  }

  Object.assign(app.class, {
    scrClassLoad,
    scrNonSchool,
    scrClassTemplates,
    BREAK_KINDS,
    breakKindLabel: kindLabel
  });
}
