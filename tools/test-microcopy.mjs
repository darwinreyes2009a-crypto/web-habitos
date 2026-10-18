/* Fase B — microcopy de interfaz.
   Ejecuta los módulos reales (fechas, rutinas, tarjetas de actividad y notas
   de clase) sobre un arnés en memoria para comprobar que:
     1. freqText('once') y las pantallas no muestran fechas ISO crudas.
     2. La pista de swipe aparece como mucho una vez por vista.
     3. La acción principal de la tarjeta sigue un único patrón de etiqueta
        (mismo texto en Inicio y en la lista para el mismo estado).
     4. La lista de notas interpreta el Markdown con el probado markdownPreview
        y sigue escapando HTML.

   Uso: node tools/test-microcopy.mjs
*/
import { registerDates } from '../src/core/dates.js';
import { registerConstants } from '../src/core/constants.js';
import { registerRoutines } from '../src/core/routines.js';
import { registerHomeAndTasks } from '../src/features/home-tasks.js';
import { registerClassNotes } from '../src/features/class/notes.js';

const TODAY = '2026-10-13';
const ISO = /\b\d{4}-\d{2}-\d{2}\b/;

/* ---------- arnés: doble de DOM en memoria (patrón de test-activity-cards) --- */
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
  return node;
};

const findNode = (node, predicate) => {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of node.children || []) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
};
const findAll = (node, predicate, out = []) => {
  if (!node || typeof node !== 'object') return out;
  if (predicate(node)) out.push(node);
  for (const child of node.children || []) findAll(child, predicate, out);
  return out;
};
const byClass = (node, name) => findAll(node, candidate => candidate.attrs && String(candidate.attrs.class || '').split(/\s+/).includes(name));
const classOf = (node) => String((node && node.attrs && node.attrs.class) || '');

const tasks = [
  { id: 'once', title: 'Cita con el dentista', cat: 'Salud', freq: { type: 'once', date: TODAY }, createdAt: '2026-10-01', completions: [], icon: 'heart' },
  { id: 'walk', title: 'Paseo', cat: 'Salud', kind: 'check', freq: { type: 'daily' }, createdAt: TODAY, completions: [], icon: 'paw' },
  { id: 'sugar', title: 'Evitar azúcar', cat: 'Salud', kind: 'avoid', freq: { type: 'daily' }, createdAt: TODAY, completions: [], log: {} },
  { id: 'water', title: 'Beber agua', cat: 'Salud', kind: 'count', target: 5, freq: { type: 'daily' }, createdAt: TODAY, completions: [], log: {} },
  { id: 'regimen', title: 'Régimen', cat: 'Salud', kind: 'check', freq: { type: 'daily' }, createdAt: TODAY, completions: [], steps: [{ id: 'st1', title: 'Preparar la compra' }] }
];
const S = { tasks, people: [], gifts: [], notes: [], inbox: [], settings: { hideCompleted: false }, profiles: [], activeProfileId: 'p1', meta: { onboarded: true } };

const app = {
  core: {
    $: () => null, h: makeNode, icon: name => '<svg data-icon="' + name + '"></svg>', avatarEl: () => null, uid: () => 'uid-test'
  },
  state: { S, save() {} },
  domain: {
    ui: { tasksView: 'lista', tasksFilter: 'hoy', weekOffset: 0, weekSel: 0, statsPeriod: 'semana', statsOffset: 0 },
    go() {}, render() {},
    currentProfile: () => ({ name: 'Alex', color: '#123456' }),
    birthdaysToday: () => [],
    tasksDueOn: date => tasks.filter(task => app.core.isDueOn(task, date)),
    isDoneOn: (task, date) => app.core.isDoneOn(task, date),
    isDueOn: (task, date) => app.core.isDueOn(task, date),
    toggleOn: (task, date) => app.core.toggleOn(task, date),
    categories: () => ['Salud'],
    freqText: task => app.core.freqText(task),
    streakOf: task => app.core.streakOf(task),
    weekStats: () => ({ due: 0, done: 0 }),
    sortedUpcomingGifts: () => [], countdownTxt: () => '', statusCls: () => ''
  },
  components: {
    headBar: (...args) => makeNode('header', {}, args),
    searchBtn: () => null,
    emptyState: (...args) => makeNode('div', { 'data-empty': args[1] }),
    confirmDialog() {}, toast() {}, openSheet() {}, closeOverlays() {}
  },
  class: { classNow: () => null, classNext: () => null, subjectById: () => null, activeSession: () => null, leftTxt: () => '', inTxt: () => '' },
  features: {
    stepDoneOn: () => false,
    priorityInfo: () => null,
    taskControl: (task, date) => makeNode('button', { 'data-control': task.id + ':' + date }, 'control'),
    goalBar: () => null,
    routineSheet() {}, guidedTaskSheet() {}
  },
  actions: {}, services: {}
};

