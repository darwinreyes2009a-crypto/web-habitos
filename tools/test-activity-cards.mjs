import { registerRoutines } from '../src/core/routines.js';
import { registerHomeAndTasks } from '../src/features/home-tasks.js';

const today = '2026-10-05';
const tasks = [
  { id: 'walk', title: 'Paseo', cat: 'Salud', kind: 'check', freq: { type: 'daily' }, createdAt: today, completions: [], icon: 'paw' },
  { id: 'water', title: 'Beber agua', cat: 'Salud', kind: 'count', target: 5, freq: { type: 'daily' }, createdAt: today, completions: [], log: {} }
];
const nodes = [];
const makeNode = (tag, attrs = {}, ...children) => {
  const node = {
    tag, attrs, children: children.flat(Infinity).filter(child => child != null), style: {}, listeners: {},
    append(...items) { this.children.push(...items.flat(Infinity).filter(child => child != null)); },
    addEventListener(name, callback) { this.listeners[name] = callback; },
    set innerHTML(value) { this.children = []; },
    get innerHTML() { return ''; },
    classList: { add() {}, remove() {}, toggle() {} },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  nodes.push(node);
  return node;
};
const S = { tasks, people: [], gifts: [], notes: [], inbox: [], settings: { hideCompleted: false }, profiles: [], activeProfileId: null };
const app = {
  core: {
    $: () => null, h: makeNode, icon: (name, size) => `<svg data-icon="${name}" data-size="${size}"></svg>`,
    todayStr: () => today, parseYmd: value => new Date(value + 'T00:00:00'),
    addDaysYmd(value, amount) { const date = new Date(value + 'T00:00:00'); date.setDate(date.getDate() + amount); return date.toISOString().slice(0, 10); },
    weekStartOf: value => value,
    fmtLong: value => value, fmtShort: value => value, fmtRange: (start, end) => start + ' - ' + end,
    WEEK_L: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
    KINDS: [{ id: 'check', label: 'Sí o no' }]
  },
  state: { S, save() {} },
  domain: {
    ui: { tasksView: 'lista', tasksFilter: 'hoy' }, go() {}, render() {}, currentProfile: () => ({ name: 'Alex', color: '#123456' }),
    birthdaysToday: () => [], tasksDueOn: date => tasks.filter(task => task.freq.date ? task.freq.date === date : true),
    isDoneOn: (task, date) => app.core.isDoneOn(task, date), isDueOn: (task, date) => app.core.isDueOn(task, date),
    categories: () => ['Salud'], freqText: () => 'Todos los días', streakOf: () => 0,
    weekStats: () => ({ due: 0, done: 0, start: today }), sortedUpcomingGifts: () => [], countdownTxt: () => '', statusCls: () => ''
  },
  components: {
    headBar: (...args) => makeNode('header', {}, args), searchBtn: () => null,
    emptyState: (...args) => makeNode('div', { 'data-empty': args[1] }), confirmDialog() {}
  },
  class: { classNow: () => null, classNext: () => null, subjectById: () => null, activeSession: () => null, leftTxt: () => '', inTxt: () => '' },
  features: {
    stepDoneOn: () => false,
    priorityInfo: () => null,
    taskControl: (task, date) => makeNode('button', { 'data-control': task.id + ':' + date }, 'control'),
    goalBar: () => null,
    routineSheet() {}, guidedTaskSheet() {},
    taskStats() {},
    taskRow() {},
    taskForm() {}
  },
  actions: {}, services: {}
};
registerRoutines(app);
app.core.avatarEl = () => null;
app.core.cap = value => value;
app.core.toYmd = value => value;
app.core.weekStartOf = value => value;
app.core.addDaysYmd = (value, amount) => {
  const date = new Date(value + 'T00:00:00'); date.setDate(date.getDate() + amount); return date.toISOString().slice(0, 10);
};
app.core.parseYmd = value => new Date(value + 'T00:00:00');
app.core.fmtLong = value => value;
app.core.fmtShort = value => value;
app.core.fmtRange = (start, end) => start + ' - ' + end;
app.core.WEEK_L = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
app.core.weekStartOf = value => value;
app.domain.currentProfile = () => ({ name: 'Alex', color: '#123456' });
app.domain.birthdaysToday = () => [];
app.domain.tasksDueOn = date => tasks.filter(task => app.core.isDueOn(task, date));
app.domain.sortedUpcomingGifts = () => [];
app.domain.countdownTxt = () => '';
app.domain.statusCls = () => '';
app.domain.categories = () => ['Salud'];
app.domain.freqText = () => 'Todos los días';
app.domain.streakOf = () => 0;
app.domain.weekStats = () => ({ due: 0, done: 0, start: today });
app.class.classNow = () => null;
app.class.classNext = () => null;
registerHomeAndTasks(app);
const screen = app.features.tasks();
const texts = nodes.flatMap(node => node.children).filter(item => typeof item === 'string').join(' ');
if (!texts.includes('Actividades') || !texts.includes('Para hoy') || !texts.includes('Paseo') || !texts.includes('Beber agua')) {
  throw new Error('Activity cards should render the heading, filters, and due tasks. Found: ' + texts);
}
if (!nodes.some(node => node.attrs && node.attrs.class === 'activity-card-list')) throw new Error('Tasks screen should use the activity-card list layout');
if (screen.children.length < 2) throw new Error('Activity screen should render a usable header and content');
console.log('The Tasks screen renders the new activity card layout for due routines.');
