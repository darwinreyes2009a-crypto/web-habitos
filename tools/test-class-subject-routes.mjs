import assert from 'node:assert/strict';
import { registerClassAgenda } from '../src/features/class/agenda.js';

const makeNode = (tag, attrs = {}, ...children) => {
  attrs = attrs || {};
  const node = {
    tag, attrs, children: children.flat(Infinity).filter(child => child != null), listeners: {}, value: attrs.value || '',
    append(...items) { this.children.push(...items.flat(Infinity).filter(child => child != null)); },
    addEventListener(type, callback) { this.listeners[type] = callback; },
    set innerHTML(value) { this.children = []; },
    get innerHTML() { return ''; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  return node;
};
const state = { subjects: [], slots: [], notes: [], inbox: [], sessions: [], tasks: [] };
let saveCount = 0;
const route = { name: 'classSubjects', params: {} };
const app = {
  core: {
    h: makeNode, uid: prefix => (prefix || 'id') + '-1', icon: () => '<svg></svg>',
    todayStr: () => '2026-10-05', parseYmd: value => new Date(value + 'T00:00:00'),
    dowIdx: () => 0, fmtShort: value => value, fmtLong: value => value,
    WEEK_FULL: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
    COLORS: ['#2563EB', '#4F46E5'], ICON_CHOICES: [{ id: 'book', label: 'Estudio' }]
  },
  state: { S: state, save() { saveCount++; } },
  domain: { route, ui: {}, routeStack: [], go(name, params) { route.name = name; route.params = params || {}; }, render() {}, currentProfile() { return null; }, tasksDueOn() { return []; }, isDoneOn() { return false; } },
  components: {
    headBar: (...children) => makeNode('header', {}, ...children),
    formHead: (title, ...children) => makeNode('header', {}, makeNode('h2', {}, title), ...children),
    emptyState: (...children) => makeNode('div', {}, ...children),
    smartBack: name => () => app.domain.go(name), openSheet() {}, closeOverlays() {}, confirmDialog() {}, toast() {}
  },
  class: {}, services: {}, features: {}
};

const originalSetInterval = globalThis.setInterval;
globalThis.setInterval = () => 0;
try {
  registerClassAgenda(app);
} finally {
  globalThis.setInterval = originalSetInterval;
}
app.features.classSubjects = app.class.scrClassSubjects;
app.features.subjectForm = app.class.scrSubjectForm;
app.features.home = () => makeNode('main', {}, 'Inicio');
const textOf = node => node && typeof node === 'object'
  ? (node.tag === 'h2' ? node.children.map(textOf).join('') : '') + node.children.map(textOf).join('')
  : String(node || '');
const findNode = (node, predicate) => {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of node.children || []) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;

  return null;
};

route.name = 'classSubjects';
let subjectScreen = (app.features[route.name] || app.features.home)();
assert.match(textOf(subjectScreen), /Asignaturas/, 'classSubjects route should render its screen instead of falling back to Inicio');
assert.equal(typeof app.features.classSubjects, 'function', 'classSubjects route must have a registered screen');
const newSubjectButton = findNode(subjectScreen, node => node.tag === 'button' && node.attrs['aria-label'] === 'Nueva asignatura');
assert.ok(newSubjectButton, 'subject list should expose the new-subject action');
newSubjectButton.attrs.onclick();
assert.equal(route.name, 'subjectForm', 'new-subject action should navigate to the subject form');

const formScreen = (app.features[route.name] || app.features.home)();
assert.match(textOf(formScreen), /Nueva asignatura/, 'subjectForm route should render the subject creation screen');
assert.match(textOf(formScreen), /Nombre de la asignatura/, 'subject form should expose its subject name field');
const nameInput = findNode(formScreen, node => node.tag === 'input' && node.attrs.placeholder === 'Ej. Redes, Sistemas, Ofimática…');
const createButton = findNode(formScreen, node => node.tag === 'button' && textOf(node).includes('Crear asignatura'));
assert.ok(nameInput && createButton, 'subject form should provide a name input and create action');
nameInput.value = 'Matemáticas';
createButton.attrs.onclick();
assert.equal(state.subjects.length, 1, 'creating a subject should add it to profile data');
assert.equal(state.subjects[0].name, 'Matemáticas', 'created subject should preserve its entered name');
assert.equal(saveCount, 1, 'creating a subject should persist once');
assert.equal(route.name, 'classSubjects', 'saving a subject should return to the subject list');
subjectScreen = (app.features[route.name] || app.features.home)();
assert.match(textOf(subjectScreen), /Matemáticas/, 'the subject list should show the newly created subject');
console.log('Subject list and creation routes render, create, and persist subjects.');
