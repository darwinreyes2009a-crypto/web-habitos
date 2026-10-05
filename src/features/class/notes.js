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
  const { toast } = app.components;
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

  function quickNotesPreview() {
    const notes = (S.notes || []).filter(note => !note.deletedAt).map(note => ({
      text: note.text, date: note.date, createdAt: note.createdAt
    }));
    // Keep unprocessed items from older versions visible as plain quick notes.
    for (const item of S.inbox || []) notes.push({ text: item.text, date: item.date, createdAt: item.createdAt });
    notes.sort((first, second) => (second.createdAt || '').localeCompare(first.createdAt || ''));
    if (!notes.length) return h('p', { class: 'field-hint', style: 'margin:4px 2px 14px' }, 'Tus notas guardadas aparecerán aquí.');
    const list = h('div', { style: 'margin-bottom:16px' });
    for (const note of notes.slice(0, 8)) {
      list.append(h('div', { class: 'quick-note-row' },
        h('span', { class: 'r-ic', html: icon('pencil', 17) }),
        h('span', { style: 'flex:1;min-width:0;overflow-wrap:anywhere' }, note.text),
        h('span', { class: 'r-sub', style: 'flex:none' }, note.date === todayStr() ? 'Hoy' : note.date || '')
      ));
    }
    return list;
  }
  Object.assign(app.class, {
    classNotesCapture,
    markdownPreview,
    quickNotesPreview
  });
}
