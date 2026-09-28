export function registerRouter(app) {
  const {
    cap,
    todayStr,
    parseYmd,
    addDaysYmd,
    dowIdx,
    weekStartOf,
    fmtLong,
    WEEK_FULL,
    DEFAULT_CATEGORIES,
    DEFAULT_RELATIONSHIPS
  } = app.core;
  const { S, save, normalizeData, switchProfileData } = app.state;
  const render = app.render;

  const session = { unlocked: false };
  const route = { name: 'home', params: {} };
  const routeStack = [];
  let startTab = null;

  try {
    const query = new URLSearchParams(location.search);
    const requestedRoute = query.get('goto');
    if (requestedRoute && ['home', 'class', 'tasks', 'gifts', 'settings', 'profile', 'taskForm', 'noteForm'].includes(requestedRoute)) {
      route.name = requestedRoute;
      route.params = {};
    }
    const requestedTab = query.get('tab');
    if (requestedRoute === 'class' && ['hoy', 'semana', 'despues', 'apuntes', 'asignaturas'].includes(requestedTab)) startTab = requestedTab;
  } catch (error) {}

  const ui = {
    weekOffset: 0,
    weekSel: dowIdx(todayStr()),
    tasksView: 'lista',
    calYM: null,
    calSel: null,
    tasksFilter: 'todas',
    // Estadísticas de tareas: periodo elegido (semana | mes | año) y cuántas
    // unidades hacia atrás (semanas / meses / años) se está consultando.
    statsPeriod: 'semana',
    statsOffset: 0,
    giftTab: 'personas'
  };
  if (startTab) ui.classTab = startTab;

  const CATS = DEFAULT_CATEGORIES;
  const categories = () => (S.settings && Array.isArray(S.settings.categories) && S.settings.categories.length) ? S.settings.categories : CATS;
  const relationships = () => (S.settings && Array.isArray(S.settings.relationships) && S.settings.relationships.length) ? S.settings.relationships : DEFAULT_RELATIONSHIPS;
  const currentProfile = () => S.profiles.find(profile => profile.id === S.activeProfileId) || null;

  function setRoute(name, params) {
    route.name = name;
    route.params = params || {};
  }

  function go(name, params, options) {
    const navigationOptions = options || {};
    // Un reemplazo también corta el historial: la pantalla anterior ya no es
    // un destino de "Volver" válido (p. ej. tras guardar un formulario).
    if (navigationOptions.replace) routeStack.length = 0;
    else if (route.name !== name) {
      routeStack.push({ name: route.name, params: route.params || {} });
    }
    setRoute(name, params);
    render();
    window.scrollTo(0, 0);
  }

  function goBack() {
    if (routeStack.length) {
      const previous = routeStack.pop();
      setRoute(previous.name, previous.params);
      render();
      window.scrollTo(0, 0);
    } else if (app.components.exitDialog) {
      app.components.exitDialog();
    }
  }

  // La lógica de routines (tipos, valores, saltos, recurrencia) vive en
  // app.core; aquí solo se delega para no tener dos definiciones.
  function isDueOn(task, ymd) {
    return app.core.isDueOn(task, ymd);
  }

  const isDoneOn = (task, ymd) => app.core.isDoneOn(task, ymd);

  function toggleOn(taskId, ymd) {
    const task = S.tasks.find(item => item.id === taskId);
    if (!task) return;
    const apply = () => {
      if (!app.core.isDueOn(task, ymd)) return;
      if (app.core.isSkipped(task, ymd)) app.core.skipOn(task, ymd, false);
      else app.core.toggleOn(task, ymd);
      task.updatedAt = Date.now();
      if (app.core.haptic) app.core.haptic(app.core.kindOf(task) === 'avoid' && app.core.isDoneOn(task, ymd) ? [12, 24, 12] : undefined);
      save();
      render();
    };
    if (app.core.kindOf(task) === 'avoid' && app.core.isDoneOn(task, ymd) && !app.core.isSkipped(task, ymd)) {
      app.components.confirmDialog({
        title: '¿Marcar como fallado?',
        message: 'El ' + fmtLong(ymd) + ' contará como un día malo.',
        confirmText: 'Marcar fallo',
        onConfirm: apply
      });
      return;
    }
    apply();
  }

  const tasksDueOn = (ymd) => S.tasks.filter(task => isDueOn(task, ymd));

  function freqText(task) {
    return app.core.freqText(task);
  }

  const streakOf = task => app.core.streakOf(task);

  function weekStats(offset, fullWeek, habitsOnly) {
    const start = addDaysYmd(weekStartOf(todayStr()), offset * 7);
    const end = addDaysYmd(start, 6);
    const today = todayStr();
    let due = 0;
    let done = 0;
    for (let index = 0; index < 7; index++) {
      const ymd = addDaysYmd(start, index);
      if (!fullWeek && ymd > today) break;
      for (const task of tasksDueOn(ymd)) {
        if (habitsOnly && task.freq && task.freq.type === 'once') continue;
        due++;
        if (isDoneOn(task, ymd)) done++;
      }
    }
    return { start, end, due, done };
  }

  function daysUntil(ymd) {
    if (!ymd) return null;
    const start = parseYmd(todayStr());
    const end = parseYmd(ymd);
    return Math.round((end - start) / 86400000);
  }

  function countdownTxt(ymd) {
    const days = daysUntil(ymd);
    if (days === null) return '';
    if (days < 0) return ' (fecha pasada)';
    if (days === 0) return ' (¡hoy!)';
    if (days === 1) return ' (mañana)';
    return ' (en ' + days + ' días)';
  }

  function bdayCountdown(birthday) {
    if (!birthday) return null;
    const parts = birthday.split('-');
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    const now = parseYmd(todayStr());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let next = new Date(now.getFullYear(), month - 1, day);
    if (next < today) next = new Date(now.getFullYear() + 1, month - 1, day);
    return { days: Math.round((next - today) / 86400000) };
  }

  function bdayTxt(birthday) {
    const countdown = bdayCountdown(birthday);
    if (!countdown) return '';
    if (countdown.days === 0) return ' · ¡Hoy es su cumpleaños!';
    if (countdown.days === 1) return ' · Mañana cumple años';
    return ' · Cumple el ' + app.core.fmtShort(birthday) + ' (en ' + countdown.days + ' días)';
  }

  const statusCls = (status) => ({
    'Idea': 'st-idea',
    'Comprar': 'st-comprar',
    'Comprado': 'st-comprado',
    'Entregado': 'st-entregado'
  }[status] || 'st-idea');
  const giftsOf = (personId) => S.gifts.filter(gift => gift.personId === personId);

  function sortedUpcomingGifts() {
    return [...S.gifts].sort((first, second) => {
      const firstDone = (first.status === 'Comprado' || first.status === 'Entregado') ? 1 : 0;
      const secondDone = (second.status === 'Comprado' || second.status === 'Entregado') ? 1 : 0;
      if (firstDone !== secondDone) return firstDone - secondDone;
      if (first.targetDate && second.targetDate) return first.targetDate.localeCompare(second.targetDate);
      if (first.targetDate) return -1;
      if (second.targetDate) return 1;
      return 0;
    });
  }

  const birthdaysToday = () => {
    const today = todayStr().slice(5);
    return S.people.filter(person => person.birthday && person.birthday.slice(5) === today);
  };

  Object.assign(app.domain, {
    render,
    session,
    route,
    routeStack,
    ui,
    setRoute,
    go,
    goBack,
    categories,
    relationships,
    currentProfile,
    isDueOn,
    isDoneOn,
    toggleOn,
    tasksDueOn,
    freqText,
    streakOf,
    weekStats,
    daysUntil,
    countdownTxt,
    bdayCountdown,
    bdayTxt,
    statusCls,
    giftsOf,
    sortedUpcomingGifts,
    birthdaysToday
  });
}
