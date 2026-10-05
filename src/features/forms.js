export function registerForms(app) {
  const {
    $,
    h,
    uid,
    icon,
    avatarEl,
    todayStr,
    addDaysYmd,
    dowIdx,
    COLORS,
    ICON_CHOICES,
    WEEK_L,
    GIFT_STATUSES,
    OCCASIONS,
    REMIND_DAYS
  } = app.core;
  const { S, save } = app.state;
  const {
    route,
    go,
    categories,
    relationships,
    weekStats,
    isDueOn,
    isDoneOn,
    streakOf
  } = app.domain;
  const { headBar, formHead, emptyState, toast } = app.components;
  const { deleteTask, deleteGift, deletePerson } = app.actions;
  const { pickImage, setPhotoEl, viewImage } = app.services;

  function scrTaskForm() {
    const editing = route.params.id ? S.tasks.find(task => task.id === route.params.id) : null;
    const back = app.components.smartBack('tasks');
    // Guardar o eliminar también corta el historial: la ficha ya no existe.
    const wrap = h('div');
    wrap.append(formHead(editing ? 'Editar tarea' : 'Nueva tarea', back,
      editing ? h('button', { class: 'icon-btn', 'aria-label': 'Eliminar tarea', onclick: () => deleteTask(editing.id), html: icon('trash', 18) }) : null
    ));
    wrap.append(h('p', { class: 'big-q' }, '¿Qué tienes que hacer?'));
    let iconId = editing ? (editing.icon || 'star') : 'star';
    const quickIconCount = 8;
    const iconGrid = h('div', { class: 'icon-grid' });
    let showingAll = !ICON_CHOICES.slice(0, quickIconCount).some(choice => choice.id === iconId);

    function drawIcons() {
      iconGrid.innerHTML = '';
      const choices = showingAll ? ICON_CHOICES : ICON_CHOICES.slice(0, quickIconCount);
      for (const choice of choices) {
        iconGrid.append(h('button', {
          class: 'icon-opt' + (choice.id === iconId ? ' on' : ''),
          onclick: event => {
            iconId = choice.id;
            [...iconGrid.children].forEach(item => item.classList.remove('on'));
            event.currentTarget.classList.add('on');
          }
        }, h('span', { html: icon(choice.id, 22) }), h('span', null, choice.label)));
      }
    }
    drawIcons();
    const iconToggle = h('button', {
      class: 'btn btn-soft',
      style: 'width:100%;margin:-8px 0 18px;font-size:13px',
      onclick: () => {
        showingAll = !showingAll;
        drawIcons();
        iconToggle.textContent = showingAll ? 'Mostrar menos' : 'Mostrar más iconos';
      }
    }, showingAll ? 'Mostrar menos' : 'Mostrar más iconos');
    wrap.append(iconGrid, iconToggle);

    const titleInput = h('input', { class: 'input', type: 'text', placeholder: 'Ej. Sacar al perro', value: editing ? editing.title : '', maxlength: '60' });
    wrap.append(h('div', { class: 'field' }, h('label', null, 'Nombre de la tarea'), titleInput));
    const taskCategories = categories();
    if (editing && editing.cat && !taskCategories.includes(editing.cat)) taskCategories.push(editing.cat);
    const categorySelect = h('select', { class: 'input' }, taskCategories.map(category => h('option', { value: category, selected: editing && editing.cat === category }, category)));
    if (!editing) categorySelect.value = 'Hábitos';
    wrap.append(h('div', { class: 'field' }, h('label', null, 'Categoría'), categorySelect));

    // Plantillas personales guardadas en ajustes (y sincronizadas por cuenta).
    if (!Array.isArray(S.settings.taskTemplates)) S.settings.taskTemplates = [];
    const templateSelect = h('select', { class: 'input' },
      h('option', { value: '' }, 'Elige una plantilla…'),
      S.settings.taskTemplates.map((template, index) => h('option', { value: String(index) }, template.name || 'Plantilla ' + (index + 1)))
    );
    const templateName = h('input', { class: 'input', type: 'text', maxlength: '30', placeholder: 'Nombre para guardar esta plantilla' });
    const templateMessage = h('span', { class: 'field-hint', 'aria-live': 'polite' });
    wrap.append(h('div', { class: 'field' },
      h('label', null, 'Plantillas'),
      h('div', { style: 'display:flex;gap:8px' },
        templateSelect,
        h('button', { class: 'btn btn-soft', style: 'padding:9px 12px;font-size:12px;white-space:nowrap', onclick: () => {
          const template = S.settings.taskTemplates[Number(templateSelect.value)];
          if (!template) { toast('Elige una plantilla'); return; }
          applyTaskTemplate(template);
          templateMessage.textContent = 'Plantilla cargada';
        } }, 'Cargar')
      ),
      h('div', { style: 'display:flex;gap:8px;margin-top:8px' },
        templateName,
        h('button', { class: 'btn btn-soft', style: 'padding:9px 12px;font-size:12px;white-space:nowrap', onclick: () => {
          const name = templateName.value.trim() || titleInput.value.trim();
          if (!name) { toast('Pon un nombre antes de guardar la plantilla'); templateName.focus(); return; }
          const snapshot = readTaskData();
          snapshot.steps = snapshot.steps.map(step => ({ ...step, id: uid('st'), done: false, completedOn: [] }));
          if (snapshot.freq.type === 'once') snapshot.freq.date = undefined;
          S.settings.taskTemplates.push({ name: name.slice(0, 30), data: snapshot, updatedAt: Date.now() });
          templateSelect.append(h('option', { value: String(S.settings.taskTemplates.length - 1) }, name.slice(0, 30)));
          templateSelect.value = String(S.settings.taskTemplates.length - 1);
          templateName.value = '';
          save();
          templateMessage.textContent = 'Plantilla guardada y sincronizada';
          toast('Plantilla guardada');
        } }, 'Guardar')
      ),
      templateMessage
    ));

    // ---- Tipo de rutina: sí/no, contador, cantidad o evitar -------------------
    wrap.append(h('p', { class: 'big-q' }, '¿Cómo se cumple?'));
    let kindId = editing ? app.core.kindOf(editing) : 'check';
    const kindSegment = h('div', { class: 'seg', style: 'flex-wrap:wrap;margin-bottom:10px' });
    const kindZone = h('div', { style: 'margin-bottom:18px' });
    let stepsSection = null;
    function drawKindSegment() {
      kindSegment.innerHTML = '';
      for (const kind of app.core.KINDS) {
        kindSegment.append(h('button', {
          class: kindId === kind.id ? 'on' : '',
          onclick: () => {
            kindId = kind.id;
            drawKindSegment();
            drawKindZone();
          }
        }, kind.label));
      }
    }
    function drawKindZone() {
      kindZone.innerHTML = '';
      targetInput = null;
      unitInput = null;
      goalInput = null;
      const current = app.core.KINDS.find(kind => kind.id === kindId);
      kindZone.append(h('p', { class: 'field-hint', style: 'margin:0 0 10px' }, current.hint));
      if (app.core.isNumeric({ kind: kindId })) {
        const target = h('input', { class: 'input', type: 'number', min: '0', max: '999', value: editing && editing.target ? editing.target : (kindId === 'count' ? 2 : 10), style: 'max-width:120px' });
        targetInput = target;
        const unit = h('input', { class: 'input', type: 'text', maxlength: '14', value: editing && editing.unit ? editing.unit : '', placeholder: 'vasos, páginas, min' });
        unitInput = unit;
        kindZone.append(h('div', { style: 'display:grid;grid-template-columns:120px 1fr;gap:10px' },
          h('div', { class: 'field' }, h('label', null, kindId === 'count' ? 'Al día' : 'Objetivo'), target),
          h('div', { class: 'field' }, h('label', null, 'Unidad'), unit)
        ));
        kindZone.append(h('p', { class: 'field-hint' }, 'Podrás sumar y restar con los botones, o poner la cifra exacta con un toque.'));
      }
      if (kindId !== 'avoid') kindZone.append(goalField());
      if (kindId === 'avoid') {
        kindZone.append(h('p', { class: 'field-hint' }, 'Los días que no marques cuentan como buenos. Marcar es decir «lo he hecho mal».'));
      }
    }
    let targetInput = null;
    let unitInput = null;
    let goalInput = null;
    function goalField() {
      const input = h('input', { class: 'input', type: 'number', min: '0', max: '7', value: editing && editing.goal ? editing.goal : '', placeholder: '5', style: 'max-width:110px' });
      goalInput = input;
      return h('div', { class: 'field' },
        h('label', null, 'Objetivo semanal'),
        input,
        h('p', { class: 'field-hint' }, 'Opcional. Con esto la app te avisa cuando llegas al 4 de 7, por ejemplo.')
      );
    }
    drawKindSegment();
    drawKindZone();
    wrap.append(kindSegment, kindZone);

    wrap.append(h('p', { class: 'big-q' }, '¿Cuándo?'));
    let frequencyType = editing ? (editing.freq || {}).type || 'daily' : 'daily';
    const frequencySegment = h('div', { class: 'seg', style: 'flex-wrap:wrap;margin-bottom:14px' });
    const frequencyOptions = [['daily', 'Todos los días'], ['weekdays', 'Días concretos'], ['weekly', 'Semanal'], ['monthly', 'Mensual'], ['every', 'Cada N días'], ['once', 'Una vez']];
    let frequencyDays = editing && editing.freq ? (editing.freq.days || []).slice() : [];
    let monthDay = editing && editing.freq ? editing.freq.dom || 1 : 1;
    let everyValue = editing && editing.freq ? editing.freq.every || 3 : 3;
    let fromValue = editing && editing.freq ? editing.freq.from || todayStr() : todayStr();
    let onceDate = editing && editing.freq ? editing.freq.date || todayStr() : todayStr();
    const frequencyZone = h('div', { style: 'margin-bottom:16px' });
    for (const [value, label] of frequencyOptions) {
      frequencySegment.append(h('button', {
        class: frequencyType === value ? 'on' : '',
        onclick: event => {
          frequencyType = value;
          [...frequencySegment.children].forEach(item => item.classList.remove('on'));
          event.currentTarget.classList.add('on');
          drawFrequencyZone();
        }
      }, label));
    }

    function drawFrequencyZone() {
      frequencyZone.innerHTML = '';
      if (frequencyType === 'weekdays' || frequencyType === 'weekly') {
        const row = h('div', { class: 'wchips' });
        for (let index = 0; index < 7; index++) {
          row.append(h('button', {
            class: 'wchip' + (frequencyDays.includes(index) ? ' on' : ''),
            onclick: event => {
              if (frequencyType === 'weekly') {
                frequencyDays = [index];
                [...row.children].forEach(item => item.classList.remove('on'));
                event.currentTarget.classList.add('on');
              } else {
                const dayIndex = frequencyDays.indexOf(index);
                if (dayIndex >= 0) {
                  frequencyDays.splice(dayIndex, 1);
                  event.currentTarget.classList.remove('on');
                } else {
                  frequencyDays.push(index);
                  event.currentTarget.classList.add('on');
                }
              }
            }
          }, WEEK_L[index]));
        }
        frequencyZone.append(h('label', { style: 'display:block;font-size:12.5px;font-weight:700;margin-bottom:10px' }, frequencyType === 'weekly' ? '¿Qué día de la semana?' : 'Elige los días'), row);
        if (!frequencyDays.length && frequencyType === 'weekly') frequencyDays = [dowIdx(todayStr())];
      } else if (frequencyType === 'every') {
        const everyInput = h('input', { class: 'input', type: 'number', min: '1', max: '60', value: everyValue, style: 'max-width:110px' });
        const fromInput = h('input', { class: 'input', type: 'date', value: fromValue, style: 'max-width:180px' });
        everyInput.addEventListener('input', () => { everyValue = Number(everyInput.value) || 1; });
        fromInput.addEventListener('change', () => {
          fromValue = fromInput.value || '';
          fromAnyInput.value = fromValue;
        });
        frequencyZone.append(h('label', { style: 'display:block;font-size:12.5px;font-weight:700;margin-bottom:10px' }, '¿Cada cuántos días?'),
          everyInput,
          h('label', { style: 'display:block;font-size:12.5px;font-weight:700;margin:14px 0 10px' }, 'Contando desde…'),
          fromInput,
          h('p', { class: 'field-hint' }, 'Ej.: cada 3 días para ir al gimnasio, o cada 2 para cambiar las sábanas.'));
      } else if (frequencyType === 'monthly') {
        const dayInput = h('input', { class: 'input', type: 'number', min: '1', max: '31', value: String(monthDay), style: 'max-width:120px' });
        dayInput.addEventListener('input', () => { monthDay = Math.max(1, Math.min(31, parseInt(dayInput.value) || 1)); });
        frequencyZone.append(h('label', { style: 'display:block;font-size:12.5px;font-weight:700;margin-bottom:10px' }, '¿Qué día del mes?'), dayInput);
      } else if (frequencyType === 'once') {
        const dateInput = h('input', { class: 'input', type: 'date', value: onceDate, style: 'max-width:220px' });
        dateInput.addEventListener('change', () => { onceDate = dateInput.value; });
        frequencyZone.append(h('label', { style: 'display:block;font-size:12.5px;font-weight:700;margin-bottom:10px' }, '¿Para qué día?'), dateInput);
      }
    }

    frequencySegment.style.display = 'flex';
    [...frequencySegment.children].forEach((button, index) => {
      button.classList.toggle('on', frequencyOptions[index][0] === frequencyType);
    });
    wrap.append(frequencySegment, frequencyZone);
    drawFrequencyZone();
    const timeInput = h('input', { class: 'input', type: 'time', value: editing ? editing.time || '' : '' });
    wrap.append(h('p', { class: 'big-q' }, '¿A qué hora?'), h('div', { class: 'field' }, timeInput, h('p', { class: 'field-hint' }, 'Opcional. Se mostrará como recordatorio junto al nombre.')));

    const prioritySelect = h('select', { class: 'input' },
      h('option', { value: '0' }, 'Normal'),
      h('option', { value: '1' }, 'Alta'),
      h('option', { value: '2' }, 'Urgente')
    );
    prioritySelect.value = String(editing ? Number(editing.priority) || 0 : 0);
    const dueDateInput = h('input', { class: 'input', type: 'date', value: editing ? editing.dueDate || '' : '' });
    wrap.append(h('p', { class: 'big-q' }, 'Prioridad y fecha límite'),
      h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px' },
        h('div', { class: 'field' }, h('label', null, 'Prioridad'), prioritySelect),
        h('div', { class: 'field' }, h('label', null, 'Fecha límite'), dueDateInput)
      )
    );

    let steps = editing && Array.isArray(editing.steps)
      ? editing.steps.filter(step => step && typeof step === 'object').map(step => ({
        ...step,
        id: step.id || uid('st'),
        title: String(step.title || ''),
        instruction: String(step.instruction || ''),
        durationMinutes: Math.max(0, Number(step.durationMinutes) || 0),
        image: String(step.image || ''),
        completedOn: Array.isArray(step.completedOn) ? [...step.completedOn] : [],
        done: !!step.done
      }))
      : [];
    const stepsList = h('div', { class: 'guided-step-editor-list' });
    const stepInput = h('input', { class: 'input', type: 'text', maxlength: '80', placeholder: 'Ej. Preparar material' });

    // Collapsible: starts collapsed for new tasks with no steps,
    // expanded when editing a task that already has steps.
    let stepsExpanded = !!editing && steps.length > 0;
    const stepsChevronIcon = h('span', { html: icon('chev', 16), style: 'transition:transform var(--t-fast) var(--ease)' });
    if (!stepsExpanded) stepsChevronIcon.style.transform = 'rotate(-90deg)';
    const stepsBody = h('div', { class: 'collapsible-body' });
    if (!stepsExpanded) stepsBody.classList.add('collapsed');
    const stepsHead = h('button', {
      class: 'guided-step-head',
      type: 'button',
      style: 'width:100%;padding:14px 12px;border:none;background:transparent;display:flex;align-items:center;justify-content:space-between;cursor:pointer',
      onclick: () => {
        stepsExpanded = !stepsExpanded;
        stepsBody.classList.toggle('collapsed', !stepsExpanded);
        stepsChevronIcon.style.transform = stepsExpanded ? 'rotate(0)' : 'rotate(-90deg)';
      }
    },
      h('span', { class: 'big-q', style: 'margin:0' }, 'Pasos guiados'),
      h('span', { class: 'chev' }, stepsChevronIcon)
    );
    function drawSteps() {
      stepsList.innerHTML = '';
      steps.forEach((step, index) => {
        const title = h('input', { class: 'input', type: 'text', maxlength: '80', value: step.title, 'aria-label': 'Nombre del paso ' + (index + 1) });
        title.addEventListener('input', () => { step.title = title.value; });
        const instruction = h('textarea', { class: 'input', rows: '2', maxlength: '500', placeholder: 'Instrucciones (opcional)', 'aria-label': 'Instrucciones del paso ' + (index + 1) });
        instruction.value = step.instruction;
        instruction.addEventListener('input', () => { step.instruction = instruction.value; });
        const duration = h('input', { class: 'input', type: 'number', min: '0', max: '1440', value: step.durationMinutes || '', placeholder: '0', 'aria-label': 'Duración en minutos del paso ' + (index + 1) });
        duration.addEventListener('input', () => { step.durationMinutes = Math.max(0, Math.min(1440, Math.round(Number(duration.value) || 0))); });
        const imageButton = h('button', { class: 'btn btn-soft', type: 'button', onclick: () => pickImage(data => { step.image = data; drawSteps(); }) },
          h('span', { class: 'ic', html: icon('image', 15) }), step.image ? 'Cambiar imagen' : 'Añadir imagen');
        const imageView = step.image ? h('button', { class: 'guided-edit-image', type: 'button', 'aria-label': 'Ver imagen del paso ' + (index + 1), onclick: () => viewImage(step.image, step.title) }, h('img', { src: step.image, alt: step.title })) : null;
        const reorder = h('div', { class: 'guided-step-order' },
          h('button', { class: 'mini-btn', type: 'button', 'aria-label': 'Mover paso arriba', disabled: index === 0, onclick: () => { [steps[index - 1], steps[index]] = [steps[index], steps[index - 1]]; drawSteps(); } }, '↑'),
          h('button', { class: 'mini-btn', type: 'button', 'aria-label': 'Mover paso abajo', disabled: index === steps.length - 1, onclick: () => { [steps[index + 1], steps[index]] = [steps[index], steps[index + 1]]; drawSteps(); } }, '↓'),
          h('button', { class: 'mini-btn', type: 'button', 'aria-label': 'Quitar paso', onclick: () => { steps = steps.filter(item => item !== step); drawSteps(); }, html: icon('trash', 15) })
        );
        stepsList.append(h('div', { class: 'guided-step-editor' },
          h('div', { class: 'guided-step-editor-head' }, h('b', null, 'Paso ' + (index + 1)), reorder),
          title,
          instruction,
          h('div', { class: 'guided-step-editor-media' }, duration, h('span', null, 'min'), imageButton, imageView)
        ));
      });
      // Auto-expand when steps exist so the user can see and edit them
      if (steps.length > 0 && !stepsExpanded) {
        stepsExpanded = true;
        stepsBody.classList.remove('collapsed');
        stepsChevronIcon.style.transform = '';
      }
    }
    const addStep = () => {
      const title = stepInput.value.trim();
      if (!title) { stepInput.focus(); return; }
      steps.push({ id: uid('st'), title, instruction: '', durationMinutes: 0, image: '', done: false, completedOn: [] });
      stepInput.value = '';
      drawSteps();
      stepInput.focus();
    };
    const addStepButton = h('button', { class: 'btn btn-soft', type: 'button', style: 'padding:9px 12px;white-space:nowrap', onclick: addStep }, 'Añadir paso');
    stepInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); addStep(); } });
    stepsBody.append(
      stepsList,
      h('div', { style: 'display:flex;gap:8px;margin-bottom:18px' }, stepInput, addStepButton),
      h('p', { class: 'field-hint', style: 'margin-top:-12px' }, 'Sin pasos, la actividad se completa con un toque. Añade varios para guiar la ejecución; cada uno puede llevar instrucciones, imagen y duración.')
    );
    drawSteps();
    stepsSection = h('section', { class: 'guided-step-settings collapsible' }, stepsHead, stepsBody);
    wrap.append(stepsSection);


    // Fecha de fin: la rutina deja de aparecer pasado ese día (fin de curso,
    // fin de temporada, hasta que se te pase la mania).
    const untilInput = h('input', { class: 'input', type: 'date', value: editing && editing.freq ? editing.freq.until || '' : '' });
    const fromAnyInput = h('input', { class: 'input', type: 'date', value: editing && editing.freq ? editing.freq.from || '' : '' });
    fromAnyInput.addEventListener('change', () => {
      if (frequencyType === 'every') fromValue = fromAnyInput.value || '';
    });
    wrap.append(h('p', { class: 'big-q' }, '¿Hasta cuándo?'),
      h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px' },
        h('div', { class: 'field' }, h('label', null, 'Empieza el'), fromAnyInput),
        h('div', { class: 'field' }, h('label', null, 'Termina el'), untilInput)
      ),
      h('p', { class: 'field-hint' }, 'Opcional. Deja el final en blanco si la rutina no acaba nunca.')
    );
    function readTaskData(title) {
      const numeric = kindId === 'count' || kindId === 'amount';
      const until = untilInput.value || '';
      const from = fromAnyInput.value || (frequencyType === 'every' ? fromValue : '');
      return {
        title: title == null ? titleInput.value.trim() : title,
        icon: iconId,
        cat: categorySelect.value,
        kind: kindId,
        target: numeric ? Math.max(0, Math.min(999, Math.round(Number(targetInput && targetInput.value) || 0))) : 0,
        unit: numeric && unitInput ? unitInput.value.trim().slice(0, 14) : '',
        goal: goalInput ? Math.max(0, Math.min(7, Math.round(Number(goalInput.value) || 0))) : 0,
        freq: {
          type: frequencyType,
          days: (frequencyType === 'weekdays' || frequencyType === 'weekly') ? [...new Set(frequencyDays)].sort() : undefined,
          dom: frequencyType === 'monthly' ? Math.max(1, Math.min(31, Math.round(Number(monthDay) || 1))) : undefined,
          date: frequencyType === 'once' ? onceDate : undefined,
          every: frequencyType === 'every' ? Math.max(1, Math.min(60, Math.round(Number(everyValue) || 1))) : undefined,
          from: from || undefined,
          until: until || undefined
        },
        time: timeInput.value || '',
        priority: Math.max(0, Math.min(2, Number(prioritySelect.value) || 0)),
        dueDate: dueDateInput.value || '',
        steps: steps.filter(step => step.title.trim()).map(step => ({
          ...step,
          id: step.id || uid('st'),
          title: step.title.trim().slice(0, 80),
          instruction: String(step.instruction || '').trim().slice(0, 500),
          durationMinutes: Math.max(0, Math.min(1440, Math.round(Number(step.durationMinutes) || 0))),
          image: String(step.image || ''),
          completedOn: Array.isArray(step.completedOn) ? [...new Set(step.completedOn)] : [],
          done: !!step.done
        }))
      };
    }

    function applyTaskTemplate(template) {
      const data = template && template.data ? template.data : template;
      if (!data || typeof data !== 'object') return;
      titleInput.value = data.title || '';
      iconId = data.icon || 'star';
      showingAll = !ICON_CHOICES.slice(0, quickIconCount).some(choice => choice.id === iconId);
      drawIcons();
      if (![...categorySelect.options].some(option => option.value === (data.cat || 'Hábitos'))) {
        categorySelect.append(h('option', { value: data.cat }, data.cat));
      }
      categorySelect.value = data.cat || 'Hábitos';
      kindId = data.kind || 'check';
      drawKindSegment();
      drawKindZone();
      if (targetInput) targetInput.value = String(data.target || 0);
      if (unitInput) unitInput.value = data.unit || '';
      if (goalInput) goalInput.value = String(data.goal || '');
      const freq = data.freq || { type: 'daily' };
      frequencyType = freq.type || 'daily';
      frequencyDays = Array.isArray(freq.days) ? [...freq.days] : [];
      monthDay = Number(freq.dom) || 1;
      everyValue = Number(freq.every) || 3;
      fromValue = freq.from || todayStr();
      onceDate = freq.date || todayStr();
      frequencySegment.querySelectorAll('button').forEach((button, index) => button.classList.toggle('on', frequencyOptions[index][0] === frequencyType));
      drawFrequencyZone();
      timeInput.value = data.time || '';
      prioritySelect.value = String(Math.max(0, Math.min(2, Number(data.priority) || 0)));
      dueDateInput.value = data.dueDate || '';
      fromAnyInput.value = freq.from || '';
      untilInput.value = freq.until || '';
      steps = Array.isArray(data.steps) ? data.steps.map(step => ({
        ...step,
        id: uid('st'),
        title: String(step.title || ''),
        instruction: String(step.instruction || ''),
        durationMinutes: Math.max(0, Number(step.durationMinutes) || 0),
        image: String(step.image || ''),
        completedOn: [],
        done: false
      })).filter(step => step.title) : [];
      drawSteps();
      templateName.value = template.name || '';
    }

    wrap.append(h('button', {
      class: 'btn btn-primary btn-block btn-lg',
      style: 'margin-top:10px',
      onclick: () => {
        const title = titleInput.value.trim();
        if (!title) {
          titleInput.focus();
          toast('Ponle un nombre a la tarea');
          return;
        }
        if ((frequencyType === 'weekdays' || frequencyType === 'weekly') && !frequencyDays.length) {
          toast('Elige al menos un día');
          return;
        }
        const data = readTaskData(title);
        if ((kindId === 'count' || kindId === 'amount') && !data.target) {
          toast('Pon el objetivo diario');
          return;
        }
        if (data.freq.from && data.freq.until && data.freq.until < data.freq.from) {
          toast('La fecha de fin va después de la de inicio');
          return;
        }
        // Evita que un registro anterior conserve el significado equivocado
        // (p. ej. checks de "leer" interpretados como fallos de "evitar").
        if (editing) app.core.prepareKindTransition(editing, kindId);
        if (editing) Object.assign(editing, data);
        else S.tasks.push({ id: uid('t'), createdAt: todayStr(), completions: [], log: {}, skips: [], ...data });
        save();
        back();
        toast(editing ? 'Tarea actualizada' : 'Tarea creada');
      }
    }, editing ? 'Guardar cambios' : 'Crear tarea'));
    const submitButton = wrap.querySelector('.btn-primary');
    if (submitButton) titleInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitButton.click();
      }
    });
    return wrap;
  }

  function scrGiftForm() {
    const editing = route.params.id ? S.gifts.find(gift => gift.id === route.params.id) : null;
    const back = () => {
      // Vuelve a donde estabas si hay historial; si vino de una persona, cae a su ficha.
      if (app.domain.routeStack.length) app.domain.goBack();
      else go(route.params.personId ? 'person' : 'gifts', route.params.personId ? { id: route.params.personId } : {}, { replace: true });
    };
    const wrap = h('div');
    wrap.append(formHead(editing ? 'Editar regalo' : 'Nueva idea de regalo', back,
      editing ? h('button', { class: 'icon-btn', 'aria-label': 'Eliminar', onclick: () => deleteGift(editing.id), html: icon('trash', 18) }) : null
    ));

    let imageData = editing ? editing.image || '' : '';
    const imageZone = h('div', { class: 'drop-img', type: 'button', style: 'cursor:pointer;text-align:center' });
    const imageActions = h('div', { style: 'display:flex;gap:10px;justify-content:center;margin-top:-6px' });
    function drawImage() {
      imageZone.innerHTML = '';
      imageActions.innerHTML = '';
      if (imageData) {
        imageZone.append(h('img', { src: imageData, alt: 'Foto del regalo', onclick: event => { event.stopPropagation(); viewImage(imageData, editing ? editing.title : 'Regalo'); } }));
        imageActions.append(
          h('button', { class: 'btn btn-soft', style: 'padding:9px 14px;font-size:13px', onclick: () => viewImage(imageData, editing ? editing.title : 'Regalo') }, 'Ver foto'),
          h('button', { class: 'btn btn-soft', style: 'padding:9px 14px;font-size:13px', onclick: () => pickImage(data => { imageData = data; drawImage(); }) }, 'Cambiar'),
          h('button', { class: 'btn btn-soft', style: 'padding:9px 14px;font-size:13px;color:var(--danger)', onclick: () => { imageData = ''; drawImage(); } }, 'Quitar')
        );
      } else {
        imageZone.append(h('span', { html: icon('image', 26) }), h('span', null, 'Añadir imagen'));
        imageZone.onclick = () => pickImage(data => { imageData = data; drawImage(); });
      }
    }
    drawImage();
    wrap.append(h('div', { class: 'field' }, imageZone), imageActions);
    const titleInput = h('input', { class: 'input', type: 'text', placeholder: 'Ej. Auriculares', value: editing ? editing.title : '', maxlength: '60' });
    wrap.append(h('div', { class: 'field' }, h('label', null, '¿Qué quieres regalar?'), titleInput));
    const personSelect = h('select', { class: 'input' },
      h('option', { value: '' }, 'Sin asignar'),
      S.people.map(person => h('option', { value: person.id, selected: editing ? editing.personId === person.id : route.params.personId === person.id }, person.name))
    );
    wrap.append(h('div', { class: 'field' }, h('label', null, '¿Para quién?'), personSelect));
    const priceInput = h('input', { class: 'input', type: 'number', step: '0.01', min: '0', placeholder: '0,00', value: editing && editing.price != null ? editing.price : '' });
    const dateInput = h('input', { class: 'input', type: 'date', value: editing ? editing.targetDate || '' : '' });
    const dateField = h('div', { class: 'field' }, h('label', null, '¿Para cuándo? (opcional)'), dateInput);
    function drawDateClear() {
      const old = dateField.querySelector('.clear-date');
      if (old) old.remove();
      if (dateInput.value) dateField.append(h('button', { class: 'clear-date link', style: 'font-size:12px;margin-top:2px', onclick: () => { dateInput.value = ''; drawDateClear(); } }, 'Quitar fecha'));
    }
    dateInput.addEventListener('change', drawDateClear);
    drawDateClear();
    wrap.append(h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px' },
      h('div', { class: 'field' }, h('label', null, 'Precio aproximado (€)'), priceInput),
      dateField
    ));
    const linkInput = h('input', { class: 'input', type: 'url', placeholder: 'Pegar enlace…', value: editing ? editing.link || '' : '' });
    wrap.append(h('div', { class: 'field' }, h('label', null, 'Enlace de la tienda'), linkInput));
    const occasionSelect = h('select', { class: 'input' }, OCCASIONS.map(occasion => h('option', { value: occasion, selected: editing && editing.occasion === occasion }, occasion)));
    if (!editing) occasionSelect.value = 'Cumpleaños';
    wrap.append(h('div', { class: 'field' }, h('label', null, 'Ocasión'), occasionSelect));

    let status = editing ? editing.status || 'Idea' : 'Idea';
    const statusSegment = h('div', { class: 'seg', style: 'flex-wrap:wrap' });
    for (const option of GIFT_STATUSES) {
      statusSegment.append(h('button', {
        class: option === status ? 'on' : '',
        onclick: event => {
          status = option;
          [...statusSegment.children].forEach(item => item.classList.remove('on'));
          event.currentTarget.classList.add('on');
        }
      }, option));
    }
    wrap.append(h('div', { class: 'field' }, h('label', null, 'Estado'), statusSegment));

    let starred = editing ? !!editing.starred : false;
    const starButton = h('button', {
      class: 'btn btn-soft btn-block',
      style: 'margin-top:2px' + (starred ? ';color:var(--amber);border-color:var(--amber-border)' : ''),
      onclick: () => {
        starred = !starred;
        starButton.style.color = starred ? 'var(--amber)' : '';
        starButton.style.borderColor = starred ? 'var(--amber-border)' : '';
        starButton.lastChild.textContent = starred ? ' Favorita ⭐' : ' Marcar como favorita';
      }
    }, h('span', { class: 'ic', html: icon('star', 16) }), starred ? ' Favorita ⭐' : ' Marcar como favorita');
    wrap.append(starButton);

    const remindSelect = h('select', { class: 'input' },
      h('option', { value: '', selected: !editing || editing.remindDays == null }, 'Aviso estándar (7 días antes)'),
      REMIND_DAYS.map(days => h('option', { value: String(days), selected: editing && editing.remindDays === days }, days === 1 ? '1 día antes' : days + ' días antes'))
    );
    wrap.append(h('div', { class: 'field' }, h('label', null, 'Avisarme antes'), remindSelect, h('p', { class: 'field-hint' }, 'Se activa cuando hay fecha y el estado es Idea o Comprar.')));

    const notesInput = h('textarea', { class: 'input', rows: '2', placeholder: 'Talla, color, detalles…', value: editing ? editing.notes || '' : '' });
    wrap.append(h('div', { class: 'field' }, h('label', null, 'Notas'), notesInput));
    wrap.append(h('button', {
      class: 'btn btn-primary btn-block btn-lg',
      style: 'margin-top:6px',
      onclick: () => {
        const title = titleInput.value.trim();
        if (!title) {
          titleInput.focus();
          toast('¿Qué quieres regalar?');
          return;
        }
        const data = {
          title,
          personId: personSelect.value || null,
          price: priceInput.value === '' ? null : Number(priceInput.value),
          targetDate: dateInput.value || '',
          link: linkInput.value.trim(),
          occasion: occasionSelect.value,
          status,
          notes: notesInput.value.trim(),
          image: imageData,
          starred,
          remindDays: remindSelect.value === '' ? null : Number(remindSelect.value)
        };
        if (editing) Object.assign(editing, data);
        else S.gifts.push({ id: uid('g'), createdAt: todayStr(), ...data });
        save();
        toast(editing ? 'Regalo actualizado' : 'Regalo guardado');
        back();
      }
    }, editing ? 'Guardar cambios' : 'Guardar regalo'));
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

  function scrPersonForm() {
    const editing = route.params.id ? S.people.find(person => person.id === route.params.id) : null;
    const back = app.components.smartBack('gifts');
    const wrap = h('div');
    wrap.append(formHead(editing ? 'Editar persona' : 'Nueva persona', back,
      editing ? h('button', { class: 'icon-btn', 'aria-label': 'Eliminar', onclick: () => deletePerson(editing), html: icon('trash', 18) }) : null
    ));
    let color = editing ? editing.color || COLORS[0] : COLORS[S.people.length % COLORS.length];
    const preview = h('div', { style: 'position:relative;display:inline-flex' });
    const swatches = h('div', { class: 'swatches', style: 'justify-content:center' });
    let photo = editing ? editing.photo || '' : '';
    const photoButton = h('button', { class: 'btn btn-soft', style: 'padding:8px 16px;font-size:12.5px;margin-top:10px', onclick: () => pickImage(data => { photo = data; drawPreview(); }, 512) });
    setPhotoEl(photoButton, photo);
    function drawPreview() {
      preview.innerHTML = '';
      preview.append(avatarEl($('#pfName') ? $('#pfName').value : (editing ? editing.name : ''), color, 64, photo));
      setPhotoEl(photoButton, photo);
      const remove = preview.querySelector('.rm-photo');
      if (!remove && photo) preview.append(h('button', { class: 'rm-photo', 'aria-label': 'Quitar foto', onclick: () => { photo = ''; drawPreview(); }, html: icon('x', 15) }));
    }
    const nameInput = h('input', { class: 'input', type: 'text', id: 'pfName', placeholder: 'Ej. Mamá, Carlos, Sofía…', value: editing ? editing.name : '', maxlength: '30' });
    nameInput.addEventListener('input', drawPreview);
    drawPreview();
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
    wrap.append(h('div', { style: 'display:flex;flex-direction:column;align-items:center;margin-bottom:18px' }, preview, photoButton), h('div', { class: 'field', style: 'margin-top:18px' }, h('label', null, 'Nombre'), nameInput));
    const personRelationships = relationships();
    if (editing && editing.relationship && !personRelationships.includes(editing.relationship)) personRelationships.push(editing.relationship);
    const relationshipSelect = h('select', { class: 'input' }, personRelationships.map(relationship => h('option', { value: relationship, selected: editing && editing.relationship === relationship }, relationship)));
    wrap.append(h('div', { class: 'field' }, h('label', null, 'Relación'), relationshipSelect));
    const birthdayInput = h('input', { class: 'input', type: 'date', value: editing ? editing.birthday || '' : '' });
    wrap.append(h('div', { class: 'field' }, h('label', null, 'Cumpleaños'), birthdayInput, h('p', { class: 'field-hint' }, 'Te avisaremos en Inicio cuando llegue el día.')));
    wrap.append(h('div', { class: 'field' }, h('label', null, 'Color del avatar'), swatches));
    const notesInput = h('textarea', { class: 'input', rows: '3', placeholder: 'Gustos, tallas, ideas que les gustan…', value: editing ? editing.notes || '' : '' });
    wrap.append(h('div', { class: 'field' }, h('label', null, 'Información'), notesInput));
    wrap.append(h('button', {
      class: 'btn btn-primary btn-block btn-lg',
      onclick: () => {
        const name = nameInput.value.trim();
        if (!name) {
          nameInput.focus();
          toast('Escribe un nombre');
          return;
        }
        const data = { name, color, photo, relationship: relationshipSelect.value, birthday: birthdayInput.value || '', notes: notesInput.value.trim() };
        if (editing) Object.assign(editing, data);
        else S.people.push({ id: uid('p'), ...data });
        save();
        toast(editing ? 'Persona actualizada' : 'Persona añadida');
        back();
      }
    }, editing ? 'Guardar cambios' : 'Guardar persona'));
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

  function scrProgress() {
    const wrap = h('div');
    wrap.append(headBar('Progreso', 'Tus hábitos esta semana',
      h('button', { class: 'icon-btn', 'aria-label': 'Volver', onclick: app.components.smartBack('home'), html: icon('back', 19) })
    ));
    const stats = weekStats(0, false, true);
    const percentage = stats.due ? Math.round(stats.done / stats.due * 100) : 0;
    wrap.append(h('div', { class: 'card', style: 'text-align:center;margin-bottom:20px' },
      h('div', { class: 'stat-big' }, percentage + '%'),
      h('p', { style: 'font-size:13px;color:var(--text-2);margin:4px 0 16px' }, 'de hábitos completados · ' + stats.done + ' de ' + stats.due),
      h('div', { class: 'bar' }, h('i', { style: 'width:' + percentage + '%' }))
    ));
    const recurring = S.tasks.filter(task => task.freq && task.freq.type !== 'once');
    wrap.append(h('div', { class: 'section-title' }, h('span', null, 'Hábitos')));
    if (!recurring.length) {
      wrap.append(emptyState('chart', 'Sin datos aún', 'Crea tareas repetitivas (diarias o semanales) para ver aquí tu progreso.', 'Crear hábito', () => go('taskForm')));
    } else {
      const card = h('div', { class: 'card' });
      for (const task of recurring) {
        let due = 0;
        let done = 0;
        let day = stats.start;
        const today = todayStr();
        for (let index = 0; index < 7; index++) {
          if (isDueOn(task, day) && day <= today) {
            due++;
            if (isDoneOn(task, day)) done++;
          }
          day = addDaysYmd(day, 1);
        }
        const taskPercentage = due ? Math.round(done / due * 100) : 0;
        card.append(h('div', { class: 'habit-row' },
          h('span', { class: 'r-ic', html: icon(task.icon || 'star', 18) }),
          h('div', { class: 'hb-mid' }, h('b', null, task.title), h('div', { class: 'bar mini' }, h('i', { style: 'width:' + taskPercentage + '%' }))),
          h('span', { class: 'hb-n' }, done + ' / ' + due)
        ));
      }
      wrap.append(card);
    }
    const best = Math.max(0, ...recurring.map(task => streakOf(task)));
    wrap.append(h('div', { class: 'section-title' }, h('span', null, 'Constancia')));
    wrap.append(h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px' },
      h('div', { class: 'card', style: 'text-align:center' }, h('div', { class: 'stat-big', style: 'font-size:26px' }, best), h('p', { style: 'font-size:12px;color:var(--text-2);margin-top:4px' }, 'Mejor racha (días)')),
      h('div', { class: 'card', style: 'text-align:center' }, h('div', { class: 'stat-big', style: 'font-size:26px' }, S.tasks.length), h('p', { style: 'font-size:12px;color:var(--text-2);margin-top:4px' }, 'Tareas creadas'))
    ));
    const pending = S.gifts.filter(gift => gift.status === 'Idea' || gift.status === 'Comprar');
    const budget = pending.reduce((total, gift) => total + (Number(gift.price) || 0), 0);
    wrap.append(h('div', { class: 'section-title' },
      h('span', null, 'Regalos'),
      h('button', { class: 'link', onclick: () => go('giftStats') }, 'Estadísticas')
    ));
    wrap.append(h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px' },
      h('div', { class: 'card', style: 'text-align:center' }, h('div', { class: 'stat-big', style: 'font-size:26px;color:var(--text)' }, pending.length), h('p', { style: 'font-size:12px;color:var(--text-2);margin-top:4px' }, 'Regalos pendientes')),
      h('div', { class: 'card', style: 'text-align:center' }, h('div', { class: 'stat-big', style: 'font-size:26px;color:var(--text)' }, budget.toFixed(0) + ' €'), h('p', { style: 'font-size:12px;color:var(--text-2);margin-top:4px' }, 'Presupuesto estimado'))
    ));
    return wrap;
  }

  Object.assign(app.features, { taskForm: scrTaskForm, giftForm: scrGiftForm, personForm: scrPersonForm, progress: scrProgress });
}
