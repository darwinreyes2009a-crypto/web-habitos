export function registerSettings(app) {
  const {
    h,
    icon,
    avatarEl,
    hashPin,
    todayStr
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
    accountsIndex,
    SYNC_KEYS,
    rememberPendingDeletes,
    clearPushTimer,
    LS_KEY,
    ACC_PREFIX
  } = app.state;
  const { session, route, go, render, currentProfile } = app.domain;
  const { headBar, openSheet, closeOverlays, switchRow, confirmDialog, toast } = app.components;
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
        const currentPin = h('div', { class: 'field' },
          h('label', { for: 'pin-current' }, 'PIN actual'),
          h('input', { id: 'pin-current', class: 'input', inputmode: 'numeric', maxlength: '6' })
        );
        const newPin = h('div', { class: 'field' },
          h('label', { for: 'pin-new' }, 'Nuevo PIN (4–6 dígitos)'),
          h('input', { id: 'pin-new', class: 'input', inputmode: 'numeric', maxlength: '6' })
        );
        const newPinConfirmation = h('div', { class: 'field' },
          h('label', { for: 'pin-new-confirm' }, 'Repite el nuevo PIN'),
          h('input', { id: 'pin-new-confirm', class: 'input', inputmode: 'numeric', maxlength: '6' })
        );
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
      // La hoja se lee de arriba abajo: permiso → recordatorios → push → silencio.
      box.append(h('p', { class: 'section-title', style: 'margin-top:0' }, h('span', null, 'Permiso')));
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

      // El bloque «con la app cerrada» se construye aquí pero se añade al final,
      // después de los recordatorios: es la opción más experimental y no debe
      // encabezar la hoja por delante de lo que la gente usa a diario.
      const pushBlock = h('div');
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

      pushBlock.append(h('p', { class: 'section-title', style: 'margin-top:20px' }, h('span', null, 'Con la app cerrada')));
      pushBlock.append(pushStatus, pushButton);
      pushBlock.append(h('button', {
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
      box.append(h('p', { class: 'section-title', style: 'margin-top:20px' }, h('span', null, 'Recordatorios')));
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
      box.append(switchRow('Aviso de clase', 'Te avisa antes de que empiece la siguiente del horario', notificationSettings.classes !== false, value => {
        notificationSettings.classes = value;
        save();
      }));
      if (notificationSettings.classes !== false) {
        const leads = [5, 10, 15, 20, 30];
        const leadRow = h('div', { class: 'chips', style: 'margin:-4px 0 4px' });
        const drawLeads = () => {
          leadRow.innerHTML = '';
          for (const value of leads) {
            leadRow.append(h('button', {
              class: 'chip' + (Number(notificationSettings.classLead == null ? 15 : notificationSettings.classLead) === value ? ' on' : ''),
              onclick: () => { notificationSettings.classLead = value; save(); drawLeads(); }
            }, value + ' min antes'));
          }
        };
        drawLeads();
        box.append(leadRow);
      }
      box.append(pushBlock);
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
      box.append(switchRow('Vibración al marcar', 'Respuesta háptica en dispositivos compatibles', S.settings.haptics !== false, value => { S.settings.haptics = value; save(); }));
      box.append(h('p', { class: 'field-hint', style: 'text-align:center;margin-top:14px' }, 'Consejo: toca una tarea en cualquier pantalla para marcarla como hecha.'));
      return box;
    });
  }

  // Fila con interruptor real. El <label> envolvente asocia el texto al
  // control y el role="switch" anuncia encendido/apagado sin cambiar el texto
  // (WAI-ARIA APG · Switch Pattern). La usan Apariencia y Aplicación.
  function switchPrefRow(iconName, label, hint, checked, onChange) {
    const input = h('input', { type: 'checkbox', role: 'switch' });
    input.checked = !!checked;
    input.addEventListener('change', () => onChange(input.checked));
    return h('label', { class: 'pref-row' },
      h('span', { class: 'r-ic', html: icon(iconName, 18) }),
      h('div', { class: 'pref-text' },
        h('b', null, label),
        hint ? h('span', null, hint) : null
      ),
      h('span', { class: 'sw' }, input, h('i'))
    );
  }

  // Hoja de Apariencia: tema, tamaño de texto, animaciones y alto contraste.
  function appearanceSheet() {
    openSheet('Apariencia', () => {
      const box = h('div');

      // `hint` es el texto bajo el título. Para los selectores ya no hace falta:
      // el botón activo dice la respuesta, y repetirla solo ocupa altura.
      function prefRow(iconName, label, hint, control) {
        return h('div', { class: 'pref-row' },
          h('span', { class: 'r-ic', html: icon(iconName, 18) }),
          h('div', { class: 'pref-text' },
            h('b', null, label),
            hint ? h('span', null, hint) : null
          ),
          control
        );
      }

      // Segmento de N opciones con la semántica de radio group (WAI-ARIA APG):
      // una sola parada de tabulación, flechas dentro del grupo y estado en
      // aria-checked, para que el valor se anuncie sin depender solo del color.
      function prefSegment(legend, options, current, onPick) {
        const segment = h('div', { class: 'seg set-seg', role: 'radiogroup', 'aria-label': legend });
        const buttons = options.map(([value, text], index) => {
          const button = h('button', {
            type: 'button',
            role: 'radio',
            'aria-label': legend + ': ' + text,
            onclick: () => { onPick(value); sync(index); }
          }, text);
          segment.append(button);
          return button;
        });
        const activeIndex = () => options.findIndex(([value]) => current() === value);
        function sync(focusIndex) {
          const active = activeIndex();
          buttons.forEach((button, index) => {
            button.classList.toggle('on', index === active);
            button.setAttribute('aria-checked', String(index === active));
            button.tabIndex = index === (active < 0 ? 0 : active) ? 0 : -1;
          });
          if (focusIndex != null) buttons[focusIndex].focus({ preventScroll: true });
        }
        segment.addEventListener('keydown', event => {
          const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
          const from = Math.max(activeIndex(), 0);
          let next = null;
          if (delta != null) next = (from + delta + options.length) % options.length;
          else if (event.key === 'Home') next = 0;
          else if (event.key === 'End') next = options.length - 1;
          if (next == null) return;
          event.preventDefault();
          onPick(options[next][0]);
          sync(next);
        });
        sync();
        return segment;
      }

      box.append(
        prefRow('moon', 'Modo oscuro', 'El tema que usa la app',
          prefSegment('Modo oscuro', [['auto', 'Auto'], ['light', 'Claro'], ['dark', 'Oscuro']], () => theme(), value => {
            S.settings.theme = value;
            save();
            applyTheme();
          })),

        // El subtítulo solo se ve en pantallas anchas (en móvil lo oculta el
        // CSS), y es donde "Máx." necesita explicarse: en el selector, que es
        // lo que siempre se ve, no cabe la palabra entera.
        prefRow('meds', 'Tamaño del texto', 'Normal, grande o máximo',
          prefSegment('Tamaño del texto', [[1, 'Normal'], [1.1, 'Grande'], [1.2, 'Máx.']], () => Number(S.settings.fontScale || 1), value => {
            S.settings.fontScale = value;
            save();
            applyTheme();
          })),

        prefRow('star', 'Animaciones', 'Movimiento de la pantalla',
          prefSegment('Animaciones', [['auto', 'Auto'], ['off', 'Reducidas'], ['on', 'Completas']], () => S.settings.reduceMotion || 'auto', value => {
            S.settings.reduceMotion = value;
            save();
            applyTheme();
          })),

        // El alto contraste es un interruptor por definición: su fila es un
        // <label> con el control dentro, así que el texto visible es su
        // nombre accesible.
        switchPrefRow('contrast', 'Alto contraste', 'Bordes y colores más marcados', !!S.settings.highContrast, value => {
          S.settings.highContrast = value;
          save();
          applyTheme();
        })
      );
      return box;
    });
  }

  // La copia de seguridad vive en features/platform.js:.exporta por perfil y
  // al importar fusiona en vez de reemplazar, para no perder nada.
  const backupSheet = () => app.features.backupSheet();

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

    // Esta pantalla es la identidad del perfil, así que el nombre tiene que
    // ser el protagonista: antes solo había un avatar suelto con un "Perfil
    // personal" genérico y el nombre no aparecía por ninguna parte. La tarjeta
    // entera es la acción de editar, igual que la fila de Ajustes.
    const email = (accountsIndex().find(account => account.uid === activeAccountUid()) || {}).email || '';
    wrap.append(h('button', {
      class: 'profile-identity',
      'aria-label': 'Editar el perfil ' + profile.name,
      onclick: () => app.components.profileEditorSheet(profile, { onSaved: () => render() })
    },
      avatarEl(profile.name, profile.color, 64, profile.photo || ''),
      h('div', { class: 'profile-identity-text' },
        h('b', null, profile.name),
        h('span', null, email || 'Perfil personal')
      ),
      h('span', { class: 'chev', html: icon('chev', 18) })
    ));

    // Las tres acciones vivian cada una en su propia tarjeta con su propio
    // titulo de seccion, para una sola fila. Se agrupan como en Ajustes.
    const row = (iconName, label, action) => h('button', { class: 'set-row', onclick: action },
      h('span', { class: 'r-ic', html: icon(iconName, 18) }),
      h('span', null, label),
      h('span', { class: 'chev', html: icon('chev', 17) })
    );
    wrap.append(h('p', { class: 'set-label' }, 'Cuenta y seguridad'),
      h('div', { class: 'set-card' },
        // Con más de un perfil no existía ninguna vuelta al selector: solo se
        // veía en el primer arranque. La fila muestra el selector sin
        // persistir el cambio; la elección se guarda al tocar una tarjeta.
        S.profiles.length > 1 ? row('user', 'Cambiar de perfil', () => { S.activeProfileId = null; session.unlocked = false; render(); }) : null,
        row('lock', profile.pin ? 'Cambiar PIN' : 'Activar PIN', securitySheet),
        row('cloud', 'Cuenta y sincronización', accountSheet),
        row('logout', 'Cambiar de cuenta', softLogout)
      )
    );
    return wrap;
  }

  function scrSettings() {
    const profile = currentProfile();
    const wrap = h('div');
    wrap.append(headBar('Ajustes', 'Personaliza DailyHub'));
    // Cada bloque declara su nombre accesible: la tarjeta se expone como grupo
    // etiquetado por su título en vez de ser un puñado de filas sueltas.
    let groupSeq = 0;
    const group = (labelText, card, danger = false) => {
      const id = 'set-group-' + (++groupSeq);
      card.setAttribute('role', 'group');
      card.setAttribute('aria-labelledby', id);
      wrap.append(h('p', { class: 'set-label' + (danger ? ' is-danger' : ''), id }, labelText), card);
    };

    // Fila navegable: título a la izquierda, `value` (estado actual) antes del
    // chevron, para leer el ajuste sin abrir su hoja.
    const row = (iconName, label, action, value, extraClass) => h('button', {
      class: 'set-row' + (extraClass ? ' ' + extraClass : ''),
      onclick: action
    },
      h('span', { class: 'r-ic', html: icon(iconName, 18) }),
      h('span', { class: 'set-text' }, label),
      value ? h('span', { class: 'set-value' }, value) : null,
      h('span', { class: 'chev', html: icon('chev', 17) }));

    const email = (accountsIndex().find(account => account.uid === activeAccountUid()) || {}).email || '';

    // La identidad del perfil baja a una fila dentro de su propia sección: la
    // tarjeta suelta arriba y la fila «Perfil» de abajo decían lo mismo dos veces.
    group('Cuenta', h('div', { class: 'set-card' },
      h('button', { class: 'set-row set-identity', 'aria-label': 'Editar el perfil ' + profile.name, onclick: () => go('profile') },
        avatarEl(profile.name, profile.color, 38, profile.photo),
        h('div', { class: 'set-identity-text' },
          h('b', null, profile.name),
          h('span', null, email || 'Perfil personal')
        ),
        h('span', { class: 'chev', html: icon('chev', 17) })
      ),
      // El correo completo ya vive en la fila de identidad de arriba; aquí solo
      // interesa si la cuenta está conectada, y así el valor no recorta el título.
      row('cloud', 'Cuenta y sincronización', accountSheet, email ? 'Conectada' : 'Sin conectar'),
      row('lock', 'Seguridad y PIN', securitySheet, profile.pin ? 'Activado' : 'Sin PIN'),
      // Único acceso a cambiar de cuenta: antes se repetía como botón rojo al
      // final de esta pantalla y otra vez dentro de Perfil → Cuenta y seguridad.
      row('logout', 'Cambiar de cuenta', softLogout)
    ));
    // --- Apariencia ---------------------------------------------------------
    // Los cuatro controles viven dentro de su propia hoja, al igual que el resto
    // de secciones: en la pantalla solo queda la fila que la abre, con el tema
    // activo como estado actual. Así Ajustes mantiene un ritmo uniforme de
    // «tarjeta que abre una sección» en vez de mezclar filas y controles inline.
    const THEME_LABELS = { auto: 'Auto', light: 'Claro', dark: 'Oscuro' };
    group('Apariencia', h('div', { class: 'set-card' },
      row('moon', 'Apariencia', appearanceSheet, THEME_LABELS[theme()] || 'Auto')
    ));

    // Resumen del permiso del navegador: el estado se lee en la fila, sin abrir la hoja.
    const notifStatus = {
      unsupported: 'No soportado',
      denied: 'Bloqueadas',
      default: 'Sin permiso',
      granted: 'Activadas'
    }[notifPermission()] || 'Sin revisar';
    group('Notificaciones', h('div', { class: 'set-card' },
      row('bell', 'Notificaciones', notifSheet, notifStatus)
    ));

    // Los dos interruptores vivían dentro de la hoja «Tareas y hábitos», que
    // solo los contenía a ellos dos: al ser preferencias siempre activas pasan a
    // su fila directa. `tasksPrefsSheet` se mantiene exportada por compatibilidad.
    group('Aplicación', h('div', { class: 'set-card' },
      switchPrefRow('checksq', 'Ocultar completadas en Hoy', 'La pantalla Inicio solo mostrará lo pendiente', S.settings.hideCompleted, value => { S.settings.hideCompleted = value; save(); }),
      switchPrefRow('phone', 'Vibración al marcar', 'Respuesta háptica en dispositivos compatibles', S.settings.haptics !== false, value => { S.settings.haptics = value; save(); }),
      row('pencil', 'Personalizar opciones', optionsSheet)
    ));

    group('Datos', h('div', { class: 'set-card' },
      row('cloud', 'Copia de seguridad', backupSheet)
    ));

    // Única zona roja de la pantalla: lo irreversible, con nombre explícito y
    // al final. Así el color no lo comparte ningún ajuste cotidiano.
    group('Zona de peligro', h('div', { class: 'set-card' },
      row('trash', 'Eliminar datos', deleteDataSheet, null, 'is-danger')
    ), true);

    group('Información', h('div', { class: 'set-card' },
      row('info', 'DailyHub v2.0', infoSheet)
    ));
    return wrap;
  }

  Object.assign(app.features, { settings: scrSettings, profile: scrProfile });
  Object.assign(app.settings, { securitySheet, notifSheet, appearanceSheet, optionsSheet, tasksPrefsSheet, backupSheet, deleteDataSheet, infoSheet });
}
