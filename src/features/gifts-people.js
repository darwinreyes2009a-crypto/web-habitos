export function registerGiftsAndPeople(app) {
  const { h, icon, avatarEl, fmtShort, GIFT_STATUSES } = app.core;
  const { S, save } = app.state;
  const {
    route,
    ui,
    go,
    render,
    giftsOf,
    sortedUpcomingGifts,
    countdownTxt,
    statusCls,
    bdayTxt
  } = app.domain;
  const { headBar, searchBtn, formHead, emptyState, openSheet, closeOverlays, toast } = app.components;
  const { deletePerson } = app.actions;
  const { giftThumb } = app.features;

  function scrGifts() {
    const wrap = h('div');
    wrap.append(headBar('Regalos', 'Tus ideas y regalos pendientes', searchBtn(),
      h('button', { class: 'icon-btn', 'aria-label': 'Nueva persona', onclick: () => go('personForm'), html: icon('users', 19) }),
      h('button', { class: 'icon-btn', 'aria-label': 'Nuevo regalo', onclick: () => go('giftForm'), html: icon('plus', 20) })
    ));
    wrap.append(h('div', { class: 'seg', style: 'margin-bottom:20px' },
      h('button', { class: ui.giftTab === 'personas' ? 'on' : '', onclick: () => { ui.giftTab = 'personas'; go('gifts'); } }, 'Personas'),
      h('button', { class: ui.giftTab === 'todos' ? 'on' : '', onclick: () => { ui.giftTab = 'todos'; go('gifts'); } }, 'Todos los regalos')
    ));

    if (ui.giftTab === 'todos') {
      if (!S.gifts.length) {
        wrap.append(emptyState('gift', 'Aún no tienes regalos', 'Crea tu primera idea de regalo y asígnala a una persona.', 'Nuevo regalo', () => go('giftForm')));
      } else {
        for (const gift of sortedUpcomingGifts()) wrap.append(giftRow(gift));
      }
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
    wrap.append(h('div', { class: 'section-title' }, h('span', null, 'Próximos regalos')));
    const gifts = sortedUpcomingGifts();
    if (!gifts.length) {
      wrap.append(emptyState('gift', 'Sin ideas todavía', 'Añade tu primera idea y asígnala a una persona.', 'Nuevo regalo', () => go('giftForm')));
    } else {
      for (const gift of gifts.slice(0, 6)) wrap.append(giftRow(gift));
    }
    return wrap;
  }

  function giftRow(gift) {
    const person = S.people.find(item => item.id === gift.personId);
    return h('div', { class: 'gift-row', style: 'cursor:pointer', onclick: () => go('giftForm', { id: gift.id }) },
      giftThumb(gift),
      h('div', { style: 'flex:1;min-width:0' },
        h('b', { style: 'font-size:14px;font-weight:600;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, gift.title),
        h('span', { class: 'r-sub' }, (person ? person.name : 'Sin asignar') + (gift.price ? ' · ' + Number(gift.price).toFixed(2).replace('.', ',') + ' €' : '') + (gift.targetDate ? ' · ' + fmtShort(gift.targetDate) + countdownTxt(gift.targetDate) : ''))
      ),
      h('button', {
        class: 'stchip ' + statusCls(gift.status),
        title: 'Cambiar estado',
        onclick: event => { event.stopPropagation(); cycleStatus(gift); }
      }, gift.status)
    );
  }

  function cycleStatus(gift) {
    const index = GIFT_STATUSES.indexOf(gift.status);
    gift.status = GIFT_STATUSES[(index + 1) % GIFT_STATUSES.length];
    save();
    render();
    toast('Estado: ' + gift.status);
  }

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
    const groups = [['Pendientes', ['Idea', 'Comprar']], ['Comprados', ['Comprado']], ['Entregados', ['Entregado']]];
    for (const [label, statuses] of groups) {
      const items = giftsOf(person.id).filter(gift => statuses.includes(gift.status));
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

  Object.assign(app.features, { gifts: scrGifts, person: scrPerson, personAbout: scrPersonAbout, personAboutTags, personDetailsSheet });
}
