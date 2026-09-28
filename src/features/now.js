// Pantalla "Ahora": lo que toca en este momento, en una sola vista. Responde a
// la pregunta "¿qué hago?" sin tener que mirar el horario, las tareas y los
// hábitos por separado.

export function registerNow(app) {
  const { h, icon, todayStr, cap, WEEK_FULL } = app.core;
  const { S, save } = app.state;
  const { go, render } = app.domain;
  const { headBar, emptyState, formHead, toast } = app.components;

  const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const hmOf = time => { const p = String(time || '0:00').split(':'); return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0); };
  const leftTxt = slot => {
    const left = hmOf(slot.end) - nowMinutes();
    if (left <= 0) return 'terminando';
    const hours = Math.floor(left / 60);
    return 'quedan ' + (hours ? hours + ' h ' : '') + (left % 60) + ' min';
  };

  function scrNow() {
    const today = todayStr();
    const wrap = h('div');
    wrap.append(formHead('Ahora', app.components.smartBack('home')));

    const descanso = app.class.todayBreak ? app.class.todayBreak() : null;
    const slots = app.class.slotsOnDate ? app.class.slotsOnDate(today) : [];
    const minutes = nowMinutes();
    const actual = slots.find(slot => hmOf(slot.start) <= minutes && minutes < hmOf(slot.end)) || null;
    const siguiente = slots.find(slot => hmOf(slot.start) > minutes) || null;

    /* --- Bloque grande: la clase de ahora o la próxima ------------------- */
    if (descanso) {
      wrap.append(h('div', { class: 'now-hero rest' },
        h('span', { class: 'ic', html: icon('moon', 30) }),
        h('div', null,
          h('b', null, descanso.label),
          h('span', null, 'Hoy no tienes clases · ' + (slots.length ? 'el horario sigue guardado' : 'aprovecha el día'))
        )
      ));
    } else if (actual) {
      const patio = actual.kind === 'patio' || actual.room === 'patio';
      wrap.append(h('div', { class: 'now-hero live', style: 'border-left-color:' + (patio ? 'var(--amber)' : app.class.blockColorOf(actual)) },
        h('span', { class: 'now-badge' }, 'AHORA'),
        h('div', { style: 'flex:1;min-width:0' },
          h('b', null, patio ? 'Patio' : app.class.blockNameOf(actual)),
          h('span', null, String(actual.start).slice(0, 5) + '–' + String(actual.end).slice(0, 5) + ' · ' + leftTxt(actual) + (app.class.roomTxt(actual) ? ' · ' + app.class.roomTxt(actual) : ''))
        ),
        h('button', { class: 'btn btn-primary', style: 'padding:9px 14px;font-size:13px', onclick: () => go('class') }, 'Abrir clase')
      ));
    } else if (siguiente) {
      const patio = siguiente.kind === 'patio' || siguiente.room === 'patio';
      wrap.append(h('div', { class: 'now-hero' },
        h('span', { class: 'now-badge idle' }, 'DESPUÉS'),
        h('div', { style: 'flex:1;min-width:0' },
          h('b', null, patio ? 'Patio' : app.class.blockNameOf(siguiente)),
          h('span', null, 'A las ' + String(siguiente.start).slice(0, 5) + ' · ' + (() => {
            const left = hmOf(siguiente.start) - minutes;
            if (left <= 0) return 'ahora mismo';
            if (left < 60) return 'en ' + left + ' min';
            return 'en ' + Math.floor(left / 60) + ' h ' + (left % 60 ? (left % 60) + ' min' : '');
          })())
        ),
        h('button', { class: 'btn btn-soft', style: 'padding:9px 14px;font-size:13px', onclick: () => go('class') }, 'Ver horario')
      ));
    } else if (slots.length) {
      wrap.append(h('div', { class: 'now-hero' },
        h('span', { class: 'ic', html: icon('check', 28) }),
        h('div', null, h('b', null, 'Clases terminadas'), h('span', null, 'No te queda nada más por hoy'))
      ));
    } else {
      wrap.append(h('div', { class: 'now-hero' },
        h('span', { class: 'ic', html: icon('calendar', 28) }),
        h('div', null, h('b', null, 'Hoy no tienes clases'), h('span', null, WEEK_FULL[app.core.dowIdx(today)] + ' libre en el horario'))
      ));
    }

    /* --- Tareas de hoy ---------------------------------------------------- */
    const hoy = (S.tasks || []).filter(task => app.core.isDueOn(task, today));
    const pendientes = hoy.filter(task => !app.core.isDoneOn(task, today));
    const hechas = hoy.length - pendientes.length;

    wrap.append(h('div', { class: 'now-head' },
      h('h3', null, 'Tareas de hoy'),
      h('span', { class: 'now-count' }, hechas + '/' + hoy.length),
      h('button', { class: 'mini-btn', 'aria-label': 'Añadir tarea', onclick: () => go('taskForm'), html: icon('plus', 17) })
    ));
    if (!hoy.length) {
      wrap.append(h('p', { class: 'field-hint', style: 'padding:6px 2px 14px' }, 'No hay nada programado para hoy.'));
    } else {
      if (pendientes.length) {
        for (const task of pendientes.slice(0, 6)) {
          wrap.append(h('div', { class: 'row' },
            app.features.taskControl(task, today),
            h('div', { style: 'flex:1;min-width:0;cursor:pointer', onclick: () => app.features.routineSheet(task) },
              h('b', null, task.title),
              h('span', { class: 'r-sub' }, app.core.freqText(task))
            ),
            h('span', { class: 'r-ic', html: icon(task.icon || 'star', 18) })
          ));
        }
        if (pendientes.length > 6) {
          wrap.append(h('p', { class: 'field-hint', style: 'padding:2px 4px 10px' }, 'y ' + (pendientes.length - 6) + ' más…'));
        }
      } else {
        wrap.append(h('div', { class: 'row', style: 'opacity:.7' },
          h('span', { class: 'row-check done' }),
          h('div', { style: 'flex:1' }, h('b', { style: 'color:var(--text-2)' }, 'Todo hecho por hoy'), h('span', { class: 'r-sub' }, hechas + (hechas === 1 ? ' rutina cumplida' : ' rutinas cumplidas')))
        ));
      }
    }

    /* --- Regalos y cumpleaños de los próximos días ------------------------- */
    const hoyMes = today.slice(5);
    const cumple = (S.people || []).filter(person => person.birthday && person.birthday.slice(5) === hoyMes);
    const proximos = (S.people || []).filter(person => person.birthday && app.domain.bdayCountdown(person.birthday) && app.domain.bdayCountdown(person.birthday).days > 0 && app.domain.bdayCountdown(person.birthday).days <= 30);
    if (cumple.length || proximos.length) {
      wrap.append(h('div', { class: 'now-head', style: 'margin-top:22px' },
        h('h3', null, 'Cumpleaños'),
        h('button', { class: 'mini-btn', 'aria-label': 'Ver regalos', onclick: () => go('gifts'), html: icon('chev', 17) })
      ));
      for (const person of (cumple.length ? cumple : proximos.slice(0, 3))) {
        const days = app.domain.bdayCountdown(person.birthday).days;
        wrap.append(h('button', { class: 'row', style: 'width:100%;text-align:left', onclick: () => go('person', { id: person.id }) },
          h('span', { class: 'r-ic', html: icon('cake', 18) }),
          h('span', { style: 'flex:1;min-width:0' }, h('b', null, person.name), h('span', { class: 'r-sub' }, app.domain.bdayTxt(person.birthday))),
          days === 0 ? h('span', { class: 'stchip st-comprado' }, '¡Hoy!') : h('span', { style: 'font-size:12px;color:var(--text-3)' }, days + ' días')
        ));
      }
    }

    wrap.append(h('div', { style: 'display:flex;gap:8px;margin-top:24px' },
      h('button', { class: 'btn btn-soft', style: 'flex:1;font-size:13px', onclick: () => go('tasks') }, h('span', { class: 'ic', html: icon('list', 16) }), 'Tareas'),
      h('button', { class: 'btn btn-soft', style: 'flex:1;font-size:13px', onclick: () => go('class') }, h('span', { class: 'ic', html: icon('calendar', 16) }), 'Clase'),
      h('button', { class: 'btn btn-soft', style: 'flex:1;font-size:13px', onclick: () => go('gifts') }, h('span', { class: 'ic', html: icon('gift', 16) }), 'Regalos')
    ));
    return wrap;
  }

  Object.assign(app.features, { scrNow });
}
