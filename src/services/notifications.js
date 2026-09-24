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

  function startNotificationChecks() {
    clearInterval(notificationTimer);
    notificationTimer = setInterval(() => {
      maybeNotify();
      scheduleGiftNotification();
    }, 60000);
  }

  Object.assign(app.services, {
    notifPermission,
    inQuietHours,
    requestNotifPermission,
    showAppNotification,
    scheduleGiftNotification,
    maybeNotify,
    startNotificationChecks
  });
}
