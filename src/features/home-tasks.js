export function registerHomeAndTasks(app) {
  const {
    $,
    h,
    icon,
    avatarEl,
    cap,
    toYmd,
    todayStr,
    parseYmd,
    addDaysYmd,
    weekStartOf,
    fmtLong,
    fmtShort,
    fmtRange,
    WEEK_L
  } = app.core;
  const { S, save } = app.state;
  const {
    ui,
    go,
    currentProfile,
    birthdaysToday,
    tasksDueOn,
    isDoneOn,
    toggleOn,
    categories,
    freqText,
    isDueOn,
    streakOf,
    weekStats,
    sortedUpcomingGifts,
    countdownTxt,
    statusCls
  } = app.domain;
  const { headBar, searchBtn, emptyState } = app.components;
  const {
    classNow,
    classNext,
    subjectById,
    activeSession,
    leftTxt,
    inTxt
  } = app.class;

  function giftThumb(gift) {
    const thumb = h('div', { class: 'gift-thumb' });
    if (gift.image) {
      const image = h('img', { src: gift.image, alt: '' });
      image.onerror = () => {
        image.remove();
        thumb.innerHTML = icon('gift', 20);
      };
      thumb.append(image);
    } else {
      thumb.innerHTML = icon('gift', 20);
    }
    return thumb;
  }

  function scrHome() {
    const profile = currentProfile();
    const hour = new Date().getHours();
    const greeting = hour >= 5 && hour < 16 ? 'Buenos días' : hour >= 16 && hour < 20 ? 'Buenas tardes' : 'Buenas noches';
    const wrap = h('div');
    wrap.append(headBar(greeting + ', ' + profile.name, cap(fmtLong(todayStr())),
      searchBtn(),
      h('button', { class: 'icon-btn', 'aria-label': 'Qué toca ahora', onclick: () => go('now'), html: icon('clock', 20) }),
      h('button', { 'aria-label': 'Tu perfil', onclick: () => go('profile'), style: 'border-radius:50%' }, avatarEl(profile.name, profile.color, 40, profile.photo))
    ));

    for (const person of birthdaysToday()) {
      wrap.append(h('div', { class: 'banner' },
        h('span', { class: 'b-ic', html: icon('cake', 20) }),
        h('div', null, h('b', null, 'Hoy es el cumpleaños de ' + person.name), h('span', null, 'Echa un vistazo a tus ideas para ' + person.name)),
        h('button', { onclick: () => go('person', { id: person.id }) }, 'Ver regalos')
      ));
    }

    const due = tasksDueOn(todayStr()).slice().sort((first, second) =>
      (Number(second.priority) || 0) - (Number(first.priority) || 0) ||
      (first.dueDate || '9999-99-99').localeCompare(second.dueDate || '9999-99-99') ||
      (first.time || '99:99').localeCompare(second.time || '99:99'));
    const done = due.filter(task => isDoneOn(task, todayStr())).length;
    const percentage = due.length ? Math.round(done / due.length * 100) : 0;
    wrap.append(h('button', {
      class: 'home-day-summary',
      type: 'button',
      'aria-label': 'Ver progreso: ' + done + ' de ' + due.length + ' actividades completadas hoy',
      onclick: () => go('progress')
    },
      h('span', { class: 'home-day-summary-icon', html: icon('check', 18) }),
      h('span', { class: 'home-day-summary-copy' },
        h('b', null, due.length ? 'Tienes ' + due.length + ' cosas para hoy' : 'Tu día está despejado'),
        h('span', null, due.length ? '¡Vamos a por ello!' : 'Disfruta el tiempo libre')
      ),
      h('span', { class: 'home-day-summary-count', style: '--day-progress:' + percentage + '%' },
        h('b', null, done + '/' + due.length)
      )
    ));

    const openNotes = (S.notes || []).filter(note => !note.done && !note.deletedAt).length;
    const inboxCount = (S.inbox || []).length;
    const liveNow = classNow();
    const liveNext = classNext();
    const liveSubject = subjectById((activeSession() || {}).subjectId);
    const classLine = activeSession()
      ? ((liveSubject ? liveSubject.name : 'Clase sin asignatura') + ' · clase activa')
      : liveNow
        ? ('Ahora: ' + ((subjectById(liveNow.subjectId) || {}).name || 'clase') + ' · ' + leftTxt(liveNow))
        : liveNext
          ? ('Después: ' + ((subjectById(liveNext.subjectId) || {}).name || 'clase') + ' · ' + inTxt(liveNext))
          : inboxCount
            ? inboxCount + ' en Para después'
            : openNotes
              ? openNotes + ' apunte' + (openNotes > 1 ? 's' : '') + ' sin terminar'
              : 'Apunta algo rápido';

    wrap.append(h('div', { class: 'section-title home-section-title' }, h('span', null, 'Para hoy')));
    let list = due;
    if (S.settings.hideCompleted) list = list.filter(task => !isDoneOn(task, todayStr()));
    if (!due.length) {
      wrap.append(emptyState('check', 'Todo despejado', 'Hoy no tienes tareas programadas. Añade una nueva o descansa.', 'Nueva tarea', () => go('taskForm')));
    } else {
      const grid = h('div', { class: 'activity-card-list home-habit-list' });
      for (const task of list) grid.append(taskActivityCard(task, todayStr(), { home: true }));
      wrap.append(grid);
    }

    wrap.append(h('button', {
      class: 'card home-class-link',
      type: 'button',
      onclick: () => go('class')
    },
      h('span', { class: 'r-ic', html: icon('pencil', 19) }),
      h('span', { class: 'home-class-copy' }, h('b', null, 'Modo Clase'), h('span', null, classLine)),
      (inboxCount || openNotes) ? h('span', { class: 'nav-badge' }, inboxCount || openNotes) : h('span', { class: 'chev', html: icon('chev', 16) })
    ));
    addSwipe(wrap, () => go('class'));

    const gifts = sortedUpcomingGifts();
    wrap.append(h('div', { class: 'section-title' },
      h('span', null, 'Próximos regalos'),
      gifts.length ? h('button', { class: 'link', onclick: () => go('gifts') }, 'Ver todo') : null
    ));
    if (!gifts.length) {
      wrap.append(emptyState('gift', 'Sin ideas todavía', 'Guarda regalos e ideas para tus personas favoritas con precio y fecha.', 'Añadir regalo', () => go('giftForm')));
    } else {
      const column = h('div');
      for (const gift of gifts.slice(0, 4)) {
        const person = S.people.find(item => item.id === gift.personId);
        column.append(h('div', { class: 'gift-row', style: 'cursor:pointer', onclick: () => go('giftForm', { id: gift.id }) },
          giftThumb(gift),
          h('div', { style: 'min-width:0;flex:1' },
            h('b', { style: 'font-size:14px;font-weight:600;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, gift.title),
            h('span', { class: 'r-sub' }, (person ? person.name : 'Sin asignar') + (gift.targetDate ? ' · ' + fmtShort(gift.targetDate) + countdownTxt(gift.targetDate) : ''))
          ),
          h('span', { class: 'stchip ' + statusCls(gift.status) }, gift.status)
        ));
      }
      wrap.append(column);
    }
    return wrap;
  }

  function taskViewSegment() {
    // Cada botón fija su vista. Al salir del resumen se vuelve al periodo
    // actual, para no aparecer en otra semana/mes/año al regresar.
    const pick = view => () => {
      ui.tasksView = view;
      if (view !== 'stats') ui.statsOffset = 0;
      go('tasks');
    };
    return h('div', { class: 'seg', style: 'margin-bottom:18px' },
      h('button', { class: ui.tasksView === 'lista' ? 'on' : '', onclick: pick('lista') }, 'Lista'),
      h('button', { class: ui.tasksView === 'semana' ? 'on' : '', onclick: pick('semana') }, 'Semana'),
      h('button', { class: ui.tasksView === 'cal' ? 'on' : '', onclick: pick('cal') }, 'Calendario'),
      h('button', { class: ui.tasksView === 'stats' ? 'on' : '', onclick: pick('stats') }, 'Resumen')
    );
  }

  function applyTaskGesture(task, ymd, direction, refresh) {
    if (!isDueOn(task, ymd)) return;
    const kind = app.core.kindOf(task);
    const progress = app.core.progressOn(task, ymd);
    const skipped = app.core.isSkipped(task, ymd);
    if (skipped) {
      if (direction < 0) return;
      app.core.skipOn(task, ymd, false);
    } else if (kind === 'avoid') {
      if (direction > 0 && app.core.isDoneOn(task, ymd)) {
        app.components.confirmDialog({
          title: '¿Marcar como fallado?',
          message: 'Hoy dejará de contar como un día limpio.',
          confirmText: 'Marcar fallo',
          onConfirm: () => {
            app.core.toggleOn(task, ymd);
            task.updatedAt = Date.now();
            save();
            if (refresh) refresh(); else app.domain.render();
          }
        });
        return;
      }
      if (direction < 0 && !app.core.isDoneOn(task, ymd)) app.core.toggleOn(task, ymd);
    } else if (kind === 'count' || kind === 'amount') {
      const step = kind === 'count' ? 1 : (progress.target && progress.target >= 20 ? 5 : 1);
      app.core.bumpOn(task, ymd, direction > 0 ? step : -step);
    } else {
      const done = app.core.isDoneOn(task, ymd);
      if ((direction > 0 && !done) || (direction < 0 && done)) app.core.toggleOn(task, ymd);
    }
    task.updatedAt = Date.now();
    save();
    if (refresh) refresh(); else app.domain.render();
  }

  function attachTaskGestures(card, task, ymd, refresh) {
    let start = null;
    let axis = null;
    const interactive = target => target && target.closest && target.closest('button,a,input,select,textarea,[data-no-card-gesture]');
    card.addEventListener('touchstart', event => {
      if (event.touches.length !== 1 || interactive(event.target)) { start = null; return; }
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY, handled: false };
      axis = null;
    }, { passive: true });
    card.addEventListener('touchmove', event => {
      if (!start || event.touches.length !== 1) return;
      const dx = event.touches[0].clientX - start.x;
      const dy = event.touches[0].clientY - start.y;
      if (!axis && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) axis = Math.abs(dx) > Math.abs(dy) * 1.35 ? 'x' : 'y';
      if (axis === 'x') {
        start.handled = true;
        if (event.cancelable) event.preventDefault();
        card.classList.add('swiping');
        card.dataset.swipeDirection = dx < 0 ? 'left' : 'right';
      }
    }, { passive: false });
    const finish = event => {
      if (!start) return;
      const dx = (event.changedTouches[0] ? event.changedTouches[0].clientX : start.x) - start.x;
      const dy = (event.changedTouches[0] ? event.changedTouches[0].clientY : start.y) - start.y;
      const shouldApply = axis === 'x' && Math.abs(dx) >= 54 && Math.abs(dx) > Math.abs(dy) * 1.35;
      start = null;
      card.classList.remove('swiping');
      card.dataset.swipeDirection = '';
      if (shouldApply) applyTaskGesture(task, ymd, dx > 0 ? 1 : -1, refresh);
    };
    card.addEventListener('touchend', finish, { passive: true });
    card.addEventListener('touchcancel', finish, { passive: true });
    card.addEventListener('keydown', event => {
      if (event.target !== card || event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      applyTaskGesture(task, ymd, event.key === 'ArrowRight' ? 1 : -1, refresh);
    });
  }

  function taskActivityCard(task, ymd, options) {
    const cardOptions = options || {};
    const isHomeCard = !!cardOptions.home;
    const kind = app.core.kindOf(task);
    const due = isDueOn(task, ymd);
    const skipped = app.core.isSkipped(task, ymd);
    const done = isDoneOn(task, ymd);
    const avoid = kind === 'avoid';
    const steps = Array.isArray(task.steps) ? task.steps.filter(step => step && String(step.title || '').trim()) : [];
    const markedSteps = steps.filter(step => app.features.stepDoneOn(step, ymd)).length;
    const legacyDone = kind === 'check' && done && steps.length && !steps.some(step => Array.isArray(step.completedOn) && step.completedOn.includes(ymd));
    const stepCount = legacyDone ? steps.length : markedSteps;
    const priority = app.features.priorityInfo(task);
    let card;
    const control = steps.length && kind === 'check'
      ? null
      : app.features.taskControl(task, ymd);
    const refreshCard = () => {
      const updated = taskActivityCard(task, ymd, cardOptions);
      card.replaceWith(updated);
      card = updated;
    };
    const status = skipped ? 'Hoy saltado' : !due ? 'No toca hoy' : done ? (avoid ? 'Día limpio' : 'Completada') : avoid ? 'Registrar fallo' : 'Pendiente';
    const open = () => {
      if (steps.length) app.features.guidedTaskSheet(task, ymd, refreshCard);
      else if (kind === 'check' || avoid) {
        if (control && !control.disabled) control.click();
      } else app.features.routineSheet(task);
    };
    card = h('article', {
      'data-task-id': task.id,
      class: 'activity-card' + (isHomeCard ? ' home-activity-card' : '') + (done && !avoid ? ' is-done' : '') + (skipped ? ' is-skipped' : '') + (priority ? ' has-priority' : ''),
      tabindex: '0',
      'aria-label': task.title + ' · ' + status,
      style: 'border-left:3px solid ' + (priority ? priority.color : done && !avoid ? 'var(--green)' : 'var(--primary)')
    });
    attachTaskGestures(card, task, ymd, refreshCard);
    const firstImage = steps.find(step => step.image);
    card.append(h('div', { class: 'activity-card-head' },
      h('button', { class: 'activity-card-main', type: 'button', onclick: open, 'aria-label': (steps.length ? 'Abrir actividad ' : 'Registrar ') + task.title },
        isHomeCard ? h('span', { class: 'activity-icon home-activity-art' }, firstImage
          ? h('img', { src: firstImage.image, alt: '' })
          : h('span', { html: icon(task.icon || 'star', 34), 'aria-hidden': 'true' }))
          : h('span', { class: 'activity-icon', html: icon(task.icon || 'star', 22) }),
        h('span', { class: 'activity-copy' },
          h('b', null, task.title),
          h('span', { class: 'activity-subtitle' }, (task.cat || 'Personal') + ' · ' + app.core.freqText(task)),
          steps.length ? h('span', { class: 'activity-step-summary' }, stepCount + ' de ' + steps.length + ' pasos') : null
        )
      ),
      h('button', { class: 'icon-btn activity-edit', type: 'button', 'aria-label': 'Editar ' + task.title, onclick: () => go('taskForm', { id: task.id }), html: icon('edit', 16) }),
      control
    ));
    const directionLabel = skipped ? 'desliza a la derecha para restaurar' : avoid ? 'desliza a la derecha para marcar fallo' : (kind === 'count' || kind === 'amount') ? 'desliza a derecha o izquierda para ajustar' : done ? 'desliza a la izquierda para deshacer' : 'desliza a la derecha para completar';
    card.append(h('span', { class: 'activity-swipe-hint' }, 'Desliza ' + directionLabel));
    if (isHomeCard ? due : due && !steps.length && (kind === 'check' || avoid)) {
      card.append(h('button', { class: 'activity-card-quick-action', type: 'button', onclick: open },
        isHomeCard ? (steps.length ? (stepCount ? 'Continuar →' : 'Empezar →') : kind === 'check' || avoid ? (done ? (avoid ? 'Día limpio ✓' : 'Hecho ✓') : (avoid ? 'Marcar fallo' : 'Hecho')) : 'Abrir →')
          : done ? (avoid ? 'Día limpio ✓' : 'Hecho ✓') : (avoid ? 'Marcar fallo' : 'Hecho')));
    }
    const goal = app.features.goalBar(task);
    if (goal) card.append(h('div', { class: 'activity-card-goal', style: 'padding:8px 4px 0' }, goal));
    // El pie solo aparece si dice algo o si ofrece la acción de pasos: con la
    // tarjeta simplemente pendiente, el círculo del control ya lo dice todo y
    // una fila con solo el lápiz quedaba vacía. Editar vive arriba, en la
    // cabecera, junto al resto de acciones de la tarjeta.
    if (status !== 'Pendiente' || steps.length) {
      card.append(h('div', { class: 'activity-card-footer' },
        status !== 'Pendiente' ? h('span', { class: 'activity-state' + (done && !avoid ? ' positive' : skipped ? ' muted' : '') },
          h('span', { class: 'activity-state-dot' }), status
        ) : null,
        steps.length ? h('button', {
          class: 'btn ' + (done ? 'btn-soft' : 'btn-primary'),
          type: 'button',
          disabled: !due || skipped,
          onclick: () => app.features.guidedTaskSheet(task, ymd, refreshCard)
        }, done ? 'Revisar pasos' : stepCount ? 'Continuar' : 'Empezar') : null
      ));
    }
    return card;
  }

  function scrTasks() {
    if (ui.tasksView === 'stats') return scrTaskStats();
    if (ui.tasksView !== 'lista') return scrWeek();
    const wrap = h('div');
    const today = todayStr();
    const dueToday = tasksDueOn(today);
    const completedToday = dueToday.filter(task => isDoneOn(task, today)).length;
    wrap.append(headBar('Actividades', completedToday + ' de ' + dueToday.length + ' completadas hoy', searchBtn(),
      h('button', { class: 'icon-btn', 'aria-label': 'Ver resumen de actividad', onclick: () => { ui.tasksView = 'stats'; ui.statsOffset = 0; go('tasks'); }, html: icon('chart', 19) }),
      h('button', { class: 'icon-btn', 'aria-label': 'Nueva actividad', onclick: () => go('taskForm'), html: icon('plus', 20) })
    ));
    ui.tasksFilter = ui.tasksFilter === 'todas' ? 'todas' : 'hoy';
    const chips = h('div', { class: 'chips' });
    const listWrap = h('div');
    const drawList = () => {
      chips.innerHTML = '';
      for (const [filter, label] of [['hoy', 'Para hoy'], ['todas', 'Todas']]) {
        chips.append(h('button', {
          class: 'chip' + (ui.tasksFilter === filter ? ' on' : ''),
          'aria-pressed': ui.tasksFilter === filter ? 'true' : 'false',
          onclick: () => { ui.tasksFilter = filter; drawList(); }
        }, label));
      }
      listWrap.innerHTML = '';
      const tasks = (ui.tasksFilter === 'hoy' ? dueToday : [...S.tasks]).slice().sort((first, second) =>
        (Number(second.priority) || 0) - (Number(first.priority) || 0) ||
        (first.time || '99:99').localeCompare(second.time || '99:99') ||
        (first.title || '').localeCompare(second.title || '', 'es'));
      if (!tasks.length) {
        listWrap.append(emptyState('spark', ui.tasksFilter === 'hoy' ? 'Día despejado' : 'Aún no hay actividades',
          ui.tasksFilter === 'hoy' ? 'No tienes actividades previstas para hoy.' : 'Crea tu primer hábito o actividad guiada y personalízala a tu manera.',
          'Nueva actividad', () => go('taskForm')));
        return;
      }
      listWrap.append(h('div', { class: 'activity-card-list' }, tasks.map(task => taskActivityCard(task, today))));
    };
    wrap.append(chips, listWrap);
    drawList();
    return wrap;
  }

  function addSwipe(element, onLeft, onRight) {
    let startX = null;
    let startY = null;
    element.addEventListener('touchstart', event => {
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    }, { passive: true });
    element.addEventListener('touchend', event => {
      if (startX === null) return;
      const deltaX = event.changedTouches[0].clientX - startX;
      const deltaY = event.changedTouches[0].clientY - startY;
      if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
        if (deltaX < 0) onLeft();
        else if (onRight) onRight();
      }
      startX = null;
    }, { passive: true });
  }

  function scrWeek() {
    const wrap = h('div');
    const today = todayStr();
    const start = addDaysYmd(weekStartOf(today), ui.weekOffset * 7);
    const segment = taskViewSegment();
    if (ui.tasksView === 'cal') {
      wrap.append(headBar('Calendario', 'Consulta cualquier día del mes', searchBtn(),
        h('button', { class: 'icon-btn', 'aria-label': 'Nueva tarea', onclick: () => go('taskForm'), html: icon('plus', 20) })
      ));
      wrap.append(segment);
      if (!ui.calYM) {
        const date = parseYmd(today);
        ui.calYM = { y: date.getFullYear(), m: date.getMonth() };
      }
      if (!ui.calSel) ui.calSel = today;
      wrap.append(calendarCard());
      wrap.append(h('div', { class: 'section-title' }, h('span', null, fmtLong(ui.calSel))));
      wrap.append(dayTaskList(ui.calSel, true));
      addSwipe(wrap, () => setCalendarMonth(1), () => setCalendarMonth(-1));
      return wrap;
    }

    wrap.append(headBar('Esta semana', fmtRange(start, addDaysYmd(start, 6)), searchBtn(),
      h('button', { class: 'icon-btn', 'aria-label': 'Nueva tarea', onclick: () => go('taskForm'), html: icon('plus', 20) })
    ));
    wrap.append(segment);
    const days = h('div', { class: 'day-chips', style: 'margin-top:18px' });
    for (let index = 0; index < 7; index++) {
      const ymd = addDaysYmd(start, index);
      days.append(h('button', {
        class: 'day-chip' + (ui.weekSel === index ? ' on' : '') + (ymd === today ? ' today' : ''),
        onclick: event => {
          ui.weekSel = index;
          [...days.children].forEach(item => item.classList.remove('on'));
          event.currentTarget.classList.add('on');
          refreshDay();
        }
      }, h('span', { class: 'dl' }, WEEK_L[index]), h('span', { class: 'dn' }, parseYmd(ymd).getDate())));
    }
    wrap.append(days);
    const stats = weekStats(ui.weekOffset, true);
    const currentDone = weekStats(ui.weekOffset).done;
    const percentage = stats.due ? Math.round(currentDone / stats.due * 100) : 0;
    wrap.append(h('div', { class: 'card', style: 'margin-bottom:20px' },
      h('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px' },
        h('b', { style: 'font-size:14px' }, stats.due === 1 ? '1 tarea esta semana' : stats.due + ' tareas esta semana'),
        h('span', { style: 'font-size:13px;color:var(--text-2);font-weight:600' }, (currentDone === 1 ? '1 completada' : currentDone + ' completadas') + (stats.due ? ' · ' + Math.round(currentDone / stats.due * 100) + '%' : ''))
      ),
      h('div', { class: 'bar' }, h('i', { style: 'width:' + percentage + '%' }))
    ));
    const selectedYmd = addDaysYmd(start, ui.weekSel);
    const title = h('div', { class: 'section-title' }, h('span', null, cap(parseYmd(selectedYmd).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }))));
    wrap.append(title);
    const listHolder = h('div');
    wrap.append(listHolder);

    function refreshDay() {
      const ymd = addDaysYmd(addDaysYmd(weekStartOf(today), ui.weekOffset * 7), ui.weekSel);
      title.innerHTML = '';
      title.append(h('span', null, cap(parseYmd(ymd).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }))));
      listHolder.innerHTML = '';
      listHolder.append(dayTaskList(ymd, true));
    }

    refreshDay();
    addSwipe(wrap, () => { ui.weekOffset++; go('tasks'); }, () => { ui.weekOffset--; go('tasks'); });
    return wrap;
  }

  function dayTaskList(ymd, allowToggle) {
    const due = [...tasksDueOn(ymd)].sort((first, second) =>
      (first.time || '99:99').localeCompare(second.time || '99:99') ||
      (Number(second.priority) || 0) - (Number(first.priority) || 0) ||
      (first.dueDate || '9999-99-99').localeCompare(second.dueDate || '9999-99-99'));
    if (!due.length) return emptyState('calendar', 'Sin tareas', 'No hay nada programado para este día.', 'Añadir tarea', () => go('taskForm'));
    const column = h('div');
    for (const task of due) {
      const done = isDoneOn(task, ymd);
      const avoid = app.core.kindOf(task) === 'avoid';
      const skipped = app.core.isSkipped(task, ymd);
      const control = allowToggle ? app.features.taskControl(task, ymd) : null;
      const activateControl = () => {
        if (!control) return;
        const button = control.tagName === 'BUTTON' ? control : control.querySelector('.counter-val');
        if (button && !button.disabled) button.click();
      };
      column.append(h('div', { class: 'row' },
        control || h('span', { class: 'row-check' + (done && !avoid ? ' done' : '') + (!done && avoid && !skipped ? ' failed' : '') + (skipped ? ' skipped' : ''), style: 'flex:none' }),
        h('div', { style: 'flex:1;min-width:0' + (allowToggle ? ';cursor:pointer' : ''), ...(allowToggle ? { onclick: activateControl } : {}) },
          h('b', { style: done ? 'color:var(--text-2)' : '' }, task.title),
          h('span', { class: 'r-sub' }, (task.time ? task.time + ' · ' : '') + (task.cat || 'Otros'))
        ),
        h('span', { class: 'r-ic', html: icon(task.icon || 'star', 19) })
      ));
    }
    return column;
  }

  function setCalendarMonth(amount) {
    const base = ui.calYM || (() => {
      const date = parseYmd(todayStr());
      return { y: date.getFullYear(), m: date.getMonth() };
    })();
    let month = base.m + amount;
    let year = base.y;
    if (month < 0) {
      month = 11;
      year--;
    }
    if (month > 11) {
      month = 0;
      year++;
    }
    ui.calYM = { y: year, m: month };
    ui.tasksView = 'cal';
    go('tasks');
  }

  function calendarCard() {
    const { y, m } = ui.calYM;
    const monthName = cap(new Date(y, m, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }));
    const first = new Date(y, m, 1);
    const lead = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const grid = h('div', { class: 'cal-grid' });
    for (const label of WEEK_L) grid.append(h('span', { class: 'wd' }, label));
    for (let index = 0; index < lead; index++) grid.append(h('span'));
    for (let day = 1; day <= daysInMonth; day++) {
      const ymd = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      const hasTasks = tasksDueOn(ymd).length > 0;
      grid.append(h('button', {
        class: 'cal-day' + (ymd === ui.calSel ? ' sel' : '') + (ymd === todayStr() ? ' today' : ''),
        onclick: event => {
          ui.calSel = ymd;
          [...grid.querySelectorAll('.cal-day')].forEach(item => item.classList.remove('sel'));
          event.currentTarget.classList.add('sel');
          const zone = $('#calDayZone');
          if (zone) {
            zone.innerHTML = '';
            zone.append(h('div', { class: 'section-title' }, h('span', null, fmtLong(ymd))));
            zone.append(dayTaskList(ymd, true));
          }
        }
      }, String(day), hasTasks ? h('span', { class: 'dt' }) : null));
    }
    return h('div', { class: 'cal' },
      h('div', { class: 'cal-head' },
        h('button', { class: 'icon-btn', style: 'width:34px;height:34px', 'aria-label': 'Mes anterior', onclick: () => setCalendarMonth(-1), html: icon('back', 17) }),
        h('b', null, monthName),
        h('button', { class: 'icon-btn', style: 'width:34px;height:34px', 'aria-label': 'Mes siguiente', onclick: () => setCalendarMonth(1), html: icon('chev', 17) }),
        h('button', { class: 'link', style: 'font-size:12.5px;font-weight:700;margin-left:4px', onclick: () => { const date = parseYmd(todayStr()); ui.calYM = { y: date.getFullYear(), m: date.getMonth() }; ui.calSel = todayStr(); ui.tasksView = 'cal'; go('tasks'); } }, 'Hoy')
      ),
      grid
    );
  }

  /* --- Estadísticas de tareas: semana, mes y año -------------------------- */

  const STAT_PERIODS = [
    { id: 'semana', label: 'Semana' },
    { id: 'mes', label: 'Mes' },
    { id: 'anio', label: 'Año' },
    { id: '30d', label: '30 días' },
    { id: '90d', label: '90 días' }
  ];

  // Rango de fechas del periodo. La unidad del desplazamiento es la semana, el
  // mes o el año según el periodo, así que los periodos anteriores se obtienen
  // con el mismo cálculo usando offset - 1.
  function statsRange(period, offset) {
    const today = todayStr();
    if (period === 'semana') {
      const start = addDaysYmd(weekStartOf(today), offset * 7);
      return { start, end: addDaysYmd(start, 6) };
    }
    if (period === '30d' || period === '90d') {
      const length = period === '30d' ? 30 : 90;
      const end = addDaysYmd(today, offset * length);
      return { start: addDaysYmd(end, -(length - 1)), end };
    }
    const date = parseYmd(today);
    if (period === 'mes') {
      return {
        start: toYmd(new Date(date.getFullYear(), date.getMonth() + offset, 1)),
        end: toYmd(new Date(date.getFullYear(), date.getMonth() + offset + 1, 0))
      };
    }
    const year = date.getFullYear() + offset;
    return { start: year + '-01-01', end: year + '-12-31' };
  }

  function statsLabel(period, range) {
    if (period === 'semana' || period === '30d' || period === '90d') return fmtRange(range.start, range.end);
    if (period === 'mes') return cap(parseYmd(range.start).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }));
    return range.start.slice(0, 4);
  }

  const prevPeriodName = period => period === 'semana' ? 'la semana anterior' : period === 'mes' ? 'el mes anterior' : 'el año anterior';

  // Una tarea sólo cuenta desde el día en que se creó. Sin esto, consultar un
  // año pasado antes de tener la app mostraría cientos de tareas "incumplidas".
  const taskStartsOn = task => (task.createdAt ? String(task.createdAt).slice(0, 10) : null);

  // Recuento día a día del periodo. Los días futuros se guardan para el gráfico
  // pero no suman al porcentaje: no penaliza lo que todavía no ha ocurrido.
  function statsTally(start, end) {
    const today = todayStr();
    const days = [];
    let due = 0;
    let done = 0;
    for (let ymd = start; ymd <= end; ymd = addDaysYmd(ymd, 1)) {
      let planned = 0;
      let finished = 0;
      for (const task of S.tasks) {
        const since = taskStartsOn(task);
        if (since && ymd < since) continue;
        if (!isDueOn(task, ymd)) continue;
        planned++;
        if (isDoneOn(task, ymd)) finished++;
      }
      const future = ymd > today;
      if (!future) {
        due += planned;
        done += finished;
      }
      days.push({ ymd, due: planned, done: finished, future });
    }
    return { days, due, done, pct: due ? Math.round(done / due * 100) : 0 };
  }

  // Agrupa los días del periodo en columnas: una por día (semana), una por
  // semana (mes) o una por mes (año).
  function statsBuckets(period, days) {
    const make = (label, entries) => {
      const total = entries.reduce((sum, entry) => sum + entry.due, 0);
      const finished = entries.reduce((sum, entry) => sum + entry.done, 0);
      return {
        label,
        due: total,
        done: finished,
        pct: total ? Math.round(finished / total * 100) : 0,
        future: entries.every(entry => entry.future)
      };
    };
    if (period === 'semana') return days.map((day, index) => make(WEEK_L[index], [day]));
    if (period === 'mes' || period === '30d' || period === '90d') {
      const buckets = [];
      for (let index = 0; index < days.length; index += 7) {
        buckets.push(make('S' + (buckets.length + 1), days.slice(index, index + 7)));
      }
      return buckets;
    }
    const byMonth = new Map();
    for (const day of days) {
      const key = day.ymd.slice(0, 7);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key).push(day);
    }
    return [...byMonth.entries()].map(([key, entries]) =>
      make(parseYmd(key + '-01').toLocaleDateString('es-ES', { month: 'short' }).slice(0, 3), entries));
  }

  // Desglose por tarea: sólo cuenta los días ya transcurridos en los que la
  // tarea estaba prevista y ya existía.
  function statsPerTask(days) {
    return S.tasks.map(task => {
      const since = taskStartsOn(task);
      let due = 0;
      let done = 0;
      for (const day of days) {
        if (day.future || !isDueOn(task, day.ymd)) continue;
        if (since && day.ymd < since) continue;
        due++;
        if (isDoneOn(task, day.ymd)) done++;
      }
      return { task, due, done, pct: due ? Math.round(done / due * 100) : 0 };
    }).filter(entry => entry.due > 0).sort((first, second) => second.due - first.due || first.pct - second.pct);
  }

  const statsCard = (value, label) => h('div', { class: 'card', style: 'text-align:center' },
    h('div', { class: 'stat-big', style: 'font-size:26px;color:var(--text)' }, String(value)),
    h('p', { style: 'font-size:12px;color:var(--text-2);margin-top:4px' }, label)
  );

  function statsNav(period) {
    const move = amount => () => { ui.statsOffset += amount; go('tasks'); };
    // No se puede avanzar hacia periodos que todavía no han empezado.
    const canGoNext = statsRange(period, ui.statsOffset + 1).start <= todayStr();
    return h('div', { class: 'period-nav' },
      h('button', { class: 'icon-btn', style: 'width:34px;height:34px', 'aria-label': 'Periodo anterior', onclick: move(-1), html: icon('back', 17) }),
      h('b', null, statsLabel(period, statsRange(period, ui.statsOffset))),
      h('button', {
        class: 'icon-btn',
        style: 'width:34px;height:34px' + (canGoNext ? '' : ';opacity:.35'),
        'aria-label': 'Periodo siguiente',
        disabled: !canGoNext,
        onclick: move(1),
        html: icon('chev', 17)
      })
    );
  }

  function scrTaskStats() {
    const period = STAT_PERIODS.some(item => item.id === ui.statsPeriod) ? ui.statsPeriod : 'semana';
    const wrap = h('div');
    wrap.append(headBar('Estadísticas', 'Cómo llevas tus tareas', searchBtn(),
      h('button', { class: 'icon-btn', 'aria-label': 'Ir a la lista', onclick: () => { ui.tasksView = 'lista'; go('tasks'); }, html: icon('list', 19) })
    ));
    wrap.append(taskViewSegment());
    wrap.append(h('div', { class: 'seg', style: 'margin-bottom:6px' },
      STAT_PERIODS.map(item => h('button', {
        class: period === item.id ? 'on' : '',
        onclick: () => { ui.statsPeriod = item.id; ui.statsOffset = 0; go('tasks'); }
      }, item.label))
    ));

    if (!S.tasks.length) {
      wrap.append(emptyState('chart', 'Sin datos todavía', 'Crea tareas repetitivas y aquí verás tu cumplimiento semana a semana, mes a mes y año a año.', 'Nueva tarea', () => go('taskForm')));
      return wrap;
    }

    const range = statsRange(period, ui.statsOffset);
    const tally = statsTally(range.start, range.end);
    const previousRange = statsRange(period, ui.statsOffset - 1);
    const previous = statsTally(previousRange.start, previousRange.end);
    wrap.append(statsNav(period));

    // Cifra grande de cumplimiento y comparación con el periodo anterior.
    const diff = tally.due && previous.due ? tally.pct - previous.pct : null;
    const delta = diff === null
      ? 'Sin datos del periodo anterior'
      : diff === 0
        ? 'Igual que ' + prevPeriodName(period)
        : (diff > 0 ? '+' + diff + ' puntos' : diff + ' puntos') + ' vs. ' + prevPeriodName(period);
    wrap.append(h('div', { class: 'card', style: 'text-align:center;margin-bottom:20px' },
      h('div', { class: 'stat-big' }, tally.due ? tally.pct + '%' : '—'),
      h('p', { style: 'font-size:13px;color:var(--text-2);margin:4px 0 16px' }, 'de cumplimiento · ' + tally.done + ' de ' + tally.due + ' tareas'),
      h('div', { class: 'bar' }, h('i', { style: 'width:' + (tally.due ? tally.pct : 0) + '%' })),
      h('p', { class: 'field-hint', style: 'margin-top:10px' }, delta)
    ));

    const past = tally.days.filter(day => !day.future);
    const activeDays = past.filter(day => day.due > 0).length;
    const perfectDays = past.filter(day => day.due > 0 && day.done === day.due).length;
    wrap.append(h('div', { style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px' },
      statsCard(tally.done, 'Completadas'),
      statsCard(tally.due, 'Previstas'),
      statsCard(activeDays ? perfectDays + ' / ' + activeDays : '—', 'Días perfectos')
    ));

    // Gráfico: una columna por día, por semana o por mes según el periodo.
    wrap.append(h('div', { class: 'section-title' }, h('span', null,
      period === 'semana' ? 'Ritmo diario' : period === 'mes' || period === '30d' || period === '90d' ? 'Semana a semana' : 'Mes a mes')));
    const chart = h('div', { class: 'vchart' });
    for (const bucket of statsBuckets(period, tally.days)) {
      const height = bucket.due ? Math.max(6, Math.round(bucket.pct * 0.96)) : 5;
      chart.append(h('div', {
        class: 'vb' + (bucket.due ? '' : ' nil') + (bucket.future ? ' dim' : ''),
        title: bucket.label + ' · ' + bucket.done + ' de ' + bucket.due
      },
        h('div', { class: 'vb-col' }, h('i', { style: 'height:' + height + 'px' })),
        h('b', null, bucket.label)
      ));
    }
    wrap.append(h('div', { class: 'card' }, chart));

    const rows = statsPerTask(tally.days);
    const riskRows = rows.filter(row => row.due >= 3 && row.pct < 50).sort((first, second) => first.pct - second.pct).slice(0, 3);
    if (riskRows.length) {
      wrap.append(h('div', { class: 'section-title' }, h('span', null, 'Para recuperar')));
      for (const row of riskRows) {
        wrap.append(h('div', { class: 'card', style: 'display:flex;align-items:center;gap:10px;margin-bottom:8px;border-left:3px solid var(--amber)' },
          h('span', { class: 'r-ic', style: 'background:var(--amber-soft);color:var(--amber)', html: icon('alarm', 17) }),
          h('div', { style: 'flex:1;min-width:0' }, h('b', null, row.task.title), h('span', { class: 'r-sub' }, row.done + ' de ' + row.due + ' · ' + row.pct + '%')),
          h('button', { class: 'link', style: 'font-size:12px', onclick: () => go('taskForm', { id: row.task.id }) }, 'Ajustar')
        ));
      }
    }
    wrap.append(h('div', { class: 'section-title' }, h('span', null, 'Tarea por tarea')));
    if (!rows.length) {
      wrap.append(h('div', { class: 'card', style: 'margin-bottom:20px' },
        h('p', { class: 'field-hint', style: 'text-align:center;padding:6px 0' }, 'No hay tareas previstas en este periodo.')));
    } else {
      const card = h('div', { class: 'card' });
      for (const row of rows) {
        card.append(h('div', { class: 'habit-row' },
          h('span', { class: 'r-ic', html: icon(row.task.icon || 'star', 18) }),
          h('div', { class: 'hb-mid' },
            h('b', null, row.task.title),
            h('div', { class: 'bar mini' }, h('i', { style: 'width:' + row.pct + '%' }))
          ),
          h('span', { class: 'hb-n' }, row.done + ' / ' + row.due)
        ));
      }
      wrap.append(card);
    }

    const recurring = S.tasks.filter(task => task.freq && task.freq.type !== 'once');
    const best = Math.max(0, ...recurring.map(task => streakOf(task)));
    const steadiest = rows.filter(row => row.due >= 3).sort((first, second) => second.pct - first.pct)[0];
    wrap.append(h('div', { class: 'section-title' }, h('span', null, 'Constancia')));
    wrap.append(h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px' },
      statsCard(best, 'Mejor racha (días)'),
      statsCard(steadiest ? steadiest.pct + '%' : '—', 'Tarea más constante')
    ));
    if (steadiest) {
      wrap.append(h('p', { class: 'field-hint', style: 'margin-top:10px' },
        'Lo que más cumpliste: ' + steadiest.task.title + ' (' + steadiest.done + ' de ' + steadiest.due + ')'));
    }

    addSwipe(wrap, () => { if (statsRange(period, ui.statsOffset + 1).start <= todayStr()) { ui.statsOffset++; go('tasks'); } }, () => { ui.statsOffset--; go('tasks'); });
    return wrap;
  }

  Object.assign(app.features, { home: scrHome, tasks: scrTasks, week: scrWeek, taskStats: scrTaskStats, giftThumb });
}
