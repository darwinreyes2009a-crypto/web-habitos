export function registerSecurity(app) {
  function hashPin(pin) {
    let hash = 5381;
    for (const character of pin) hash = ((hash << 5) + hash + character.charCodeAt(0)) >>> 0;
    return 'h' + hash.toString(36);
  }

  app.core.hashPin = hashPin;
}
