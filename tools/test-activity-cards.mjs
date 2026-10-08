import { registerRoutines } from '../src/core/routines.js';
import { registerHomeAndTasks } from '../src/features/home-tasks.js';

const today = '2026-10-05';
const tasks = [
  { id: 'walk', title: 'Paseo', cat: 'Salud', kind: 'check', freq: { type: 'daily' }, createdAt: today, completions: [], icon: 'paw' },
  { id: 'water', title: 'Beber agua', cat: 'Salud', kind: 'count', target: 5, freq: { type: 'daily' }, createdAt: today, completions: [], log: {} },
  { id: 'avoid-sugar', title: 'Evitar azúcar', cat: 'Salud', kind: 'avoid', freq: { type: 'daily' }, createdAt: today, completions: [], log: {} }
];
const nodes = [];
let saveCount = 0;
let renderCount = 0;
const makeNode = (tag, attrs = {}, ...children) => {
  const node = {
    tag, attrs, children: [], style: {}, listeners: {}, parentNode: null,
    append(...items) { for (const item of items.flat(Infinity).filter(child => child != null)) { if (item && typeof item === 'object') item.parentNode = this; this.children.push(item); } },
    replaceWith(next) { if (!this.parentNode) return; const siblings = this.parentNode.children; const index = siblings.indexOf(this); if (index >= 0) { siblings[index] = next; next.parentNode = this.parentNode; } this.parentNode = null; },
    addEventListener(name, callback) { this.listeners[name] = callback; },
    click() { if (!this.attrs.disabled && this.attrs.onclick) this.attrs.onclick({ stopPropagation() {}, preventDefault() {}, currentTarget: this, target: this }); },
    set innerHTML(value) { this.children = []; },
    get innerHTML() { return ''; },
    classList: { add() {}, remove() {}, toggle() {} },
    dataset: {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    set textContent(value) { this.children = [String(value)]; },
    get textContent() { return this.children.map(child => child && typeof child === 'object' ? child.textContent : String(child)).join(''); }
  };
  node.append(...children);
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
  state: { S, save() { saveCount++; } },
  domain: {
    ui: { tasksView: 'lista', tasksFilter: 'hoy' }, go() {}, render() { renderCount++; }, toggleOn(id, date) { return app.core.toggleOn(tasks.find(task => task.id === id), date); }, currentProfile: () => ({ name: 'Alex', color: '#123456' }),
    birthdaysToday: () => [], tasksDueOn: date => tasks.filter(task => task.freq.date ? task.freq.date === date : true),
    isDoneOn: (task, date) => app.core.isDoneOn(task, date), isDueOn: (task, date) => app.core.isDueOn(task, date),
    categories: () => ['Salud'], freqText: () => 'Todos los días', streakOf: () => 0,
    weekStats: () => ({ due: 0, done: 0, start: today }), sortedUpcomingGifts: () => [], countdownTxt: () => '', statusCls: () => ''
  },
  components: {
    headBar: (...args) => makeNode('header', {}, args), searchBtn: () => null,
    emptyState: (...args) => makeNode('div', { 'data-empty': args[1] }), confirmDialog(options) { app.components.lastConfirm = options; }
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

function findNode(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of node.children || []) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}
function swipe(card, startX, endX, startY = 80, endY = 82, target = card) {
  let prevented = false;
  const event = { target, cancelable: true, preventDefault() { prevented = true; }, stopPropagation() {} };
  card.listeners.touchstart({ ...event, touches: [{ clientX: startX, clientY: startY }] });
  card.listeners.touchmove?.({ ...event, touches: [{ clientX: endX, clientY: endY }] });
  card.listeners.touchend({ ...event, changedTouches: [{ clientX: endX, clientY: endY }] });
  return prevented;
}
const walk = tasks.find(task => task.id === 'walk');
const activityCard = findNode(screen, node => node.tag === 'article' && node.attrs['data-task-id'] === 'walk');
if (!activityCard || !activityCard.listeners.touchstart || !activityCard.listeners.touchend) throw new Error('Activity cards should support an intuitive swipe gesture');
swipe(activityCard, 40, 140);
if (!walk.completions.includes(today)) throw new Error('Swiping right on a check habit should complete it');
swipe(activityCard, 140, 40);
if (walk.completions.includes(today)) throw new Error('Swiping left on a completed check habit should undo it');
if (swipe(activityCard, 40, 44, 80, 150) || walk.completions.includes(today)) throw new Error('Vertical movement should remain scroll and never complete the habit');
const water = tasks.find(task => task.id === 'water');
const waterCard = findNode(screen, node => node.tag === 'article' && node.attrs['data-task-id'] === 'water');
swipe(waterCard, 140, 40);
if ((water.log[today] || 0) !== 0) throw new Error('Swipe left on a numeric habit should subtract its normal step without going below zero');
swipe(waterCard, 40, 140);
if ((water.log[today] || 0) !== 1) throw new Error('Swipe right on a numeric habit should add one unit');
const avoid = tasks.find(task => task.id === 'avoid-sugar');
const avoidCard = findNode(screen, node => node.tag === 'article' && node.attrs['data-task-id'] === 'avoid-sugar');
swipe(avoidCard, 40, 140);
if (avoid.completions.includes(today) || !app.components.lastConfirm) throw new Error('A clean Avoid habit should require confirmation before recording a failure');
app.components.lastConfirm.onConfirm();
if (!avoid.completions.includes(today)) throw new Error('Confirming the Avoid gesture should record the failure');
swipe(avoidCard, 140, 40);
if (avoid.completions.includes(today)) throw new Error('Swiping left on an Avoid failure should restore a clean day');

const home = app.features.home();
const homeCard = findNode(home, node => node.tag === 'article' && node.attrs['data-task-id'] === 'walk');
if (!homeCard) throw new Error('Home should render habits with the same clear visual card treatment');
if (!String(homeCard.attrs.class).includes('home-activity-card')) throw new Error('Home should mark its activity tiles for the compact image-grid layout');
if (!findNode(homeCard, node => node.attrs && String(node.attrs.class || '').split(/\s+/).includes('home-activity-art'))) throw new Error('Home tiles should show a routine image or a large icon');
if (!findNode(homeCard, node => node.attrs && String(node.attrs.class || '').split(/\s+/).includes('activity-card-quick-action'))) throw new Error('Home tiles should expose a clear primary action');
if (!findNode(home, node => node.attrs && String(node.attrs.class || '').split(/\s+/).includes('home-day-summary'))) throw new Error('Home should summarize today at the top of the activity tiles');
swipe(homeCard, 40, 140);
if (!walk.completions.includes(today)) throw new Error('The same swipe should complete a habit from Home');
const refreshedHomeCard = findNode(home, node => node.tag === 'article' && node.attrs['data-task-id'] === 'walk');
if (!String(refreshedHomeCard.attrs.class).includes('home-activity-card')) throw new Error('Refreshing a Home tile should preserve its compact presentation');
if (!findNode(refreshedHomeCard, node => node.attrs && String(node.attrs.class || '').split(/\s+/).includes('activity-card-quick-action'))) throw new Error('The refreshed Home tile should retain its primary action');
console.log('Home and Activities render visual cards and support swipe-to-complete with undo.');
