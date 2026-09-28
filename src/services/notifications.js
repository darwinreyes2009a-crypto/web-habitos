export function registerNotifications(app) {
  const { todayStr } = app.core;
  const { S, save } = app.state;
  const { sortedUpcomingGifts, daysUntil, tasksDueOn, isDoneOn, birthdaysToday } = app.domain;
  let notificationTimer = null;

  function notifPermission() {
    return 'Notification' in window ? Notification.permission : 'unsupported';
  }

  function inQuietHours() {
    const settings = S.settings && S.settings.notif;
    if (!settings || !settings.quietFrom || !settings.quietTo) return false;
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const from = Number(settings.quietFrom.slice(0, 2)) * 60 + Number(settings.quietFrom.slice(3));
    const to = Number(settings.quietTo.slice(0, 2)) * 60 + Number(settings.quietTo.slice(3));
    if (from === to) return false;
    return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
  }

  async function requestNotifPermission() {
    if (notifPermission() === 'unsupported') return 'unsupported';
    try {
      return await Notification.requestPermission();
    } catch (error) {
      return 'error';
    }
  }

  async function showAppNotification(title, body) {
    if (notifPermission() !== 'granted') return false;
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        if (registration && registration.showNotification) {
          await registration.showNotification(title, { body, icon: './icon.svg', tag: 'dailyhub-' + todayStr() });
          return true;
        }
      }
      new Notification(title, { body });
      return true;
    } catch (error) {
      console.warn('No se pudo mostrar la notificación', error);
      return false;
    }
  }

  async function scheduleGiftNotification() {
    try {
      const settings = S.settings.notif;
      if (!settings || !settings.gifts || notifPermission() !== 'granted' || inQuietHours()) return false;
      const today = todayStr();
      const gifts = sortedUpcomingGifts().filter(gift =>
        gift.targetDate && gift.targetDate >= today && (gift.status === 'Idea' || gift.status === 'Comprar')
      );
      // Cada regalo puede tener su propio margen de aviso (remindDays);
      // si no, se usa el estándar de 7 días.
      const gift = gifts.find(item => item._lastNotified !== today && daysUntil(item.targetDate) <= (item.remindDays != null ? item.remindDays : 7));
      if (!gift) return false;
      const person = S.people.find(item => item.id === gift.personId);
      const days = daysUntil(gift.targetDate);
      const when = days === 0 ? '¡es hoy!' : days === 1 ? 'es mañana' : 'es en ' + days + ' días';
      const shown = await showAppNotification('Regalo pendiente', gift.title + (person ? ' para ' + person.name : '') + ' ' + when);
      if (shown) {
        gift._lastNotified = today;
        save();
      }
      return shown;
    } catch (error) {
      console.warn('Regalo notification', error);
      return false;
    }
  }

  async function maybeNotify(force = false) {
    try {
      const settings = S.settings.notif;
      if (!settings || (!settings.reminders && !settings.daily) || notifPermission() !== 'granted' || inQuietHours()) return false;
      const today = todayStr();
      if (!force && S.meta.lastNotified === today) return false;
      const pending = tasksDueOn(today).filter(task => !isDoneOn(task, today)).length;
      const birthdays = birthdaysToday();
      if (!pending && !birthdays.length) return false;
      let body = pending > 0 ? pending + (pending === 1 ? ' tarea pendiente hoy' : ' tareas pendientes hoy') : '';
      if (birthdays.length) body += (body ? ' · ' : '') + 'Cumpleaños de ' + birthdays.map(person => person.name).join(', ');
      const shown = await showAppNotification('DailyHub', body.trim());
      if (shown) {
        S.meta.lastNotified = today;
        save();
      }
      return shown;
    } catch (error) {
      console.warn('DailyHub notification', error);
      return false;
    }
  }

  /* --- Aviso de clase ------------------------------------------------------ */

  // Avisa de la próxima clase del día si empieza dentro del margen. El margen
  // sale de los ajustes (`notif.classLead`, por defecto 15 minutos) y solo se
  // dispara una vez por bloque y día.
  async function maybeNotifyClass() {
    try {
      const settings = S.settings.notif;
      if (!settings || settings.classes === false || notifPermission() !== 'granted') return false;
      if (app.class && typeof app.class.breakOn === 'function' && app.class.breakOn(todayStr())) return false;
      const lead = Number(settings.classLead == null ? 15 : settings.classLead) || 15;
      const blocks = typeof app.class.slotsOnDate === 'function' ? app.class.slotsOnDate(todayStr()) : [];
      const now = new Date();
      const minutes = now.getHours() * 60 + now.getMinutes();
      const hmOf = time => { const p = String(time || '0:00').split(':'); return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0); };
      const target = blocks
        .filter(slot => hmOf(slot.start) > minutes && hmOf(slot.start) - minutes <= lead)
        .sort((first, second) => hmOf(first.start) - hmOf(second.start))[0];
      if (!target) return false;
      const today = todayStr();
      const stamp = 'class:' + target.id;
      if (S.meta.classNotified === stamp) return false;
      const patio = target.kind === 'patio' || target.room === 'patio';
      const name = patio ? 'el patio' : (((app.class.subjectById && app.class.subjectById(target.subjectId)) || {}).name || 'una clase');
      const when = hmOf(target.start) - minutes;
      const where = target.room && !/^https?:/i.test(target.room) ? ' en ' + target.room : '';
      const shown = await showAppNotification(
        (when <= 1 ? 'Empieza ahora' : 'Empieza en ' + when + ' min'),
        name + where + ' · ' + String(target.start).slice(0, 5)
      );
      if (shown) {
        S.meta.classNotified = stamp;
        save();
      }
      return shown;
    } catch (error) {
      console.warn('Aviso de clase', error);
      return false;
    }
  }

  function startNotificationChecks() {
    clearInterval(notificationTimer);
    notificationTimer = setInterval(() => {
      maybeNotify();
      scheduleGiftNotification();
      maybeNotifyClass();
    }, 60000);
    // El aviso de clase se busca nada más arrancar: si la app se abre con la
    // clase a punto de empezar, hay que decirlo igualmente.
    setTimeout(() => { maybeNotifyClass(); }, 4000);
  }

  Object.assign(app.services, {
    notifPermission,
    inQuietHours,
    requestNotifPermission,
    showAppNotification,
    scheduleGiftNotification,
    maybeNotify,
    maybeNotifyClass,
    startNotificationChecks
  });
}