registerDates(app);
registerConstants(app);
app.core.todayStr = () => TODAY; // fecha fija y determinista para el arnés
registerRoutines(app);
registerHomeAndTasks(app);
registerClassNotes(app);

/* ---------- comprobaciones ---------- */
let fallos = 0;
let comprobaciones = 0;
const comprueba = (label, ok, detail) => {
  comprobaciones++;
  console.log((ok ? '  OK  ' : ' FALLO') + ' ' + label + (ok || detail == null ? '' : ' → ' + JSON.stringify(detail)));
  if (!ok) fallos++;
};

const screenTexts = node => {
  const out = [];
  const walk = current => {
    if (!current || typeof current !== 'object') return;
    for (const child of current.children || []) {
      if (typeof child === 'string') out.push(child);
      else walk(child);
    }
  };
  walk(node);
  return out.join(' ');
};

const quickActionOf = (screen, taskId) => {
  const card = findNode(screen, node => node.tag === 'article' && node.attrs['data-task-id'] === taskId);
  return card ? byClass(card, 'activity-card-quick-action')[0] : null;
};
const labelOf = button => button ? String((button.children || []).filter(child => typeof child === 'string').join('')) : null;

/* 1. freqText('once') con el formateador propio de la app. */
const freqOnce = app.core.freqText(tasks[0]);
comprueba('freqText de "once" no devuelve la fecha ISO cruda', !ISO.test(freqOnce), freqOnce);
comprueba('freqText de "once" muestra la fecha formateada', /\b13\b/.test(freqOnce) && freqOnce !== '2026-10-13', freqOnce);
comprueba('freqText de "once" sin fecha sigue diciendo "Una vez"', app.core.freqText({ freq: { type: 'once' } }) === 'Una vez', app.core.freqText({ freq: { type: 'once' } }));

/* 2. Ninguna fecha ISO cruda llega al DOM de Inicio ni de Actividades. */
const listScreen = app.features.tasks();
comprueba('Actividades no muestra ninguna fecha ISO cruda', !ISO.test(screenTexts(listScreen)));
const homeScreen = app.features.home();
comprueba('Inicio no muestra ninguna fecha ISO cruda', !ISO.test(screenTexts(homeScreen)));

/* 3. Una sola pista de gesto por vista, con cualquier número de tarjetas. */
const listHints = byClass(listScreen, 'activity-swipe-hint');
comprueba('la lista de Actividades lleva una sola pista de gesto', listHints.length === 1, listHints.length);
const homeHints = byClass(homeScreen, 'activity-swipe-hint');
comprueba('Inicio no repite la pista por tarjeta (como mucho una)', homeHints.length <= 1, homeHints.length);
comprueba('la pista de la lista es texto discreto en singular', listHints.length === 1 && /Desliza /.test(screenTexts(listHints[0])) && !/Desliza Desliza/.test(screenTexts(listHints[0])), screenTexts(listHints[0] || {}));
// Con la lista vacía la pista no tiene nada que señalar y se retira.
const tareasReservadas = tasks.splice(0, tasks.length);
const pistaEnVacia = byClass(app.features.tasks(), 'activity-swipe-hint')[0];
comprueba('con la lista vacía la pista queda oculta', !pistaEnVacia || pistaEnVacia.style.display === 'none', pistaEnVacia && pistaEnVacia.style.display);
tasks.push(...tareasReservadas);

