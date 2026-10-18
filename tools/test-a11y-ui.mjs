/* Fase C — accesibilidad semántica y objetivos táctiles.
   Ejecuta los módulos reales (shell de navegación y pantalla de Auth) sobre un
   arnés en memoria y parsea los CSS para comprobar que:
     1. La navegación marca la ruta activa con aria-current="page".
     2. El FAB no se pinta en Ajustes (solape medido a 390 px) y sí en el resto.
     3. Auth vincula cada etiqueta con su campo (for/id) y anuncia errores con
        aria-live.
     4. .btn tiene el mínimo táctil --tap (44 px) y el contenido móvil reserva
        un tap final de scroll.
     5. Los títulos de las tarjetas admiten 2 líneas en vez de cortarse en 1.

   Uso: node tools/test-a11y-ui.mjs
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerOnboarding } from '../src/features/onboarding-shell.js';
import { registerAuth } from '../src/features/auth.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = file => fs.readFileSync(path.join(RAIZ, file), 'utf8');

/* ---------- arnés: doble de DOM en memoria (patrón de test-microcopy) ------ */
const makeNode = (tag, attrs = {}, ...children) => {
  const node = {
    tag, attrs, children: [], style: {}, listeners: {}, parentNode: null,
    get firstChild() { return this.children[0] || null; },
    append(...items) { for (const item of items.flat(Infinity).filter(child => child != null)) { if (item && typeof item === 'object') item.parentNode = this; this.children.push(item); } },
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
const findAll = (node, predicate, out = []) => {
  if (!node || typeof node !== 'object') return out;
  if (predicate(node)) out.push(node);
  for (const child of node.children || []) findAll(child, predicate, out);
  return out;
};
const findNode = (node, predicate) => findAll(node, predicate)[0] || null;
const classOf = node => String((node && node.attrs && node.attrs.class) || '');

let fallos = 0;
let comprobaciones = 0;
const comprueba = (label, ok, detail) => {
  comprobaciones++;
  console.log((ok ? '  OK  ' : ' FALLO') + ' ' + label + (ok || detail == null ? '' : ' → ' + JSON.stringify(detail)));
  if (!ok) fallos++;
};

/* ---------- 1 y 2: shell con aria-current y FAB por ruta ------------------ */
const route = { name: 'tasks', params: {} };
const appShell = {
  core: {
    h: makeNode, uid: () => 'uid-test', icon: () => '<svg></svg>', avatarEl: () => null,
    hashPin: value => value, todayStr: () => '2026-10-13', COLORS: ['#2563EB'],
    startLongPress() {}, cancelLongPress() {}, longPressFired: () => false
  },
  state: {
    S: { meta: { onboarded: true }, profiles: [], activeProfileId: 'p1' },
    save() {}, normalizeData() {}, switchProfileData() {}, activeAccountUid: () => null,
    rememberPendingDeletes() {}, SYNC_KEYS: []
  },
  domain: { session: { unlocked: true }, route, go() {}, render() {}, tasksDueOn: () => [], isDoneOn: () => false },
  components: { openSheet() {}, closeOverlays() {}, confirmDialog() {}, toast() {}, quickAddSheet() {} },
  services: { pickImage() {}, setPhotoEl() {} },
  features: { home: () => makeNode('div', { class: 'pantalla-test' }, 'pantalla') }
};
// registerOnboarding engancha el teclado de la pantalla PIN al registrarse.
globalThis.document = globalThis.document || { addEventListener() {}, querySelector: () => null };
registerOnboarding(appShell);

const perfil = { name: 'Ana', color: '#2563EB' };
const botonesDeNav = shell => findAll(shell, node => node.tag === 'button' && /(^|\s)(nav-item|bn-item)(\s|$)/.test(classOf(node)));

route.name = 'tasks';
let shell = appShell.features.shell(perfil);
const navButtons = botonesDeNav(shell);
const activas = navButtons.filter(button => button.attrs['aria-current'] === 'page');
const inactivas = navButtons.filter(button => button.attrs['aria-current'] !== 'page');
comprueba('la navegación pinta 5 secciones en barra y 5 en el pie', navButtons.length === 10, navButtons.length);
comprueba('sólo la sección activa lleva aria-current="page" (barra y pie)',
  activas.length === 2 && activas.every(button => /(^|\s)on(\s|$)/.test(classOf(button))),
  activas.map(button => ({ class: classOf(button), current: button.attrs['aria-current'] })));
comprueba('las secciones inactivas no declaran aria-current',
  inactivas.every(button => !button.attrs['aria-current']), inactivas.map(button => button.attrs['aria-current']));

route.name = 'home';
comprueba('el FAB sigue pintándose donde añadir tiene sentido (Inicio)',
  !!findNode(appShell.features.shell(perfil), node => classOf(node).split(/\s+/).includes('fab')));
route.name = 'settings';
comprueba('en Ajustes no se pinta el FAB (tapaba el segmento "Oscuro" a 390 px)',
  !findNode(appShell.features.shell(perfil), node => classOf(node).split(/\s+/).includes('fab')));
route.name = 'tasks';

/* ---------- 3: Auth con labels vinculadas y aria-live ---------------------- */
const appAuth = {
  core: { h: makeNode, avatarEl: () => null },
  state: {
    S: {}, replaceState() {}, defaultState: () => ({}), stateFromRaw: value => value,
    switchProfileData() {}, applyTheme() {}, accountsIndex: () => [], saveAccountsIndex() {},
    activeAccountUid: () => null, updateAccountIndex() {}, claimAccount() {}, clearPushTimer() {},
    ACC_ACTIVE: 'dailyhub_v2:active', ACC_PREFIX: 'dailyhub_v2:acc:'
  },
  domain: { session: { unlocked: false } },
  components: { openSheet() {}, closeOverlays() {}, confirmDialog() {}, toast() {} },
  services: { sync: { status: { state: 'online' } }, supabase: {} },
  render() {},
  features: {},
  auth: {}
};
registerAuth(appAuth);
const authScreen = appAuth.auth.authScreen();
const emailInput = findNode(authScreen, node => node.tag === 'input' && node.attrs.id === 'auth-email');
const passwordInput = findNode(authScreen, node => node.tag === 'input' && node.attrs.id === 'auth-password');
const emailLabel = findNode(authScreen, node => node.tag === 'label' && node.attrs.for === 'auth-email');
const passwordLabel = findNode(authScreen, node => node.tag === 'label' && node.attrs.for === 'auth-password');
comprueba('la etiqueta Email vincula su campo con for="auth-email"', !!emailLabel && !!emailInput);
comprueba('la etiqueta Contraseña vincula su campo con for="auth-password"', !!passwordLabel && !!passwordInput);
const live = findNode(authScreen, node => node.tag === 'p' && node.attrs['aria-live'] === 'polite');
comprueba('el mensaje de Auth anuncia errores con aria-live="polite"', !!live && String(classOf(live)).includes('field-hint'), live && live.attrs);

/* ---------- 4 y 5: contratos de CSS ---------------------------------------- */
const tokens = leer('styles/tokens.css');
const components = leer('styles/components.css');
comprueba('el token --tap sigue fijando 44px', /--tap:\s*44px/.test(tokens));
const reglaBtn = (tokens.match(/(^|\n)\.btn\s*\{[^}]*\}/) || [''])[0];
comprueba('.btn declara min-height: var(--tap)', /min-height:\s*var\(--tap\)/.test(reglaBtn), reglaBtn.slice(0, 120));
const reglaContent = (tokens.match(/(^|\n)\.content\s*\{[^}]*\}/) || [''])[0];
comprueba('el contenido móvil reserva un tap final de scroll para el FAB', /\+ var\(--tap\) \+ env\(safe-area-inset-bottom\)/.test(reglaContent), reglaContent.slice(0, 160));
const reglaTitulo = (components.match(/(^|\n)\.activity-copy > b\s*\{[^}]*\}/) || [''])[0];
comprueba('los títulos de tarjeta admiten 2 líneas con elipsis', /-webkit-line-clamp:\s*2/.test(reglaTitulo), reglaTitulo.slice(0, 120));

console.log('\n' + (fallos ? fallos + ' comprobaciones fallidas' : 'Todo correcto (' + comprobaciones + ' comprobaciones)'));
process.exit(fallos ? 1 : 0);
