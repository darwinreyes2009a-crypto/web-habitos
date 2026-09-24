export function registerOnboarding(app) {
  const {
    h,
    uid,
    icon,
    avatarEl,
    hashPin,
    todayStr,
    COLORS,
    startLongPress,
    cancelLongPress,
    longPressFired
  } = app.core;
  const {
    S,
    save,
    normalizeData,
    switchProfileData,
    activeAccountUid,
    rememberPendingDeletes,
    SYNC_KEYS
  } = app.state;
  const { session, route, go, render, tasksDueOn, isDoneOn } = app.domain;
  const { openSheet, closeOverlays, confirmDialog, toast } = app.components;
  const { pickImage, setPhotoEl } = app.services;
  let pinBuffer = '';
  let pinKeyHandler = null;

  function welcomeScreen() {
    const box = h('div', { class: 'welcome-box' },
      h('div', { class: 'logo-mark', html: 'D' }),
      h('h2', null, 'DailyHub'),
      h('p', { class: 'lead' }, 'Tus tareas, hábitos, regalos y apuntes de clase, sincronizados en todos tus dispositivos con tu cuenta.'),
      h('div', { style: 'margin-bottom:22px' },
        feature('checksq', 'Tareas y hábitos', 'Marca tu día con un toque'),
        feature('pencil', 'Modo Clase', 'Deberes, material y notas rápidas'),
        feature('gift', 'Regalos por persona', 'Ideas, precios y fechas importantes')
      ),
      h('button', { class: 'btn btn-primary btn-block btn-lg', onclick: () => { S.meta.onboarded = true; save(); go('newProfile', { first: true }); } }, 'Empezar'),
      h('p', { style: 'font-size:11.5px;color:var(--text-3);margin-top:16px' }, 'Los cambios se sincronizan al instante entre tus dispositivos mediante tu cuenta.')
    );
    return h('div', { class: 'welcome' }, box);
  }

  function feature(iconName, title, subtitle) {
    return h('div', { class: 'feat' },
      h('span', { class: 'f-ic', html: icon(iconName, 20) }),
      h('div', null, h('b', null, title), h('span', null, subtitle))
    );
  }

  function newProfileScreen() {
    const first = route.params.first;
    const nameInput = h('input', { class: 'input', type: 'text', placeholder: 'Ej. Darwin', maxlength: '24', autocomplete: 'off' });
    const pinInput = h('input', { class: 'input', type: 'text', inputmode: 'numeric', maxlength: '6', placeholder: '•••••• (opcional)', autocomplete: 'off' });
    const pinConfirmationInput = h('input', { class: 'input', type: 'text', inputmode: 'numeric', maxlength: '6', placeholder: 'Repite el PIN', autocomplete: 'off' });
    const pinConfirmationField = h('div', { class: 'field hidden' }, h('label', null, 'Repite el PIN'), pinConfirmationInput);
    let color = COLORS[0];
    let newProfilePhoto = '';
    const avatarPreview = h('div', { style: 'position:relative;display:inline-flex' });
    const photoButton = h('button', { class: 'btn btn-soft', style: 'padding:8px 16px;font-size:12.5px;margin-top:12px', onclick: () => pickImage(data => { newProfilePhoto = data; drawNewAvatar(); }, 512) });
    setPhotoEl(photoButton, newProfilePhoto);

    function drawNewAvatar() {
      avatarPreview.innerHTML = '';
      avatarPreview.append(avatarEl(nameInput.value || '?', color, 72, newProfilePhoto));
      const remove = avatarPreview.querySelector('.rm-photo');
      if (!remove && newProfilePhoto) {
        avatarPreview.append(h('button', { class: 'rm-photo', 'aria-label': 'Quitar foto', onclick: () => { newProfilePhoto = ''; drawNewAvatar(); }, html: icon('x', 15) }));
      }
      setPhotoEl(photoButton, newProfilePhoto);
    }

    nameInput.addEventListener('input', drawNewAvatar);
    drawNewAvatar();
    const swatches = h('div', { class: 'swatches', style: 'justify-content:center;margin-bottom:18px' },
      COLORS.map(swatchColor => h('button', {
        type: 'button',
        class: 'swatch' + (swatchColor === color ? ' on' : ''),
        style: 'background:' + swatchColor,
        onclick: event => {
          color = swatchColor;
          [...swatches.children].forEach(item => item.classList.remove('on'));
          event.currentTarget.classList.add('on');
          drawNewAvatar();
        }
      }))
    );
    const error = h('p', { class: 'field-hint', style: 'color:var(--danger);min-height:16px;text-align:center' });

    function submit() {
      const name = nameInput.value.trim();
      if (!name) {
        error.textContent = 'Escribe tu nombre para continuar.';
        nameInput.focus();
        return;
      }
      const pin = pinInput.value.trim();
      if (pin && !/^\d{4,6}$/.test(pin)) {
        error.textContent = 'El PIN debe tener entre 4 y 6 dígitos.';
        return;
      }
      if (pin && pin !== pinConfirmationInput.value.trim()) {
        error.textContent = 'Los PIN no coinciden.';
        return;
      }
      const accountUid = activeAccountUid();
      const existing = first
        ? (S.profiles.find(profile => profile.id === accountUid) || (S.profiles.length === 1 ? S.profiles[0] : null))
        : (accountUid ? S.profiles.find(profile => profile.id === accountUid) : null);
      if (existing) {
        existing.name = name;
        existing.color = color;
        existing.photo = newProfilePhoto;
        existing.pin = pin ? hashPin(pin) : null;
        existing.pinLen = pin ? pin.length : null;
        existing.updatedAt = Date.now();
        S.activeProfileId = existing.id;
      } else {
        const profile = { id: uid('pr'), name, color, photo: newProfilePhoto, pin: pin ? hashPin(pin) : null, pinLen: pin ? pin.length : null };
        S.profiles.push(profile);
        S.activeProfileId = profile.id;
      }
      normalizeData();
      switchProfileData();
      session.unlocked = true;
      save();
      go('home');
    }

    nameInput.addEventListener('keydown', event => { if (event.key === 'Enter') submit(); });
    pinInput.addEventListener('input', () => {
      pinInput.value = pinInput.value.replace(/\D/g, '');
      pinConfirmationField.classList.toggle('hidden', !pinInput.value);
    });
    pinConfirmationInput.addEventListener('keydown', event => { if (event.key === 'Enter') submit(); });
    return h('div', { class: 'center-page' }, h('div', { class: 'center-box' },
      first ? h('div', { class: 'logo-mark', style: 'width:52px;height:52px;font-size:24px;margin-bottom:16px', html: 'D' }) : null,
      h('h2', { style: 'font-size:24px;font-weight:800;letter-spacing:-.03em' }, first ? 'Crea tu perfil' : 'Nuevo perfil'),
      h('p', { style: 'font-size:13px;color:var(--text-2);margin:6px 0 24px' }, 'Elige un color y, si quieres, un PIN para protegerlo.'),
      h('div', { style: 'display:flex;flex-direction:column;align-items:center;margin-bottom:20px' }, avatarPreview, photoButton),
      h('div', { class: 'field', style: 'text-align:left' }, h('label', null, 'Tu nombre'), nameInput),
      h('div', { class: 'field', style: 'text-align:left' }, h('label', null, 'PIN de acceso'), pinInput, h('p', { class: 'field-hint' }, 'De 4 a 6 dígitos. Puedes dejarlo vacío.')),
      pinConfirmationField,
      h('label', { style: 'display:block;font-size:12.5px;font-weight:700;margin-bottom:10px' }, 'Color del avatar'),
      swatches,
      error,
      h('button', { class: 'btn btn-primary btn-block btn-lg', style: 'margin-top:8px', onclick: submit }, first ? 'Crear y empezar' : 'Crear perfil'),
      !first ? h('button', { class: 'btn btn-soft btn-block', style: 'margin-top:10px', onclick: () => go('profiles') }, 'Cancelar') : null
    ));
  }

  function profileSelectScreen() {
    const wrap = h('div', { class: 'center-page' }, h('div', { class: 'center-box' },
      h('div', { class: 'logo-mark', style: 'width:52px;height:52px;font-size:24px;margin-bottom:18px', html: 'D' }),
      h('h2', { style: 'font-size:26px;font-weight:800;letter-spacing:-.03em' }, '¿Quién eres?'),
      h('p', { style: 'font-size:13.5px;color:var(--text-2);margin-top:6px' }, 'Selecciona tu perfil para continuar.'),
      S.profiles.length > 1 ? h('p', { style: 'font-size:12px;color:var(--text-3);margin-top:4px' }, 'Mantén pulsado un perfil para eliminarlo.') : null
    ));
    const grid = h('div', { class: 'profile-grid', style: 'width:100%;max-width:420px;margin:26px auto 0' });

    function deleteProfile(profile) {
      confirmDialog({
        title: '¿Eliminar "' + profile.name + '"?',
        message: 'Se borrarán también sus tareas, notas y regalos de este dispositivo. Esta acción no se puede deshacer.',
        confirmText: 'Eliminar perfil',
        onConfirm: () => {
          const index = S.profiles.findIndex(item => item.id === profile.id);
          if (index < 0) return;
          const oldBucket = S.data[profile.id] || {};
          rememberPendingDeletes('profiles', [profile.id]);
          for (const key of SYNC_KEYS) {
            rememberPendingDeletes(key, (oldBucket[key] || []).map(item => item && item.id).concat((oldBucket.__del && oldBucket.__del[key]) || []));
          }
          S.profiles.splice(index, 1);
          delete S.data[profile.id];
          S.activeProfileId = S.profiles[0] ? S.profiles[0].id : null;
          switchProfileData();
          session.unlocked = false;
          save();
          render();
          toast('Perfil "' + profile.name + '" eliminado');
        }
      });
    }

    function editProfileCardSheet(profile) {
      openSheet('Editar perfil', () => {
        let newColor = profile.color;
        let newPhoto = profile.photo || '';
        const body = h('div');
        const avatarPreview = h('div', { style: 'display:flex;justify-content:center;margin-bottom:16px;position:relative' });
        const nameInput = h('input', { class: 'input', type: 'text', value: profile.name, maxlength: '24', style: 'text-align:center;font-weight:700;font-size:17px' });
        const photoButton = h('button', { class: 'btn btn-soft', style: 'padding:8px 14px;font-size:12px;margin-top:10px' });
        function drawAvatar() {
          avatarPreview.innerHTML = '';
          avatarPreview.append(avatarEl(nameInput.value || profile.name, newColor, 64, newPhoto));
          if (newPhoto) {
            avatarPreview.append(h('button', { class: 'rm-photo', 'aria-label': 'Quitar foto', onclick: () => { newPhoto = ''; drawAvatar(); setPhotoEl(photoButton, ''); }, html: icon('x', 15) }));
          }
          setPhotoEl(photoButton, newPhoto);
        }
        photoButton.onclick = () => pickImage(data => { newPhoto = data; drawAvatar(); }, 512);
        drawAvatar();
        nameInput.addEventListener('input', drawAvatar);
        const swatches = h('div', { class: 'swatches', style: 'justify-content:center;margin:16px 0 22px' });
        for (const swatchColor of COLORS) {
          swatches.append(h('button', {
            class: 'swatch' + (swatchColor === newColor ? ' on' : ''),
            style: 'background:' + swatchColor,
            onclick: event => {
              newColor = swatchColor;
              [...swatches.children].forEach(item => item.classList.remove('on'));
              event.currentTarget.classList.add('on');
              drawAvatar();
            }
          }));
        }
        body.append(avatarPreview, photoButton,
          h('div', { class: 'field', style: 'margin-top:14px' }, h('label', null, 'Nombre'), nameInput),
          swatches,
          h('button', {
            class: 'btn btn-primary btn-block btn-lg',
            onclick: () => {
              const name = nameInput.value.trim();
              if (!name) {
                toast('El nombre no puede estar vacío');
                nameInput.focus();
                return;
              }
              const apply = () => {
                profile.name = name;
                profile.color = newColor;
                profile.photo = newPhoto;
                save();
                closeOverlays();
                render();
                toast('Perfil actualizado');
              };
              if (name !== profile.name) confirmDialog({ title: '¿Cambiar el nombre?', message: '“' + profile.name + '” pasará a llamarse “' + name + '”.', confirmText: 'Cambiar nombre', onConfirm: apply });
              else apply();
            }
          }, 'Guardar cambios')
        );
        const submitButton = body.querySelector('.btn-primary');
        if (submitButton) nameInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); submitButton.click(); } });
        return body;
      });
    }

    function showProfileActions(profile) {
      openSheet('Perfil de ' + profile.name, () => {
        const box = h('div');
        box.append(
          h('button', { class: 'set-row', onclick: () => { closeOverlays(); setTimeout(() => editProfileCardSheet(profile), 120); } }, h('span', { class: 'r-ic', html: icon('pencil', 18) }), h('span', null, 'Editar perfil'), h('span', { class: 'chev', html: icon('chev', 17) })),
          h('button', { class: 'set-row', onclick: () => { closeOverlays(); setTimeout(() => deleteProfile(profile), 120); } }, h('span', { class: 'r-ic', html: icon('trash', 18) }), h('span', { style: 'color:var(--danger)' }, 'Eliminar perfil'), h('span', { class: 'chev', html: icon('chev', 17) }))
        );
        return box;
      });
    }

    function selectProfile(profile) {
      S.activeProfileId = profile.id;
      switchProfileData();
      session.unlocked = false;
      save();
      render();
    }

    for (const profile of S.profiles) {
      const card = h('button', {
        class: 'person-card profile-card',
        style: 'min-height:140px',
        onclick: () => { if (longPressFired()) return; selectProfile(profile); },
        oncontextmenu: event => { event.preventDefault(); deleteProfile(profile); },
        onpointerdown: event => { if (event.pointerType === 'touch') startLongPress(() => showProfileActions(profile)); },
        onpointerup: cancelLongPress,
        onpointercancel: cancelLongPress,
        onpointerleave: cancelLongPress
      },
        avatarEl(profile.name, profile.color, 58, profile.photo),
        h('b', null, profile.name),
        h('span', null, profile.pin ? 'Protegido con PIN' : 'Sin PIN')
      );
      if (S.profiles.length > 1) {
        card.append(h('span', {
          class: 'profile-del',
          'aria-label': 'Eliminar perfil "' + profile.name + '"',
          title: 'Eliminar perfil',
          html: icon('trash', 14),
          onclick: event => { event.stopPropagation(); deleteProfile(profile); }
        }));
      }
      grid.append(card);
    }
    grid.append(h('button', { class: 'person-card add', onclick: () => go('newProfile') }, h('span', { class: 'f-ic', html: icon('plus', 22) }), h('b', null, 'Añadir perfil')));
    wrap.append(grid);
    return wrap;
  }

  function pinScreen(profile) {
    pinBuffer = '';
    const pinLength = Math.max(4, Math.min(6, Number(profile.pinLen) || 6));
    const dots = h('div', { class: 'pin-dots' }, [...Array(pinLength)].map(() => h('span', { class: 'pin-dot' })));
    const box = h('div', { class: 'center-box' });

    function draw() {
      [...dots.children].forEach((dot, index) => dot.classList.toggle('fill', index < pinBuffer.length));
    }

    function check() {
      let valid = hashPin(pinBuffer) === profile.pin;
      if (!valid && pinBuffer.length >= 4) {
        for (let length = 4; length <= pinBuffer.length; length++) {
          if (hashPin(pinBuffer.slice(0, length)) === profile.pin) {
            valid = true;
            break;
          }
        }
      }
      if (valid) {
        session.unlocked = true;
        pinBuffer = '';
        render();
        return;
      }
      box.classList.remove('shake');
      void box.offsetWidth;
      box.classList.add('shake');
      pinBuffer = '';
      draw();
    }

    function press(key) {
      if (key === 'del') {
        pinBuffer = pinBuffer.slice(0, -1);
        draw();
        return;
      }
      if (key === 'ok') {
        if (pinBuffer.length >= 4) check();
        return;
      }
      if (pinBuffer.length >= pinLength) return;
      pinBuffer += key;
      draw();
      if (pinBuffer.length === pinLength) setTimeout(check, 120);
    }

    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];
    const keypad = h('div', { class: 'keypad' }, keys.map(key => h('button', {
      class: 'key' + (key === 'ok' ? ' key-ok' : ''),
      'aria-label': key === 'del' ? 'Borrar' : key === 'ok' ? 'Confirmar' : key,
      onclick: () => press(key),
      html: key === 'del' ? icon('back', 22) : key === 'ok' ? icon('check', 22) : key
    })));
    box.append(
      h('div', { style: 'display:flex;justify-content:center' }, avatarEl(profile.name, profile.color, 72, profile.photo)),
      h('h2', { style: 'font-size:22px;font-weight:800;margin-top:14px;letter-spacing:-.02em' }, profile.name),
      h('p', { style: 'font-size:13.5px;color:var(--text-2);margin-top:4px' }, 'Introduce tu PIN'),
      dots,
      keypad,
      h('button', { class: 'link', style: 'font-size:12.5px;margin-top:22px', onclick: () => confirmDialog({
        title: '¿Has olvidado tu PIN?',
        message: 'Se desactivará el PIN de "' + profile.name + '". Tus datos no se borran y podrás crear uno nuevo desde Ajustes.',
        confirmText: 'Desactivar PIN',
        onConfirm: () => { profile.pin = null; profile.pinLen = null; session.unlocked = true; save(); render(); toast('PIN desactivado'); }
      }) }, '¿Has olvidado tu PIN?')
    );
    pinKeyHandler = event => {
      if (/^\d$/.test(event.key)) press(event.key);
      else if (event.key === 'Backspace') press('del');
      else if (event.key === 'Enter') press('ok');
    };
    return h('div', { class: 'center-page' }, box);
  }

  document.addEventListener('keydown', event => {
    // La pantalla PIN se renderiza fuera del router (`app.render` la muestra
    // directamente); comprobamos el DOM para que el teclado funciona sin
    // convertir el estado visual en una ruta de navegación.
    if (pinKeyHandler && document.querySelector('.pin-dots')) pinKeyHandler(event);
  });

  const navigation = [
    { id: 'home', label: 'Inicio', icon: 'home' },
    { id: 'class', label: 'Clase', icon: 'pencil' },
    { id: 'tasks', label: 'Tareas', icon: 'checksq' },
    { id: 'gifts', label: 'Regalos', icon: 'gift' },
    { id: 'settings', label: 'Ajustes', icon: 'gear' }
  ];

  function shell(profile) {
    const root = h('div', { class: 'shell' });
    const navigationElement = vertical => h('div', { style: vertical ? 'display:flex;flex-direction:column;gap:4px' : 'display:contents' },
      navigation.map(item => {
        const active = route.name === item.id ||
          (item.id === 'tasks' && (route.name === 'progress' || route.name === 'week')) ||
          (item.id === 'class' && ['noteForm', 'classSubjects', 'subjectForm', 'classSchedule', 'slotForm', 'subjectView', 'classHistory'].includes(route.name)) ||
          (item.id === 'gifts' && ['person', 'personAbout', 'personForm'].includes(route.name));
        let badge = null;
        if (item.id === 'tasks') {
          const pending = tasksDueOn(todayStr()).filter(task => !isDoneOn(task, todayStr())).length;
          if (pending) badge = pending;
        }
        return h('button', { class: (vertical ? 'nav-item' : 'bn-item') + (active ? ' on' : ''), onclick: () => go(item.id) },
          vertical
            ? [h('span', { html: icon(item.icon, 20) }), h('span', null, item.label), badge ? h('span', { class: 'nav-badge' }, badge) : null]
            : [h('span', { class: 'bn-ic', html: icon(item.icon, 22) }), h('span', null, item.label)]
        );
      })
    );
    root.append(h('aside', { class: 'sidebar' },
      h('div', null,
        h('div', { class: 'brand' }, h('div', { class: 'brand-mark', html: 'D' }), h('div', null, h('h1', null, 'DailyHub'), h('p', null, 'Tu espacio personal'))),
        navigationElement(true)
      ),
      h('button', { class: 'side-user', style: 'text-align:left', onclick: () => go('profile') },
        avatarEl(profile.name, profile.color, 36, profile.photo),
        h('div', { style: 'min-width:0' }, h('b', null, profile.name), h('span', null, 'Perfil personal'))
      )
    ));
    const main = h('main', { class: 'main' });
    const content = h('div', { class: 'content' });
    const screen = app.features[route.name] || app.features.home;
    content.append(screen());
    main.append(content);
    root.append(main);
    const rootElement = h('div', { style: 'display:contents' }, root);
    rootElement.append(h('nav', { class: 'bottom-nav' }, navigationElement(false)));
    rootElement.append(h('button', { class: 'fab', 'aria-label': 'Añadir', onclick: () => app.components.quickAddSheet(), html: icon('plus', 26) }));
    return rootElement;
  }

  Object.assign(app.features, { welcomeScreen, newProfileScreen, profileSelectScreen, pinScreen, shell });
}
