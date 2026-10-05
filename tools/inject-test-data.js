// Injects test data into DailyHub's localStorage for runtime visual audit.
// Usage: node tools/inject-test-data.js
// Run this in a context that has a `localStorage` shim (we use jsdom-free
// in-memory storage via globalThis.localStorage) — the actual browser
// localStorage is not available in plain Node, so we print a snippet to run
// in the console instead.

const uid = (prefix) => prefix + Math.random().toString(36).slice(2, 10);

const NOW = Date.now();
const today = new Date().toISOString().slice(0, 10);

const testData = {
  profiles: [{
    id: 'test-uid-001',
    name: 'Test User',
    color: '#2563EB',
    photo: '',
    pin: null,
    pinLen: null,
    createdAt: '2026-10-01',
    updatedAt: NOW
  }],
  activeProfileId: 'test-uid-001',
  tasks: [
    {
      id: 't1',
      title: 'Estudiar matemáticas',
      icon: 'book',
      cat: 'Personal',
      kind: 'check',
      target: 0,
      unit: '',
      goal: 0,
      freq: { type: 'weekdays', days: [1, 2, 3, 4, 5] },
      time: '09:00',
      priority: 1,
      dueDate: '',
      steps: [
        { id: 'st1', title: 'Repasar apuntes', instruction: 'Lee las diapositivas del tema 1', durationMinutes: 15, image: '', completedOn: [], done: false },
        { id: 'st2', title: 'Hacer ejercicios', instruction: '', durationMinutes: 20, image: '', completedOn: [], done: false }
      ],
      createdAt: '2026-10-01',
      updatedAt: NOW,
      completions: [],
      log: {},
      skips: []
    },
    {
      id: 't2',
      title: 'Evitar distracciones',
      icon: 'eye',
      cat: 'Personal',
      kind: 'avoid',
      target: 0,
      unit: '',
      goal: 0,
      freq: { type: 'daily' },
      time: '',
      priority: 0,
      dueDate: '',
      steps: [],
      createdAt: '2026-10-01',
      updatedAt: NOW,
      completions: [],
      log: {},
      skips: []
    }
  ],
  people: [
    { id: 'p1', name: 'Ana Gómez', color: '#F59E0B', photo: '', relationship: 'Amiga', birthday: '', notes: 'Le gustan los gatos y el café', details: { gustos: 'Café, gatos', favoritos: 'Té green, postres', fechas: [{ label: 'Onomástica', date: '2026-12-21' }] }, createdAt: '2026-10-01', updatedAt: NOW }
  ],
  gifts: [
    { id: 'g1', title: 'Taza personalizada', personId: 'p1', price: 25.50, targetDate: today, link: 'https://example.com/taza', occasion: 'Cumpleaños', status: 'Idea', notes: 'Tema de gatos', image: '', starred: true, remindDays: 7, createdAt: '2026-10-01', updatedAt: NOW }
  ],
  notes: [
    { id: 'n1', title: 'Ideas para el proyecto', content: 'Revisar el documento de requisitos y proponer arquitectura.', done: false, deletedAt: '', createdAt: '2026-10-01', updatedAt: NOW }
  ],
  subjects: [
    { id: 'sub-001', name: 'Matemáticas', color: '#2563EB', icon: 'book', createdAt: '2026-10-01', updatedAt: NOW }
  ],
  slots: [
    { id: 'slot1', subjectId: 'sub-001', day: 1, start: '09:00', end: '10:30', classroom: 'Aula 2', createdAt: '2026-10-01', updatedAt: NOW },
    { id: 'slot2', subjectId: 'sub-001', day: 3, start: '10:00', end: '11:00', classroom: 'Aula 3', createdAt: '2026-10-01', updatedAt: NOW }
  ],
  inbox: [],
  sessions: [],
  breaks: [],
  offs: [],
  settings: {
    theme: 'auto',
    fontScale: 1,
    reduceMotion: 'auto',
    highContrast: false,
    hideCompleted: false,
    haptics: true,
    notif: { reminders: true, gifts: true, daily: false, classes: true, classLead: 15, quietFrom: '22:00', quietTo: '08:00' },
    categories: ['Hábitos', 'Personal', 'Salud', 'Casa', 'Trabajo'],
    relationships: ['Amiga', 'Amigo', 'Hermano/a', 'Cliente', 'Colega'],
    currency: 'eur'
  },
  meta: { onboarded: true, created: '2026-10-01', lastNotified: null },
  data: {}
};

// Build a snippet to paste into the browser console
const snippet = `(() => {
  const uid = '${uid('test')}';
  localStorage.setItem('dailyhub_v2:acc:test-uid-001', JSON.stringify(${JSON.stringify(testData)}));
  localStorage.setItem('dailyhub_v2:active', 'test-uid-001');
  console.log('Test data injected. Reload the page.');
})();`;

// Also try to inject directly if localStorage is available (e.g. in jsdom)
if (typeof localStorage !== 'undefined') {
  localStorage.setItem('dailyhub_v2:acc:test-uid-001', JSON.stringify(testData));
  localStorage.setItem('dailyhub_v2:active', 'test-uid-001');
  console.log('Test data injected directly into localStorage.');
} else {
  console.log('No localStorage available in Node. Paste this snippet into the browser console:\n');
  console.log(snippet);
}
