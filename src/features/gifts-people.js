export function registerGiftsAndPeople(app) {
  const {
    h,
    uid,
    icon,
    avatarEl,
    fmtShort,
    todayStr,
    GIFT_STATUSES,
    REMIND_DAYS
  } = app.core;
  const { S, save } = app.state;
  const {
    route,
    ui,
    go,
    render,
    giftsOf,
    countdownTxt,
    daysUntil,
    statusCls,
    bdayTxt
  } = app.domain;
  const { headBar, searchBtn, formHead, emptyState, openSheet, closeOverlays, toast } = app.components;
  const { deletePerson } = app.actions;
  const { giftThumb } = app.features;

  ui.giftFilter = ui.giftFilter || 'todas';
  ui.giftStatus = ui.giftStatus || 'todas';
  ui.giftSort = ui.giftSort || 'fecha';
  ui.giftSearch = ui.giftSearch || '';

  const fmtEur = value => Number(value || 0).toFixed(2).replace('.', ',') + ' €';

  function domainOf(link) {
    try { return new URL(link).hostname.replace(/^www\./, ''); } catch (error) { return ''; }
  }

  /* Próxima ocurrencia de una fecha anual (cumpleaños, onomástica…) */
  function nextDateFor(ymd) {
    if (!ymd || ymd.length < 10) return ymd;
    const today = todayStr();
    const mmdd = ymd.slice(5);
    let candidate = today.slice(0, 4) + '-' + mmdd;
    if (candidate < today) candidate = (Number(today.slice(0, 4)) + 1) + '-' + mmdd;
    return candidate;
  }

  function upcomingGiftOccasions() {
    const events = [];
    for (const person of S.people) {
      if (person.birthday) {
        events.push({ kind: 'Cumpleaños', icon: 'cake', label: 'Cumpleaños de ' + person.name, date: nextDateFor(person.birthday), personId: person.id });
      }
      for (const date of ((person.details || {}).fechas || [])) {
        if (!date.date) continue;
        events.push({ kind: date.label || 'Fecha', icon: 'calendar', label: (date.label || 'Fecha') + ' · ' + person.name, date: nextDateFor(date.date), personId: person.id });
      }
    }
    for (const gift of S.gifts) {
      if (gift.targetDate && gift.targetDate >= todayStr() && gift.status !== 'Entregado') {
        const person = S.people.find(item => item.id === gift.personId);
        events.push({ kind: gift.occasion || 'Otro', icon: 'gift', label: gift.title + (person ? ' · ' + person.name : ''), date: gift.targetDate, personId: gift.personId || null, giftId: gift.id });
      }
    }
    return events.sort((first, second) => (first.date < second.date ? -1 : first.date > second.date ? 1 : 0));
  }

  function scrGifts() {
    const wrap = h('div');
    wrap.append(headBar('Regalos', 'Tus ideas y regalos pendientes', searchBtn(),
      h('button', { class: 'icon-btn', 'aria-label': 'Agenda de regalos', onclick: () => go('giftAgenda'), html: icon('cake', 19) }),
      h('button', { class: 'icon-btn', 'aria-label': 'Estadísticas de regalos', onclick: () => go('giftStats'), html: icon('chart', 19) }),
      h('button', { class: 'icon-btn', 'aria-label': 'Nueva persona', onclick: () => go('personForm'), html: icon('users', 19) }),
      h('button', { class: 'icon-btn', 'aria-label': 'Nuevo regalo', onclick: () => go('giftForm'), html: icon('plus', 20) })
    ));
    wrap.append(h('div', { class: 'seg', style: 'margin-bottom:16px' },
      h('button', { class: ui.giftTab === 'personas' ? 'on' : '', onclick: () => { ui.giftTab = 'personas'; go('gifts'); } }, 'Personas'),
      h('button', { class: ui.giftTab === 'todos' ? 'on' : '', onclick: () => { ui.giftTab = 'todos'; go('gifts'); } }, 'Todos los regalos')
    ));

    if (ui.giftTab === 'todos') {
      wrap.append(giftsBrowser());
      return wrap;
    }

    wrap.append(h('div', { class: 'section-title' }, h('span', null, 'Personas')));
    const grid = h('div', { class: 'person-grid' });
    for (const person of S.people) {
      const count = giftsOf(person.id).length;
      grid.append(h('button', { class: 'person-card', onclick: () => go('person', { id: person.id }) },
        avatarEl(person.name, person.color, 54, person.photo),
        h('b', null, person.name),
        h('span', null, count + (count === 1 ? ' regalo' : ' regalos')),
        person.birthday ? h('span', { style: 'font-size:11px;color:var(--text-3)' }, 'Cumple: ' + fmtShort(person.birthday)) : null
      ));
    }
    grid.append(h('button', { class: 'person-card add', onclick: () => go('personForm') }, h('span', { html: icon('plus', 22) }), h('b', null, 'Añadir persona')));
    wrap.append(grid);
    wrap.append(h('div', { class: 'section-title' },
      h('span', null, 'Próximos regalos'),
      h('button', { class: 'link', onclick: () => { ui.giftTab = 'todos'; render(); } }, 'Ver todos')
    ));
    const gifts = sortedUpcomingGifts();
    if (!gifts.length) {
      wrap.append(emptyState('gift', 'Sin ideas todavía', 'Añade tu primera idea y asígnala a una persona.', 'Nuevo regalo', () => go('giftForm')));
    } else {
      for (const gift of gifts.slice(0, 6)) wrap.append(giftRow(gift));
    }
    return wrap;
  }

  /* ---- Pestaña "Todos los regalos": búsqueda, filtros, orden y archivo ---- */

  function giftsBrowser() {
    const wrap = h('div');
    const searchRow = h('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:12px' });
    const searchInput = h('input', {
      class: 'input', type: 'search', placeholder: 'Buscar regalo…',
      style: 'flex:1;min-width:0;padding:9px 12px;font-size:13px', value: ui.giftSearch
    });
    searchInput.addEventListener('input', () => { ui.giftSearch = searchInput.value; drawList(); });
    const sortButton = h('button', {
      class: 'icon-btn', style: 'width:38px;height:38px;flex:none',
      'aria-label': 'Cambiar orden', title: ui.giftSort === 'fecha' ? 'Ordenado por fecha' : 'Ordenado por precio',
      onclick: () => { ui.giftSort = ui.giftSort === 'fecha' ? 'precio' : 'fecha'; render(); },
      html: icon(ui.giftSort === 'fecha' ? 'calendar' : 'euro', 17)
    });
    searchRow.append(searchInput, sortButton);
    wrap.append(searchRow);

    const personChips = h('div', { class: 'chips' });
    const drawPersonChips = () => {
      personChips.innerHTML = '';
      const chips = [{ id: 'todas', label: 'Todos' }].concat(S.people.map(person => ({ id: person.id, label: person.name })));
      for (const chip of chips) {
        personChips.append(h('button', {
          class: 'chip' + (ui.giftFilter === chip.id ? ' on' : ''),
          onclick: () => { ui.giftFilter = chip.id; drawPersonChips(); drawList(); }
        }, chip.label));
      }
    };
    drawPersonChips();

    const statusChips = h('div', { class: 'chips' });
    const drawStatusChips = () => {
      statusChips.innerHTML = '';
      const chips = [{ id: 'todas', label: 'Activos' }, { id: 'archivo', label: 'Archivo' }]
        .concat(GIFT_STATUSES.filter(status => status !== 'Entregado').map(status => ({ id: status, label: status })));
      for (const chip of chips) {
        statusChips.append(h('button', {
          class: 'chip' + (ui.giftStatus === chip.id ? ' on' : ''),
          onclick: () => { ui.giftStatus = chip.id; drawStatusChips(); drawList(); }
        }, chip.label));
      }
    };
    drawStatusChips();
    wrap.append(personChips, statusChips);

    const listWrap = h('div');
    wrap.append(listWrap);

    function matchesFilters(gift) {
      if (ui.giftStatus === 'archivo') { if (gift.status !== 'Entregado') return false; }
      else if (ui.giftStatus === 'todas') { if (gift.status === 'Entregado') return false; }
      else if (gift.status !== ui.giftStatus) return false;
      if (ui.giftFilter !== 'todas' && gift.personId !== ui.giftFilter) return false;
      const query = ui.giftSearch.trim().toLowerCase();
      if (query) {
        const person = S.people.find(item => item.id === gift.personId);
        const haystack = gift.title + ' ' + (gift.notes || '') + ' ' + (gift.occasion || '') + ' ' + (person ? person.name : '');
        if (!haystack.toLowerCase().includes(query)) return false;
      }
      return true;
    }

    function drawList() {
      listWrap.innerHTML = '';
      const gifts = S.gifts.filter(matchesFilters);
      if (ui.giftSort === 'precio') {
        gifts.sort((first, second) => (Number(second.price) || 0) - (Number(first.price) || 0));
      } else {
        gifts.sort((first, second) => {
          const firstDone = first.status === 'Comprado' || first.status === 'Entregado' ? 1 : 0;
          const secondDone = second.status === 'Comprado' || second.status === 'Entregado' ? 1 : 0;
          if (firstDone !== secondDone) return firstDone - secondDone;
          if (first.targetDate && second.targetDate) return first.targetDate.localeCompare(second.targetDate);
          if (first.targetDate) return -1;
          if (second.targetDate) return 1;
          return 0;
        });
      }
      if (!gifts.length) {
        const filtered = ui.giftSearch.trim() || ui.giftFilter !== 'todas' || ui.giftStatus !== 'todas';
        if (filtered) listWrap.append(emptyState('search', 'Sin resultados', 'Prueba con otro filtro o busca por otro nombre.'));
        else if (ui.giftStatus === 'archivo') listWrap.append(emptyState('archive', 'Archivo vacío', 'Los regalos entregados se guardarán aquí, fuera de la lista diaria.'));
        else listWrap.append(emptyState('gift', 'Aún no tienes regalos', 'Crea tu primera idea de regalo y asígnala a una persona.', 'Nuevo regalo', () => go('giftForm')));
        return;
      }
      const total = gifts.reduce((sum, gift) => sum + (Number(gift.price) || 0), 0);
      listWrap.append(h('p', { class: 'field-hint', style: 'margin:2px 0 10px' },
        gifts.length + (gifts.length === 1 ? ' regalo · ' : ' regalos · ') + fmtEur(total)));
      for (const gift of gifts) listWrap.append(giftRow(gift, drawList));
    }

    drawList();
    return wrap;
  }

  function giftRow(gift, redraw) {
    const person = S.people.find(item => item.id === gift.personId);
    const link = (gift.link || '').trim();
    return h('div', { class: 'gift-row', style: 'cursor:pointer', onclick: () => go('giftForm', { id: gift.id }) },
      giftThumb(gift),
      h('div', { style: 'flex:1;min-width:0' },
        h('b', { style: 'font-size:14px;font-weight:600;display:flex;align-items:center;gap:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' },
          gift.starred ? h('span', { style: 'color:var(--amber);flex:none', html: icon('star', 13) }) : null,
          h('span', { style: 'overflow:hidden;text-overflow:ellipsis' }, gift.title)
        ),
        h('span', { class: 'r-sub' }, (person ? person.name : 'Sin asignar') + (gift.price ? ' · ' + fmtEur(gift.price) : '') + (gift.targetDate ? ' · ' + fmtShort(gift.targetDate) + countdownTxt(gift.targetDate) : '')),
        link ? h('a', {
          class: 'st-link', href: link, target: '_blank', rel: 'noopener noreferrer',
          onclick: event => event.stopPropagation()
        }, h('span', { html: icon('external', 12) }), domainOf(link)) : null
      ),
      h('button', {
        class: 'stchip ' + statusCls(gift.status),
        title: 'Más opciones',
        onclick: event => { event.stopPropagation(); giftMenu(gift, redraw); }
      }, gift.status)
    );
  }

  function giftMenu(gift, redraw) {
    closeOverlays();
    const overlay = h('div', { class: 'overlay', style: 'z-index:60', onclick: event => { if (event.target === overlay) overlay.remove(); } });
    const run = callback => () => { overlay.remove(); callback(); };
    const refresh = () => { save(); if (redraw) redraw(); else render(); };
    const link = (gift.link || '').trim();
    const sheet = h('div', { class: 'sheet', style: 'max-width:360px', role: 'menu' },
      h('div', { style: 'padding:0 4px 14px' },
        h('p', { style: 'font-size:15px;font-weight:600;line-height:1.4' }, gift.title),
        h('p', { class: 'field-hint' }, 'Elige el estado o lo que quieras hacer')
      ),
      h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;padding:0 4px 14px' },
        GIFT_STATUSES.map(status => h('button', {
          class: 'chip' + (status === gift.status ? ' on' : ''),
          onclick: run(() => { gift.status = status; refresh(); toast('Estado: ' + status); })
        }, status))
      ),
      h('button', { class: 'set-row', onclick: run(() => { gift.starred = !gift.starred; refresh(); toast(gift.starred ? 'Marcada como favorita' : 'Quitada de favoritas'); }) },
        h('span', { class: 'r-ic', style: gift.starred ? 'background:var(--amber-soft);color:var(--amber)' : '', html: icon('star', 17) }),
        h('span', null, gift.starred ? 'Quitar de favoritas' : 'Marcar como favorita')
      ),
      link ? h('button', { class: 'set-row', onclick: run(() => window.open(link, '_blank', 'noopener')) },
        h('span', { class: 'r-ic', html: icon('external', 17) }),
        h('span', null, 'Abrir ' + domainOf(link))
      ) : null,
      h('button', { class: 'set-row', onclick: run(() => duplicateGift(gift)) },
        h('span', { class: 'r-ic', html: icon('copy', 17) }),
        h('span', null, 'Duplicar')
      ),
      h('button', { class: 'set-row', style: 'color:var(--danger)', onclick: run(() => app.actions.deleteGift(gift.id)) },
        h('span', { class: 'r-ic', style: 'background:var(--danger-soft);color:var(--danger)', html: icon('trash', 17) }),
        h('span', null, 'Eliminar')
      )
    );
    overlay.append(sheet);
    document.body.appendChild(overlay);
  }

  function duplicateGift(gift) {
    const copy = {
      id: uid('g'),
      title: gift.title,
      personId: gift.personId || null,
      price: gift.price == null ? null : gift.price,
      targetDate: '',
      link: gift.link || '',
      occasion: gift.occasion || 'Cumpleaños',
      status: 'Idea',
      notes: gift.notes || '',
      image: gift.image || '',
      starred: false,
      remindDays: gift.remindDays != null ? gift.remindDays : null,
      createdAt: todayStr(),
      updatedAt: Date.now()
    };
    S.gifts.push(copy);
    save();
    render();
    toast('Copia creada', { label: 'Editar', fn: () => go('giftForm', { id: copy.id }) });
  }

  function sortedUpcomingGifts() {
    return [...S.gifts].sort((first, second) => {
      const firstDone = (first.status === 'Comprado' || first.status === 'Entregado') ? 1 : 0;
      const secondDone = (second.status === 'Comprado' || second.status === 'Entregado') ? 1 : 0;
      if (firstDone !== secondDone) return firstDone - secondDone;
      if (first.targetDate && second.targetDate) return first.targetDate.localeCompare(second.targetDate);
      if (first.targetDate) return -1;
      if (second.targetDate) return 1;
      return 0;
    });
  }

  /* ---- Agenda de regalos: cumpleaños, fechas y entregas con cuenta atrás ---- */

  function monthLabel(ym) {
    const parts = ym.split('-');
    const text = new Date(Number(parts[0]), Number(parts[1]) - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function scrGiftAgenda() {
    const back = app.components.smartBack('gifts');
    const wrap = h('div');
    wrap.append(formHead('Agenda de regalos', back));
    const events = upcomingGiftOccasions();
    if (!events.length) {
      wrap.append(emptyState('cake', 'Sin ocasiones a la vista', 'Añade cumpleaños y fechas importantes a tus personas y aparecerán aquí con su cuenta atrás.', 'Añadir persona', () => go('personForm')));
      return wrap;
    }
    let currentMonth = null;
    for (const event of events.slice(0, 40)) {
      const month = event.date.slice(0, 7);
      if (month !== currentMonth) {
        currentMonth = month;
        wrap.append(h('div', { class: 'section-title' }, h('span', null, monthLabel(month))));
      }
      const days = daysUntil(event.date);
      const person = event.personId ? S.people.find(item => item.id === event.personId) : null;
      wrap.append(h('button', {
        class: 'hist-row', style: 'width:100%;text-align:left;background:none;border:none;cursor:pointer;font:inherit;color:inherit',
        onclick: person ? () => go('person', { id: person.id }) : (event.giftId ? () => go('giftForm', { id: event.giftId }) : undefined)
      },
        h('span', { class: 'r-ic', style: days <= 7 ? 'background:var(--amber-soft);color:var(--amber)' : '', html: icon(event.icon, 17) }),
        h('div', { style: 'flex:1;min-width:0' },
          h('b', null, event.label),
          h('span', { class: 'r-sub' }, fmtShort(event.date) + ' · ' + event.kind)
        ),
        h('span', { style: 'font-size:12px;font-weight:700;flex:none;color:' + (days <= 7 ? 'var(--amber)' : 'var(--text-2)') },
          days === 0 ? '¡Hoy!' : days === 1 ? 'Mañana' : days + ' días')
      ));
    }
    wrap.append(h('p', { class: 'field-hint', style: 'text-align:center;margin-top:8px' }, 'Las fechas anuales se repiten cada año automáticamente.'));
    return wrap;
  }

  /* ---- Historial por persona: qué le regalaste cada año ---- */

  function scrGiftHistory() {
    const person = S.people.find(item => item.id === route.params.id);
    if (!person) {
      go('gifts', undefined, { replace: true });
      return h('div');
    }
    const back = app.components.smartBack('person', { id: person.id });
    const wrap = h('div');
    wrap.append(formHead('Historial · ' + person.name.split(' ')[0], back));
    const gifts = giftsOf(person.id).slice().sort((first, second) => (second.targetDate || '').localeCompare(first.targetDate || ''));
    if (!gifts.length) {
      wrap.append(emptyState('clock', 'Sin historial todavía', 'Cuando guardes regalos para ' + person.name + ' con su fecha, aquí verás qué le diste cada año.', 'Añadir regalo', () => go('giftForm', { personId: person.id })));
      return wrap;
    }
    const byYear = new Map();
    for (const gift of gifts) {
      const year = gift.targetDate ? gift.targetDate.slice(0, 4) : 'Sin fecha';
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year).push(gift);
    }
    const years = [...byYear.keys()].sort((first, second) => (first === 'Sin fecha' ? -1 : second === 'Sin fecha' ? 1 : second.localeCompare(first)));
    for (const year of years) {
      const items = byYear.get(year);
      wrap.append(h('div', { class: 'section-title' },
        h('span', null, year === 'Sin fecha' ? 'Sin fecha' : year),
        h('span', { class: 'nav-badge', style: 'background:var(--surface-2);color:var(--text-2)' }, items.length)
      ));
      for (const gift of items) {
        const statusIcon = gift.status === 'Entregado' ? 'check' : gift.status === 'Comprado' ? 'cart' : gift.status === 'Comprar' ? 'cart' : 'gift';
        wrap.append(h('div', { class: 'hist-row' },
          h('span', { class: 'r-ic', html: icon(statusIcon, 17) }),
          h('div', { style: 'flex:1;min-width:0' },
            h('b', null, gift.title),
            h('span', { class: 'r-sub' }, (gift.occasion || '') + (gift.targetDate ? ' · ' + fmtShort(gift.targetDate) : '') + (gift.price ? ' · ' + fmtEur(gift.price) : ''))
          ),
          h('span', { class: 'stchip ' + statusCls(gift.status) }, gift.status)
        ));
      }
    }
    return wrap;
  }

  /* ---- Estadísticas de gasto ---- */

  function statCard(big, label) {
    return h('div', { class: 'card', style: 'text-align:center' },
      h('div', { class: 'stat-big', style: 'font-size:24px' }, big),
      h('p', { style: 'font-size:12px;color:var(--text-2);margin-top:4px' }, label));
  }

  function scrGiftStats() {
    const back = app.components.smartBack('gifts');
    const wrap = h('div');
    wrap.append(formHead('Estadísticas de regalos', back));
    const gifts = S.gifts;
    if (!gifts.length) {
      wrap.append(emptyState('chart', 'Sin datos todavía', 'Guarda regalos con precio y aquí verás cuánto planificas y cuánto gastas.', 'Nuevo regalo', () => go('giftForm')));
      return wrap;
    }
    const spentAll = gifts.filter(gift => gift.status === 'Comprado' || gift.status === 'Entregado').reduce((total, gift) => total + (Number(gift.price) || 0), 0);
    const planned = gifts.filter(gift => gift.status === 'Idea' || gift.status === 'Comprar').reduce((total, gift) => total + (Number(gift.price) || 0), 0);
    const priced = gifts.filter(gift => Number(gift.price) > 0);
    const year = todayStr().slice(0, 4);

    const byYearMap = new Map();
    for (const gift of gifts) {
      if (gift.status !== 'Comprado' && gift.status !== 'Entregado') continue;
      const giftYear = gift.targetDate ? gift.targetDate.slice(0, 4) : year;
      byYearMap.set(giftYear, (byYearMap.get(giftYear) || 0) + (Number(gift.price) || 0));
    }
    const byYear = [...byYearMap.entries()].sort((first, second) => second[0].localeCompare(first[0])).slice(0, 4);
    const maxYear = Math.max(1, ...byYear.map(entry => entry[1]));

    const byPerson = S.people.map(person => ({
      person,
      total: gifts.filter(gift => gift.personId === person.id && (gift.status === 'Comprado' || gift.status === 'Entregado')).reduce((total, gift) => total + (Number(gift.price) || 0), 0)
    })).filter(entry => entry.total > 0).sort((first, second) => second.total - first.total).slice(0, 5);
    const maxPerson = Math.max(1, ...byPerson.map(entry => entry.total));

    const occMap = new Map();
    for (const gift of gifts) {
      const key = gift.occasion || 'Otro';
      occMap.set(key, (occMap.get(key) || 0) + 1);
    }
    const topOccasion = [...occMap.entries()].sort((first, second) => second[1] - first[1])[0];

    wrap.append(h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px' },
      statCard(fmtEur(spentAll), 'Gastado en total'),
      statCard(fmtEur(planned), 'Planificado ahora'),
      statCard(priced.length ? fmtEur(priced.reduce((total, gift) => total + Number(gift.price), 0) / priced.length) : '—', 'Regalo medio'),
      statCard(topOccasion ? topOccasion[0] : '—', topOccasion ? topOccasion[1] + (topOccasion[1] === 1 ? ' regalo' : ' regalos') : 'Ocasión top')
    ));

    wrap.append(h('div', { class: 'section-title' }, h('span', null, 'Gasto por año')));
    const yearCard = h('div', { class: 'card', style: 'margin-bottom:20px' });
    if (!byYear.length) {
      yearCard.append(h('p', { class: 'field-hint', style: 'text-align:center;padding:6px 0' }, 'Aún no hay compras registradas.'));
    } else {
      for (const [giftYear, total] of byYear) {
        yearCard.append(h('div', { class: 'habit-row' },
          h('b', { style: 'width:48px;flex:none;font-size:13px' }, giftYear),
          h('div', { style: 'flex:1' }, h('div', { class: 'bar mini' }, h('i', { style: 'width:' + Math.round(total / maxYear * 100) + '%' }))),
          h('span', { class: 'hb-n', style: 'flex:none;font-size:12px' }, fmtEur(total))
        ));
      }
    }
    wrap.append(yearCard);

    wrap.append(h('div', { class: 'section-title' }, h('span', null, 'A quién más regalas')));
    const personCard = h('div', { class: 'card' });
    if (!byPerson.length) {
      personCard.append(h('p', { class: 'field-hint', style: 'text-align:center;padding:6px 0' }, 'Asigna persona y precio a tus regalos para ver el ranking.'));
    } else {
      for (const entry of byPerson) {
        personCard.append(h('button', {
          class: 'habit-row', style: 'width:100%;text-align:left;background:none;border:none;cursor:pointer;font:inherit;color:inherit',
          onclick: () => go('person', { id: entry.person.id })
        },
          avatarEl(entry.person.name, entry.person.color, 30, entry.person.photo),
          h('div', { style: 'flex:1' }, h('div', { class: 'bar mini' }, h('i', { style: 'width:' + Math.round(entry.total / maxPerson * 100) + '%' }))),
          h('span', { class: 'hb-n', style: 'flex:none;font-size:12px' }, fmtEur(entry.total))
        ));
      }
    }
    wrap.append(personCard);
    return wrap;
  }

  /* ---- Ficha de persona ---- */

  function personAboutTags(person) {
    const details = person.details || {};
    const tags = [];
    if (details.gustos) tags.push('Gustos');
    if (details.favoritos) tags.push('Favoritos');
    if (person.notes) tags.push('Información');
    if (Array.isArray(details.fechas) && details.fechas.length) tags.push(details.fechas.length === 1 ? '1 fecha' : details.fechas.length + ' fechas');
    return tags;
  }

  function personDetailsSheet(person) {
    openSheet('Sobre ' + person.name.split(' ')[0], () => {
      const details = person.details || {};
      const body = h('div');
      const createField = (label, placeholder, value, rows) => {
        const input = rows ? h('textarea', { class: 'input', rows: String(rows), placeholder }) : h('input', { class: 'input', type: 'text', placeholder, maxlength: '120' });
        input.value = value || '';
        body.append(h('div', { class: 'field' }, h('label', null, label), input));
        return input;
      };
      const tastesInput = createField('Gustos', 'Ej. Manga, cocina, música indie…', details.gustos, 2);
      const favoritesInput = createField('Cosas favoritas', 'Ej. Color azul, pizza, el equipo X…', details.favoritos, 2);
      const notesInput = createField('Información', 'Ej. Talla M, sin lactosa, colecciona…', person.notes, 3);
      body.append(h('p', { class: 'field-hint', style: 'margin:2px 0 10px' }, 'Todo esto solo se usa para ayudarte a elegir regalos.'));

      let dates = Array.isArray(details.fechas) ? details.fechas.map(date => ({ ...date })) : [];
      const datesList = h('div', { style: 'display:flex;flex-direction:column;gap:8px;margin-bottom:10px' });
      function drawDates() {
        datesList.innerHTML = '';
        for (const date of dates) {
          datesList.append(h('div', { style: 'display:flex;align-items:center;gap:8px' },
            h('input', { class: 'input', type: 'text', placeholder: 'Ej. Onomástica', value: date.label || '', maxlength: '30', style: 'flex:1.4', oninput: event => { date.label = event.currentTarget.value; } }),
            h('input', { class: 'input', type: 'date', value: date.date || '', style: 'flex:1', onchange: event => { date.date = event.currentTarget.value; } }),
            h('button', { class: 'icon-btn', style: 'width:36px;height:36px;color:var(--danger)', 'aria-label': 'Quitar fecha', onclick: () => { dates = dates.filter(item => item !== date); drawDates(); }, html: icon('x', 15) })
          ));
        }
      }
      drawDates();
      body.append(
        h('b', { style: 'font-size:13px;display:block;margin-bottom:8px' }, 'Fechas importantes'),
        datesList,
        h('button', { class: 'btn btn-soft', style: 'width:100%;font-size:13px', onclick: () => { dates.push({ label: '', date: '' }); drawDates(); } }, '+ Añadir fecha'),
        h('button', {
          class: 'btn btn-primary btn-block btn-lg',
          style: 'margin-top:14px',
          onclick: () => {
            person.details = { gustos: tastesInput.value.trim(), favoritos: favoritesInput.value.trim(), fechas: dates.filter(date => date.label.trim() || date.date) };
            person.notes = notesInput.value.trim();
            save();
            closeOverlays();
            render();
            toast('Información guardada');
          }
        }, 'Guardar')
      );
      return body;
    });
  }

  function scrPerson() {
    const person = S.people.find(item => item.id === route.params.id);
    if (!person) {
      // La ficha ya no existe (eliminada en otra pestaña): el historial hacia
      // ella deja de ser válido y reemplazamos para no dejar basura atrás.
      go('gifts', undefined, { replace: true });
      return h('div');
    }
    const back = app.components.smartBack('gifts');
    const wrap = h('div');
    wrap.append(headBar('', null,
      h('button', { class: 'icon-btn', 'aria-label': 'Volver', onclick: back, html: icon('back', 19) }),
      h('button', { class: 'icon-btn', 'aria-label': 'Editar persona', onclick: () => go('personForm', { id: person.id }), html: icon('edit', 18) }),
      h('button', { class: 'icon-btn', 'aria-label': 'Eliminar', onclick: () => deletePerson(person), html: icon('trash', 18) })
    ));
    wrap.append(h('div', { style: 'display:flex;flex-direction:column;align-items:center;text-align:center;margin-bottom:22px' },
      avatarEl(person.name, person.color, 84, person.photo),
      h('h2', { style: 'font-size:22px;font-weight:800;margin-top:12px;letter-spacing:-.02em' }, person.name),
      h('p', { style: 'font-size:13px;color:var(--text-2);margin-top:4px' }, giftsOf(person.id).length + (giftsOf(person.id).length === 1 ? ' regalo' : ' regalos') + (person.birthday ? bdayTxt(person.birthday) : ''))
    ));
    const tags = personAboutTags(person);
    const hasDetails = tags.length > 0;
    const detailsCard = h('div', { class: 'card', style: 'text-align:left;margin-bottom:20px' },
      h('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px' },
        h('b', { style: 'font-size:15px' }, 'Sobre ' + person.name.split(' ')[0]),
        h('button', { class: 'icon-btn', style: 'width:34px;height:34px', 'aria-label': hasDetails ? 'Editar información' : 'Añadir información', onclick: () => personDetailsSheet(person), html: icon(hasDetails ? 'edit' : 'plus', 17) })
      )
    );
    if (hasDetails) {
      detailsCard.append(
        h('p', { style: 'font-size:12.5px;color:var(--text-3);margin:2px 0 12px' }, tags.join(' · ')),
        h('button', { class: 'btn btn-soft', style: 'width:100%;justify-content:space-between', onclick: () => go('personAbout', { id: person.id }) },
          h('span', null, 'Ver toda la información'),
          h('span', { class: 'chev', html: icon('chev', 16) })
        )
      );
    } else {
      detailsCard.append(
        h('p', { style: 'font-size:13px;color:var(--text-2);line-height:1.5;margin:6px 0 12px' }, 'Apunta sus gustos, cosas favoritas y fechas importantes para acertar siempre con los regalos.'),
        h('button', { class: 'btn btn-soft', style: 'width:100%', onclick: () => personDetailsSheet(person) }, 'Añadir información')
      );
    }
    wrap.append(detailsCard);
    wrap.append(h('button', { class: 'btn btn-primary btn-block btn-lg', onclick: () => go('giftForm', { personId: person.id }) }, 'Añadir regalo para ' + person.name));

    const personGifts = giftsOf(person.id);
    if (personGifts.length) {
      const pending = personGifts.filter(gift => gift.status === 'Idea' || gift.status === 'Comprar');
      const planned = pending.reduce((total, gift) => total + (Number(gift.price) || 0), 0);
      const spent = personGifts.filter(gift => gift.status === 'Comprado' || gift.status === 'Entregado').reduce((total, gift) => total + (Number(gift.price) || 0), 0);
      wrap.append(h('div', { class: 'card', style: 'display:flex;text-align:center;margin-top:14px;margin-bottom:14px;padding:0;overflow:hidden' },
        h('div', { style: 'flex:1;padding:14px 6px' },
          h('b', { style: 'font-size:17px;display:block' }, fmtEur(planned)),
          h('span', { style: 'font-size:11.5px;color:var(--text-2)' }, 'planificado · ' + pending.length + (pending.length === 1 ? ' regalo' : ' regalos'))
        ),
        h('div', { style: 'width:1px;background:var(--border-soft)' }),
        h('div', { style: 'flex:1;padding:14px 6px' },
          h('b', { style: 'font-size:17px;display:block' }, fmtEur(spent)),
          h('span', { style: 'font-size:11.5px;color:var(--text-2)' }, 'gastado en total')
        )
      ));
      wrap.append(h('button', { class: 'btn btn-soft btn-block', style: 'margin-bottom:20px', onclick: () => go('giftHistory', { id: person.id }) },
        h('span', { class: 'ic', html: icon('clock', 15) }), 'Historial de regalos'));
    }

    const groups = [['Pendientes', ['Idea', 'Comprar']], ['Comprados', ['Comprado']], ['Entregados', ['Entregado']]];
    for (const [label, statuses] of groups) {
      const items = personGifts.filter(gift => statuses.includes(gift.status));
      wrap.append(h('div', { class: 'section-title' }, h('span', null, label + ' · ' + items.length)));
      if (!items.length) {
        wrap.append(h('div', { style: 'border:1.5px dashed var(--border);border-radius:var(--r-l);background:var(--surface-2);padding:16px;text-align:center;color:var(--text-3);font-size:12.5px;margin-bottom:4px' }, 'Nada aquí todavía.'));
        continue;
      }
      for (const gift of items) wrap.append(giftRow(gift));
    }
    return wrap;
  }

  function scrPersonAbout() {
    const person = S.people.find(item => item.id === route.params.id);
    if (!person) {
      go('gifts', undefined, { replace: true });
      return h('div');
    }
    const back = app.components.smartBack('person', { id: person.id });
    const wrap = h('div');
    wrap.append(formHead('Sobre ' + person.name.split(' ')[0], back));
    const details = person.details || {};
    const rows = [];
    if (details.gustos) rows.push({ icon: 'heart', label: 'Gustos', value: details.gustos });
    if (details.favoritos) rows.push({ icon: 'star', label: 'Cosas favoritas', value: details.favoritos });
    if (person.notes) rows.push({ icon: 'pencil', label: 'Información', value: person.notes });
    const hasDates = Array.isArray(details.fechas) && details.fechas.length;
    if (!rows.length && !hasDates) {
      wrap.append(emptyState('heart', 'Sin información todavía', 'Añade sus gustos, cosas favoritas y fechas para acertar con los regalos.', 'Añadir información', () => personDetailsSheet(person)));
      return wrap;
    }
    const card = h('div', { class: 'card', style: 'text-align:left;padding:4px 18px;margin-bottom:20px' });
    for (const row of rows) {
      card.append(h('div', { style: 'display:flex;gap:12px;padding:14px 0;border-bottom:1px solid var(--border-soft)' },
        h('span', { class: 'r-ic', style: 'width:36px;height:36px;border-radius:12px;flex:none', html: icon(row.icon, 17) }),
        h('div', { style: 'min-width:0;flex:1' },
          h('b', { style: 'font-size:12px;color:var(--text-2);display:block;margin-bottom:4px' }, row.label),
          h('p', { style: 'font-size:14.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word' }, row.value)
        )
      ));
    }
    if (rows.length) card.lastChild.style.borderBottom = 'none';
    if (hasDates) {
      card.append(h('div', { style: 'padding:16px 0 18px' },
        h('b', { style: 'font-size:12px;color:var(--text-2);display:block;margin-bottom:10px' }, 'Fechas importantes'),
        h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px' }, details.fechas.slice().sort((first, second) => (first.date || '').slice(5) < (second.date || '').slice(5) ? -1 : 1).map(date =>
          h('span', { style: 'display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:99px;background:var(--primary-soft);border:1px solid var(--primary-softer);color:var(--primary);font-size:13px;font-weight:600' },
            (date.label || 'Fecha') + ' · ' + fmtShort(date.date)
          )
        ))
      ));
    }
    wrap.append(card);
    wrap.append(h('button', { class: 'btn btn-primary btn-block btn-lg', onclick: () => personDetailsSheet(person) }, 'Editar información'));
    return wrap;
  }

  Object.assign(app.features, {
    gifts: scrGifts,
    person: scrPerson,
    personAbout: scrPersonAbout,
    giftHistory: scrGiftHistory,
    giftAgenda: scrGiftAgenda,
    giftStats: scrGiftStats,
    personAboutTags,
    personDetailsSheet
  });
}
