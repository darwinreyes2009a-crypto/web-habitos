import assert from 'node:assert/strict';
import { registerRoutines } from '../src/core/routines.js';
import { registerForms } from '../src/features/forms.js';
import { registerHomeAndTasks } from '../src/features/home-tasks.js';
import { registerTaskRow } from '../src/features/task-row.js';

const TODAY = '2026-10-05';
let nextId = 0;
const bodyNodes = [];
const matches = (node, selector) => {
  selector = selector.trim();
  if (selector.startsWith('.')) return String(node.attrs.class || '').split(/\s+/).includes(selector.slice(1));
  const tag = selector.match(/^[a-z][a-z\d-]*/i)?.[0];
  if (!tag || node.tag !== tag) return false;
  const attrs = [...selector.matchAll(/\[([^\]]+)\]/g)];
  return attrs.every(([, expression]) => {
    const [name, expected] = expression.split('=');
    const actual = node.attrs[name];
    return expected === undefined ? actual !== undefined : String(actual) === expected.replace(/^['"]|['"]$/g, '');
  });
};
class FakeNode {
  constructor(tag, attrs = {}, children = []) {
    this.tag = tag;
    this.attrs = attrs || {};
    this.children = [];
    this.listeners = {};
    this.style = Object.fromEntries(String(this.attrs.style || '').split(';').map(part => part.trim()).filter(Boolean).map(part => {
      const [key, ...value] = part.split(':');
      return [key.trim().replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value.join(':').trim()];
    }));
    this.value = this.attrs.value == null ? '' : this.attrs.value;
    this.disabled = !!this.attrs.disabled;
    this.classList = {
      add: value => { if (!this.classList.contains(value)) this.attrs.class = (this.attrs.class ? this.attrs.class + ' ' : '') + value; },
      remove: value => { this.attrs.class = String(this.attrs.class || '').split(/\s+/).filter(item => item !== value).join(' '); },
      contains: value => String(this.attrs.class || '').split(/\s+/).includes(value),
      toggle: (value, force) => {
        const on = force === undefined ? !this.classList.contains(value) : !!force;
        if (on) this.classList.add(value); else this.classList.remove(value);
        return on;
      }
    };
    if (tag === 'body') bodyNodes.push(this);
    this.append(...children.flat(Infinity).filter(child => child != null));
  }
  append(...children) {
    for (const child of children.flat(Infinity).filter(item => item != null)) {
      if (child instanceof FakeNode) child.parentNode = this;
      this.children.push(child);
    }
  }
  appendChild(child) { this.append(child); return child; }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  focus() {}
  select() {}
  get innerHTML() { return ''; }
  set innerHTML(value) { this.children = []; }
  get textContent() { return this.children.map(child => child instanceof FakeNode ? child.textContent : String(child)).join(''); }
  set textContent(value) { this.children = [String(value)]; }
  get options() { return this.children.filter(child => child instanceof FakeNode && child.tag === 'option'); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const parts = selector.split(',').map(item => item.trim());
    const found = [];
    const visit = node => {
      for (const child of node.children) {
        if (!(child instanceof FakeNode)) continue;
        if (parts.some(part => matches(child, part))) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = null;
  }
  replaceWith(next) {
    if (!this.parentNode) return;
    const siblings = this.parentNode.children;
    const index = siblings.indexOf(this);
    next.parentNode = this.parentNode;
    siblings[index] = next;
    this.parentNode = null;
  }
}
const h = (tag, attrs, ...children) => new FakeNode(tag, attrs, children);
const textOf = node => node instanceof FakeNode ? node.textContent : String(node || '');
const find = (node, predicate, depth = 0) => {
  if (depth > 200) throw new Error('Mock DOM traversal depth exceeded');
  if (!(node instanceof FakeNode)) return null;
  if (predicate(node)) return node;
  for (const child of node.children) {
    const found = find(child, predicate, depth + 1);
    if (found) return found;
  }
  return null;
};
const date = value => new Date(value + 'T00:00:00');
const formatYmd = value => value.toISOString().slice(0, 10);
const tasks = [];
const S = { tasks, people: [], gifts: [], notes: [], inbox: [], profiles: [], activeProfileId: null, settings: { hideCompleted: false, taskTemplates: [], categories: ['Salud'] } };
let saves = 0;
let renderCount = 0;
let toastMessage = '';
const body = new FakeNode('body');
function closeOverlays() { body.children.filter(child => child instanceof FakeNode && child.attrs.class === 'overlay').forEach(child => child.remove()); }
body.append = (...children) => { for (const child of children.flat(Infinity).filter(item => item != null)) { if (child instanceof FakeNode) child.parentNode = body; body.children.push(child); } };
body.appendChild = child => { body.append(child); return child; };
globalThis.document = { body };
const app = {
  core: {
    $: selector => body.querySelector(selector), h,
    uid: prefix => (prefix || 'id') + '-' + (++nextId),
    icon: name => '<svg data-icon="' + name + '"></svg>',
    todayStr: () => TODAY, parseYmd: date,
    addDaysYmd(value, amount) { const result = date(value); result.setDate(result.getDate() + amount); return formatYmd(result); },
    dowIdx: value => (date(value).getDay() + 6) % 7,
    weekStartOf: value => value,
    fmtLong: value => value, fmtShort: value => value, fmtRange: (start, end) => start + ' – ' + end,
    WEEK_L: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
    WEEK_FULL: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
    COLORS: ['#2563EB', '#4F46E5'],
    ICON_CHOICES: [{ id: 'book', label: 'Estudio' }, { id: 'star', label: 'Otro' }],
    GIFT_STATUSES: [], OCCASIONS: [], REMIND_DAYS: []
  },
  state: { S, save() { saves++; } },
  domain: {
    route: { params: {} }, ui: { tasksView: 'lista', tasksFilter: 'hoy' },
    go() {}, render() { renderCount++; }, currentProfile: () => ({ name: 'Alex', color: '#123456' }),
    birthdaysToday: () => [], tasksDueOn: ymd => tasks.filter(task => app.core.isDueOn(task, ymd)),
    isDoneOn: (task, ymd) => app.core.isDoneOn(task, ymd), toggleOn: (id, ymd) => app.core.toggleOn(tasks.find(task => task.id === id), ymd),
    categories: () => ['Salud'], relationships: () => [], freqText: task => app.core.freqText(task),
    isDueOn: (task, ymd) => app.core.isDueOn(task, ymd), streakOf: () => 0,
    weekStats: () => ({ due: 0, done: 0, start: TODAY }), sortedUpcomingGifts: () => [], countdownTxt: () => '', statusCls: () => ''
  },
  components: {
    headBar: (...args) => h('header', {}, ...args), formHead: (title, ...args) => h('header', {}, h('h2', {}, title), ...args),
    emptyState: (...args) => h('div', { 'data-empty': args[1] }, ...args), searchBtn: () => null,
    smartBack: () => () => {}, toast(message) { toastMessage = message; },
    confirmDialog() {}, openSheet() {}, closeOverlays
  },
  actions: { deleteTask() {}, deleteGift() {}, deletePerson() {} },
  services: { pickImage() {}, setPhotoEl() {}, viewImage() {} },
  class: { classNow: () => null, classNext: () => null, subjectById: () => null, activeSession: () => null, leftTxt: () => '', inTxt: () => '' },
  features: { taskStats() {}, taskRow() {}, taskForm() {} }
};
registerRoutines(app);
registerHomeAndTasks(app);
registerTaskRow(app);
registerForms(app);

for (const kind of ['count', 'amount', 'avoid']) {
  app.domain.route.params = {};
  const form = app.features.taskForm();
  const kindButton = find(form, node => node.tag === 'button' && textOf(node).trim() === app.core.KINDS.find(item => item.id === kind).label);
  assert.ok(kindButton, 'task editor should offer the ' + kind + ' kind');
  kindButton.attrs.onclick();
  const stepSection = find(form, node => String(node.attrs.class || '').split(/\s+/).includes('guided-step-settings'));
  assert.ok(stepSection && stepSection.style.display !== 'none', 'guided steps should be configurable for ' + kind + ' habits');
  const stepInput = find(form, node => node.tag === 'input' && node.attrs.placeholder === 'Ej. Preparar material');
  stepInput.value = 'Paso ' + kind;
  find(form, node => node.tag === 'button' && textOf(node).includes('Añadir paso')).attrs.onclick();
  const save = find(form, node => node.tag === 'button' && String(node.attrs.class || '').split(/\s+/).includes('btn-primary') && textOf(node).includes('Crear tarea'));
  find(form, node => node.tag === 'input' && node.attrs.placeholder === 'Ej. Sacar al perro').value = 'Hábito ' + kind;
  save.attrs.onclick();
  const created = tasks.at(-1);
  assert.equal(created.kind, kind, 'editor should preserve selected habit type');
  assert.equal(created.steps.length, 1, 'editor should save the guided step for ' + kind + ' habits');
}

const countTask = tasks.find(task => task.kind === 'count');
countTask.target = 2;
countTask.log[TODAY] = 1;
countTask.completions = [TODAY];
const originalCountLog = JSON.stringify({ completions: countTask.completions, log: countTask.log, skips: countTask.skips });
const screen = app.features.tasks();
let card = find(screen, node => node.tag === 'article' && node.attrs['data-task-id'] === countTask.id);
assert.ok(card, 'the guided count habit should render as an activity card');
const mainAction = find(card, node => node.attrs['aria-label'] === 'Abrir actividad Hábito count');
mainAction.attrs.onclick();
let sheet = find(body, node => node.attrs['aria-label'] === 'Actividad guiada: Hábito count');
assert.ok(sheet, 'activity card should open the guided flow for a count habit');
const completeStep = find(sheet, node => node.tag === 'button' && textOf(node).trim() === 'Completar paso');
completeStep.attrs.onclick();
const overlay = find(body, node => node.attrs.class === 'overlay');
assert.ok(overlay && overlay.children.includes(sheet), 'the guided confirmation sheet should remain open after completing the last step');
card = find(screen, node => node.tag === 'article' && node.attrs['data-task-id'] === countTask.id);
const summary = find(card, node => node.attrs.class === 'activity-step-summary');
assert.equal(textOf(summary), '1 de 1 pasos', 'visible activity card should reflect the final step while the sheet remains open');
assert.equal(find(card, node => node.attrs.class === 'activity-state').textContent.includes('Pendiente'), true, 'guided progress must not falsely complete a count habit below its target');
assert.equal(JSON.stringify({ completions: countTask.completions, log: countTask.log, skips: countTask.skips }), originalCountLog, 'guided steps must leave canonical numeric records intact');
overlay.remove();

for (const kind of ['amount', 'avoid']) {
  const task = tasks.find(item => item.kind === kind);
  const before = JSON.stringify({ completions: task.completions, log: task.log, skips: task.skips });
  const taskCard = find(screen, node => node.tag === 'article' && node.attrs['data-task-id'] === task.id);
  find(taskCard, node => node.attrs['aria-label'] === 'Abrir actividad Hábito ' + kind).attrs.onclick();
  const guidedSheet = find(body, node => node.attrs['aria-label'] === 'Actividad guiada: Hábito ' + kind);
  assert.ok(guidedSheet, 'activity card should launch guided steps for ' + kind + ' habits');
  find(guidedSheet, node => node.tag === 'button' && textOf(node).trim() === 'Completar paso').attrs.onclick();
  const openOverlay = find(body, node => node.attrs.class === 'overlay');
  assert.ok(openOverlay && openOverlay.children.includes(guidedSheet), 'guided runner should remain open for ' + kind);
  const updatedCard = find(screen, node => node.tag === 'article' && node.attrs['data-task-id'] === task.id);
  assert.equal(textOf(find(updatedCard, node => node.attrs.class === 'activity-step-summary')), '1 de 1 pasos', 'activity card should refresh for ' + kind);
  assert.equal(JSON.stringify({ completions: task.completions, log: task.log, skips: task.skips }), before, 'guided steps must not alter canonical ' + kind + ' records');
  openOverlay.remove();
}
console.log('Guided steps can be configured and launched for count, amount, and avoid habits; cards refresh without closing the runner or changing canonical records.');
