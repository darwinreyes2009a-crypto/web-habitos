export function registerClassNotes(app) {
  const {
    h,
    uid,
    icon,
    todayStr,
    parseYmd,
    fmtLong,
    COLORS,
    ICON_CHOICES
  } = app.core;
  const { S, save } = app.state;
  const { route, ui, go, render } = app.domain;
  const {
    headBar,
    formHead,
    emptyState,
    openSheet,
    closeOverlays,
    confirmDialog,
    toast
  } = app.components;
  const {
    noteKinds,
    noteKindStyle,
    noteTimeStr,
    subjectIconsQuick,
    subjectById,
    slotsOfSubject,
    tintHex,
    activeSession,
    pickSubject
  } = app.class;
  const { showAppNotification } = app.services;

  function noteCard(note, redraw) {
    const style = noteKindStyle(note.kind);
    const kind = noteKinds.find(item => item.id === note.kind) || noteKinds[0];
    const subject = subjectById(note.subjectId);
    const refresh = () => { save(); if (redraw) redraw(); else render(); };
    return h('div', { class: 'note-card' + (note.done ? ' done' : ''), style: 'border-left:3px solid ' + style.c },
      h('button', {
        class: 'note-check' + (note.done ? ' on' : ''),
        'aria-label': note.done ? 'Marcar como pendiente' : 'Marcar como hecho',
        onclick: () => { note.done = !note.done; refresh(); }
      }, note.done ? h('span', { html: icon('check', 13) }) : null),
      h('div', { style: 'flex:1;min-width:0' },
        h('p', { class: 'note-text' }, note.text),
        h('div', { class: 'note-meta' },
          h('span', { class: 'note-kind', style: 'color:' + style.c + ';background:' + style.bg + ';border:1px solid ' + style.br }, kind.label),
          subject ? h('span', { class: 'subj-chip', style: 'color:' + subject.color + ';background:' + tintHex(subject.color, '22') }, subject.name) : null,
          note.starred ? h('span', { class: 'note-star', style: 'color:var(--amber)', html: icon('star', 13) }) : null,
          noteTimeStr(note) ? h('span', null, '· ' + noteTimeStr(note)) : null
        )
      ),
      h('button', { class: 'icon-btn', style: 'width:32px;height:32px', 'aria-label': 'Más opciones', onclick: () => noteMenu(note, redraw) }, h('span', { class: 'chev', html: icon('more', 16) }))
    );
  }

  function classNotesCapture(onSaved) {
    const wrap = h('div');
    let quickKind = 'nota';
    const kindSegment = h('div', { class: 'seg', style: 'flex-wrap:wrap;margin-bottom:10px' },
      noteKinds.map(kind => h('button', {
        class: kind.id === quickKind ? 'on' : '',
        style: 'flex:0 1 auto',
        onclick: event => {
          quickKind = kind.id;
          [...kindSegment.children].forEach(item => item.classList.remove('on'));
          event.currentTarget.classList.add('on');
        }
      }, kind.label))
    );
    const quickInput = h('input', { class: 'input', type: 'text', placeholder: 'Escribe y pulsa Enter para apuntar…', autocomplete: 'off', maxlength: '240' });
    quickInput.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const text = quickInput.value.trim();
      if (!text) return;
      const currentSession = activeSession();
      S.notes.unshift({
        id: uid(),
        text,
        kind: quickKind,
        date: todayStr(),
        time: '',
        done: false,
        starred: quickKind === 'importante',
        subjectId: (ui.noteSubject && ui.noteSubject !== 'todas' && ui.noteSubject !== 'sin') ? ui.noteSubject : null,
        sessionId: currentSession ? currentSession.id : null,
        createdAt: new Date().toISOString()
      });
      save();
      quickInput.value = '';
      toast('Apuntado');
      if (onSaved) onSaved();
    });
    wrap.append(kindSegment, quickInput, h('p', { class: 'field-hint', style: 'margin-bottom:4px' }, 'Se guarda con la fecha de hoy.'));
    return wrap;
  }

  const pomodoro = { timer: null, left: 25 * 60, running: false, phase: 'focus' };

  function pomodoroCard() {
    return h('div', { class: 'set-card', style: 'display:flex;align-items:center;gap:14px;padding:16px 18px' },
      h('div', { style: 'flex:1' },
        h('div', { id: 'pom-time', style: 'font-size:34px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums' }, '25:00'),
        h('div', { id: 'pom-phase', style: 'font-size:11.5px;font-weight:700;color:var(--text-2);letter-spacing:.06em;text-transform:uppercase;margin-top:2px' }, 'Concentración')
      ),
      h('button', { class: 'btn btn-soft', style: 'padding:10px 16px', onclick: () => pomodoroSet(pomodoro.phase === 'focus' ? 5 : 25, pomodoro.phase === 'focus' ? 'break' : 'focus') }, 'Descanso'),
      h('button', { class: 'btn btn-soft', style: 'padding:10px 16px', onclick: () => pomodoroSet(pomodoro.phase === 'focus' ? 25 : 5, pomodoro.phase) }, 'Reiniciar'),
      h('button', { id: 'pom-toggle', class: 'btn btn-primary', style: 'padding:10px 22px', onclick: pomodoroToggle }, 'Empezar')
    );
  }

  function pomodoroSet(minutes, phase) {
    pomodoro.left = minutes * 60;
    pomodoro.phase = phase;
    pomodoro.running = false;
    clearInterval(pomodoro.timer);
    pomodoro.timer = null;
    pomodoroDraw();
  }

  function pomodoroToggle() {
    if (pomodoro.running) {
      clearInterval(pomodoro.timer);
      pomodoro.timer = null;
      pomodoro.running = false;
      pomodoroDraw();
      return;
    }
    pomodoro.running = true;
    pomodoroDraw();
    pomodoro.timer = setInterval(pomodoroTick, 1000);
  }

  function pomodoroTick() {
    pomodoro.left--;
    if (pomodoro.left <= 0) {
      clearInterval(pomodoro.timer);
      pomodoro.timer = null;
      pomodoro.running = false;
      const finishedFocus = pomodoro.phase === 'focus';
      showAppNotification('DailyHub · Pomodoro', finishedFocus ? 'Ciclo de concentración terminado. Toca descansar 5 min.' : 'Descanso terminado. ¿Otra ronda de 25 min?');
      pomodoroSet(finishedFocus ? 5 : 25, finishedFocus ? 'break' : 'focus');
      return;
    }
    pomodoroDraw();
  }

  function pomodoroDraw() {
    const time = document.getElementById('pom-time');
    const phase = document.getElementById('pom-phase');
    const toggle = document.getElementById('pom-toggle');
    if (time) time.textContent = String(Math.floor(pomodoro.left / 60)).padStart(2, '0') + ':' + String(pomodoro.left % 60).padStart(2, '0');
    if (phase) {
      phase.textContent = pomodoro.phase === 'focus' ? 'Concentración' : 'Descanso';
      phase.style.color = pomodoro.phase === 'focus' ? 'var(--primary)' : 'var(--green)';
    }
    if (toggle) toggle.textContent = pomodoro.running ? 'Pausar' : 'Empezar';
  }

  function classNotesBody() {
    const wrap = h('div');
    wrap.append(classNotesCapture(drawList));
    const subjectChips = h('div', { class: 'chips' });
    function drawSubjectChips() {
      subjectChips.innerHTML = '';
      const options = [{ id: 'todas', label: 'Todas' }].concat((S.subjects || []).map(subject => ({ id: subject.id, label: subject.name })));
      if ((S.notes || []).some(note => !note.subjectId)) options.push({ id: 'sin', label: 'Sin asignatura' });
      for (const option of options) {
        subjectChips.append(h('button', {
          class: 'chip' + (ui.noteSubject === option.id ? ' on' : ''),
          onclick: () => { ui.noteSubject = option.id; drawSubjectChips(); drawList(); }
        }, option.label));
      }
    }
    const filters = ['todas', 'abiertas', 'importante'];
    const filterLabels = { todas: 'Todas', abiertas: 'Pendientes', importante: 'Importantes' };
    let classFilter = filterLabels[ui.noteState] ? ui.noteState : 'todas';
    const filterChips = h('div', { class: 'chips' });
    function drawFilterChips() {
      filterChips.innerHTML = '';
      for (const filter of filters) {
        filterChips.append(h('button', {
          class: 'chip' + (filter === classFilter ? ' on' : ''),
          onclick: () => { classFilter = filter; ui.noteState = filter; drawFilterChips(); drawList(); }
        }, filterLabels[filter]));
      }
    }
    drawFilterChips();
    drawSubjectChips();
    wrap.append(subjectChips, filterChips);
    const listWrap = h('div');

    function matchesFilter(note) {
      if (ui.noteSubject === 'sin') {
        if (note.subjectId) return false;
      } else if (ui.noteSubject !== 'todas' && note.subjectId !== ui.noteSubject) return false;
      if (classFilter === 'importante') return !!note.starred;
      if (classFilter === 'abiertas') return !note.done;
      return true;
    }

    function relativeDay(ymd) {
      const difference = Math.round((parseYmd(ymd) - parseYmd(todayStr())) / 86400000);
      if (difference === 0) return 'Hoy';
      if (difference === 1) return 'Mañana';
      if (difference === -1) return 'Ayer';
      return fmtLong(ymd);
    }

    function drawList() {
      listWrap.innerHTML = '';
      const notes = S.notes.filter(matchesFilter).sort((first, second) => first.date === second.date ? (first.done - second.done) : (first.date < second.date ? 1 : -1));
      if (!notes.length) {
        listWrap.append(emptyState('pencil', 'Nada por aquí', 'Escribe arriba y pulsa Enter para capturar en un segundo.'));
        return;
      }
      let currentDate = null;
      for (const note of notes) {
        if (note.date !== currentDate) {
          currentDate = note.date;
          const open = notes.filter(item => item.date === currentDate && !item.done).length;
          listWrap.append(
            h('div', { class: 'section-title', style: 'margin-top:6px' }, h('span', null, relativeDay(currentDate))),
            open ? h('span', { class: 'nav-badge', style: 'margin-left:6px' }, open) : null
          );
        }
        listWrap.append(noteCard(note, drawList));
      }
    }

    drawList();
    wrap.append(listWrap);
    return wrap;
  }

  function noteMenu(note, redraw) {
    closeOverlays();
    const done = () => { save(); if (redraw) redraw(); else render(); };
    const overlay = h('div', { class: 'overlay', style: 'z-index:60', onclick: event => { if (event.target === overlay) overlay.remove(); } });
    const subject = subjectById(note.subjectId);
    const sheet = h('div', { class: 'sheet', style: 'max-width:340px', role: 'menu' },
      h('button', { class: 'set-row', onclick: () => { overlay.remove(); note.starred = !note.starred; done(); } },
        h('span', { class: 'r-ic', html: icon('star', 17) }),
        h('span', null, note.starred ? 'Quitar de importante' : 'Marcar como importante')
      ),
      h('button', { class: 'set-row', onclick: () => {
        overlay.remove();
        pickSubject('Asignatura', selected => { note.subjectId = selected ? selected.id : null; done(); toast(selected ? 'Movido a ' + selected.name : 'Sin asignatura'); });
      } },
        h('span', { class: 'r-ic', style: 'background:var(--surface-2);color:var(--text-2)', html: icon('folder', 17) }),
        h('span', null, subject ? 'Asignatura: ' + subject.name : 'Asignar a una asignatura')
      ),
      h('button', { class: 'set-row', onclick: () => { overlay.remove(); noteToTask(note, redraw); } },
        h('span', { class: 'r-ic', html: icon('checksq', 17) }),
        h('span', null, 'Convertir en tarea')
      ),
      h('button', { class: 'set-row', onclick: () => { overlay.remove(); go('noteForm', { id: note.id }); } },
        h('span', { class: 'r-ic', html: icon('pencil', 17) }),
        h('span', null, 'Editar')
      ),
      h('button', { class: 'set-row', style: 'color:var(--danger)', onclick: () => {
        overlay.remove();
        confirmDialog({
          title: '¿Eliminar la nota?',
          message: note.text,
          confirmText: 'Eliminar',
          onConfirm: () => {
            const index = S.notes.indexOf(note);
            if (index < 0) return;
            const [removed] = S.notes.splice(index, 1);
            save();
            if (redraw) redraw();
            else render();
            toast('Nota eliminada', { label: 'Deshacer', fn: () => { S.notes.splice(Math.min(index, S.notes.length), 0, removed); save(); render(); } });
          }
        });
      } },
        h('span', { class: 'r-ic', html: icon('trash', 17) }),
        h('span', null, 'Eliminar')
      )
    );
    overlay.append(sheet);
    document.body.appendChild(overlay);
  }

  function noteToTask(note, redraw) {
    const task = { id: uid('t'), title: note.text, icon: 'checksq', cat: 'Personal', freq: { type: 'once', date: note.date || todayStr() }, time: '', completions: [], createdAt: todayStr() };
    S.tasks.push(task);
    const index = S.notes.indexOf(note);
    if (index >= 0) S.notes.splice(index, 1);
    save();
    if (redraw) redraw();
    else render();
    toast('Convertida en tarea', { label: 'Deshacer', fn: () => { S.tasks = S.tasks.filter(item => item.id !== task.id); if (index >= 0) S.notes.splice(Math.min(index, S.notes.length), 0, note); save(); render(); } });
  }

  function scrNoteForm() {
    const editing = route.params.id ? S.notes.find(note => note.id === route.params.id) : null;
    const back = () => {
      // Historial interno primero (p. ej. llegaste desde la ficha de asignatura);
      // si no, cae al sitio natural según de dónde venga el apunte.
      if (app.domain.routeStack.length) {
        app.domain.goBack();
        return;
      }
      if (route.params.subjectId) {
        go('subjectView', { id: route.params.subjectId }, { replace: true });
        return;
      }
      go('class', undefined, { replace: true });
    };
    const wrap = h('div');
    wrap.append(formHead(editing ? 'Editar nota' : 'Nueva nota', back,
      editing ? h('button', { class: 'icon-btn', 'aria-label': 'Eliminar nota', onclick: () => {
        confirmDialog({
          title: '¿Eliminar la nota?',
          message: editing.text,
          confirmText: 'Eliminar',
          onConfirm: () => {
            S.notes = S.notes.filter(note => note.id !== editing.id);
            save();
            back();
            toast('Nota eliminada');
          }
        });
      }, html: icon('trash', 18) }) : null
    ));
    const textInput = h('textarea', { class: 'input', rows: '4', placeholder: 'Ej. Traer la libreta de mates mañana', maxlength: '500' });
    if (editing) textInput.value = editing.text;
    wrap.append(h('div', { class: 'field' }, h('label', null, '¿Qué quieres apuntar?'), textInput));
    let kind = editing ? editing.kind : 'nota';
    const kindSegment = h('div', { class: 'seg', style: 'flex-wrap:wrap;margin-bottom:16px' });
    for (const option of noteKinds) {
      kindSegment.append(h('button', {
        class: kind === option.id ? 'on' : '',
        onclick: event => {
          kind = option.id;
          [...kindSegment.children].forEach(item => item.classList.remove('on'));
          event.currentTarget.classList.add('on');
        }
      }, option.label));
    }
    wrap.append(h('p', { class: 'big-q' }, 'Tipo'), kindSegment);
    let preselectedSubject = editing ? (editing.subjectId || '') : (route.params.subjectId || (activeSession() ? activeSession().subjectId || '' : ''));
    if (preselectedSubject && !subjectById(preselectedSubject)) preselectedSubject = '';
    const subjectSelect = h('select', { class: 'input' },
      h('option', { value: '', selected: !preselectedSubject }, 'Sin asignatura'),
      (S.subjects || []).map(subject => h('option', { value: subject.id, selected: subject.id === preselectedSubject }, subject.name))
    );
    wrap.append(h('div', { class: 'field' }, h('label', null, 'Asignatura (opcional)'), subjectSelect));
    const dateInput = h('input', { class: 'input', type: 'date', value: editing ? editing.date : todayStr() });
    wrap.append(h('p', { class: 'big-q' }, '¿De qué día es?'), h('div', { class: 'field' }, dateInput));
    const timeInput = h('input', { class: 'input', type: 'time', value: editing ? (editing.time || '') : '' });
    wrap.append(h('div', { class: 'field' }, h('label', null, 'Hora (opcional)'), timeInput));
    let starred = editing ? !!editing.starred : false;
    const starButton = h('button', {
      class: 'btn btn-soft btn-block',
      style: 'margin-top:6px' + (starred ? ';color:var(--amber);border-color:var(--amber-border)' : ''),
      onclick: event => {
        starred = !starred;
        event.currentTarget.style.color = starred ? 'var(--amber)' : '';
        event.currentTarget.style.borderColor = starred ? 'var(--amber-border)' : '';
        event.currentTarget.lastChild.textContent = starred ? ' Importante' : ' Marcar como importante';
      }
    }, h('span', { class: 'ic', html: icon('star', 16) }), starred ? ' Importante' : ' Marcar como importante');
    wrap.append(starButton);
    wrap.append(h('button', {
      class: 'btn btn-primary btn-block btn-lg',
      style: 'margin-top:12px',
      onclick: () => {
        const text = textInput.value.trim();
        if (!text) {
          textInput.focus();
          toast('Escribe algo primero');
          return;
        }
        const data = { text, kind, date: dateInput.value || todayStr(), time: timeInput.value || '', starred, subjectId: subjectSelect.value || null };
        if (editing) Object.assign(editing, data);
        else S.notes.unshift({ id: uid(), done: false, sessionId: activeSession() ? activeSession().id : null, createdAt: new Date().toISOString(), ...data });
        save();
        back();
        toast(editing ? 'Nota actualizada' : 'Nota apuntada');
      }
    }, editing ? 'Guardar cambios' : 'Apuntar'));
    const submitButton = wrap.querySelector('.btn-primary');
    if (submitButton) {
      [dateInput, timeInput].forEach(input => input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submitButton.click();
        }
      }));
    }
    return wrap;
  }

  function scrClassSubjects() {
    const wrap = h('div');
    const subjects = S.subjects || [];
    wrap.append(formHead('Asignaturas', app.components.smartBack('class'),
      h('button', { class: 'icon-btn', 'aria-label': 'Nueva asignatura', onclick: () => go('subjectForm'), html: icon('plus', 20) })
    ));
    wrap.append(app.class.subjectsGrid());
    return wrap;
  }

  function scrSubjectForm() {
    const editing = route.params.id ? subjectById(route.params.id) : null;
    const back = app.components.smartBack('classSubjects');
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
      const choices = showingAll ? ICON_CHOICES : ICON_CHOICES.filter(item => subjectIconsQuick.includes(item.id));
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
    confirmDialog({
      title: '¿Eliminar «' + subject.name + '»?',
      message: 'Se quitará esta asignatura' + (slotsOfSubject(subject.id).length ? (slotsOfSubject(subject.id).length === 1 ? ' y su clase del horario' : ' y sus ' + slotsOfSubject(subject.id).length + ' clases del horario') : '') + '. Sus apuntes no se borran: pasarán a «Sin asignatura». Podrás deshacerlo unos segundos desde el aviso.',
      confirmText: 'Eliminar',
      onConfirm: () => {
        const index = S.subjects.findIndex(item => item.id === subject.id);
        if (index < 0) return;
        const [removed] = S.subjects.splice(index, 1);
        const touched = (S.notes || []).filter(note => note.subjectId === subject.id);
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

  Object.assign(app.class, {
    noteCard,
    classNotesCapture,
    pomodoroCard,
    classNotesBody,
    noteMenu,
    noteToTask,
    scrNoteForm,
    scrClassSubjects,
    scrSubjectForm,
    deleteSubject
  });
}
