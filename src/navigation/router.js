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

  function isDueOn(task, ymd) {
    const frequency = task.freq || { type: 'daily' };
    if (frequency.type === 'daily') return true;
    if (frequency.type === 'weekdays') return (frequency.days || []).includes(dowIdx(ymd));
    if (frequency.type === 'weekly') return (frequency.days || [])[0] === dowIdx(ymd);
    if (frequency.type === 'monthly') {
      const date = parseYmd(ymd);
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      return date.getDate() === Math.min(frequency.dom || 1, lastDay);
    }
    if (frequency.type === 'once') return frequency.date === ymd;
    return false;
  }

  const isDoneOn = (task, ymd) => (task.completions || []).includes(ymd);

  function toggleOn(taskId, ymd) {
    const task = S.tasks.find(item => item.id === taskId);
    if (!task) return;
    task.completions = task.completions || [];
    const index = task.completions.indexOf(ymd);
    if (index >= 0) task.completions.splice(index, 1);
    else task.completions.push(ymd);
    save();
    render();
  }

  const tasksDueOn = (ymd) => S.tasks.filter(task => isDueOn(task, ymd));

  function freqText(task) {
    const frequency = task.freq || { type: 'daily' };
    let text = '';
    if (frequency.type === 'daily') text = 'Todos los días';
    else if (frequency.type === 'weekdays') text = frequency.days && frequency.days.length ? frequency.days.map(day => WEEK_FULL[day]).join(', ') : 'Días concretos';
    else if (frequency.type === 'weekly') text = 'Cada semana · ' + (WEEK_FULL[(frequency.days || [])[0]] || '');
    else if (frequency.type === 'monthly') text = 'Día ' + (frequency.dom || 1) + ' de cada mes';
    else if (frequency.type === 'once') text = frequency.date ? fmtLong(frequency.date) : 'Una vez';
    if (task.time) text += ' · ' + task.time;
    return text;
  }

  function streakOf(task) {
    let streak = 0;
    let day = todayStr();
    for (let index = 0; index < 400; index++) {
      if (isDueOn(task, day)) {
        if (isDoneOn(task, day)) streak++;
        else break;
      }
      day = addDaysYmd(day, -1);
      if (streak === 0 && index > 7 && !isDueOn(task, day)) continue;
    }
    return streak;
  }

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
