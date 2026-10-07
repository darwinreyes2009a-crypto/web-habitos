// Piezas de interfaz de las rutinas: el control que cambia según el tipo de
// hábito, la barra del objetivo semanal, la acción de saltar día, el heatmap
// anual y la hoja de detalle de un día.

export function registerTaskRow(app) {
  const { h, icon, todayStr, fmtLong, WEEK_L, uid } = app.core;
  const { S, save } = app.state;
  const { toast, confirmDialog, openSheet, closeOverlays } = app.components;
  const {
    kindOf, isNumeric, targetOf, logOf, isSkipped, skipOn, progressOn,
    toggleOn, bumpOn, isDoneOn, isDueOn, streakOf, bestStreakOf,
    weekdayStreakOf, weekProgress, heatmapData
  } = app.core;

  const kindLabel = id => (app.core.KINDS.find(kind => kind.id === id) || app.core.KINDS[0]).label;

  /* --- Control según el tipo ---------------------------------------------- */

  // Devuelve el elemento que se pincha para cambiar el registro del día.
  function taskControl(task, ymd) {
    const kind = kindOf(task);
    const info = progressOn(task, ymd);
    const due = isDueOn(task, ymd);
    const base = 'flex:none;display:flex;align-items:center;gap:2px';

    if (Array.isArray(task.steps) && task.steps.some(step => step && String(step.title || '').trim())) {
      return h('button', {
        class: 'row-check' + (info.done ? ' done' : '') + (info.skipped ? ' skipped' : ''),
        'aria-label': 'Abrir actividad guiada: ' + task.title,
        'aria-pressed': info.done ? 'true' : 'false',
        disabled: !due,
        style: base,
        onclick: () => guidedTaskSheet(task, ymd)
      });
    }

    if (kind === 'check' || kind === 'avoid') {
      return h('button', {
        class: 'row-check' + (info.done ? ' done' : '') + (kind === 'avoid' && due && !info.done && !info.skipped ? ' failed' : '') + (info.skipped ? ' skipped' : ''),
        'aria-label': (info.skipped ? 'Día saltado; restaurar' : !due ? 'Hoy no toca' : kind === 'avoid' ? (info.done ? 'Día limpio; marcar como fallado' : 'Fallo registrado; quitarlo') : (info.done ? 'Marcar como pendiente' : 'Completar')) + ' el ' + fmtLong(ymd),
        'aria-pressed': !info.skipped && (kind === 'avoid' ? !info.done : info.done) ? 'true' : 'false',
        disabled: !due,
        style: base,
        onclick: () => {
          if (!isDueOn(task, ymd)) return;
          const apply = () => {
            if (info.skipped) skipOn(task, ymd, false);
            else toggleOn(task, ymd);
            task.updatedAt = Date.now();
            if (app.core.haptic) app.core.haptic(kind === 'avoid' && info.done ? [12, 24, 12] : undefined);
            after();
          };
          if (kind === 'avoid' && info.done && !info.skipped) {
            confirmDialog({
              title: '¿Marcar como fallado?',
              message: 'El ' + fmtLong(ymd) + ' contará como un día malo y bajará tu cumplimiento.',
              confirmText: 'Marcar',
              onConfirm: apply
            });
            return;
          }
          apply();
        }
      });
    }

    // Contador y cantidad: botón central + Incremento/decremento.
    const target = targetOf(task);
    const centre = h('button', {
      class: 'counter-val' + (info.done ? ' done' : '') + (info.partial ? ' partial' : '') + (info.skipped ? ' skipped' : ''),
      'aria-label': 'Valor del ' + fmtLong(ymd) + ': ' + info.value + (target ? ' de ' + target : ''),
      disabled: !due || info.skipped,
      onclick: () => { if (due && !isSkipped(task, ymd)) valueSheet(task, ymd); }
    },
      h('b', null, String(info.value)),
      target ? h('span', null, '/' + target) : null
    );
    if (info.skipped) {
      return h('button', {
        class: 'counter-val skipped',
        'aria-label': 'Día saltado. Toca para volver a hacerlo',
        disabled: !due,
        onclick: () => { skipOn(task, ymd, false); task.updatedAt = Date.now(); if (app.core.haptic) app.core.haptic(); after(); }
      }, h('b', null, '–'));
    }
    const step = kind === 'count' ? 1 : (target && target >= 20 ? 5 : 1);
    const bump = delta => () => {
      if (!isDueOn(task, ymd) || isSkipped(task, ymd)) return;
      bumpOn(task, ymd, delta);
      task.updatedAt = Date.now();
      if (app.core.haptic) app.core.haptic(5);
      after();
    };
    return h('div', { class: 'stepper' },
      h('button', {
        class: 'mini-btn', 'aria-label': 'Restar ' + step,
        disabled: !due || info.skipped || info.value <= 0,
        onclick: bump(-step), html: icon('minus', 16)
      }),
      centre,
      h('button', { class: 'mini-btn', 'aria-label': 'Sumar ' + step, disabled: !due || info.skipped, onclick: bump(step), html: icon('plus', 16) })
    );
  }

  function after() {
    save();
    app.domain.render();
  }

  // Hoja para poner el valor exacto (por ejemplo "he leído 42 páginas").
  function valueSheet(task, ymd) {
    const info = progressOn(task, ymd);
    const kind = kindOf(task);
    const step = kind === 'count' ? 1 : 5;
    let value = info.value;
    const label = h('b', { class: 'value-display' });
    const unit = task.unit ? ' ' + task.unit : '';
    const target = targetOf(task);
    const draw = () => { label.textContent = value + unit; };
    draw();
    const input = h('input', { class: 'input value-input', type: 'number', min: '0', value: value });
    input.addEventListener('input', () => { value = Math.max(0, Number(input.value) || 0); draw(); });
    const skipValue = () => {
      if (!isDueOn(task, ymd)) { toast('Ese día no tocaba'); return; }
      skipOn(task, ymd, !isSkipped(task, ymd));
      task.updatedAt = Date.now();
      after();
      closeOverlays();
    };
    openSheet(task.title, () => {
      const box = h('div', { style: 'text-align:center' });
      box.append(h('p', { class: 'field-hint', style: 'margin-bottom:14px' }, fmtLong(ymd) + (target ? ' · objetivo ' + target + unit : '')));
      box.append(label);
      box.append(h('div', { style: 'display:flex;align-items:center;justify-content:center;gap:14px;margin:18px 0' },
        h('button', { class: 'mini-btn', 'aria-label': 'Restar ' + step, onclick: () => { value = Math.max(0, value - step); input.value = value; draw(); }, html: icon('minus', 18) }),
        input,
        h('button', { class: 'mini-btn', 'aria-label': 'Sumar ' + step, onclick: () => { value += step; input.value = value; draw(); }, html: icon('plus', 18) })
      ));
      box.append(h('div', { style: 'display:flex;gap:8px' },
        h('button', { class: 'btn btn-soft', style: 'flex:1', onclick: () => { app.core.clearDay(task, ymd); task.updatedAt = Date.now(); after(); closeOverlays(); } }, 'Borrar'),
        h('button', { class: 'btn btn-soft', style: 'flex:1', onclick: skipValue }, isSkipped(task, ymd) ? 'Restaurar día' : 'Saltar hoy'),
        h('button', { class: 'btn btn-primary', style: 'flex:1', onclick: () => { setValue(task, ymd, value); after(); closeOverlays(); } }, 'Guardar')
      ));
      return box;
    });
  }

  function setValue(task, ymd, value) {
    app.core.setLog(task, ymd, value);
    task.updatedAt = Date.now();
  }

  /* --- Fila completa ------------------------------------------------------ */

  function priorityInfo(task) {
    const priority = Math.max(0, Math.min(2, Number(task.priority) || 0));
    return priority === 2 ? { label: 'Urgente', color: 'var(--danger)', background: 'var(--danger-soft)' }
      : priority === 1 ? { label: 'Alta', color: 'var(--amber)', background: 'var(--amber-soft)' }
        : null;
  }

  function stepsSheet(task) {
    const steps = Array.isArray(task.steps) ? task.steps : [];
    if (!steps.length) return;
    openSheet('Subtareas · ' + task.title, () => {
      const box = h('div');
      const summary = h('p', { class: 'field-hint', style: 'margin:-4px 0 12px' });
      const list = h('div', { style: 'display:flex;flex-direction:column;gap:6px' });
      const draw = () => {
        list.innerHTML = '';
        const completed = steps.filter(step => step.done).length;
        summary.textContent = completed + ' de ' + steps.length + ' completadas';
        for (const step of steps) {
          const check = h('input', { type: 'checkbox', checked: !!step.done, 'aria-label': 'Completar ' + step.title });
          check.addEventListener('change', () => {
            step.done = check.checked;
            task.updatedAt = Date.now();
            if (app.core.haptic) app.core.haptic();
            save();
            draw();
          });
          list.append(h('label', { style: 'display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--surface-2);border-radius:12px;cursor:pointer' },
            check,
            h('span', { style: step.done ? 'text-decoration:line-through;color:var(--text-2)' : '' }, step.title)
          ));
        }
      };
      draw();
      box.append(summary, list);
      return box;
    });
  }

  function stepDoneOn(step, ymd) {
    return !!(step && Array.isArray(step.completedOn) && step.completedOn.includes(ymd));
  }

  function setGuidedStep(task, step, ymd, completed) {
    if (!task || !isDueOn(task, ymd) || isSkipped(task, ymd)) return false;
    const activeSteps = (task.steps || []).filter(item => item && String(item.title || '').trim());
    if (!activeSteps.includes(step)) return false;
    if (!Array.isArray(step.completedOn)) step.completedOn = [];
    const index = step.completedOn.indexOf(ymd);
    if (completed && index < 0) step.completedOn.push(ymd);
    if (!completed && index >= 0) step.completedOn.splice(index, 1);
    const allDone = activeSteps.length > 0 && activeSteps.every(item => stepDoneOn(item, ymd));
    if (kindOf(task) === 'check' && allDone !== isDoneOn(task, ymd)) toggleOn(task, ymd);
    task.updatedAt = Date.now();
    save();
    return allDone;
  }

  function guidedTaskSheet(task, ymd, onProgress) {
    const steps = Array.isArray(task.steps) ? task.steps : [];
    if (!steps.length) return;
    closeOverlays();
    const overlay = h('div', { class: 'overlay', style: 'z-index:66', onclick: event => { if (event.target === overlay) close(); } });
    const close = () => { overlay.remove(); app.domain.render(); };
    const box = h('div', { class: 'sheet guided-sheet', style: 'max-width:460px;max-height:88vh;overflow:auto', role: 'dialog', 'aria-label': 'Actividad guiada: ' + task.title });
    const header = h('div', { class: 'sheet-head' },
      h('div', null, h('h3', { style: 'font-size:18px;font-weight:800' }, task.title), h('span', { class: 'r-sub' }, 'Actividad guiada')),
      h('button', { class: 'icon-btn', 'aria-label': 'Cerrar', onclick: close, html: icon('x', 18) })
    );
    const progress = h('div', { class: 'bar', style: 'margin:14px 0 18px' });
    const body = h('div');
    const actions = h('div', { style: 'display:flex;gap:8px;margin-top:16px' });
    const runnable = isDueOn(task, ymd) && !isSkipped(task, ymd);
    // Older tasks may already be completed for today without per-step history.
    // Seed only the new per-day field; never rewrite legacy `step.done` values.
    if (runnable && kindOf(task) === 'check' && isDoneOn(task, ymd) && !steps.some(step => stepDoneOn(step, ymd))) {
      for (const step of steps) {
        if (!Array.isArray(step.completedOn)) step.completedOn = [];
        step.completedOn.push(ymd);
      }
      save();
    }
    let activeIndex = Math.max(0, steps.findIndex(step => !stepDoneOn(step, ymd)));
    if (steps.every(step => stepDoneOn(step, ymd))) activeIndex = steps.length - 1;
    const draw = () => {
      const complete = steps.filter(step => stepDoneOn(step, ymd)).length;
      progress.innerHTML = '';
      progress.append(h('i', { style: 'width:' + Math.round(complete / steps.length * 100) + '%' }));
      body.innerHTML = '';
      const step = steps[activeIndex];
      const card = h('div', { class: 'activity-step' },
        h('span', { class: 'field-hint' }, 'Paso ' + (activeIndex + 1) + ' de ' + steps.length),
        h('h4', { style: 'font-size:20px;margin:5px 0 10px' }, step.title || 'Paso sin título'),
        step.instruction ? h('p', { style: 'white-space:pre-wrap;line-height:1.55;color:var(--text-2)' }, step.instruction) : null,
        Number(step.durationMinutes) > 0 ? h('span', { class: 'nav-badge', style: 'display:inline-flex;align-items:center;gap:4px;margin:8px 0' }, h('span', { class: 'ic', html: icon('clock', 13) }), step.durationMinutes + ' min') : null,
        step.image ? h('button', { class: 'guided-image', type: 'button', onclick: () => app.services.viewImage(step.image, step.title || task.title) }, h('img', { src: step.image, alt: step.title || task.title }), h('span', null, 'Ver imagen')) : null,
        h('button', {
          class: 'btn ' + (stepDoneOn(step, ymd) ? 'btn-soft' : 'btn-primary') + ' btn-block',
          disabled: !runnable,
          style: 'margin-top:14px',
          onclick: () => {
            const completed = !stepDoneOn(step, ymd);
            const allDone = setGuidedStep(task, step, ymd, completed);
            if (completed && !allDone) {
              const next = steps.findIndex((item, index) => index > activeIndex && !stepDoneOn(item, ymd));
              if (next >= 0) activeIndex = next;
              else activeIndex = steps.findIndex(item => !stepDoneOn(item, ymd));
            }
            draw();
            if (onProgress) onProgress();
            if (allDone && kindOf(task) === 'check') toast('Actividad completada');
          }
        }, stepDoneOn(step, ymd) ? 'Desmarcar este paso' : 'Completar paso')
      );
      if (isSkipped(task, ymd) && due) card.append(h('button', { class: 'btn btn-soft btn-block', style: 'margin-top:12px', onclick: () => {
        skipOn(task, ymd, false);
        task.updatedAt = Date.now();
        save();
        app.domain.render();
        close();
        guidedTaskSheet(task, ymd, onProgress);
      } }, 'Restaurar hoy y continuar'));
      else if (!runnable) card.append(h('p', { class: 'field-hint', style: 'margin-top:12px' }, 'Esta actividad no toca hoy.'));
      body.append(card);
      actions.innerHTML = '';
      actions.append(
        h('button', { class: 'btn btn-soft', style: 'flex:1', disabled: activeIndex <= 0, onclick: () => { activeIndex--; draw(); } }, 'Anterior'),
        h('button', { class: 'btn btn-soft', style: 'flex:1', disabled: activeIndex >= steps.length - 1, onclick: () => { activeIndex++; draw(); } }, 'Siguiente')
      );
    };
    box.append(header, progress, body, actions,
      h('button', { class: 'btn btn-soft btn-block', style: 'margin-top:12px', onclick: () => { overlay.remove(); app.domain.go('taskForm', { id: task.id }); } }, 'Editar actividad')
    );
    overlay.append(box);
    document.body.appendChild(overlay);
    draw();
  }

  function taskRow(task, ymd, options) {
    const op = options || {};
    const done = isDoneOn(task, ymd);
    const info = progressOn(task, ymd);
    const due = isDueOn(task, ymd);
    const streak = streakOf(task);
    const priority = priorityInfo(task);
    const steps = Array.isArray(task.steps) ? task.steps : [];
    const stepDone = steps.filter(step => step.done).length;
    const today = todayStr();
    const late = !!(task.dueDate && task.dueDate < today && !done && kindOf(task) !== 'avoid');
    const failedAvoid = kindOf(task) === 'avoid' && !done && due && !info.skipped;
    const routineStatus = info.skipped ? 'Saltado' : !due ? 'Hoy no toca' : failedAvoid ? 'Fallo registrado · toca para quitarlo' : app.core.freqText(task);
    const row = h('div', { class: 'row habit-row' + (info.skipped ? ' skipped' : '') + (failedAvoid ? ' failed-avoid' : '') + (priority ? ' priority-' + (Number(task.priority) === 2 ? 'urgent' : 'high') : ''), style: done && kindOf(task) !== 'avoid' ? 'opacity:.62' : '' },
      taskControl(task, ymd),
      h('div', {
        class: 'r-main',
        onclick: () => op.onOpen ? op.onOpen(task, ymd) : app.domain.go('taskForm', { id: task.id })
      },
        h('b', { style: done && kindOf(task) !== 'avoid' ? 'color:var(--text-2)' : '' }, task.title),
        h('span', { class: 'r-sub' }, routineStatus, streak > 0 ? ' · racha ' + streak : ''),
        h('span', { class: 'task-meta', style: 'display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:4px' },
          priority ? h('span', { style: 'font-size:10.5px;font-weight:700;color:' + priority.color + ';background:' + priority.background + ';padding:2px 7px;border-radius:99px' }, priority.label) : null,
          task.dueDate ? h('span', { style: 'font-size:11px;font-weight:600;color:' + (late ? 'var(--danger)' : 'var(--text-3)') }, (late ? 'Atrasada · ' : 'Límite · ') + app.core.fmtShort(task.dueDate)) : null,
          steps.length ? h('button', { class: 'link', style: 'font-size:11px', 'aria-label': 'Ver subtareas de ' + task.title, onclick: event => { event.stopPropagation(); stepsSheet(task); } }, stepDone + '/' + steps.length + ' subtareas') : null
        )
      ),
      failedAvoid ? h('span', { class: 'r-ic', style: 'width:auto;padding:0 8px;background:var(--danger-soft);color:var(--danger);font-size:11px;font-weight:700' }, 'Fallo') : null,
      h('span', { class: 'r-ic', html: icon(task.icon || 'star', 19) })
    );
    if (op.menu) row.append(op.menu(task, ymd));
    if (!due && !op.noDue) row.style.opacity = '.5';
    return row;
  }

  Object.assign(app.features, { taskRow, taskControl, goalBar, heatCard, routineSheet, setValue, kindLabel, priorityInfo, stepsSheet, guidedTaskSheet, stepDoneOn, setGuidedStep });

  /* --- Objetivo semanal ---------------------------------------------------- */

  function goalBar(task) {
    const goal = Number(task.goal) || 0;
    if (!goal) return null;
    const week = weekProgress(task, 0);
    const hit = week.done >= goal;
    return h('div', { class: 'goal' + (hit ? ' hit' : '') },
      h('div', { class: 'bar' }, h('i', { style: 'width:' + Math.round(week.ratio * 100) + '%' + (hit ? ';background:var(--green)' : '') })),
      h('span', { class: 'goal-t' }, week.done + '/' + goal + (hit ? ' · conseguida' : ''))
    );
  }

  /* --- Heatmap anual ------------------------------------------------------- */

  function heatCard(task) {
    const wrap = h('div', { class: 'heat' });
    const state = { year: new Date().getFullYear() };
    const body = h('div');
    const draw = () => {
      body.innerHTML = '';
      const mapa = heatmapData(task, state.year);
      const grid = h('div', { class: 'heat-grid' });
      for (const week of mapa.weeks) {
        const column = h('div', { class: 'heat-week' });
        for (const day of week) {
          if (!day.inYear) { column.append(h('i', { class: 'heat-cell blank' })); continue; }
          const level = day.skipped ? 'skip' : day.done ? 'l4' : day.value > 0 ? 'l2' : day.future ? 'fut' : day.due ? 'l0' : 'non';
          column.append(h('i', {
            class: 'heat-cell ' + level,
            title: day.ymd + (day.skipped ? ' · saltado' : day.done ? ' · hecho' : day.value > 0 ? ' · ' + day.value : '')
          }));
        }
        grid.append(column);
      }
      body.append(grid);
      // Una etiqueta por columna del heatmap, para que el mes caiga justo
      // encima de su semana. Si se pusieran solo los que cambian de mes, al
      // desplazar horizontalmente quedarían descuadrados.
      const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
      const months = h('div', { class: 'heat-months' });
      let last = '';
      for (const week of mapa.weeks) {
        const first = week.find(day => day.inYear);
        const month = first ? Number(first.ymd.slice(5, 7)) : 0;
        months.append(h('span', { class: 'heat-mon' }, month && month !== last ? MESES[month - 1] : ''));
        if (month) last = month;
      }
      body.insertBefore(months, grid);
      const total = mapa.weeks.flat().filter(d => d.due);
      const cumplidos = total.filter(d => d.done).length;
      body.append(h('p', { class: 'heat-sum' },
        cumplidos + ' de ' + total.length + ' días previstos en ' + state.year +
        (cumplidos ? ' · ' + Math.round(cumplidos / total.length * 100) + '%' : '')));
    };
    draw();
    wrap.append(h('div', { class: 'heat-head' },
      h('b', null, 'Mapa del año'),
      h('span', { class: 'heat-nav' },
        h('button', { class: 'mini-btn', 'aria-label': 'Año anterior', onclick: () => { state.year--; draw(); }, html: icon('back', 16) }),
        h('span', null, state.year),
        h('button', { class: 'mini-btn', 'aria-label': 'Año siguiente', onclick: () => { state.year++; draw(); }, html: icon('chev', 16) })
      )
    ));
    wrap.append(body);
    return wrap;
  }

  /* --- Ficha de una rutina -------------------------------------------------- */

  function routineSheet(task) {
    const today = todayStr();
    closeOverlays();
    const overlay = h('div', { class: 'overlay', style: 'z-index:66', onclick: event => { if (event.target === overlay) overlay.remove(); } });
    const sheet = h('div', { class: 'sheet', style: 'max-width:420px;max-height:86vh;overflow:auto', role: 'dialog' },
      h('div', { class: 'grabber' }),
      h('div', { class: 'sheet-head' },
        h('h3', { style: 'font-size:17px;font-weight:800' }, task.title),
        h('span', { class: 'r-sub' }, kindLabel(kindOf(task)) + ' · ' + app.core.freqText(task))
      )
    );
    const racha = streakOf(task);
    const mejor = bestStreakOf(task);
    const laborables = weekdayStreakOf(task);
    sheet.append(h('div', { class: 'stat-trio' },
      h('div', null, h('b', null, String(racha)), h('span', null, 'racha actual')),
      h('div', null, h('b', null, String(mejor)), h('span', null, 'mejor racha')),
      h('div', null, h('b', null, String(laborables)), h('span', null, 'días lectivos'))
    ));
    const bar = goalBar(task);
    if (bar) sheet.append(h('div', { style: 'margin:-2px 0 16px' }, bar));
    sheet.append(heatCard(task));

    // Últimos 14 días en detalle
    sheet.append(h('p', { class: 'section-title', style: 'margin-top:20px' }, h('span', null, 'Últimos 14 días')));
    const strip = h('div', { class: 'day-strip' });
    for (let index = 13; index >= 0; index--) {
      const ymd = app.core.addDaysYmd(today, -index);
      const info = progressOn(task, ymd);
      const due = isDueOn(task, ymd);
      const avoidFailed = kindOf(task) === 'avoid' && due && !info.done && !info.skipped;
      strip.append(h('button', {
        class: 'day-cell' + (info.done ? ' on' : '') + (info.partial ? ' part' : '') + (avoidFailed ? ' fail' : '') + (info.skipped ? ' skip' : '') + (!due ? ' non' : '') + (ymd === today ? ' today' : ''),
        title: ymd + (info.skipped ? ' · saltado' : avoidFailed ? ' · fallo registrado' : info.done ? ' · limpio' : ''),
        'aria-label': ymd + (info.skipped ? ', día saltado' : avoidFailed ? ', fallo registrado' : info.done ? ', limpio' : ''),
        disabled: !due,
        onclick: () => {
          if (!due) { toast('Ese día no tocaba'); return; }
          if (info.skipped) skipOn(task, ymd, false);
          else if (kindOf(task) === 'avoid') {
            if (info.done) {
              confirmDialog({
                title: '¿Marcar como fallado?',
                message: 'El ' + fmtLong(ymd) + ' contará como un día malo.',
                confirmText: 'Marcar fallo',
                onConfirm: () => {
                  toggleOn(task, ymd);
                  task.updatedAt = Date.now();
                  after();
                  overlay.remove();
                }
              });
              return;
            }
            toggleOn(task, ymd);
          } else {
            if (isSkipped(task, ymd)) { toast('Restaura el día antes de registrar el hábito'); return; }
            setValue(task, ymd, info.done ? 0 : (targetOf(task) || 1));
          }
          task.updatedAt = Date.now();
          after();
          overlay.remove();
        }
      }, h('b', null, WEEK_L[app.core.dowIdx(ymd)]), h('span', null, String(ymd).slice(8, 10))));
    }
    sheet.append(strip);

    sheet.append(h('div', { style: 'display:flex;gap:8px;margin-top:18px' },
      h('button', { class: 'btn btn-soft', style: 'flex:1;font-size:13px', onclick: () => { overlay.remove(); app.domain.go('taskForm', { id: task.id }); } },
        h('span', { class: 'ic', html: icon('edit', 15) }), 'Editar'),
      h('button', {
        class: 'btn btn-soft', style: 'flex:1;font-size:13px',
        onclick: () => {
          if (!isDueOn(task, today)) { toast('Hoy no toca esta rutina'); return; }
          const saltado = isSkipped(task, today);
          skipOn(task, today, !saltado);
          task.updatedAt = Date.now();
          after();
          overlay.remove();
          toast(saltado ? 'Día restaurado' : 'Hoy saltado · no rompe la racha');
        }
      }, h('span', { class: 'ic', html: icon(skippedHoy(task) ? 'check' : 'calendar', 15) }), skippedHoy(task) ? 'Restaurar hoy' : 'Saltar hoy')
    ));
    overlay.append(sheet);
    document.body.append(overlay);
  }

  const skippedHoy = task => isSkipped(task, todayStr());

  Object.assign(app.features, { taskRow, taskControl, goalBar, heatCard, routineSheet, setValue, kindLabel });
}
