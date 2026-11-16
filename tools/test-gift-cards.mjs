/* Fase 3 — Regalos tipo wishlist y ficha de persona.
 *
 * Comprueba sobre el markup real (mismo harness de nodos que
 * test-activity-cards) que:
 *   1. Cada regalo se pinta como tarjeta con foto o 🎁 sobre círculo suave.
 *   2. El chip de estado usa los cuatro valores del modelo, con su emoji y su
 *      etiqueta legible, sin inventar estados nuevos.
 *   3. El presupuesto sale con el formato de la app y hay enlace solo si el
 *      regalo tiene URL.
 *   4. La ficha de persona muestra el cumpleaños con 0, 1, 12 y fecha ya
 *      pasada, y no pinta nada cuando no hay fecha.
 */
import { registerRouter } from '../src/navigation/router.js';
import { registerGiftsAndPeople } from '../src/features/gifts-people.js';
import { registerConstants } from '../src/core/constants.js';

const TODAY = '2026-11-16';

const people = [
  { id: 'sofia', name: 'Sofía', color: '#f59e0b', birthday: '1990-11-28', details: { gustos: 'Manga y cocina', favoritos: 'Té verde' }, notes: 'Talla M' },
  { id: 'hoy', name: 'Marta', color: '#60a5fa', birthday: '1992-11-16', details: {} },
  { id: 'pasada', name: 'Luis', color: '#34d399', birthday: '1988-11-10', details: {} },
  { id: 'sinfecha', name: 'Álex', color: '#a78bfa', details: {} }
];

const gifts = [
  { id: 'g1', title: 'Set de té', personId: 'sofia', price: 24.5, status: 'Idea', link: 'https://example.com/te', image: '', targetDate: '2026-11-28', starred: true },
  { id: 'g2', title: 'Manta', personId: 'sofia', price: 39.9, status: 'Comprar', link: '' },
  { id: 'g3', title: 'Libro', personId: 'sinfecha', price: null, status: 'Comprado', link: '' },
  { id: 'g4', title: 'Vela', personId: null, price: 12, status: 'Entregado', link: 'https://tienda.test/vela', image: 'data:image/png;base64,AAAA' }
];

const S = {
  tasks: [], people, gifts, notes: [], inbox: [],
  settings: { categories: [], relationships: [] },
  profiles: [], activeProfileId: null
};

