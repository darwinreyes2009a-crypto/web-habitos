export function markdownPreview(text) {
  // Solo formato de texto (sin HTML, enlaces ni atributos arbitrarios).
  // Escapamos antes de introducir las pocas etiquetas permitidas.
  const escaped = String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^\s*[-*]\s+(.+)$/gm, '• $1')
    .replace(/\n/g, '<br>');
}

export function registerClassNotes(app) {
  const { h, uid, icon, todayStr } = app.core;
  const { S, save } = app.state;
  const { toast, openSheet, closeOverlays, confirmDialog } = app.components;
  const { activeSession } = app.class;

  function classNotesCapture(onSaved) {
    const wrap = h('div', { class: 'quick-note-capture' });
    const input = h('input', {
      class: 'input', type: 'text', autocomplete: 'off', maxlength: '240',
      placeholder: 'Ej. Traer cartulina el viernes', 'aria-label': 'Nota rápida de clase'
    });
    const saveNote = () => {
      const text = input.value.trim();
      if (!text) { input.focus(); return; }
      const currentSession = activeSession();
      S.notes.unshift({
        id: uid(), text, kind: 'nota', date: todayStr(), time: '', done: false, starred: false,
        subjectId: currentSession ? currentSession.subjectId || null : null,
        sessionId: currentSession ? currentSession.id : null,
        tags: [], deletedAt: null, createdAt: new Date().toISOString(), updatedAt: Date.now()
      });
      save();
      input.value = '';
      toast('Nota guardada');
      if (onSaved) onSaved();
      else input.focus();
    };
    const button = h('button', { class: 'btn btn-primary', type: 'button', 'aria-label': 'Guardar nota rápida', onclick: saveNote },
      h('span', { class: 'ic', html: icon('check', 17) }), 'Guardar');
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); saveNote(); }
    });
    wrap.append(input, button);
    return wrap;
  }

  function editQuickNote(note, onSaved) {
    openSheet('Editar nota', () => {
      const text = h('textarea', {
        class: 'input', id: 'class-note-edit', rows: '4', maxlength: '240',
        'aria-label': 'Texto de la nota', placeholder: 'Escribe tu nota de clase…'
      });
      text.value = String(note.text || '');
      const saveButton = h('button', {
        class: 'btn btn-primary btn-block', type: 'button',
        onclick: () => {
          const next = text.value.trim();
          if (!next) {
            text.focus();
            toast('La nota no puede estar vacía');
            return;
          }
          note.text = next;
          note.updatedAt = Date.now();
          save();
          closeOverlays();
          toast('Nota actualizada');
          if (onSaved) onSaved();
        }
      }, 'Guardar cambios');
      text.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          saveButton.click();
        }
      });
      return h('div', null,
        h('div', { class: 'field' }, h('label', { for: 'class-note-edit' }, 'Contenido'), text),
        saveButton
      );
    });
  }

  function deleteQuickNote(note, onSaved, source) {
    confirmDialog({
      title: '¿Eliminar esta nota?',
      message: 'La nota se moverá a la papelera y dejará de aparecer aquí. Puedes deshacerlo desde el aviso.',
      confirmText: 'Eliminar nota',
      onConfirm: () => {
        if (source === 'inbox') {
          const index = S.inbox.indexOf(note);
          if (index < 0) return;
          S.inbox.splice(index, 1);
          note.updatedAt = Date.now();
          save();
          if (onSaved) onSaved();
          toast('Nota eliminada', { label: 'Deshacer', fn: () => {
            if (S.inbox.includes(note)) return;
            note.updatedAt = Date.now();
            S.inbox.splice(Math.min(index, S.inbox.length), 0, note);
            save();
            if (onSaved) onSaved();
          } });
          return;
        }
        note.deletedAt = new Date().toISOString();
        note.updatedAt = Date.now();
        save();
        if (onSaved) onSaved();
        toast('Nota eliminada', { label: 'Deshacer', fn: () => {
          note.deletedAt = null;
          note.updatedAt = Date.now();
          save();
          if (onSaved) onSaved();
        } });
      }
    });
  }

  function quickNotesPreview(onChanged) {
    const notes = (S.notes || []).filter(note => !note.deletedAt).map(note => ({
      ...note,
      record: note,
      source: 'note'
    }));
    // Keep unprocessed inbox items from older versions visible as plain quick notes.
    for (const item of S.inbox || []) notes.push({
      ...item,
      record: item,
      source: 'inbox'
    });
    notes.sort((first, second) => (second.createdAt || '').localeCompare(first.createdAt || ''));
    if (!notes.length) return h('p', { class: 'field-hint', style: 'margin:4px 2px 14px' }, 'Tus notas guardadas aparecerán aquí.');
    const list = h('div', { class: 'quick-note-list', style: 'margin-bottom:16px' });
    for (const note of notes.slice(0, 8)) {
      const row = h('div', { class: 'quick-note-row' },
        h('span', { class: 'r-ic', html: icon(note.source === 'note' ? 'pencil' : 'pin', 17) }),
        h('span', { class: 'qn-text' }, note.text),
        h('span', { class: 'r-sub' }, note.date === todayStr() ? 'Hoy' : note.date || '')
      );
      row.append(h('span', { class: 'quick-note-actions' },
        h('button', {
          class: 'icon-btn', type: 'button',
          'aria-label': 'Editar nota: ' + String(note.text || '').slice(0, 80),
          title: 'Editar nota', html: icon('pencil', 15),
          onclick: () => editQuickNote(note.record, onChanged)
        }),
        h('button', {
          class: 'icon-btn', type: 'button',
          'aria-label': 'Eliminar nota: ' + String(note.text || '').slice(0, 80),
          title: 'Eliminar nota', html: icon('trash', 15),
          onclick: () => deleteQuickNote(note.record, onChanged, note.source)
        })
      ));
      list.append(row);
    }
    return list;
  }

  Object.assign(app.class, {
    classNotesCapture,
    editQuickNote,
    deleteQuickNote,
    markdownPreview,
    quickNotesPreview
  });
}
