// Pantalla "Ahora": lo que toca en este momento, en una sola vista. Responde a
// la pregunta "¿qué hago?" sin tener que mirar el horario, las tareas y los
// hábitos por separado.
//
// La tarjeta grande es la pieza central: elige entre los bloques del día
// (clases del horario + hábitos con hora) el que está en curso y, si no hay
// nada, muestra el siguiente con su hora. El botón ejecuta de verdad: abre
// Modo Clase, marca el hábito o abre su ficha.

export function registerNow(app) {
  const { h, icon, todayStr, emojiAvatar } = app.core;
  const { S, save } = app.state;
  const { go, render } = app.domain;
  const { formHead, toast } = app.components;

  const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  /* Minutos que quedan del bloque. Usa los límites ya normalizados (un bloque
     nocturno termina en 1470, no en 30) para no decir "terminando" a las
     00:15 de una clase que aún sigue. */
  const leftOfBlock = (block, minutes) => {
    const at = block.end > 24 * 60 && minutes < block.end - 24 * 60 ? minutes + 24 * 60 : minutes;
    const left = block.end - at;
    if (left <= 0) return 'terminando';
    const hours = Math.floor(left / 60);
    return 'quedan ' + (hours ? hours + ' h ' : '') + (left % 60) + ' min';
  };
  const relTxt = (start, minutes) => {
    const left = start - minutes;
    if (left <= 0) return 'ahora';
    if (left < 60) return 'en ' + left + ' min';
    return 'en ' + Math.floor(left / 60) + ' h' + (left % 60 ? ' ' + (left % 60) + ' min' : '');
  };
  const isPatio = slot => !!(slot && (slot.kind === 'patio' || slot.room === 'patio'));
  const classTitle = slot => isPatio(slot) ? 'Patio' : app.class.blockNameOf(slot);

  /* --- La tarjeta zen ------------------------------------------------------ */

  function completeHabit(task) {
    const today = todayStr();
    if (app.core.isSkipped(task, today)) app.core.skipOn(task, today, false);
    const kind = app.core.kindOf(task);
    if (kind === 'avoid') {
      app.features.routineSheet(task);
      return;
    }
    if (kind === 'count' || kind === 'amount') app.features.setValue(task, today, app.core.targetOf(task) || 1);
    else app.core.toggleOn(task, today);
    task.updatedAt = Date.now();
    save();
    render();
    if (app.core.haptic) app.core.haptic();
    if (app.features.doneFx) app.features.doneFx(task.id);
    if (app.features.dayDoneFx) app.features.dayDoneFx();
    toast('Hecho · ' + task.title);
  }

  function zenAction(block, mode) {
    if (!block) return h('button', { class: 'btn btn-soft', onclick: () => go('taskForm') }, 'Añadir un hábito');
    if (block.kind === 'class') {
      return h('button', {
        class: 'btn ' + (mode === 'now' ? 'btn-primary' : 'btn-soft'),
        onclick: () => go('class')
      }, mode === 'now' ? 'Abrir clase' : 'Ver horario');
    }
    const task = block.task;
    if (mode === 'next') {
      return h('button', { class: 'btn btn-soft', onclick: () => app.features.routineSheet(task) }, 'Abrir detalle');
    }
    if (app.core.isDoneOn(task, todayStr())) {
      return h('button', { class: 'btn btn-soft', onclick: () => app.features.routineSheet(task) }, 'Ver detalle');
    }
    return h('button', { class: 'btn btn-primary', onclick: () => completeHabit(task) }, 'Completar ahora');
  }

  function zenCard({ block, mode, descanso, minutes }) {
    const attrs = { class: 'now-zen', 'data-mode': mode, 'aria-labelledby': 'now-zen-title' };
    if (block && block.kind === 'habit') attrs['data-task-id'] = block.task.id;
    const card = h('section', attrs);

    let title = 'Nada programado';
    let sub = descanso
      ? descanso.label + ' · el horario sigue guardado'
      : 'Aprovecha para respirar o marca un hábito';
    let time = '';

    if (block && block.kind === 'class') {
      const slot = block.slot;
      title = classTitle(slot);
      time = String(slot.start).slice(0, 5) + '–' + String(slot.end).slice(0, 5);
      if (mode === 'now') {
        sub = leftOfBlock(block, minutes) + (app.class.roomTxt(slot) ? ' · ' + app.class.roomTxt(slot) : '');
      } else {
        sub = 'A las ' + String(slot.start).slice(0, 5) + ' · ' + relTxt(block.start, minutes) +
          (app.class.roomTxt(slot) ? ' · ' + app.class.roomTxt(slot) : '');
      }
    } else if (block && block.kind === 'habit') {
      const task = block.task;
      const done = app.core.isDoneOn(task, todayStr());
      title = task.title;
      time = app.core.minutesTxt(block.start);
      sub = mode === 'now'
        ? (done ? 'Completado hoy' : 'Programado a las ' + time + ' · sin completar')
        : 'A las ' + time + ' · ' + relTxt(block.start, minutes);
    }

    card.append(h('div', { class: 'zen-top' },
      h('span', { class: 'zen-eyebrow' }, mode === 'now' ? 'Ahora' : block ? 'Después' : 'Ahora'),
      time ? h('span', { class: 'zen-time' }, time) : null
    ));
    card.append(h('div', { class: 'zen-main' },
      block && block.kind === 'habit'
        ? emojiAvatar(block.task, 56)
        : h('span', { class: 'zen-ico', 'aria-hidden': 'true', html: icon(block && block.kind === 'class' ? 'calendar' : 'moon', 26) }),
      h('div', { class: 'zen-copy' },
        h('b', { id: 'now-zen-title' }, title),
        h('span', null, sub)
      )
    ));
    if (!block) {
      card.append(h('p', { class: 'zen-hint' }, descanso
        ? 'Hoy no tienes clases y no queda ningún hábito con hora.'
        : 'No hay nada a esta hora. Disfruta el hueco.'));
    } else if (mode !== 'now') {
      card.append(h('p', { class: 'zen-hint' }, 'Ahora mismo no hay nada programado.'));
    }
    card.append(zenAction(block, mode));
    return card;
  }

  function scrNow() {
    const today = todayStr();
    const wrap = h('div');
    wrap.append(formHead('Ahora', app.components.smartBack('home')));

    const descanso = app.class.todayBreak ? app.class.todayBreak() : null;
    const slots = app.class.slotsOnDate ? app.class.slotsOnDate(today) : [];
    const minutes = nowMinutes();
    const dueTasks = (S.tasks || []).filter(task => app.core.isDueOn(task, today));
    const blocks = app.core.buildDayBlocks({ slots, tasks: dueTasks, ymd: today, isDueOn: app.core.isDueOn });
    const { current, next } = app.core.pickDayBlock(blocks, minutes);
    wrap.append(zenCard(current
      ? { block: current, mode: 'now', minutes, descanso }
      : { block: next, mode: 'next', minutes, descanso }));

    /* --- Tareas de hoy ---------------------------------------------------- */
    const hoy = dueTasks;
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
            h('button', { style: 'flex:1;min-width:0;text-align:left;padding:0', onclick: () => app.features.routineSheet(task) },
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