const nodes = [];
const makeNode = (tag, attrs = {}, ...children) => {
  const node = {
    tag, attrs, children: [], style: {}, listeners: {}, parentNode: null,
    append(...items) {
      for (const item of items.flat(Infinity)) {
        if (item == null) continue;
        if (item && typeof item === 'object') item.parentNode = this;
        this.children.push(item);
      }
    },
    replaceWith(next) { if (!this.parentNode) return; const siblings = this.parentNode.children; const index = siblings.indexOf(this); if (index >= 0) { siblings[index] = next; next.parentNode = this.parentNode; } this.parentNode = null; },
    addEventListener(name, callback) { this.listeners[name] = callback; },
    click() { if (!this.attrs.disabled && this.attrs.onclick) this.attrs.onclick({ stopPropagation() {}, preventDefault() {}, currentTarget: this, target: this }); },
    set innerHTML(value) { this.children = []; },
    get innerHTML() { return ''; },
    classList: {
      add(name) { const list = new Set(String(node.attrs.class || '').split(/\s+/).filter(Boolean)); list.add(name); node.attrs.class = [...list].join(' '); },
      remove(name) { node.attrs.class = String(node.attrs.class || '').split(/\s+/).filter(item => item && item !== name).join(' '); },
      contains(name) { return String(node.attrs.class || '').split(/\s+/).includes(name); }
    },
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

const app = {
  core: {
    h: makeNode,
    uid: prefix => prefix + '-test',
    icon: (name, size) => makeNode('svg', { 'data-icon': name, 'data-size': size }),
    avatarEl: (name, color, size) => makeNode('span', { class: 'avatar', style: 'background:' + color }, name),
    cap: text => text.charAt(0).toUpperCase() + text.slice(1),
    todayStr: () => TODAY,
    parseYmd: value => new Date(value + 'T00:00:00'),
    addDaysYmd(value, amount) { const date = new Date(value + 'T00:00:00'); date.setDate(date.getDate() + amount); return date.toISOString().slice(0, 10); },
    dowIdx: () => 0,
    weekStartOf: value => value,
    fmtLong: value => value,
    fmtShort: value => value,
    fmtRange: (start, end) => start + ' - ' + end,
    WEEK_L: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
    WEEK_FULL: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
    KINDS: [{ id: 'check', label: 'Sí o no' }]
  },
  state: { S, save() {}, normalizeData() {}, switchProfileData() {} },
  render() {},
  domain: {
    ui: { giftTab: 'todos', giftFilter: 'todas', giftStatus: 'todas', giftSort: 'fecha', giftSearch: '' },
    route: { name: 'gifts', params: {} },
    go() {}
  },
  components: {
    headBar: (...args) => makeNode('header', {}, args),
    searchBtn: () => makeNode('button', { 'aria-label': 'Buscar' }),
    formHead: (title, back) => makeNode('header', {}, title),
    emptyState: (...args) => makeNode('div', { 'data-empty': args[1] }),
    openSheet() {}, closeOverlays() {}, confirmDialog() {}, toast() {},
    smartBack: () => () => {}
  },
  actions: { deletePerson() {}, deleteGift() {} },
  services: { pickImage() {}, viewImage() {} },
  features: {}
};

registerConstants(app);
registerRouter(app);
registerGiftsAndPeople(app);

const all = node => {
  const out = [node];
  for (const child of node.children || []) if (child && typeof child === 'object') out.push(...all(child));
  return out;
};
const byClass = (node, name) => all(node).filter(item => String((item.attrs && item.attrs.class) || '').split(/\s+/).includes(name));
const textOf = node => node.textContent;

let fallos = 0;
const comprueba = (titulo, ok, detalle) => {
  if (ok) { console.log('  OK   ' + titulo); return; }
  fallos++;
  console.log('  FAIL ' + titulo + (detalle === undefined ? '' : ' → ' + JSON.stringify(detalle)));
};

/* ---------- 1. Tarjetas de regalo ---------------------------------------- */

app.domain.ui.giftTab = 'todos';
const browser = app.features.gifts();
const cards = byClass(browser, 'gift-card');
comprueba('cada regalo activo se pinta como tarjeta', cards.length === 3, cards.length);
// El archivo conserva los entregados, como antes del rediseño.
app.domain.ui.giftStatus = 'archivo';
const archived = byClass(app.features.gifts(), 'gift-card');
comprueba('el archivo pinta los entregados como tarjeta', archived.length === 1, archived.length);
app.domain.ui.giftStatus = 'todas';
const cardOf = title => [...cards, ...archived].find(card => textOf(card).includes(title));

const tea = cardOf('Set de té');
comprueba('la tarjeta sin foto muestra el 🎁 grande', !!tea && byClass(tea, 'gift-art-emoji').length === 1 && textOf(byClass(tea, 'gift-art-emoji')[0]) === '🎁', tea && textOf(tea));
const vela = cardOf('Vela');
comprueba('la tarjeta con foto pinta la imagen', !!vela && vela.children.some(child => child && child.tag === 'button' && byClass(child, 'gift-art').some(art => art.children.some(item => item && item.tag === 'img'))));

const chipText = title => {
  const card = cardOf(title);
  const chip = card && byClass(card, 'stchip')[0];
  return chip ? { text: textOf(chip).replace(/\s+/g, ' ').trim(), cls: String(chip.attrs.class), label: chip.attrs['aria-label'] } : null;
};
const estados = [
  ['Set de té', '💡', 'Idea', 'st-idea'],
  ['Manta', '🛒', 'Por comprar', 'st-comprar'],
  ['Libro', '✨', 'Comprado', 'st-comprado'],
  ['Vela', '🎉', 'Entregado', 'st-entregado']
];
for (const [title, emoji, label, clase] of estados) {
  const chip = chipText(title);
  comprueba('estado de «' + title + '»: ' + emoji + ' ' + label,
    !!chip && chip.text.includes(emoji) && chip.text.includes(label) && chip.cls.includes(clase), chip);
}
comprueba('el chip de estado se anuncia como acción', /^Estado del regalo .+: .+\. Cambiar de estado$/.test(String((chipText('Manta') || {}).label || '')), (chipText('Manta') || {}).label);

const budgetOf = title => {
  const card = cardOf(title);
  const budget = card && byClass(card, 'gift-budget')[0];
  return budget ? { text: textOf(budget), none: String(budget.attrs.class).includes('none') } : null;
};
comprueba('el presupuesto usa el formato de la app', (budgetOf('Set de té') || {}).text === '24,50 €', budgetOf('Set de té'));
comprueba('sin precio se dice «Sin presupuesto»', (budgetOf('Libro') || {}).text === 'Sin presupuesto' && (budgetOf('Libro') || {}).none === true, budgetOf('Libro'));

const linksOf = title => {
  const card = cardOf(title);
  return card ? byClass(card, 'gift-link') : [];
};
const teaLink = linksOf('Set de té')[0];
comprueba('el botón de enlace abre la URL guardada', !!teaLink && teaLink.attrs.href === 'https://example.com/te' && teaLink.attrs.target === '_blank', teaLink && teaLink.attrs);
comprueba('el enlace lleva etiqueta accesible', !!teaLink && /Comprar o ver el enlace de Set de té en example\.com/.test(String(teaLink.attrs['aria-label'])), teaLink && teaLink.attrs['aria-label']);
comprueba('sin enlace no se pinta botón (ni errores)', linksOf('Manta').length === 0, linksOf('Manta').length);

/* ---------- 2. Ficha de persona ----------------------------------------- */

// Se muta el mismo objeto de ruta que comparten router y features (no se
// reemplaza: gifts-people guardó la referencia al registrar el módulo).
const personScreen = id => {
  app.domain.route.name = 'person';
  app.domain.route.params = { id };
  return app.features.person();
};

const sofia = personScreen('sofia');
comprueba('la ficha muestra el nombre', byClass(sofia, 'hero-title').some(node => textOf(node).includes('Sofía')));
comprueba('la ficha muestra el perfil afectivo', textOf(sofia).includes('Le gusta') && textOf(sofia).includes('Manga y cocina') && textOf(sofia).includes('Favoritos'), byClass(sofia, 'person-about-row').length);
comprueba('la ficha lista sus ideas de regalo', byClass(sofia, 'gift-card').length === 2, byClass(sofia, 'gift-card').length);
const bdaySofia = byClass(sofia, 'bday-card')[0];
comprueba('cuenta atrás de cumpleaños a 12 días', !!bdaySofia && textOf(bdaySofia).includes('Faltan 12 días para el cumple de Sofía 🎂'), bdaySofia && textOf(bdaySofia));

const hoy = byClass(personScreen('hoy'), 'bday-card')[0];
comprueba('cuenta atrás para hoy (0 días)', !!hoy && textOf(hoy).includes('¡Hoy es el cumple de Marta! 🎂'), hoy && textOf(hoy));

const pasada = personScreen('pasada');
const bdayPasada = byClass(pasada, 'bday-card')[0];
comprueba('fecha pasada: cuenta al año siguiente, sin días negativos',
  !!bdayPasada && textOf(bdayPasada).includes('Faltan 359 días para el cumple de Luis 🎂') && !/-\d/.test(textOf(bdayPasada)),
  bdayPasada && textOf(bdayPasada));

const sinFecha = personScreen('sinfecha');
comprueba('sin fecha no se pinta la cuenta atrás', byClass(sinFecha, 'bday-card').length === 0, byClass(sinFecha, 'bday-card').length);

console.log(fallos ? '\n' + fallos + ' fallo(s) en las tarjetas de regalo.' : 'Las tarjetas de regalo y la ficha de persona respetan el modelo y las cuentas atrás.');
if (fallos) process.exit(1);
