import { registerClassNotes } from '../src/features/class/notes.js';

const nodes = [];
const openedSheets = [];
let pendingConfirmation = null;
let lastToast = null;
const makeNode = (tag, attrs = {}, ...children) => {
  const safeAttrs = attrs || {};
  const node = {
    tag, attrs: safeAttrs, children: [], value: '', listeners: {}, parentNode: null,
    append(...items) {
      for (const item of items.flat(Infinity).filter(child => child != null)) {
        if (item && typeof item === 'object') item.parentNode = this;
        this.children.push(item);
      }
    },
    replaceWith(...items) {
      if (!this.parentNode) return;
      const siblings = this.parentNode.children;
      const index = siblings.indexOf(this);
      if (index < 0) return;
      this.parentNode.children.splice(index, 1, ...items);
      this.parentNode = null;
      for (const item of items) if (item && typeof item === 'object') item.parentNode = this.parentNode;
    },
    addEventListener(type, callback) { this.listeners[type] = callback; },
    focus() {},
    set innerHTML(value) { this.children = []; },
    get innerHTML() { return ''; }
  };
  node.append(...children);
  Object.assign(node, safeAttrs.value != null ? { value: safeAttrs.value } : {});
  nodes.push(node);
  return node;
};
const state = {
  S: {
    notes: [{ id: 'legacy-note', text: '<img onerror=alert(1)> Examen el jueves', date: '2026-10-05', kind: 'deberes', tags: ['examen'], deletedAt: null, createdAt: '2026-10-05T08:00:00Z' }],
    inbox: [{ id: 'legacy-inbox', text: 'Recordatorio antiguo de bandeja', date: '2026-10-05', createdAt: '2026-10-05T09:00:00Z' }],
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
    headBar() {}, formHead() {}, emptyState() {},
    openSheet(title, build) { openedSheets.push({ title, body: build() }); },
    closeOverlays() {},
    confirmDialog(options) { pendingConfirmation = options; },
    toast(message, action) { lastToast = { message, action }; }
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
const savedNote = state.S.notes.find(note => note.id === 'quick-note-id');
if (state.S.notes.length !== 2 || !savedNote || savedNote.text !== 'Traer cartulina el viernes') throw new Error('Quick note should save trimmed text');
if (savedNote.kind !== 'nota' || savedNote.subjectId !== 'math' || savedNote.sessionId !== 'session-1') throw new Error('Quick note should keep simple legacy-compatible class metadata');
if (state.saveCount !== 1 || input.value !== '') throw new Error('Quick note should persist once and clear the input');

let preview = app.class.quickNotesPreview(() => { preview = app.class.quickNotesPreview(refreshPreview); });
const refreshPreview = () => { preview = app.class.quickNotesPreview(refreshPreview); };
function nodeText(node) {
  return node && typeof node === 'object' ? (node.value || '') + (node.children || []).map(nodeText).join('') : String(node || '');
}
const previewText = nodeText(preview);
if (!previewText.includes('Recordatorio antiguo de bandeja') || !previewText.includes('Examen el jueves')) {
  throw new Error('Preview should show quick notes and preserve pre-existing class notes and inbox items: ' + previewText);
}
if (!previewText.includes('<img onerror=alert(1)>')) throw new Error('Legacy note text should stay visible as plain text');
if (nodes.filter(node => node.attrs.html).some(node => String(node.attrs.html).includes('onerror=alert(1)'))) throw new Error('Legacy note must never be passed as HTML');
if (state.S.notes.length !== 2 || state.S.inbox.length !== 1) throw new Error('Preview must not delete or migrate existing note and inbox rows');

function findNode(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of node.children || []) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}
const inboxItem = state.S.inbox[0];
const inboxEditButton = findNode(preview, node => node.tag === 'button' && node.attrs['aria-label'] === 'Editar nota: ' + inboxItem.text);
if (!inboxEditButton) throw new Error('Every visible inbox item should expose an accessible edit action');
inboxEditButton.attrs.onclick();
const inboxEditor = openedSheets.at(-1);
const inboxInput = findNode(inboxEditor && inboxEditor.body, node => node.tag === 'textarea' && node.attrs['aria-label'] === 'Texto de la nota');
const inboxSaveButton = findNode(inboxEditor && inboxEditor.body, node => node.tag === 'button' && nodeText(node).includes('Guardar cambios'));
if (!inboxInput || inboxInput.value !== inboxItem.text || !inboxSaveButton) throw new Error('The inbox item editor should preload its text');
inboxInput.value = 'Recordatorio actualizado';
inboxSaveButton.attrs.onclick();
if (inboxItem.text !== 'Recordatorio actualizado' || state.saveCount !== 2) throw new Error('Editing an inbox item should update and persist it');
refreshPreview();
const inboxDeleteButton = findNode(preview, node => node.tag === 'button' && node.attrs['aria-label'] === 'Eliminar nota: Recordatorio actualizado');
if (!inboxDeleteButton) throw new Error('Every visible inbox item should expose an accessible delete action');
inboxDeleteButton.attrs.onclick();
if (!pendingConfirmation || pendingConfirmation.confirmText !== 'Eliminar nota') throw new Error('Deleting an inbox item should ask for confirmation first');
pendingConfirmation.onConfirm();
if (state.S.inbox.includes(inboxItem) || state.saveCount !== 3 || !lastToast || !lastToast.action) throw new Error('Confirmed inbox deletion should persist and offer undo');
refreshPreview();
if (findNode(preview, node => node.tag === 'button' && node.attrs['aria-label'] === 'Eliminar nota: Recordatorio actualizado')) throw new Error('Deleted inbox items should disappear from the preview');
lastToast.action.fn();
if (!state.S.inbox.includes(inboxItem) || state.saveCount !== 4) throw new Error('Undo should restore and persist the inbox item');
refreshPreview();

const editButton = findNode(preview, node => node.tag === 'button' && node.attrs['aria-label'] === 'Editar nota: Traer cartulina el viernes');
if (!editButton) throw new Error('A saved quick note should expose an accessible edit action');
editButton.attrs.onclick();
const editor = openedSheets.at(-1);
if (!editor || editor.title !== 'Editar nota') throw new Error('Editing a quick note should open its editor');
const editInput = findNode(editor.body, node => node.tag === 'textarea' && node.attrs['aria-label'] === 'Texto de la nota');
const updateButton = findNode(editor.body, node => node.tag === 'button' && nodeText(node).includes('Guardar cambios'));
if (!editInput || editInput.value !== 'Traer cartulina el viernes' || !updateButton) throw new Error('The editor should preload the saved text and expose save');
editInput.value = 'Traer cartulina el lunes';
updateButton.attrs.onclick();
if (savedNote.text !== 'Traer cartulina el lunes' || state.saveCount !== 5) throw new Error('Editing should update and persist the selected note: text=' + savedNote.text + ', saves=' + state.saveCount + ', input=' + editInput.value);

const refreshedPreview = app.class.quickNotesPreview();
const deleteButton = findNode(refreshedPreview, node => node.tag === 'button' && node.attrs['aria-label'] === 'Eliminar nota: Traer cartulina el lunes');
if (!deleteButton) throw new Error('A saved quick note should expose an accessible delete action');
deleteButton.attrs.onclick();
if (!pendingConfirmation || pendingConfirmation.confirmText !== 'Eliminar nota' || savedNote.deletedAt) throw new Error('Deleting a quick note should ask for confirmation first');
pendingConfirmation.onConfirm();
if (!savedNote.deletedAt || state.saveCount !== 6 || !lastToast || !lastToast.action) throw new Error('Confirmed deletion should soft-delete, persist, and offer undo');
refreshPreview();
if (findNode(preview, node => node.tag === 'button' && node.attrs['aria-label'] === 'Eliminar nota: Traer cartulina el lunes')) throw new Error('Deleted notes should disappear from the preview');
lastToast.action.fn();
if (savedNote.deletedAt !== null || state.saveCount !== 7) throw new Error('Undo should restore and persist the note');
refreshPreview();
if (!findNode(preview, node => node.tag === 'button' && node.attrs['aria-label'] === 'Eliminar nota: Traer cartulina el lunes')) throw new Error('Undo should restore the note in the preview');
console.log('Quick notes and legacy inbox items save, edit, delete with confirmation, undo deletion, render safely, and retain data.');