/* 4. Un solo patrón de CTA: mismo estado, misma etiqueta en Inicio y lista. */
const LABELS = new Set(['Empezar →', 'Continuar →', 'Hecho', 'Hecho ✓', 'Marcar fallo', 'Día limpio ✓', 'Abrir →']);
const checkLabel = (view, screen, taskId, expected) => {
  const label = labelOf(quickActionOf(screen, taskId));
  comprueba(view + ': la acción de "' + taskId + '" es "' + expected + '"', label === expected, label);
  return label;
};
checkLabel('lista', listScreen, 'walk', 'Hecho');
checkLabel('inicio', homeScreen, 'walk', 'Hecho');
checkLabel('lista', listScreen, 'sugar', 'Día limpio ✓');
checkLabel('inicio', homeScreen, 'sugar', 'Día limpio ✓');
checkLabel('inicio', homeScreen, 'water', 'Abrir →');
checkLabel('inicio', homeScreen, 'regimen', 'Empezar →');
const listCard = findNode(listScreen, node => node.tag === 'article' && node.attrs['data-task-id'] === 'water');
comprueba('la lista no añade CTA donde el control de la tarjeta ya basta', !listCard || byClass(listCard, 'activity-card-quick-action').length === 0);

// Con el fallo registrado, la tarea "Evitar" ofrece marcarlo en las dos vistas.
tasks.find(task => task.id === 'sugar').completions.push(TODAY);
checkLabel('lista', app.features.tasks(), 'sugar', 'Marcar fallo');
checkLabel('inicio', app.features.home(), 'sugar', 'Marcar fallo');

// Estado completado: la etiqueta cambia igual en las dos vistas.
tasks.find(task => task.id === 'walk').completions.push(TODAY);
const doneList = app.features.tasks();
const doneHome = app.features.home();
const listDoneLabel = labelOf(quickActionOf(doneList, 'walk'));
const homeDoneLabel = labelOf(quickActionOf(doneHome, 'walk'));
comprueba('completada: la lista y el inicio dicen lo mismo', listDoneLabel === 'Hecho ✓' && homeDoneLabel === 'Hecho ✓', { listDoneLabel, homeDoneLabel });
const allLabels = [...byClass(doneList, 'activity-card-quick-action'), ...byClass(doneHome, 'activity-card-quick-action')].map(labelOf);
comprueba('todas las etiquetas siguen el patrón unificado', allLabels.every(label => LABELS.has(label)), allLabels);

/* 5. La lista de notas interpreta el Markdown y sigue escapando HTML. */
S.notes.push({ id: 'n1', text: '**Traer cartulina** el viernes', kind: 'nota', date: TODAY, time: '', done: false, starred: false, subjectId: null, sessionId: null, tags: [], deletedAt: null, createdAt: '2026-10-13T09:00:00.000Z', updatedAt: 1 });
let preview = app.class.quickNotesPreview(() => {});
let noteNode = byClass(preview, 'qn-text')[0];
comprueba('la nota muestra negrita interpretada, no Asteriscos crudos',
  !!noteNode && String(noteNode.attrs.html || '').includes('<strong>Traer cartulina</strong>') && !String(noteNode.attrs.html || '').includes('**'),
  noteNode && noteNode.attrs.html);

S.notes.unshift({ id: 'n2', text: '<img src=x onerror=alert(1)> *fin*', kind: 'nota', date: TODAY, time: '', done: false, starred: false, subjectId: null, sessionId: null, tags: [], deletedAt: null, createdAt: '2026-10-13T10:00:00.000Z', updatedAt: 1 });
preview = app.class.quickNotesPreview(() => {});
noteNode = byClass(preview, 'qn-text')[0];
comprueba('el Markdown interpretado sigue escapando HTML peligroso',
  !!noteNode && !String(noteNode.attrs.html || '').includes('<img') && String(noteNode.attrs.html || '').includes('<em>fin</em>'),
  noteNode && noteNode.attrs.html);

console.log('\n' + (fallos ? fallos + ' comprobaciones fallidas' : 'Todo correcto (' + comprobaciones + ' comprobaciones)'));
process.exit(fallos ? 1 : 0);
