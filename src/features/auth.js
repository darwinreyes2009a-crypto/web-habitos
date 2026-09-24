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

  function authCheck() {
    if (!sync) return true;
    if (sync.status.state === 'loading') return true;
    return sync.status.state === 'online';
  }

  function softLogout() {
    clearPushTimer();
    if (sync && sync.realtime) sync.realtime.stop();
    sync.status.state = 'loggedout';
    session.unlocked = false;
    closeOverlays();
    render();
  }

  function switchAccount(account) {
    toast('Entrando…');
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
      sync.status.state = 'online';
      session.unlocked = false;
      applyTheme();
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
        if (sync && sync.realtime) sync.realtime.stop();
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
    const button = h('button', { class: 'btn btn-primary btn-block btn-lg' }, 'Entrar');
    let authMode = 'login';
    const modeButton = h('button', { class: 'link', style: 'font-size:13px;margin-top:18px' }, '¿No tienes cuenta? Crear una');
    modeButton.addEventListener('click', () => {
      authMode = authMode === 'login' ? 'signup' : 'login';
      button.textContent = authMode === 'login' ? 'Entrar' : 'Crear cuenta';
      modeButton.textContent = authMode === 'login' ? '¿No tienes cuenta? Crear una' : 'Ya tengo cuenta · Entrar';
      message.textContent = '';
    });

    async function submit() {
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      if (!email || !password) {
        message.textContent = 'Escribe tu email y contraseña.';
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
          return;
        }
        const user = result.data.session.user;
        sync.status.state = 'online';
        message.style.color = '';
        message.textContent = '';
        claimAccount(user.id, user.email || email);
        session.unlocked = false;
        applyTheme();
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
          box.append(
            h('div', { style: 'text-align:center;margin-bottom:16px' },
              h('div', { class: 'auth-logo', style: 'width:48px;height:48px;font-size:20px;margin-bottom:10px', html: (user.email || '?').charAt(0).toUpperCase() }),
              h('b', { style: 'font-size:15px;display:block' }, user.email),
              h('p', { style: 'font-size:12px;color:var(--text-2);margin-top:4px' }, profile ? 'Perfil: ' + profile.name : 'Tus datos se sincronizan en todos tus dispositivos')
            ),
            h('button', { class: 'btn btn-soft btn-block', onclick: async () => { toast('Sincronizando…'); const ok = await sync.push(); toast(ok ? 'Todo sincronizado ✓' : 'No se pudo sincronizar'); } }, 'Sincronizar ahora'),
            h('button', { class: 'btn btn-soft btn-block', style: 'margin-top:10px', onclick: async () => { toast('Descargando…'); const ok = await sync.pull(); toast(ok ? 'Datos actualizados ✓' : 'No se pudo descargar'); if (ok) render(); } }, 'Descargar cambios del servidor'),
            h('button', { class: 'btn btn-soft btn-block', style: 'margin-top:10px', onclick: softLogout }, 'Cambiar de cuenta'),
            h('button', { class: 'btn btn-danger btn-block btn-lg', style: 'margin-top:10px', onclick: removeDeviceAccount }, 'Quitar esta cuenta del dispositivo'),
            h('p', { style: 'font-size:11px;color:var(--text-3);margin-top:14px;text-align:center' }, 'Copia local: ' + Math.round(localSize / 1024) + ' KB')
          );
        } else {
          box.append(
            h('p', { style: 'font-size:13.5px;color:var(--text-2);text-align:center;line-height:1.6;margin-bottom:16px' }, 'Tus datos se guardan en la nube con tu cuenta. Inicia sesión para tenerlos en todos tus dispositivos.'),
            h('button', { class: 'btn btn-primary btn-block btn-lg', onclick: () => { sync.status.state = 'loggedout'; closeOverlays(); render(); } }, 'Crear cuenta o iniciar sesión')
          );
        }
      });
      return box;
    });
  }

  Object.assign(app.auth, { authCheck, softLogout, switchAccount, removeDeviceAccount, authScreen, accountSheet });
}
