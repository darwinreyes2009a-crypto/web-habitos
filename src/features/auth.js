export function registerAuth(app) {
  const { h, avatarEl } = app.core;
  const {
    S,
    replaceState,
    defaultState,
    stateFromRaw,
    switchProfileData,
    applyTheme,
    accountsIndex,
    saveAccountsIndex,
    activeAccountUid,
    updateAccountIndex,
    claimAccount,
    clearPushTimer,
    ACC_ACTIVE,
    ACC_PREFIX
  } = app.state;
  const { session } = app.domain;
  const { openSheet, closeOverlays, confirmDialog, toast } = app.components;
  const sync = app.services.sync;
  const supabase = app.services.supabase;
  const render = app.render;
  let mode = 'picker';
  let loginEmail = '';
  let offlineAccountAccess = !!activeAccountUid();

  function authCheck() {
    if (!sync) return true;
    if (sync.status.state === 'loading' || sync.status.state === 'online') return true;
    return sync.status.state === 'offline' && offlineAccountAccess && !!activeAccountUid();
  }

  function softLogout() {
    offlineAccountAccess = false;
    clearPushTimer();
    if (sync && sync.realtime) sync.realtime.stop();
    if (sync && sync.cancelRetry) sync.cancelRetry();
    sync.status.state = 'loggedout';
    session.unlocked = false;
    closeOverlays();
    render();
  }

  function switchAccount(account) {
    offlineAccountAccess = false;
    toast('Entrando…');
    if (sync && sync.cancelRetry) sync.cancelRetry();
    if (sync && sync.realtime) sync.realtime.stop();
    sync.restoreSession(account.uid).then(user => {
      if (!user) {
        toast('La sesión ha caducado. Vuelve a entrar.');
        mode = 'login';
        loginEmail = account.email || '';
        render();
        return;
      }
      localStorage.setItem(ACC_ACTIVE, account.uid);
      const raw = localStorage.getItem(ACC_PREFIX + account.uid);
      replaceState(raw ? stateFromRaw(raw) : defaultState());
      switchProfileData();
      if (window.__rebuildPrevCaches) window.__rebuildPrevCaches();
      updateAccountIndex(account.uid, user.email || account.email || '');
      offlineAccountAccess = true;
      sync.status.state = typeof navigator === 'undefined' || navigator.onLine !== false ? 'online' : 'offline';
      session.unlocked = false;
      applyTheme();
      if (sync.cancelRetry) sync.cancelRetry();
      sync.pull().then(ok => {
        toast(ok ? 'Datos de ' + (user.email || 'la cuenta') + ' cargados' : 'Conectado, pero la nube no responde');
        if (ok && sync.realtime) sync.realtime.start();
        render();
      });
    }).catch(() => {
      toast('No se pudo entrar en esa cuenta');
      render();
    });
  }

  function removeDeviceAccount() {
    const uid = activeAccountUid();
    if (!uid) {
      closeOverlays();
      return;
    }
    confirmDialog({
      title: '¿Quitar esta cuenta del dispositivo?',
      message: 'Se borrará la copia guardada de esta cuenta en este navegador. Los datos de la nube se conservan: podrás volver a entrar cuando quieras.',
      confirmText: 'Quitar cuenta',
      onConfirm: async () => {
        offlineAccountAccess = false;
        if (sync && sync.realtime) sync.realtime.stop();
        if (sync && sync.cancelRetry) sync.cancelRetry();
        if (sync && sync.removeAuthBlob) await sync.removeAuthBlob(uid);
        try {
          localStorage.removeItem(ACC_PREFIX + uid);
          saveAccountsIndex(accountsIndex().filter(account => account.uid !== uid));
          localStorage.removeItem(ACC_ACTIVE);
        } catch (error) {}
        replaceState(defaultState());
        switchProfileData();
        applyTheme();
        sync.status.state = 'loggedout';
        session.unlocked = false;
        closeOverlays();
        render();
        toast('Cuenta eliminada de este dispositivo');
      }
    });
  }

  function authScreen() {
    const status = sync.status.state;
    const accounts = accountsIndex();
    const wrap = h('div', { class: 'center-page' }, h('div', { class: 'center-box' }));
    const box = wrap.firstChild;
    box.append(
      h('div', { class: 'auth-logo', html: 'D' }),
      h('h2', { style: 'font-size:24px;font-weight:800;letter-spacing:-.03em' }, 'Bienvenido a DailyHub')
    );

    if (status === 'offline') {
      box.append(
        h('p', { style: 'font-size:13.5px;color:var(--text-2);margin:8px 0 20px;line-height:1.6' }, 'No hay conexión con el servidor. Comprueba tu conexión y vuelve a intentarlo para entrar en tu cuenta.'),
        h('button', { class: 'btn btn-primary btn-block btn-lg', onclick: () => { sync.status.state = 'loading'; render(); sync.boot(); } }, 'Reintentar')
      );
      return wrap;
    }

    if (accounts.length && mode !== 'login') {
      box.append(h('p', { style: 'font-size:13px;color:var(--text-2);margin:4px 0 18px;text-align:center' }, '¿Quién eres?'));
      const list = h('div', { style: 'display:flex;flex-direction:column;gap:10px;margin-bottom:14px' });
      for (const account of accounts) {
        list.append(h('button', {
          class: 'btn btn-soft btn-block',
          style: 'display:flex;align-items:center;gap:12px;padding:12px 16px',
          onclick: () => switchAccount(account)
        },
          avatarEl(account.name || '?', account.color || '#2563EB', 40, account.photo || ''),
          h('div', { style: 'text-align:left;min-width:0' },
            h('b', { style: 'display:block;font-size:14.5px' }, account.name || 'Cuenta'),
            h('span', { style: 'font-size:12px;color:var(--text-2);word-break:break-all' }, account.email || account.uid)
          )
        ));
      }
      box.append(list);
      box.append(h('button', { class: 'btn btn-primary btn-block', onclick: () => { mode = 'login'; render(); } }, 'Añadir otra cuenta'));
      return wrap;
    }

    const emailInput = h('input', { class: 'input', type: 'email', placeholder: 'tucorreo@ejemplo.com', autocomplete: 'email' });
    const passwordInput = h('input', { class: 'input', type: 'password', placeholder: 'Mínimo 6 caracteres', autocomplete: 'current-password' });
    const message = h('p', { class: 'field-hint', style: 'min-height:18px;text-align:center' });
    let showPassword = false;
    const togglePassword = h('button', {
      class: 'link',
      type: 'button',
      style: 'font-size:12px;margin-top:8px',
      onclick: () => {
        showPassword = !showPassword;
        passwordInput.type = showPassword ? 'text' : 'password';
        togglePassword.textContent = showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña';
      }
    }, 'Mostrar contraseña');
    const button = h('button', { class: 'btn btn-primary btn-block btn-lg' }, 'Entrar');
    let authMode = 'login';
    const modeButton = h('button', { class: 'link', style: 'font-size:13px;margin-top:18px' }, '¿No tienes cuenta? Crear una');
    modeButton.addEventListener('click', () => {
      authMode = authMode === 'login' ? 'signup' : 'login';
      button.textContent = authMode === 'login' ? 'Entrar' : 'Crear cuenta';
      modeButton.textContent = authMode === 'login' ? '¿No tienes cuenta? Crear una' : 'Ya tengo cuenta · Entrar';
      message.textContent = '';
      message.style.color = '';
    });

    async function submit() {
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      if (!email || !password) {
        message.textContent = 'Escribe tu email y contraseña.';
        return;
      }
      if (!/^[\w.+-]+@[\w.-]+\.[\w.-]+$/.test(email)) {
        message.textContent = 'Escribe un email válido.';
        return;
      }
      if (password.length < 6) {
        message.textContent = 'La contraseña debe tener al menos 6 caracteres.';
        return;
      }
      button.disabled = true;
      message.textContent = 'Un momento…';
      try {
        const result = authMode === 'login'
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });
        if (result.error) throw result.error;
        if (authMode === 'signup' && !result.data.session) {
          message.style.color = 'var(--primary)';
          message.textContent = 'Cuenta creada. Revisa tu correo para confirmarla y luego entra.';
          button.disabled = false;
          authMode = 'login';
          button.textContent = 'Entrar';
          modeButton.textContent = '¿No tienes cuenta? Crear una';
          return;
        }
        const user = result.data.session.user;
        sync.status.state = typeof navigator === 'undefined' || navigator.onLine !== false ? 'online' : 'offline';
        message.style.color = '';
        message.textContent = '';
        claimAccount(user.id, user.email || email);
        offlineAccountAccess = true;
        session.unlocked = false;
        applyTheme();
        if (sync.cancelRetry) sync.cancelRetry();
        const pullOk = await sync.pull();
        if (pullOk && sync.realtime) sync.realtime.start();
        render();
        if (!pullOk) toast('Conectado, pero la nube no responde. ¿Aplicaste supabase/schema.sql en Supabase?');
      } catch (error) {
        message.style.color = 'var(--danger)';
        message.textContent = error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos.' : (error.message || 'Error de conexión');
        button.disabled = false;
      }
    }

    button.addEventListener('click', submit);
    passwordInput.addEventListener('keydown', event => { if (event.key === 'Enter') submit(); });
    emailInput.addEventListener('keydown', event => { if (event.key === 'Enter') passwordInput.focus(); });
    box.append(...[
      h('div', { class: 'field', style: 'text-align:left;margin-top:20px' }, h('label', null, 'Email'), emailInput),
      h('div', { class: 'field', style: 'text-align:left' }, h('label', null, 'Contraseña'), passwordInput),
      togglePassword,
      message,
      button,
      modeButton,
      accounts.length ? h('button', { class: 'link', style: 'font-size:12px;margin-top:8px;color:var(--text-3)', onclick: () => { mode = 'picker'; render(); } }, '← Volver a elegir cuenta') : null
    ].filter(Boolean));
    emailInput.value = loginEmail || '';
    return wrap;
  }

  function accountSheet() {
    openSheet('Cuenta y sincronización', () => {
      const box = h('div');
      sync.getUser().then(user => {
        box.innerHTML = '';
        if (user) {
          const localSize = (localStorage.getItem(ACC_PREFIX + user.id) || '').length;
          const profile = S.profiles.find(item => item.id === S.activeProfileId) || null;
          const status = sync.status;
          const stateLabel = status.state === 'online' ? 'Conectado'
            : status.state === 'loading' ? 'Sincronizando…'
              : status.state === 'offline' ? 'Sin conexión · los cambios siguen guardándose localmente'
                : 'Sesión no iniciada';
          const statusNote = h('p', { style: 'font-size:12px;color:' + (status.state === 'offline' ? 'var(--danger)' : 'var(--text-2)') + ';margin-top:4px', 'aria-live': 'polite' }, stateLabel);
          const syncButton = h('button', { class: 'btn btn-soft btn-block', disabled: status.state === 'loggedout' || (typeof navigator !== 'undefined' && navigator.onLine === false), onclick: async () => {
            toast('Sincronizando…');
            const ok = await sync.pull();
            if (ok && sync.realtime) sync.realtime.start();
            statusNote.textContent = ok ? 'Conectado · sincronizado ahora' : (status.error ? 'Error: ' + status.error : 'No se pudo sincronizar · los cambios siguen en este dispositivo');
            statusNote.style.color = ok ? 'var(--green)' : 'var(--danger)';
            toast(ok ? 'Todo sincronizado ✓' : 'No se pudo sincronizar');
          } }, 'Sincronizar ahora');
          box.append(
            h('div', { style: 'text-align:center;margin-bottom:16px' },
              h('div', { class: 'auth-logo', style: 'width:48px;height:48px;font-size:20px;margin-bottom:10px', html: (user.email || '?').charAt(0).toUpperCase() }),
              h('b', { style: 'font-size:15px;display:block' }, user.email),
              h('p', { style: 'font-size:12px;color:var(--text-2);margin-top:4px' }, profile ? 'Perfil: ' + profile.name : 'Tus datos se sincronizan en todos tus dispositivos'),
              statusNote,
              status.error ? h('p', { style: 'font-size:11px;color:var(--danger);overflow-wrap:anywhere;margin-top:4px' }, status.error) : null,
              status.lastSyncAt ? h('p', { style: 'font-size:11px;color:var(--text-3);margin-top:4px' }, 'Última sincronización: ' + new Date(status.lastSyncAt).toLocaleString('es-ES')) : null
            ),
            syncButton,
            h('button', { class: 'btn btn-soft btn-block', style: 'margin-top:10px', disabled: status.state === 'loggedout' || (typeof navigator !== 'undefined' && navigator.onLine === false), onclick: async () => { toast('Descargando…'); const ok = await sync.pull(); toast(ok ? 'Datos actualizados ✓' : 'No se pudo descargar'); if (ok) render(); } }, 'Descargar cambios del servidor'),
            h('button', { class: 'btn btn-soft btn-block', style: 'margin-top:10px', onclick: softLogout }, 'Cambiar de cuenta'),
            h('button', { class: 'btn btn-danger btn-block btn-lg', style: 'margin-top:10px', onclick: removeDeviceAccount }, 'Quitar esta cuenta del dispositivo'),
            h('p', { style: 'font-size:11px;color:var(--text-3);margin-top:14px;text-align:center' }, 'Copia local: ' + Math.round(localSize / 1024) + ' KB')
          );
        } else {
          box.append(
            h('p', { style: 'font-size:13.5px;color:var(--text-2);text-align:center;line-height:1.6;margin-bottom:16px' }, 'Tus datos se guardan en la nube con tu cuenta. Inicia sesión para tenerlos en todos tus dispositivos.'),
            h('button', { class: 'btn btn-primary btn-block btn-lg', onclick: () => { if (sync.cancelRetry) sync.cancelRetry(); sync.status.state = 'loggedout'; closeOverlays(); render(); } }, 'Crear cuenta o iniciar sesión')
          );
        }
      });
      return box;
    });
  }

  Object.assign(app.auth, { authCheck, softLogout, switchAccount, removeDeviceAccount, authScreen, accountSheet });
}
