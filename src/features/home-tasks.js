export function registerHomeAndTasks(app) {
  const {
    $,
    h,
    icon,
    avatarEl,
    cap,
    todayStr,
    parseYmd,
    addDaysYmd,
    weekStartOf,
    fmtLong,
    fmtShort,
    fmtRange,
    WEEK_L
  } = app.core;
  const { S } = app.state;
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
      h('button', { 'aria-label': 'Tu perfil', onclick: () => go('profile'), style: 'border-radius:50%' }, avatarEl(profile.name, profile.color, 40, profile.photo))
    ));

    for (const person of birthdaysToday()) {
      wrap.append(h('div', { class: 'banner' },
        h('span', { class: 'b-ic', html: icon('cake', 20) }),
        h('div', null, h('b', null, 'Hoy es el cumpleaños de ' + person.name), h('span', null, 'Echa un vistazo a tus ideas para ' + person.name)),
        h('button', { onclick: () => go('person', { id: person.id }) }, 'Ver regalos')
      ));
    }

    const due = tasksDueOn(todayStr());
    const done = due.filter(task => isDoneOn(task, todayStr())).length;
    const percentage = due.length ? Math.round(done / due.length * 100) : 0;
    wrap.append(h('button', {
      class: 'card',
      style: 'width:100%;text-align:left;margin-bottom:20px;display:block',
      onclick: () => go('progress')
    },
      h('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px' },
        h('div', null, h('b', { style: 'font-size:15px;font-weight:700' }, 'Tu día'), h('span', { style: 'font-size:13px;color:var(--text-2);margin-left:8px' }, done + ' de ' + due.length + ' tareas')),
        h('span', { style: 'font-size:13px;font-weight:700;color:var(--primary)' }, percentage + '%')
      ),
      h('div', { class: 'bar' }, h('i', { style: 'width:' + percentage + '%' }))
    ));

    const openNotes = (S.notes || []).filter(note => !note.done).length;
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
    wrap.append(h('button', {
      class: 'card',
      style: 'width:100%;text-align:left;margin:-8px 0 20px;display:flex;align-items:center;gap:12px',
      onclick: () => go('class')
    },
      h('span', { class: 'r-ic', html: icon('pencil', 19) }),
      h('div', { style: 'flex:1' }, h('b', { style: 'font-size:14.5px;display:block' }, 'Modo Clase'), h('span', { style: 'font-size:12.5px;color:var(--text-2)' }, classLine)),
      (inboxCount || openNotes) ? h('span', { class: 'nav-badge' }, inboxCount || openNotes) : h('span', { class: 'chev', html: icon('chev', 16) })
    ));
    addSwipe(wrap, () => go('class'));

    wrap.append(h('div', { class: 'section-title' }, h('span', null, 'Hoy')));
    let list = due;
    if (S.settings.hideCompleted) list = list.filter(task => !isDoneOn(task, todayStr()));
    if (!due.length) {
      wrap.append(emptyState('check', 'Todo despejado', 'Hoy no tienes tareas programadas. Añade una nueva o descansa.', 'Nueva tarea', () => go('taskForm')));
    } else {
      const grid = h('div', { class: 'task-grid' });
      for (const task of list) {
        const done = isDoneOn(task, todayStr());
        grid.append(h('button', { class: 'task-card' + (done ? ' done' : ''), onclick: () => toggleOn(task.id, todayStr()) },
          h('span', { class: 't-ic', html: icon(task.icon || 'star', 20) }),
          h('b', null, task.title),
          h('span', { class: 't-state' }, h('span', { class: 't-dot' }), done ? 'Completado' : 'Pendiente')
        ));
      }
      wrap.append(grid);
    }

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
    return h('div', { class: 'seg', style: 'margin-bottom:18px' },
      h('button', { class: ui.tasksView === 'lista' ? 'on' : '', onclick: () => { ui.tasksView = 'lista'; go('tasks'); } }, 'Lista'),
      h('button', { class: ui.tasksView === 'semana' ? 'on' : '', onclick: () => { ui.tasksView = 'semana'; go('tasks'); } }, 'Semana'),
      h('button', { class: ui.tasksView === 'cal' ? 'on' : '', onclick: () => { ui.tasksView = 'cal'; go('tasks'); } }, 'Calendario')
    );
  }

  function scrTasks() {
    if (ui.tasksView !== 'lista') return scrWeek();
    const wrap = h('div');
    wrap.append(headBar('Tareas', 'Todo lo que haces regularmente', searchBtn(),
      h('button', { class: 'icon-btn', 'aria-label': 'Nueva tarea', onclick: () => go('taskForm'), html: icon('plus', 20) })
    ));
    const today = todayStr();
    const categoryList = categories();
    const filters = ['todas', 'hoy', ...categoryList.map(category => category.toLowerCase())];
    const chips = h('div', { class: 'chips' });
    for (const filter of filters) {
      const label = filter === 'todas' ? 'Todas' : filter === 'hoy' ? 'Hoy' : cap(filter);
      chips.append(h('button', {
        class: 'chip' + (ui.tasksFilter === filter ? ' on' : ''),
        onclick: event => {
          ui.tasksFilter = filter;
          [...chips.children].forEach(item => item.classList.remove('on'));
          event.currentTarget.classList.add('on');
          drawList();
        }
      }, label));
    }
    wrap.append(taskViewSegment(), chips);
    const listWrap = h('div');
    wrap.append(listWrap);

    function drawList() {
      listWrap.innerHTML = '';
      let tasks = [...S.tasks];
      const filter = ui.tasksFilter;
      if (filter === 'hoy') tasks = tasks.filter(task => isDueOn(task, today));
      else if (filter !== 'todas') tasks = tasks.filter(task => (task.cat || 'Otros').toLowerCase() === filter);
      if (!tasks.length) {
        listWrap.append(emptyState('list', 'Nada por aquí', 'Crea tu primera tarea o hábito y aparecerá aquí cada día.', 'Nueva tarea', () => go('taskForm')));
        return;
      }
      for (const category of categoryList) {
        const group = tasks.filter(task => (task.cat || 'Otros') === category);
        if (!group.length) continue;
        listWrap.append(h('div', { class: 'section-title' }, h('span', null, category + ' · ' + group.length)));
        for (const task of group) {
          const done = isDoneOn(task, today) && isDueOn(task, today);
          listWrap.append(h('div', { class: 'row' },
            h('button', { class: 'row-check' + (done ? ' done' : ''), 'aria-label': 'Completar hoy', onclick: () => toggleOn(task.id, today), style: 'flex:none' }),
            h('div', { style: 'flex:1;min-width:0;cursor:pointer', onclick: () => toggleOn(task.id, today) },
              h('b', { style: done ? 'color:var(--text-2)' : '' }, task.title),
              h('span', { class: 'r-sub' }, freqText(task))
            ),
            h('span', { class: 'r-ic', html: icon(task.icon || 'star', 19) }),
            h('button', { class: 'mini-btn', 'aria-label': 'Editar', onclick: () => go('taskForm', { id: task.id }), html: icon('edit', 17) })
          ));
        }
      }
    }

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
    const due = [...tasksDueOn(ymd)].sort((first, second) => (first.time || '99:99').localeCompare(second.time || '99:99'));
    if (!due.length) return emptyState('calendar', 'Sin tareas', 'No hay nada programado para este día.', 'Añadir tarea', () => go('taskForm'));
    const column = h('div');
    for (const task of due) {
      const done = isDoneOn(task, ymd);
      column.append(h('div', { class: 'row' },
        allowToggle
          ? h('button', { class: 'row-check' + (done ? ' done' : ''), 'aria-label': 'Completar', onclick: () => toggleOn(task.id, ymd), style: 'flex:none' })
          : h('span', { class: 'row-check' + (done ? ' done' : ''), style: 'flex:none' }),
        h('div', { style: 'flex:1;min-width:0' + (allowToggle ? ';cursor:pointer' : ''), ...(allowToggle ? { onclick: () => toggleOn(task.id, ymd) } : {}) },
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

  Object.assign(app.features, { home: scrHome, tasks: scrTasks, week: scrWeek, giftThumb });
}
