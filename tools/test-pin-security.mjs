/* Pruebas de hash PIN: legado djb2, PBKDF2 v2 y migración transparente. */
import {
  PBKDF2_ITERATIONS,
  hashPin,
  hashPinLegacy,
  verifyAndUpgradePin
} from '../src/core/security.js';

let fallos = 0;
function ok(label, cond) {
  console.log((cond ? '  OK  ' : ' FALLO') + ' ' + label);
  if (!cond) fallos++;
}

const PIN = '1234';
const BAD = '9999';

const legacy = hashPinLegacy(PIN);
ok('legado empieza por h', legacy.startsWith('h') && legacy.length > 1);
ok('legado es determinista', hashPinLegacy(PIN) === legacy);
ok('legado rechaza PIN incorrecto', hashPinLegacy(BAD) !== legacy);

const v2 = await hashPin(PIN);
ok('v2 tiene formato v2$iter$salt$hash', /^v2\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/.test(v2));
ok('v2 usa ' + PBKDF2_ITERATIONS + ' iteraciones', v2.split('$')[1] === String(PBKDF2_ITERATIONS));
ok('v2 no es determinista (sal distinta)', (await hashPin(PIN)) !== v2);

let saves = 0;
const profileV2 = { pin: v2, pinLen: 4 };
ok('verify v2 correcto', await verifyAndUpgradePin(PIN, profileV2, () => { saves++; }));
ok('verify v2 no reescribe', profileV2.pin === v2 && saves === 0);
ok('verify v2 rechaza incorrecto', !(await verifyAndUpgradePin(BAD, profileV2, () => { saves++; })));

saves = 0;
const profileLegacy = { pin: legacy, pinLen: 4 };
ok('verify legado correcto', await verifyAndUpgradePin(PIN, profileLegacy, () => { saves++; }));
ok('legado se actualiza a v2$', String(profileLegacy.pin).startsWith('v2$'));
ok('saveFn se llama al migrar', saves === 1);
ok('tras migración sigue verificando', await verifyAndUpgradePin(PIN, profileLegacy, () => { saves++; }));
ok('tras migración rechaza incorrecto', !(await verifyAndUpgradePin(BAD, profileLegacy)));

ok('sin pin → false', !(await verifyAndUpgradePin(PIN, { pin: null })));
ok('perfil vacío → false', !(await verifyAndUpgradePin(PIN, null)));

console.log('\n' + (fallos ? fallos + ' comprobaciones fallidas' : 'Todo correcto (16 comprobaciones)'));
process.exit(fallos ? 1 : 0);
