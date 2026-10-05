import { registerRoutines } from '../src/core/routines.js';
import { registerTaskRow } from '../src/features/task-row.js';

const TODAY = '2026-10-05';
const pad = value => String(value).padStart(2, '0');
const toYmd = date => date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
const parseYmd = value => new Date(value + 'T00:00:00');
const state = { tasks: [] };
let saves = 0;
const app = {
  core: {
    todayStr: () => TODAY,
    parseYmd,
    addDaysYmd(value, amount) { const date = parseYmd(value); date.setDate(date.getDate() + amount); return toYmd(date); },
    dowIdx: value => (parseYmd(value).getDay() + 6) % 7,
    weekStartOf(value) { const date = parseYmd(value); date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); return toYmd(date); },
    fmtLong: value => value,
    fmtShort: value => value,
    WEEK_L: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
    WEEK_FULL: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
    uid: () => 'step-id'
  },
  state: { S: state, save() { saves++; } },
  components: { toast() {}, confirmDialog() {}, openSheet() {}, closeOverlays() {} },
  domain: { render() {}, go() {} },
  services: { viewImage() {} },
  features: {}
};
registerRoutines(app);
registerTaskRow(app);

const task = {
  id: 'guided', title: 'Preparar mochila', kind: 'check', freq: { type: 'daily' },
  createdAt: TODAY, completions: [],
  steps: [
    { id: 'one', title: 'Revisar horario', done: true, completedOn: [] },
    { id: 'two', title: 'Guardar libros', done: false, completedOn: [] }
  ]
};
state.tasks.push(task);
const firstDone = app.features.setGuidedStep(task, task.steps[0], TODAY, true);
if (firstDone || app.core.isDoneOn(task, TODAY)) throw new Error('A guided activity must remain incomplete until every step is complete');
if (task.steps[0].done !== true || task.steps[1].done !== false) throw new Error('Guided execution must not mutate legacy global step.done values');
if (task.steps[0].completedOn.join() !== TODAY || task.completions.length) throw new Error('Step progress must be stored by date, separately from the task completion');
const allDone = app.features.setGuidedStep(task, task.steps[1], TODAY, true);
if (!allDone || !app.core.isDoneOn(task, TODAY) || !task.completions.includes(TODAY)) throw new Error('Completing the final step must use the canonical daily task completion');
app.features.setGuidedStep(task, task.steps[1], TODAY, false);
if (app.core.isDoneOn(task, TODAY) || task.completions.includes(TODAY)) throw new Error('Undoing a step must clear today’s task completion');

for (const [kind, canonical] of [
  ['count', { target: 4, log: { [TODAY]: 2 }, completions: [TODAY] }],
  ['amount', { target: 500, unit: 'ml', log: { [TODAY]: 250 }, completions: [TODAY] }],
  ['avoid', { completions: [TODAY], log: {} }]
]) {
  const guided = {
    id: 'guided-' + kind, title: 'Pasos ' + kind, kind, freq: { type: 'daily' }, createdAt: TODAY,
    ...structuredClone(canonical), steps: [{ id: kind + '-step', title: 'Paso uno', completedOn: [] }]
  };
  const originalCanonical = JSON.stringify({ completions: guided.completions, log: guided.log, skips: guided.skips });
  const completed = app.features.setGuidedStep(guided, guided.steps[0], TODAY, true);
  if (!completed || !guided.steps[0].completedOn.includes(TODAY)) throw new Error('Guided steps should be completable for ' + kind + ' habits');
  if (JSON.stringify({ completions: guided.completions, log: guided.log, skips: guided.skips }) !== originalCanonical) {
    throw new Error('Guided progress must not change canonical ' + kind + ' records');
  }
}

const notDue = { id: 'future', title: 'Future', kind: 'check', freq: { type: 'once', date: '2026-10-06' }, createdAt: TODAY, completions: [], steps: [{ id: 'future-step', title: 'Wait', completedOn: [] }] };
if (app.features.setGuidedStep(notDue, notDue.steps[0], TODAY, true) || notDue.steps[0].completedOn.length) throw new Error('A guided step cannot be completed on a day the task is not due');
const skipped = { id: 'skipped', title: 'Skipped', kind: 'check', freq: { type: 'daily' }, createdAt: TODAY, completions: [], skips: [TODAY], steps: [{ id: 'skipped-step', title: 'Wait', completedOn: [] }] };
if (app.features.setGuidedStep(skipped, skipped.steps[0], TODAY, true) || skipped.steps[0].completedOn.length) throw new Error('A guided step cannot be completed on a skipped day');
if (saves !== 6) throw new Error('Only valid guided-step updates should save, including supported numeric and avoid habits');
console.log('Guided steps are per-day and complete tasks through the canonical routine rules.');
