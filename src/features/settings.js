export function registerSettings(app) {
  const {
    h,
    icon,
    avatarEl,
    hashPin,
    todayStr,
    COLORS
  } = app.core;
  const {
    S,
    replaceState,
    defaultState,
    normalizeData,
    switchProfileData,
    save,
    theme,
    applyTheme,
    activeAccountUid,
    SYNC_KEYS,
    rememberPendingDeletes,
    clearPushTimer,
    LS_KEY,
    ACC_PREFIX
  } = app.state;
  const { session, route, go, render, currentProfile } = app.domain;
  const { headBar, openSheet, closeOverlays, switchRow, confirmDialog, toast } = app.components;
  const { pickImage, setPhotoEl } = app.services;
  const { accountSheet, softLogout } = app.auth;
  const {
    notifPermission,
    requestNotifPermission,
    showAppNotification,
    scheduleGiftNotification
  } = app.services;
  const sync = app.services.sync;
  const supabase = app.services.supabase;

  function securitySheet() {
    openSheet('Seguridad y PIN', () => {
      const profile = currentProfile();
      const box = h('div');
      if (profile.pin) {
        const currentPin = h('input', { class: 'input', inputmode: 'numeric', maxlength: '6', placeholder: 'PIN actual' });
        const newPin = h('input', { class: 'input', inputmode: 'numeric', maxlength: '6', placeholder: 'Nuevo PIN (4–6 dígitos)', style: 'margin-top:10px' });
        const newPinConfirmation = h('input', { class: 'input', inputmode: 'numeric', maxlength: '6', placeholder: 'Repite el nuevo PIN', style: 'margin-top:10px' });
        const error = h('p', { style: 'font-size:12.5px;color:var(--danger);min-height:18px;margin:8px 0' });
        box.append(currentPin, newPin, newPinConfirmation, error,
          h('button', {
            class: 'btn btn-primary btn-block',
            onclick: () => {
              if (hashPin(currentPin.value.trim()) !== profile.pin) {
                error.textContent = 'El PIN actual no es correcto.';
                return;
              }
              if (!/^\d{4,6}$/.test(newPin.value.trim())) {
                error.textContent = 'El nuevo PIN debe tener 4–6 dígitos.';
                return;
              }
              if (newPin.value.trim() !== newPinConfirmation.value.trim()) {
                error.textContent = 'Los PIN nuevos no coinciden.';
                return;
              }
              profile.pin = hashPin(newPin.value.trim());
              profile.pinLen = newPin.value.trim().length;
              save();
              closeOverlays();
              toast('PIN actualizado');
            }
          }, 'Guardar nuevo PIN'),
          h('button', {
            class: 'btn btn-soft btn-block',
            style: 'margin-top:10px',
            onclick: () => confirmDialog({
              title: 'Quitar el PIN',
              message: 'Este perfil quedará sin protección. ¿Continuar?',
              confirmText: 'Quitar PIN',
              onConfirm: () => {
                profile.pin = null;
                profile.pinLen = null;
                save();
                closeOverlays();
                toast('PIN desactivado');
              }
            })
          }, 'Quitar PIN')
        );
      } else {
        const newPin = h('input', { class: 'input', inputmode: 'numeric', maxlength: '6', placeholder: 'Nuevo PIN (4–6 dígitos)' });
        const newPinConfirmation = h('input', { class: 'input', inputmode: 'numeric', maxlength: '6', placeholder: 'Repite el PIN', style: 'margin-top:10px' });
        const error = h('p', { style: 'font-size:12.5px;color:var(--danger);min-height:18px;margin:8px 0' });
        box.append(
          h('p', { style: 'font-size:13px;color:var(--text-2);margin-bottom:14px;line-height:1.5' }, 'Protege este perfil con un PIN de 4 a 6 dígitos. Se pedirá al seleccionar el perfil.'),
          newPin,
          newPinConfirmation,
          error,
          h('button', {
            class: 'btn btn-primary btn-block',
            onclick: () => {
              if (!/^\d{4,6}$/.test(newPin.value.trim())) {
                error.textContent = 'Debe tener 4–6 dígitos.';
                return;
              }
              if (newPin.value.trim() !== newPinConfirmation.value.trim()) {
                error.textContent = 'No coinciden.';
                return;
              }
              profile.pin = hashPin(newPin.value.trim());
              profile.pinLen = newPin.value.trim().length;
              save();
              closeOverlays();
              toast('PIN activado');
            }
          }, 'Activar PIN')
        );
      }
      return box;
    });
  }

  function notifSheet() {
    openSheet('Notificaciones', () => {
      const notificationSettings = S.settings.notif;
      const box = h('div');
      const permissionNote = h('div');

      function drawPermission() {
        permissionNote.innerHTML = '';
        const permission = notifPermission();
        if (permission === 'unsupported') {
          permissionNote.append(h('p', { style: 'font-size:12.5px;color:var(--amber);background:var(--amber-soft);border:1px solid var(--amber-border);border-radius:var(--r-m);padding:10px 14px;margin-bottom:14px' }, 'Tu navegador no soporta notificaciones. Prueba desde Chrome o Safari actualizado.'));
        } else if (permission === 'denied') {
          permissionNote.append(h('p', { style: 'font-size:12.5px;color:var(--amber);background:var(--amber-soft);border:1px solid var(--amber-border);border-radius:var(--r-m);padding:10px 14px;margin-bottom:14px' }, 'Las notificaciones están bloqueadas. Actívalas en los ajustes del navegador para esta web (icono ⓘ junto a la dirección).'));
        } else if (permission === 'default') {
          permissionNote.append(h('button', { class: 'btn btn-secondary btn-block', style: 'margin-bottom:14px', onclick: async () => {
            const result = await requestNotifPermission();
            drawPermission();
            toast(result === 'granted' ? 'Notificaciones activadas' : 'Permiso no concedido');
          } }, 'Permitir notificaciones en este navegador'));
        } else {
          permissionNote.append(h('p', { style: 'font-size:12.5px;color:var(--green);background:var(--green-soft);border:1px solid var(--green-border);border-radius:var(--r-m);padding:10px 14px;margin-bottom:14px' }, 'Notificaciones activas en este navegador ✓'));
        }
      }

      drawPermission();
      box.append(permissionNote);
      box.append(h('button', {
        class: 'btn btn-soft btn-block',
        style: 'margin-bottom:12px',
        onclick: async () => {
          const permission = notifPermission() === 'granted' ? 'granted' : await requestNotifPermission();
          drawPermission();
          if (permission !== 'granted') {
            toast(permission === 'denied' ? 'Activa las notificaciones en los ajustes del navegador' : 'No se pudo activar el permiso');
            return;
          }
          const shown = await showAppNotification('DailyHub funciona', 'Esta es una notificación de prueba.');
          toast(shown ? 'Notificación de prueba enviada' : 'El navegador no permitió mostrarla');
        }
      }, 'Enviar notificación de prueba'));

      const pushVapidPublicKey = 'BPIgPzRS-3X97keys1Jse8EfqMjep-Rn_4JizpjLA6V7aEZ56OGPt361haUQop-7TF22ynnhgL2KlGIp-UMsBu8';
      const urlBase64 = value => {
        const padding = '='.repeat((4 - value.length % 4) % 4);
        const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
        return Uint8Array.from([...raw].map(character => character.charCodeAt(0)));
      };
      const pushStatus = h('p', { class: 'field-hint', style: 'text-align:left;margin-bottom:10px' }, '');
      const pushButton = h('button', { class: 'btn btn-soft btn-block' });

      async function drawPush() {
        let subscription = null;
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          if (registration) subscription = await registration.pushManager.getSubscription();
        } catch (error) {}
        pushButton.textContent = subscription ? 'Desactivar avisos con la app cerrada' : 'Activar avisos con la app cerrada';
        pushStatus.textContent = subscription ? 'Activados: llegarán aunque no tengas la web abierta.' : 'Requiere una cuenta conectada. Es experimental.';
      }

      pushButton.addEventListener('click', async () => {
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          if (!registration || !('PushManager' in window)) {
            toast('Tu navegador no soporta push');
            return;
          }
          const existing = await registration.pushManager.getSubscription();
          if (existing) {
            await existing.unsubscribe();
            const session = await supabase.auth.getSession();
            if (session.data.session) {
              await fetch(sync.config.url + '/functions/v1/push-unsubscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: sync.config.key, Authorization: 'Bearer ' + session.data.session.access_token },
                body: JSON.stringify({ endpoint: existing.endpoint })
              }).catch(() => {});
            }
            toast('Avisos en segundo plano desactivados');
          } else {
            const permission = notifPermission() === 'granted' ? 'granted' : await requestNotifPermission();
            drawPermission();
            if (permission !== 'granted') {
              toast('Primero concede permiso de notificaciones');
              return;
            }
            const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64(pushVapidPublicKey) });
            const session = await supabase.auth.getSession();
            if (!session.data.session) {
              await subscription.unsubscribe();
              toast('Inicia sesión en Cuenta para usar esta función');
              return;
            }
            const response = await fetch(sync.config.url + '/functions/v1/push-subscribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: sync.config.key, Authorization: 'Bearer ' + session.data.session.access_token },
              body: JSON.stringify(subscription.toJSON())
            });
            if (!response.ok) throw new Error('el servidor no aceptó la suscripción (' + response.status + ')');
            toast('Avisos en segundo plano activados');
          }
          await drawPush();
        } catch (error) {
          console.error(error);
          toast('No se pudo completar: ' + (error.message || 'error'));
        }
      });

      box.append(h('p', { class: 'section-title', style: 'margin-top:20px' }, h('span', null, 'Con la app cerrada')));
      box.append(pushStatus, pushButton);
      box.append(h('button', {
        class: 'btn btn-soft btn-block',
        style: 'margin-top:10px',
        onclick: async () => {
          try {
            const session = await supabase.auth.getSession();
            if (!session.data.session) {
              toast('Inicia sesión para probar el push');
              return;
            }
            const response = await fetch(sync.config.url + '/functions/v1/push-send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: sync.config.key, Authorization: 'Bearer ' + session.data.session.access_token },
              body: JSON.stringify({ title: 'DailyHub · prueba push', body: 'Si ves esto, los avisos en segundo plano funcionan.' })
            });
            const json = await response.json().catch(() => ({}));
            toast(response.ok ? 'Enviado: ' + (json.sent || 0) + ' dispositivo(s)' : 'Error del servidor: ' + (json.error || response.status));
          } catch (error) {
            toast('No se pudo enviar: ' + (error.message || 'error'));
          }
        }
      }, 'Probar push (requiere cuenta + avisos activados)'));
      drawPush();
      box.append(switchRow('Recordatorios de tareas', 'Aviso diario con tus tareas pendientes', notificationSettings.reminders, value => {
        notificationSettings.reminders = value;
        save();
        if (value && notifPermission() === 'default') requestNotifPermission().then(drawPermission);
      }));
      box.append(switchRow('Recordatorios de regalos', 'Aviso cuando se acerque una fecha importante (máx. 1 semana antes)', notificationSettings.gifts, value => {
        notificationSettings.gifts = value;
        save();
        if (value) scheduleGiftNotification();
      }));
      box.append(switchRow('Resumen diario', 'Un resumen cada mañana', notificationSettings.daily, value => {
        notificationSettings.daily = value;
        save();
      }));
      const quietFrom = h('input', { class: 'input', type: 'time', value: notificationSettings.quietFrom, style: 'padding:9px 10px;font-size:13px' });
      const quietTo = h('input', { class: 'input', type: 'time', value: notificationSettings.quietTo, style: 'padding:9px 10px;font-size:13px' });
      quietFrom.addEventListener('change', () => { notificationSettings.quietFrom = quietFrom.value; save(); });
      quietTo.addEventListener('change', () => { notificationSettings.quietTo = quietTo.value; save(); });
      box.append(h('p', { class: 'section-title', style: 'margin-top:20px' }, h('span', null, 'Horario de silencio')));
      box.append(h('div', { style: 'display:flex;align-items:center;gap:10px' }, quietFrom, h('span', { style: 'color:var(--text-3)' }, '—'), quietTo));
      box.append(h('p', { class: 'field-hint', style: 'text-align:center' }, 'Sin avisos durante estas horas.'));
      return box;
    });
  }

  function optionsSheet() {
    openSheet('Personalizar opciones', () => {
      const box = h('div');
      box.append(h('p', { class: 'field-hint', style: 'margin-bottom:12px' }, 'Añade, renombra o elimina opciones. Los cambios aparecerán en los formularios nuevos.'));
      const section = (title, key, placeholder) => {
        const list = h('div');
        const input = h('input', { class: 'input', type: 'text', placeholder, maxlength: '30' });
        const add = h('button', { class: 'btn btn-soft', style: 'margin-top:8px' }, 'Añadir');
        function draw() {
          list.innerHTML = '';
          const values = S.settings[key] || [];
          values.forEach((value, index) => {
            const edit = h('input', { class: 'input', type: 'text', value, maxlength: '30', style: 'flex:1;min-width:0' });
            edit.addEventListener('change', () => {
              const next = edit.value.trim();
              if (!next) {
                edit.value = value;
                return;
              }
              if (values.some((item, itemIndex) => itemIndex !== index && item.toLowerCase() === next.toLowerCase())) {
                toast('Esa opción ya existe');
                edit.value = value;
                return;
              }
              S.settings[key][index] = next;
              save();
              draw();
            });
            const remove = h('button', {
              class: 'icon-btn',
              style: 'width:36px;height:36px;color:var(--danger)',
              'aria-label': 'Eliminar ' + value,
              onclick: () => {
                if (values.length <= 1) {
                  toast('Debe quedar al menos una opción');
                  return;
                }
                if (key === 'categories') {
                  const fallback = values.find((item, itemIndex) => itemIndex !== index) || 'Otros';
                  S.tasks.forEach(task => { if (task.cat === value) task.cat = fallback; });
                }
                S.settings[key].splice(index, 1);
                save();
                draw();
              },
              html: icon('trash', 16)
            });
            list.append(h('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:8px' }, edit, remove));
          });
        }
        add.onclick = () => {
          const value = input.value.trim();
          if (!value) {
            input.focus();
            return;
          }
          if ((S.settings[key] || []).some(item => item.toLowerCase() === value.toLowerCase())) {
            toast('Esa opción ya existe');
            return;
          }
          S.settings[key].push(value);
          input.value = '';
          save();
          draw();
        };
        draw();
        return h('div', { style: 'margin-bottom:22px' },
          h('p', { class: 'section-title', style: 'margin:0 0 10px' }, h('span', null, title)),
          list,
          h('div', { style: 'display:flex;gap:8px;align-items:center' }, input, add)
        );
      };
      box.append(section('Categorías de tareas y hábitos', 'categories', 'Ej. Salud, Casa…'));
      box.append(section('Relaciones', 'relationships', 'Ej. Hermano/a, Cliente…'));
      return box;
    });
  }

  function tasksPrefsSheet() {
    openSheet('Tareas y hábitos', () => {
      const box = h('div');
      box.append(switchRow('Ocultar completadas en Hoy', 'La pantalla Inicio solo mostrará lo pendiente', S.settings.hideCompleted, value => { S.settings.hideCompleted = value; save(); }));
      box.append(h('p', { class: 'field-hint', style: 'text-align:center;margin-top:10px' }, 'Consejo: toca una tarea en cualquier pantalla para marcarla como hecha.'));
      return box;
    });
  }

  function backupSheet() {
    openSheet('Copia de seguridad', () => {
      const box = h('div');
      box.append(
        h('p', { style: 'font-size:13px;color:var(--text-2);line-height:1.55;margin-bottom:16px' }, 'Exporta todas tus personas, tareas y regalos a un archivo JSON, o importa una copia anterior en este navegador.'),
        h('button', {
          class: 'btn btn-primary btn-block btn-lg',
          onclick: () => {
            const blob = new Blob([JSON.stringify({ app: 'dailyhub', version: 2, exportedAt: new Date().toISOString(), data: S }, null, 2)], { type: 'application/json' });
            const link = h('a', { href: URL.createObjectURL(blob), download: 'dailyhub-backup-' + todayStr() + '.json' });
            document.body.append(link);
            link.click();
            link.remove();
            toast('Copia exportada');
          }
        }, 'Exportar copia (JSON)'),
        h('button', {
          class: 'btn btn-secondary btn-block btn-lg',
          style: 'margin-top:10px',
          onclick: () => {
            const input = h('input', { type: 'file', accept: 'application/json,.json' });
            input.addEventListener('change', () => {
              const file = input.files[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                try {
                  const json = JSON.parse(reader.result);
                  const data = json && json.app === 'dailyhub' && json.data ? json.data : json;
                  if (!data || !Array.isArray(data.profiles)) throw new Error('bad');
                  replaceState(Object.assign(defaultState(), data));
                  normalizeData();
                  switchProfileData();
                  save();
                  closeOverlays();
                  render();
                  toast('Copia importada');
                } catch (error) {
                  toast('El archivo no es una copia válida');
                }
              };
              reader.readAsText(file);
            });
            input.click();
          }
        }, 'Importar copia')
      );
      return box;
    });
  }

  function deleteDataSheet() {
    openSheet('Eliminar datos', () => {
      const box = h('div');
      box.append(
        h('p', { style: 'font-size:13px;color:var(--text-2);line-height:1.55;margin-bottom:16px' }, 'Estas acciones no se pueden deshacer. Si crees que puedes arrepentirte, exporta antes una copia.'),
        h('button', {
          class: 'btn btn-danger btn-block btn-lg',
          onclick: () => confirmDialog({
            title: '¿Borrar tareas, regalos y personas?',
            message: 'Se eliminarán todas tus tareas, hábitos, personas y regalos. Los perfiles y ajustes se conservan.',
            confirmText: 'Borrar todo',
            onConfirm: () => {
              // Estas listas se reemplazan completas; conservamos sus ids
              // para generar tombstones antes de limpiar el estado local.
              for (const key of ['tasks', 'gifts', 'people']) {
                rememberPendingDeletes(key, (S[key] || []).map(item => item && item.id).filter(Boolean));
              }
              S.tasks = [];
              S.gifts = [];
              S.people = [];
              save();
              closeOverlays();
              render();
              toast('Datos borrados');
            }
          })
        }, 'Borrar tareas, regalos y personas'),
        h('button', {
          class: 'btn btn-danger btn-block btn-lg',
          style: 'margin-top:10px',
          onclick: () => confirmDialog({
            title: '¿Empezar de cero?',
            message: 'Se eliminará TODO, incluidos los perfiles y el PIN. La aplicación volverá a su estado inicial.',
            confirmText: 'Borrar todo',
            onConfirm: () => {
              const oldData = S.data;
              const pendingDeletes = {};
              for (const [table, ids] of Object.entries(S.__pendingDeletes || {})) {
                if (Array.isArray(ids)) pendingDeletes[table] = ids.slice();
              }
              pendingDeletes.profiles = (pendingDeletes.profiles || []).concat((S.profiles || []).map(profile => profile.id).filter(Boolean)).filter((id, index, ids) => ids.indexOf(id) === index);
              for (const profileId of Object.keys(oldData)) {
                const bucket = oldData[profileId];
                if (!bucket.__del) bucket.__del = {};
                for (const key of SYNC_KEYS) {
                  pendingDeletes[key] = pendingDeletes[key] || [];
                  for (const row of bucket[key] || []) {
                    if (row && row.id != null && !pendingDeletes[key].includes(row.id)) pendingDeletes[key].push(row.id);
                  }
                  for (const id of bucket.__del[key] || []) {
                    if (!pendingDeletes[key].includes(id)) pendingDeletes[key].push(id);
                  }
                  bucket[key] = [];
                }
                bucket.__prev = {};
                for (const key of SYNC_KEYS) bucket.__prev[key] = [];
              }
              replaceState(defaultState());
              S.meta.onboarded = true;
              S.__pendingDeletes = pendingDeletes;
              save();
              clearPushTimer();
              if (sync && sync.status.state === 'online') sync.push();
              session.unlocked = true;
              closeOverlays();
              render();
              toast('DailyHub reiniciado');
            }
          })
        }, 'Borrar todo y empezar de cero')
      );
      return box;
    });
  }

  function infoSheet() {
    openSheet('Información', () => {
      const size = Math.round(((activeAccountUid() ? localStorage.getItem(ACC_PREFIX + activeAccountUid()) : null) || localStorage.getItem(LS_KEY) || '').length / 1024);
      return h('div', { style: 'text-align:center;padding:6px 0 10px' },
        h('div', { class: 'logo-mark', style: 'width:52px;height:52px;font-size:24px;margin-bottom:14px', html: 'D' }),
        h('b', { style: 'font-size:16px' }, 'DailyHub v2.0'),
        h('p', { style: 'font-size:13px;color:var(--text-2);line-height:1.6;margin-top:8px' }, 'Tareas, hábitos y regalos con tu cuenta privada.\nLos datos están en la nube (Supabase) y también en este navegador (' + size + ' KB) para poder usar la app sin conexión.'),
        h('p', { style: 'font-size:11.5px;color:var(--text-3);margin-top:14px' }, 'Hecho con cariño · ' + new Date().getFullYear())
      );
    });
  }

  function scrProfile() {
    const profile = currentProfile();
    const wrap = h('div');
    wrap.append(headBar('Perfil', null, h('button', { class: 'icon-btn', 'aria-label': 'Volver', onclick: app.components.smartBack('settings'), html: icon('back', 19) })));
    let photo = profile.photo || '';
    const preview = h('div', { style: 'display:flex;flex-direction:column;align-items:center;margin-bottom:22px' });
    const avatarPreview = h('div', { style: 'position:relative;display:inline-flex' });
    function drawAvatar() {
      avatarPreview.innerHTML = '';
      avatarPreview.append(avatarEl(profile.name, profile.color, 84, photo));
      const remove = avatarPreview.querySelector('.rm-photo');
      if (!remove && photo) avatarPreview.append(h('button', { class: 'rm-photo', 'aria-label': 'Quitar foto', onclick: () => { photo = ''; profile.photo = ''; save(); drawAvatar(); setPhotoEl(photoButton, ''); toast('Foto quitada'); }, html: icon('x', 15) }));
    }
    drawAvatar();
    const photoButton = h('button', { class: 'btn btn-soft', style: 'padding:9px 16px;font-size:13px;margin-top:12px', onclick: () => pickImage(data => { photo = data; profile.photo = data; save(); drawAvatar(); setPhotoEl(photoButton, data); toast('Foto actualizada'); }, 512) });
    setPhotoEl(photoButton, photo);

    function editProfileSheet() {
      openSheet('Editar perfil', () => {
        let newColor = profile.color;
        const body = h('div');
        const avatarPreviewInside = h('div', { style: 'display:flex;justify-content:center;margin-bottom:16px' });
        const nameInput = h('input', { class: 'input', type: 'text', value: profile.name, maxlength: '24', style: 'text-align:center;font-weight:700;font-size:17px' });
        function drawProfilePreview() {
          avatarPreviewInside.innerHTML = '';
          avatarPreviewInside.append(avatarEl(nameInput.value || profile.name, newColor, 64, profile.photo || ''));
        }
        drawProfilePreview();
        nameInput.addEventListener('input', drawProfilePreview);
        const swatches = h('div', { class: 'swatches', style: 'justify-content:center;margin:16px 0 22px' });
        for (const swatchColor of COLORS) {
          swatches.append(h('button', {
            class: 'swatch' + (swatchColor === newColor ? ' on' : ''),
            style: 'background:' + swatchColor,
            onclick: event => {
              newColor = swatchColor;
              [...swatches.children].forEach(item => item.classList.remove('on'));
              event.currentTarget.classList.add('on');
              drawProfilePreview();
            }
          }));
        }
        body.append(avatarPreviewInside,
          h('div', { class: 'field' }, h('label', null, 'Nombre'), nameInput),
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
                save();
                closeOverlays();
                render();
                toast('Perfil actualizado');
              };
              if (name !== profile.name) confirmDialog({ title: '¿Cambiar el nombre?', message: 'Tu perfil pasará a llamarse “' + name + '” en toda la aplicación.', confirmText: 'Cambiar nombre', onConfirm: apply });
              else apply();
            }
          }, 'Guardar cambios')
        );
        const submitButton = body.querySelector('.btn-primary');
        if (submitButton) nameInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); submitButton.click(); } });
        return body;
      });
    }

    preview.append(avatarPreview, h('p', { style: 'font-size:12px;color:var(--text-2);margin-top:10px' }, 'Perfil personal'), photoButton,
      h('button', { class: 'btn btn-soft', style: 'padding:9px 16px;font-size:13px;margin-top:10px', onclick: editProfileSheet },
        h('span', { class: 'ic', html: icon('pencil', 15) }),
        'Editar perfil'
      )
    );
    wrap.append(preview);
    wrap.append(h('div', { class: 'section-title' }, h('span', null, 'Seguridad')));
    wrap.append(h('div', { class: 'set-card' }, h('button', { class: 'set-row', onclick: securitySheet }, h('span', { class: 'r-ic', html: icon('lock', 18) }), h('span', null, profile.pin ? 'Cambiar PIN' : 'Activar PIN'), h('span', { class: 'chev', html: icon('chev', 17) }))));
    wrap.append(h('div', { class: 'section-title' }, h('span', null, 'Cuenta')));
    wrap.append(h('div', { class: 'set-card' }, h('button', { class: 'set-row', onclick: accountSheet }, h('span', { class: 'r-ic', html: icon('cloud', 18) }), h('span', null, 'Cuenta y sincronización'), h('span', { class: 'chev', html: icon('chev', 17) }))));
    wrap.append(h('div', { class: 'section-title' }, h('span', null, 'Sesión')));
    wrap.append(h('div', { class: 'set-card' }, h('button', { class: 'set-row', onclick: softLogout }, h('span', { class: 'r-ic', html: icon('logout', 18) }), h('span', null, 'Cambiar de cuenta'), h('span', { class: 'chev', html: icon('chev', 17) }))));
    return wrap;
  }

  function scrSettings() {
    const profile = currentProfile();
    const wrap = h('div');
    wrap.append(headBar('Ajustes', 'Personaliza DailyHub'));
    wrap.append(h('button', { class: 'set-card', style: 'width:100%;display:flex;align-items:center;gap:14px;padding:16px 18px;text-align:left', onclick: () => go('profile') },
      avatarEl(profile.name, profile.color, 48, profile.photo),
      h('div', { style: 'flex:1' }, h('b', { style: 'font-size:15px' }, profile.name), h('span', { style: 'display:block;font-size:12px;color:var(--text-2)' }, 'Perfil personal · toca para editar')),
      h('span', { class: 'chev', html: icon('chev', 18) })
    ));
    const row = (iconName, label, action) => h('button', { class: 'set-row', onclick: action }, h('span', { class: 'r-ic', html: icon(iconName, 18) }), h('span', null, label), h('span', { class: 'chev', html: icon('chev', 17) }));
    wrap.append(h('p', { class: 'set-label' }, 'Cuenta'),
      h('div', { class: 'set-card' },
        row('cloud', 'Cuenta y sincronización', accountSheet),
        row('user', 'Perfil', () => go('profile')),
        row('lock', 'Seguridad y PIN', securitySheet)
      )
    );
    wrap.append(h('p', { class: 'set-label' }, 'Aplicación'),
      h('div', { class: 'set-card' },
        row('bell', 'Notificaciones', notifSheet),
        row('list', 'Tareas y hábitos', tasksPrefsSheet),
        row('pencil', 'Personalizar opciones', optionsSheet)
      )
    );
    wrap.append(h('p', { class: 'set-label' }, 'Apariencia'),
      h('div', { class: 'set-card' },
        h('div', { style: 'display:flex;align-items:center;gap:12px;padding:12px 14px' },
          h('span', { class: 'r-ic', html: icon('moon', 18) }),
          h('div', { style: 'flex:1' }, h('b', { style: 'font-size:14px;display:block' }, 'Modo oscuro'), h('span', { id: 'themeHint', style: 'font-size:12px;color:var(--text-2)' }, '')),
          (() => {
            const segment = h('div', { class: 'seg', style: 'display:flex;max-width:210px' });
            const drawHint = () => {
              const hint = document.getElementById('themeHint');
              if (hint) hint.textContent = theme() === 'auto' ? 'Sigue tu sistema' : theme() === 'dark' ? 'Siempre oscuro' : 'Siempre claro';
            };
            for (const [value, label] of [['auto', 'Auto'], ['light', 'Claro'], ['dark', 'Oscuro']]) {
              segment.append(h('button', {
                class: theme() === value ? 'on' : '',
                onclick: event => {
                  S.settings.theme = value;
                  save();
                  applyTheme();
                  [...segment.children].forEach(item => item.classList.remove('on'));
                  event.currentTarget.classList.add('on');
                  drawHint();
                }
              }, label));
            }
            drawHint();
            return segment;
          })()
        )
      )
    );
    wrap.append(h('p', { class: 'set-label' }, 'Datos'),
      h('div', { class: 'set-card' },
        row('cloud', 'Copia de seguridad', backupSheet),
        row('trash', 'Eliminar datos', deleteDataSheet)
      )
    );
    wrap.append(h('p', { class: 'set-label' }, 'Información'),
      h('div', { class: 'set-card' }, row('info', 'DailyHub v2.0', infoSheet))
    );
    wrap.append(h('button', { class: 'btn btn-block', style: 'margin-top:26px;color:var(--danger);background:rgba(220,38,38,.08);border:1.5px solid rgba(220,38,38,.45)', onclick: softLogout }, 'Cambiar de cuenta'));
    return wrap;
  }

  Object.assign(app.features, { settings: scrSettings, profile: scrProfile });
  Object.assign(app.settings, { securitySheet, notifSheet, optionsSheet, tasksPrefsSheet, backupSheet, deleteDataSheet, infoSheet });
}
