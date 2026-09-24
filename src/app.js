import '../app-sync.js?v=24';
import { createAppContext } from './core/context.js';
import { registerDom } from './core/dom.js';
import { registerDates } from './core/dates.js';
import { registerConstants } from './core/constants.js';
import { registerIcons } from './core/icons.js';
import { registerSecurity } from './core/security.js';
import { registerInteractions } from './core/interactions.js';
import { registerStore } from './state/store.js';
import { registerRouter } from './navigation/router.js';
import { registerOverlays } from './components/overlays.js';
import { registerMedia } from './services/media.js';
import { registerRecordActions } from './actions/records.js';
import { registerNotifications } from './services/notifications.js';
import { registerAuth } from './features/auth.js';
import { registerClassAgenda } from './features/class/agenda.js';
import { registerClassNotes } from './features/class/notes.js';
import { registerClassSchedule } from './features/class/schedule.js';
import { registerOnboarding } from './features/onboarding-shell.js';
import { registerHomeAndTasks } from './features/home-tasks.js';
import { registerGiftsAndPeople } from './features/gifts-people.js';
import { registerForms } from './features/forms.js';
import { registerSettings } from './features/settings.js';

const app = createAppContext();
window.DailyHub = app;

app.render = function render() {
  app.state.applyTheme();
  const root = app.core.$('#app');
  root.innerHTML = '';
  app.components.closeOverlays();

  if (!app.auth.authCheck()) {
    root.append(app.auth.authScreen());
    return;
  }
  if (!app.state.S.meta.onboarded) {
    root.append(app.features.welcomeScreen);
    return;
  }
  if (app.domain.route.name === 'newProfile') {
    root.append(app.features.newProfileScreen);
    return;
  }
  if (!app.state.S.activeProfileId) {
    root.append(app.features.profileSelectScreen);
    return;
  }
  const profile = app.domain.currentProfile();
  if (!profile) {
    app.state.S.activeProfileId = null;
    app.state.switchProfileData();
    app.state.save();
    root.append(app.features.profileSelectScreen);
    return;
  }
  if (profile.pin && !app.domain.session.unlocked) {
    root.append(app.features.pinScreen(profile));
    return;
  }
  root.append(app.features.shell(profile));
};

registerDom(app);
registerDates(app);
registerConstants(app);
registerIcons(app);
registerSecurity(app);
registerInteractions(app);
registerStore(app);
registerRouter(app);
registerOverlays(app);

app.services.sync = window.DailySync;
app.services.supabase = window.sb;

registerMedia(app);
registerRecordActions(app);
registerNotifications(app);
registerAuth(app);
registerClassAgenda(app);
registerClassNotes(app);
registerClassSchedule(app);
registerOnboarding(app);
registerHomeAndTasks(app);
registerGiftsAndPeople(app);
registerForms(app);
registerSettings(app);

Object.assign(app.features, {
  class: app.class.scrClass,
  noteForm: app.class.scrNoteForm,
  classSubjects: app.class.scrClassSubjects,
  subjectForm: app.class.scrSubjectForm,
  classSchedule: app.class.scrClassSchedule,
  slotForm: app.class.scrSlotForm,
  subjectView: app.class.scrSubjectView,
  classHistory: app.class.scrClassHistory
});

function registerViewport() {
  const update = () => {
    document.documentElement.style.setProperty('--vvh', (window.visualViewport ? window.visualViewport.height : window.innerHeight) + 'px');
  };
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', update);
    window.visualViewport.addEventListener('scroll', update);
  }
  window.addEventListener('resize', update);
  update();
}

function registerExitGuard() {
  let armed = true;
  window.__armExitGuard = value => { armed = !!value; };
  window.addEventListener('beforeunload', event => {
    if (!armed) return;
    event.preventDefault();
    event.returnValue = '¿Seguro que quieres salir de DailyHub?';
    return event.returnValue;
  });
  history.pushState({ dailyHub: true }, '', location.href);
  window.addEventListener('popstate', () => {
    if (!armed) return;
    history.pushState({ dailyHub: true }, '', location.href);
    if (app.core.$('#overlays').children.length) {
      app.components.closeOverlays();
      return;
    }
    if (app.domain.routeStack.length) {
      app.domain.goBack();
      return;
    }
    app.components.exitDialog();
  });
}

async function boot() {
  if (app.services.sync) {
    const accountUid = app.state.activeAccountUid();
    if (accountUid) {
      try {
        const user = await app.services.sync.getUser();
        if (!user || user.id !== accountUid) await app.services.sync.restoreSession(accountUid);
      } catch (error) {}
    }
  }
  if (window.__rebuildPrevCaches) window.__rebuildPrevCaches();
  app.render();
  if (app.services.sync) app.services.sync.boot();
  app.services.maybeNotify();
  app.services.scheduleGiftNotification();
  app.services.startNotificationChecks();
  window.addEventListener('focus', () => {
    app.services.maybeNotify();
    app.services.scheduleGiftNotification();
  });
}

registerViewport();
registerExitGuard();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

['pagehide', 'visibilitychange'].forEach(eventName => document.addEventListener(eventName, () => {
  if (eventName === 'visibilitychange' && document.visibilityState !== 'hidden') return;
  if (app.services.sync && app.services.sync.status.state === 'online') {
    app.state.clearPushTimer();
    app.services.sync.push();
  }
}));

boot();
