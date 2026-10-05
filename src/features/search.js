// Buscador global: una sola caja para encontrar tareas, notas, personas,
// asignaturas, bloques de horario y regalos. Se abre con Ctrl+K / Cmd+K desde
// cualquier pantalla y se maneja entero con el teclado.

export function registerSearch(app) {
  const { h, icon, todayStr, cap, WEEK_FULL } = app.core;
  const { S } = app.state;
  const { go, closeOverlays, toast } = app.domain;
  const { openSheet, confirmDialog } = app.components;

  let overlay = null;
  let results = [];
  let cursor = 0;
  let input = null;

  // Normaliza para que "matematicas" encuentre "Matem\u00e1ticas": se quitan
  // tildes y se pasa a minúsculas.
  const norm = value => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  function collect(query) {
    const q = norm(query);
    if (q.length < 1) return [];
    const out = [];
    const add = (kind, iconName, title, subtitle, action) => {
      if (out.length > 40) return;
      out.push({ kind, icon: iconName, title, subtitle, action });
    };

    // Cada bloque va protegido: si un dato raro rompe una búsqueda, el resto de
    // resultados deben seguir apareciendo en vez de dejar la lista vacía.
    const safe = (run) => { try { run(); } catch (error) { console.warn('Búsqueda: se saltó un bloque', error); } };

    safe(() => {
      for (const task of S.tasks || []) {
        const hay = norm(task.title + ' ' + (task.cat || '') + ' ' + (task.time || '') + ' ' + (app.core.freqText(task) || '') + ' ' + (task.dueDate || '') + ' ' + (Array.isArray(task.steps) ? task.steps.map(step => step.title).join(' ') : ''));
        if (!hay.includes(q)) continue;
        const streak = app.core.streakOf(task);
        add('Tarea', task.icon || 'check', task.title, (task.cat || '') + ' · ' + app.core.freqText(task) + (streak ? ' · racha ' + streak : ''), () => go('taskForm', { id: task.id }));
      }
    });
    safe(() => {
      for (const subject of S.subjects || []) {
        if (!norm(subject.name).includes(q)) continue;
        const count = (S.slots || []).filter(slot => slot.subjectId === subject.id).length;
        add('Asignatura', 'folder', subject.name, count + (count === 1 ? ' bloque' : ' bloques') + ' a la semana', () => go('subjectView', { id: subject.id }));
      }
    });
    safe(() => {
      for (const note of S.notes || []) {
        if (note.deletedAt || !norm(note.text + ' ' + (Array.isArray(note.tags) ? note.tags.join(' ') : '')).includes(q)) continue;
        const when = note.date || '';
        add('Nota rápida', 'pencil', note.text.slice(0, 60) + (note.text.length > 60 ? '…' : ''), when ? app.core.fmtShort(when) : 'Nota de clase', () => { app.domain.ui.classTab = 'hoy'; go('class'); });
      }
    });
    safe(() => {
      for (const person of S.people || []) {
        if (!norm(person.name + ' ' + (person.notes || '')).includes(q)) continue;
        const gifts = app.domain.giftsOf(person.id).length;
        add('Persona', 'user', person.name, [person.relationship, gifts ? gifts + ' regalos' : '', person.birthday ? app.domain.bdayTxt(person.birthday) : ''].filter(Boolean).join(' · '), () => go('person', { id: person.id }));
      }
    });
    safe(() => {
      for (const gift of S.gifts || []) {
        if (!norm(gift.title).includes(q)) continue;
        const person = (S.people || []).find(p => p.id === gift.personId);
        add('Regalo', 'gift', gift.title, (person ? person.name + ' · ' : '') + (gift.status || 'Idea'), () => go('giftForm', { id: gift.id }));
      }
    });
    safe(() => {
      for (const slot of S.slots || []) {
        const name = app.class.blockNameOf(slot);
        if (!norm(name + ' ' + (slot.room || '')).includes(q)) continue;
        add('Clase', 'calendar', name, WEEK_FULL[slot.day] + ' · ' + String(slot.start).slice(0, 5) + '–' + String(slot.end).slice(0, 5) + (slot.room ? ' · ' + app.class.roomTxt(slot) : ''), () => go('classSchedule'));
      }
    });
    return out;
  }

  function draw() {
    if (!results.length) {
      list.innerHTML = '';
      list.append(h('p', { class: 'field-hint', style: 'text-align:center;padding:18px 0' },
        query.value.trim() ? 'Nada con «' + query.value.trim() + '»' : 'Escribe para buscar en tareas, notas, personas, asignaturas, clases y regalos'));
      return;
    }
    list.innerHTML = '';
    results.forEach((item, index) => {
      const row = h('button', {
        class: 'set-row sr-row' + (index === cursor ? ' on' : ''),
        onmouseenter: () => { cursor = index; paint(); },
        onclick: () => { close(); item.action(); }
      },
        h('span', { class: 'r-ic', html: icon(item.icon, 17) }),
        h('span', { class: 'sr-main' }, h('b', null, item.title), h('span', { class: 'r-sub' }, item.kind + ' · ' + item.subtitle))
      );
      list.append(row);
    });
  }

  function paint() {
    [...list.children].forEach((row, index) => row.classList.toggle('on', index === cursor));
    const active = list.children[cursor];
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
  }

  const query = { value: '' };
  let list = null;

  function close() {
    if (overlay) { overlay.remove(); overlay = null; }
    input = null;
  }

  function open(initial) {
    close();
    query.value = initial || '';
    cursor = 0;
    input = h('input', {
      class: 'input sr-input',
      type: 'search',
      placeholder: 'Buscar en toda la app…',
      'aria-label': 'Buscar',
      autocomplete: 'off'
    });
    input.value = query.value;
    list = h('div', { class: 'sr-list' });
    overlay = h('div', { class: 'overlay sr-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Buscar', style: 'z-index:80', onclick: event => { if (event.target === overlay) close(); } },
      h('div', { class: 'sheet sr-sheet' },
        h('div', { class: 'grabber' }),
        h('div', { class: 'sr-head' }, h('span', { class: 'ic', html: icon('search', 18) }), input, h('kbd', null, 'Esc')),
        list,
        h('p', { class: 'sr-hint' }, h('kbd', null, '↑↓'), ' moverse · ', h('kbd', null, 'Enter'), ' abrir · ', h('kbd', null, 'Esc'), ' cerrar')
      )
    );
    document.body.append(overlay);

    const refresh = () => {
      results = collect(query.value);
      cursor = 0;
      draw();
    };
    input.addEventListener('input', () => { query.value = input.value; refresh(); });
    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); cursor = Math.min(cursor + 1, results.length - 1); paint(); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); cursor = Math.max(cursor - 1, 0); paint(); }
      else if (event.key === 'Enter') {
        event.preventDefault();
        const item = results[cursor];
        if (item) { close(); item.action(); }
      } else if (event.key === 'Escape') { event.preventDefault(); close(); }
    });
    refresh();
    input.focus();
    input.select();
  }

  // Atajo global. Se registra una sola vez aunque se vuelva a pintar.
  function listen() {
    if (app.features._searchBound) return;
    app.features._searchBound = true;
    document.addEventListener('keydown', event => {
      const meta = event.ctrlKey || event.metaKey;
      if (meta && (event.key === 'k' || event.key === 'K')) {
        event.preventDefault();
        open();
        return;
      }
      // "/" abre la búsqueda si no estás escribiendo en un campo.
      const tag = (event.target && event.target.tagName) || '';
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (event.target && event.target.isContentEditable);
      if (event.key === '/' && !typing && !meta && !event.altKey) {
        event.preventDefault();
        open();
      }
    });
  }

  Object.assign(app.features, { openSearch: open, searchListen: listen });
}
