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
    OCCASIONS
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

    wrap.append(h('p', { class: 'big-q' }, '¿Cuándo?'));
    let frequencyType = editing ? (editing.freq || {}).type || 'daily' : 'daily';
    const frequencySegment = h('div', { class: 'seg', style: 'flex-wrap:wrap;margin-bottom:14px' });
    const frequencyOptions = [['daily', 'Todos los días'], ['weekdays', 'Días concretos'], ['weekly', 'Semanal'], ['monthly', 'Mensual'], ['once', 'Una vez']];
    let frequencyDays = editing && editing.freq ? (editing.freq.days || []).slice() : [];
    let monthDay = editing && editing.freq ? editing.freq.dom || 1 : 1;
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
        const data = {
          title,
          icon: iconId,
          cat: categorySelect.value,
          freq: {
            type: frequencyType,
            days: (frequencyType === 'weekdays' || frequencyType === 'weekly') ? [...frequencyDays].sort() : undefined,
            dom: frequencyType === 'monthly' ? monthDay : undefined,
            date: frequencyType === 'once' ? onceDate : undefined
          },
          time: timeInput.value || ''
        };
        if (editing) Object.assign(editing, data);
        else S.tasks.push({ id: uid('t'), createdAt: todayStr(), completions: [], ...data });
        save();
        back();
        toast(editing ? 'Tarea actualizada' : 'Tarea creada');
      }
    }, editing ? 'Guardar cambios' : 'Crear tarea'));
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
          image: imageData
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
    wrap.append(h('div', { class: 'section-title' }, h('span', null, 'Regalos')));
    wrap.append(h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px' },
      h('div', { class: 'card', style: 'text-align:center' }, h('div', { class: 'stat-big', style: 'font-size:26px;color:var(--text)' }, pending.length), h('p', { style: 'font-size:12px;color:var(--text-2);margin-top:4px' }, 'Regalos pendientes')),
      h('div', { class: 'card', style: 'text-align:center' }, h('div', { class: 'stat-big', style: 'font-size:26px;color:var(--text)' }, budget.toFixed(0) + ' €'), h('p', { style: 'font-size:12px;color:var(--text-2);margin-top:4px' }, 'Presupuesto estimado'))
    ));
    return wrap;
  }

  Object.assign(app.features, { taskForm: scrTaskForm, giftForm: scrGiftForm, personForm: scrPersonForm, progress: scrProgress });
}
