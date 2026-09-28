export function registerInteractions(app) {
  let longPressTimer = null;
  let longPressAlreadyFired = false;

  function startLongPress(callback) {
    cancelLongPress();
    longPressAlreadyFired = false;
    longPressTimer = setTimeout(() => {
      longPressAlreadyFired = true;
      callback();
    }, 550);
  }

  function cancelLongPress() {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }

  function longPressFired() {
    const fired = longPressAlreadyFired;
    longPressAlreadyFired = false;
    return fired;
  }

  function haptic(pattern) {
    if (app.state.S && app.state.S.settings && app.state.S.settings.haptics === false) return false;
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
    try { return navigator.vibrate(pattern == null ? 8 : pattern); } catch (error) { return false; }
  }

  Object.assign(app.core, { startLongPress, cancelLongPress, longPressFired, haptic });
}
