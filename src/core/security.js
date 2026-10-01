/* PIN hashing: PBKDF2-SHA-256 (v2) with transparent migration from legacy djb2.

   Legacy format: `h` + base36(djb2) — fast but not a password hash.
   V2 format:     `v2$<iterations>$<saltB64>$<hashB64>`
   Iterations default to 210000 (OWASP PBKDF2-HMAC-SHA256 recommendation).
   Salt is 16 random bytes. Derived key is 256 bits.
*/
const PBKDF2_ITERATIONS = 210000;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_KEY_BITS = 256;

function bytesToB64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
  return btoa(binary);
}

function b64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function hashPinLegacy(pin) {
  let hash = 5381;
  for (const character of String(pin || '')) {
    hash = ((hash << 5) + hash + character.charCodeAt(0)) >>> 0;
  }
  return 'h' + hash.toString(36);
}

async function hashPinV2(pin, salt) {
  const saltBytes = salt
    ? (salt instanceof Uint8Array ? salt : new Uint8Array(salt))
    : crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(pin || '')),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    PBKDF2_KEY_BITS
  );
  return 'v2$' + PBKDF2_ITERATIONS + '$' + bytesToB64(saltBytes) + '$' + bytesToB64(new Uint8Array(derived));
}

async function verifyPinV2(pin, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'v2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  let saltBytes;
  try {
    saltBytes = b64ToBytes(parts[2]);
  } catch (error) {
    return false;
  }
  const expected = parts[3];
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(pin || '')),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    PBKDF2_KEY_BITS
  );
  return bytesToB64(new Uint8Array(derived)) === expected;
}

/** Always creates a v2 PBKDF2 hash (for new / changed PINs). */
async function hashPin(pin) {
  return hashPinV2(pin);
}

/**
 * Verify a PIN against profile.pin. Legacy `h…` hashes that match are
 * transparently upgraded to v2 and persisted via saveFn.
 * @returns {Promise<boolean>}
 */
async function verifyAndUpgradePin(pin, profile, saveFn) {
  if (!profile || !profile.pin) return false;
  const stored = String(profile.pin);
  if (stored.startsWith('v2$')) {
    return verifyPinV2(pin, stored);
  }
  if (stored.startsWith('h') && hashPinLegacy(pin) === stored) {
    profile.pin = await hashPinV2(pin);
    if (typeof saveFn === 'function') saveFn();
    return true;
  }
  return false;
}

export function registerSecurity(app) {
  app.core.hashPin = hashPin;
  app.core.hashPinLegacy = hashPinLegacy;
  app.core.verifyAndUpgradePin = verifyAndUpgradePin;
}

export {
  PBKDF2_ITERATIONS,
  hashPin,
  hashPinLegacy,
  hashPinV2,
  verifyAndUpgradePin,
  verifyPinV2
};
