export function registerOverlays(app) {
  const { $, h, icon, avatarEl, fmtShort } = app.core;
  const { S } = app.state;
  const { go, ui, giftsOf, freqText } = app.domain;
  let toastTimer = null;

  function headBar(title, subtitle, ...actions) {
    return h('div', { class: 'scr-head' },
      h('div', null, h('h2', null, title), subtitle ? h('p', { class: 'sub' }, subtitle) : null),
      h('div', { class: 'head-actions' }, ...actions)
    );
  }

  function searchBtn() {
    return h('button', { class: 'icon-btn', 'aria-label': 'Buscar', onclick: searchOverlay, html: icon('search', 19) });
  }

  function formHead(title, onBack, extra) {
    return h('div', { class: 'scr-head' },
      h('div', { style: 'display:flex;align-items:center;gap:10px' },
        h('button', { class: 'icon-btn', 'aria-label': 'Volver', onclick: onBack, html: icon('back', 19) }),
        h('h2', { style: 'font-size:20px' }, title)
      ),
      h('div', { class: 'head-actions' }, extra || null)
    );
  }

  /* Vuelve a la pantalla anterior si hay historial interno; si se llegó
     directamente (atajo, notificación), cae a la pestaña indicada. */
  function smartBack(fallback, fallbackParams) {
    return () => {
      if (app.domain.routeStack.length) app.domain.goBack();
      else go(fallback, fallbackParams || {}, { replace: true });
    };
  }

  function emptyState(iconName, title, text, actionLabel, action) {
    return h('div', { class: 'empty' },
      h('div', { class: 'e-ic', html: icon(iconName, 24) }),
      h('b', null, title),
      h('p', null, text),
      actionLabel ? h('button', { class: 'btn btn-primary', onclick: action }, actionLabel) : null
    );
  }

  function openSheet(title, build) {
    const overlay = h('div', {
      class: 'overlay',
      onclick: event => { if (event.target === overlay) closeOverlays(); }
    });
    const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-label': title },
      h('div', { class: 'grabber' }),
      h('div', { class: 'sheet-head' },
        h('h3', null, title),
        h('button', { class: 'icon-btn', style: 'width:34px;height:34px', 'aria-label': 'Cerrar', onclick: closeOverlays, html: icon('x', 18) })
      )
    );
    const body = build(sheet);
    if (body) sheet.append(body);
    overlay.append(sheet);
    $('#overlays').append(overlay);
    const focusable = sheet.querySelector('input,select,textarea,button:not(.icon-btn)');
    if (focusable) focusable.focus({ preventScroll: true });
  }

  function closeOverlays() {
    $('#overlays').innerHTML = '';
  }

  function switchRow(label, hint, checked, onChange) {
    const input = h('input', { type: 'checkbox' });
    input.checked = !!checked;
    input.addEventListener('change', () => onChange(input.checked));
    return h('label', { class: 'set-row', style: 'cursor:pointer' },
      h('div', { style: 'flex:1' },
        h('b', { style: 'font-size:14px;display:block' }, label),
        hint ? h('span', { style: 'font-size:12px;color:var(--text-2)' }, hint) : null
      ),
      h('span', { class: 'sw' }, input, h('i'))
    );
  }

  function quickAddSheet() {
    openSheet('¿Qué quieres añadir?', () => {
      const item = (iconName, label, hint, action) => h('button', {
        class: 'set-row',
        onclick: () => { closeOverlays(); action(); }
      },
        h('span', { class: 'r-ic', html: icon(iconName, 19) }),
        h('div', { style: 'flex:1' },
          h('b', { style: 'font-size:14.5px;display:block' }, label),
          h('span', { style: 'font-size:12px;color:var(--text-2)' }, hint)
        ),
        h('span', { class: 'chev', html: icon('chev', 17) })
      );
      return h('div', { style: 'margin:-6px -20px -14px' },
        item('pencil', 'Modo Clase', 'Apuntar algo rápido de clase', () => go('class')),
        item('checksq', 'Nueva tarea', 'Diaria, semanal o puntual', () => go('taskForm')),
        item('gift', 'Nuevo regalo', 'Una idea para alguien especial', () => go('giftForm')),
        item('users', 'Nueva persona', 'Un perfil con sus gustos y cumpleaños', () => go('personForm'))
      );
    });
  }

  function searchOverlay() {
    openSheet('Buscar', sheet => {
      const input = h('input', { class: 'input', type: 'text', placeholder: 'Personas, tareas, regalos, apuntes…', autocomplete: 'off' });
      const results = h('div');

      function draw() {
        const query = input.value.trim().toLowerCase();
        results.innerHTML = '';
        if (!query) {
          results.append(h('p', { class: 'field-hint', style: 'text-align:center;padding:8px 0' }, 'Escribe para buscar en todo DailyHub.'));
          return;
        }
        const people = S.people.filter(person => person.name.toLowerCase().includes(query));
        const tasks = S.tasks.filter(task => task.title.toLowerCase().includes(query));
        const gifts = S.gifts.filter(gift => gift.title.toLowerCase().includes(query) || (gift.notes || '').toLowerCase().includes(query));
        const notes = (S.notes || []).filter(note => (note.text || '').toLowerCase().includes(query));
        const inbox = (S.inbox || []).filter(item => (item.text || '').toLowerCase().includes(query));
        if (!people.length && !tasks.length && !gifts.length && !notes.length && !inbox.length) {
          results.append(h('p', { class: 'field-hint', style: 'text-align:center;padding:10px 0' }, 'Sin resultados para "' + input.value.trim() + '"'));
          return;
        }
        if (inbox.length) {
          results.append(h('p', { class: 'sr-group' }, 'Para después'));
          for (const item of inbox.slice(0, 6)) {
            results.append(h('button', { class: 'sr-item', onclick: () => { closeOverlays(); ui.classTab = 'despues'; go('class'); } },
              h('span', { class: 'r-ic', style: 'width:34px;height:34px;border-radius:11px;background:var(--amber-soft);color:var(--amber)', html: icon('pin', 16) }),
              h('div', null, h('b', null, item.text), h('span', null, 'Sin organizar · ' + fmtShort(item.date)))
            ));
          }
        }
        if (notes.length) {
          results.append(h('p', { class: 'sr-group' }, 'Apuntes de clase'));
          for (const note of notes.slice(0, 6)) {
            const kind = (app.class.noteKinds.find(item => item.id === note.kind) || app.class.noteKinds[0]);
            const subject = app.class.subjectById(note.subjectId);
            results.append(h('button', { class: 'sr-item', onclick: () => { closeOverlays(); ui.classTab = 'apuntes'; go('class'); } },
              h('span', { class: 'r-ic', style: 'width:34px;height:34px;border-radius:11px', html: icon(kind.icon, 16) }),
              h('div', null, h('b', null, note.text), h('span', null, subject ? subject.name : 'Sin asignatura'))
            ));
          }
        }
        if (people.length) {
          results.append(h('p', { class: 'sr-group' }, 'Personas'));
          for (const person of people) {
            results.append(h('button', { class: 'sr-item', onclick: () => { closeOverlays(); go('person', { id: person.id }); } },
              avatarEl(person.name, person.color, 34, person.photo),
              h('div', null, h('b', null, person.name), h('span', null, giftsOf(person.id).length + ' regalos'))
            ));
          }
        }
        if (tasks.length) {
          results.append(h('p', { class: 'sr-group' }, 'Tareas'));
          for (const task of tasks.slice(0, 6)) {
            results.append(h('button', { class: 'sr-item', onclick: () => { closeOverlays(); go('tasks'); } },
              h('span', { class: 'r-ic', style: 'width:34px;height:34px;border-radius:11px', html: icon(task.icon || 'star', 16) }),
              h('div', null, h('b', null, task.title), h('span', null, freqText(task)))
            ));
          }
        }
        if (gifts.length) {
          results.append(h('p', { class: 'sr-group' }, 'Regalos'));
          for (const gift of gifts.slice(0, 6)) {
            results.append(h('button', { class: 'sr-item', onclick: () => { closeOverlays(); go('giftForm', { id: gift.id }); } },
              h('span', { class: 'r-ic', style: 'width:34px;height:34px;border-radius:11px', html: icon('gift', 16) }),
              h('div', null, h('b', null, gift.title), h('span', null, gift.status))
            ));
          }
        }
      }

      input.addEventListener('input', draw);
      draw();
      sheet.append(h('div', { class: 'search-input-wrap' }, h('span', { html: icon('search', 18) }), input), results);
      return h('div');
    });
  }

  function confirmDialog({ title, message, confirmText, onConfirm }) {
    const actionLabel = confirmText || 'Eliminar';
    const overlay = h('div', {
      class: 'overlay',
      style: 'z-index:70',
      onclick: event => { if (event.target === overlay) overlay.remove(); }
    });
    const sheet = h('div', { class: 'sheet', style: 'max-width:420px', role: 'alertdialog', 'aria-label': title },
      h('h3', { style: 'font-size:17px;font-weight:800;margin-bottom:8px' }, title),
      h('p', { style: 'font-size:13.5px;color:var(--text-2);line-height:1.55;margin-bottom:20px' }, message),
      h('div', { style: 'display:flex;gap:10px;justify-content:flex-end' },
        h('button', { class: 'btn btn-soft', onclick: () => overlay.remove() }, 'Cancelar'),
        h('button', { class: 'btn btn-danger', onclick: () => { overlay.remove(); if (onConfirm) onConfirm(); } }, actionLabel)
      )
    );
    overlay.append(sheet);
    document.body.appendChild(overlay);
    const first = sheet.querySelector('button');
    if (first) first.focus({ preventScroll: true });
  }

  function exitDialog() {
    confirmDialog({
      title: '¿Salir de DailyHub?',
      message: 'Tu progreso se ha guardado. ¿Seguro que quieres salir de la aplicación?',
      confirmText: 'Salir de la app',
      onConfirm: () => { window.__armExitGuard(false); history.back(); }
    });
  }

  function toast(message, action) {
    const holder = $('#toasts');
    holder.innerHTML = '';
    const element = h('div', { class: 'toast', role: 'status' },
      h('span', null, message),
      action ? h('button', { onclick: () => { element.remove(); action.fn(); } }, action.label || 'Deshacer') : null
    );
    holder.append(element);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.remove(), action ? 6000 : 2600);
  }

  Object.assign(app.components, {
    headBar,
    searchBtn,
    formHead,
    smartBack,
    emptyState,
    openSheet,
    closeOverlays,
    switchRow,
    quickAddSheet,
    searchOverlay,
    exitDialog,
    confirmDialog,
    toast
  });
}
