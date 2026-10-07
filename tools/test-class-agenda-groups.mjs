import { groupClassSlots, registerClassAgenda } from '../src/features/class/agenda.js';

const slots = [
  { id: 'first', start: '09:00', end: '09:55' },
  { id: 'second', start: '10:00', end: '10:55' },
  { id: 'third', start: '11:00', end: '11:55' },
  { id: 'fourth', start: '12:00', end: '12:55' }
];
const hm = value => {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};
const ids = rows => rows.map(slot => slot.id).join(',');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const beforeFirst = groupClassSlots(slots, hm('08:59'), hm);
assert(!beforeFirst.current && !beforeFirst.upcoming, 'Before first class, there should be no current or separate upcoming slot');
assert(ids(beforeFirst.later) === 'first,second,third,fourth', 'Before first class, every slot should be grouped under Más tarde');

const firstStarted = groupClassSlots(slots, hm('09:00'), hm);
assert(firstStarted.current?.id === 'first', 'At the first start time, the first slot should be Ahora mismo');
assert(firstStarted.upcoming?.id === 'second', 'The second slot should be Después while the first is in progress');
assert(ids(firstStarted.later) === 'third,fourth', 'Only remaining slots should be grouped under Más tarde');

const betweenClasses = groupClassSlots(slots, hm('09:55'), hm);
assert(!betweenClasses.current && betweenClasses.upcoming?.id === 'second', 'Between classes, the next slot should be Después');
assert(ids(betweenClasses.later) === 'third,fourth', 'Slots after the upcoming class should remain Más tarde');

const secondStarted = groupClassSlots(slots, hm('10:00'), hm);
assert(secondStarted.current?.id === 'second' && secondStarted.upcoming?.id === 'third', 'When the second class starts, it should become Ahora mismo and the third Después');
assert(ids(secondStarted.later) === 'fourth', 'Only the final slot should remain Más tarde');

const dayEnded = groupClassSlots(slots, hm('13:00'), hm);
assert(!dayEnded.current && !dayEnded.upcoming && dayEnded.later.length === 0, 'After the final class there should be no current or upcoming slots');

const originalDate = globalThis.Date;
const originalSetInterval = globalThis.setInterval;
class FixedDate extends originalDate {
  constructor(...args) {
    super(...(args.length ? args : [2026, 9, 7, 10, 20]));
  }
}
globalThis.Date = FixedDate;
globalThis.setInterval = () => 0;
try {
  const activeSlots = [
    { id: 'current', start: '10:00', end: '10:50', subjectId: 'current-subject' },
    { id: 'upcoming', start: '11:00', end: '11:50', subjectId: 'upcoming-subject' },
    { id: 'later', start: '12:00', end: '12:50', subjectId: 'later-subject' }
  ];
  const makeNode = (tag, attrs = {}, ...children) => ({
    tag, attrs, children: children.flat(Infinity).filter(child => child != null),
    append(...items) { this.children.push(...items.flat(Infinity).filter(child => child != null)); },
    set innerHTML(_value) { this.children = []; }
  });
  const app = {
    core: {
      h: makeNode, uid: () => 'id', icon: () => '<svg></svg>', todayStr: () => '2026-10-07',
      parseYmd: value => new FixedDate(value + 'T00:00:00'), dowIdx: () => 2,
      fmtShort: value => value, fmtLong: value => value, WEEK_FULL: [], COLORS: [], ICON_CHOICES: []
    },
    state: {
      S: {
        slots: activeSlots,
        subjects: [
          { id: 'current-subject', name: 'Ahora' },
          { id: 'upcoming-subject', name: 'Después' },
          { id: 'later-subject', name: 'Más tarde' }
        ],
        activeSession: { id: 'session-1', subjectId: 'current-subject', start: '10:00', end: '10:50' },
        notes: [], inbox: [], breaks: [], offs: []
      },
      save() {}
    },
    domain: { route: { name: 'class' }, ui: { classTab: 'hoy' }, go() {}, render() {} },
    components: { headBar() {}, formHead() {}, emptyState() {}, openSheet() {}, closeOverlays() {}, confirmDialog() {}, smartBack() {}, toast() {} },
    class: {
      slotsOnDate: () => activeSlots, breakOn: () => null,
      quickNotesPreview: () => makeNode('div'), classNotesCapture: () => makeNode('div')
    },
    services: {}, actions: {}, features: {}
  };
  registerClassAgenda(app);
  const zone = makeNode('div');
  app.class.drawNowZone(zone);
  const renderedText = node => typeof node === 'object'
    ? (node.children || []).map(renderedText).join('')
    : String(node || '');
  const text = renderedText(zone);
  assert(text.includes('Después') && text.includes('11:00 — 11:50'), 'While a class session is active, the next lesson should still render under Después');
  assert(text.includes('Más tarde') && text.includes('12:00'), 'While a class session is active, later lessons should remain under Más tarde');

  app.state.S.activeSession = null;
  const inProgressZone = makeNode('div');
  app.class.drawNowZone(inProgressZone);
  const inProgressText = renderedText(inProgressZone);
  assert(inProgressText.includes('10:00 — 10:50'), 'The scheduled class should appear under Ahora mismo when its time starts without manually starting a session');
  assert(inProgressText.includes('Después') && inProgressText.includes('11:00 — 11:50'), 'The next lesson should appear under Después while a scheduled class is in progress without an active session');
  assert(inProgressText.includes('Más tarde') && inProgressText.includes('12:00'), 'Lessons after the next should remain Más tarde while a scheduled class is in progress');
} finally {
  globalThis.Date = originalDate;
  globalThis.setInterval = originalSetInterval;
}

console.log('Class schedule groups slots as Ahora mismo, Después, and Más tarde across time transitions, including an active session.');
