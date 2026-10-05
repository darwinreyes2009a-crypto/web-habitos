import { registerClassNotes } from '../src/features/class/notes.js';

const nodes = [];
const makeNode = (tag, attrs = {}, ...children) => {
  const node = {
    tag, attrs, children: children.flat(Infinity).filter(item => item != null), value: '', listeners: {},
    append(...items) { this.children.push(...items.flat(Infinity).filter(item => item != null)); },
    addEventListener(type, callback) { this.listeners[type] = callback; },
    focus() {},
    set innerHTML(value) { this.children = []; },
    get innerHTML() { return ''; }
  };
  Object.assign(node, attrs.value != null ? { value: attrs.value } : {});
  nodes.push(node);
  return node;
};
const state = {
  S: {
    notes: [{ id: 'legacy-note', text: '<img onerror=alert(1)> Examen el jueves', date: '2026-10-05', kind: 'deberes', tags: ['examen'], deletedAt: null, createdAt: '2026-10-05T08:00:00Z' }],
    inbox: [{ id: 'legacy-inbox', text: 'Traer cartulina el viernes', date: '2026-10-05', createdAt: '2026-10-05T09:00:00Z' }],
    activeSession: { id: 'session-1', subjectId: 'math' }, subjects: [], slots: []
  },
  saveCount: 0
};
const app = {
  core: {
    h: makeNode,
    uid: () => 'quick-note-id',
    icon: () => '<svg></svg>',
    todayStr: () => '2026-10-05',
    parseYmd: value => new Date(value + 'T00:00:00'),
    fmtLong: value => value,
    COLORS: ['#123456'], ICON_CHOICES: [],
    $: () => null
  },
  state: { S: state.S, save() { state.saveCount++; } },
  domain: { route: { params: {} }, ui: {}, go() {}, render() {} },
  components: {
    headBar() {}, formHead() {}, emptyState() {}, openSheet() {}, closeOverlays() {},
    confirmDialog() {}, toast() {}
  },
  class: {
    noteKinds: [{ id: 'nota', label: 'Nota', icon: 'pencil' }],
    noteKindStyle: () => ({ c: 'blue', bg: 'blue-soft', br: 'blue-border' }),
    noteTimeStr: () => '', subjectIconsQuick: [], subjectById: id => ({ id, name: 'Matemáticas', color: '#123456' }),
    slotsOfSubject: () => [], tintHex: () => 'blue-tint', activeSession: () => state.S.activeSession,
    pickSubject() {}
  },
  services: { showAppNotification() {} },
  actions: {}, features: {}
};
registerClassNotes(app);

const capture = app.class.classNotesCapture();
const input = nodes.find(node => node.tag === 'input' && node.attrs['aria-label'] === 'Nota rápida de clase');
const saveButton = nodes.find(node => node.tag === 'button' && node.attrs['aria-label'] === 'Guardar nota rápida');
if (!input || !saveButton || capture.children.length !== 2) throw new Error('Quick-note capture should contain a single input and a save button');
input.value = '   ';
saveButton.attrs.onclick();
if (state.S.notes.length !== 1 || state.saveCount !== 0) throw new Error('Empty notes must not be saved');
input.value = '  Traer cartulina el viernes  ';
saveButton.attrs.onclick();
if (state.S.notes.length !== 2 || state.S.notes[0].text !== 'Traer cartulina el viernes') throw new Error('Quick note should save trimmed text');
if (state.S.notes[0].kind !== 'nota' || state.S.notes[0].subjectId !== 'math' || state.S.notes[0].sessionId !== 'session-1') throw new Error('Quick note should keep simple legacy-compatible class metadata');
if (state.saveCount !== 1 || input.value !== '') throw new Error('Quick note should persist once and clear the input');

const preview = app.class.quickNotesPreview();
function nodeText(node) {
  return node && typeof node === 'object' ? (node.value || '') + (node.children || []).map(nodeText).join('') : String(node || '');
}
const previewText = nodeText(preview);
if (!previewText.includes('Traer cartulina el viernes') || !previewText.includes('Examen el jueves')) {
  throw new Error('Preview should show quick notes and preserve pre-existing class notes and inbox items: ' + previewText);
}
if (!previewText.includes('<img onerror=alert(1)>')) throw new Error('Legacy note text should stay visible as plain text');
if (nodes.filter(node => node.attrs.html).some(node => String(node.attrs.html).includes('onerror=alert(1)'))) throw new Error('Legacy note must never be passed as HTML');
if (state.S.notes.length !== 2 || state.S.inbox.length !== 1) throw new Error('Preview must not delete or migrate existing note and inbox rows');
console.log('Quick notes save immediately, render safely, and retain legacy data.');
