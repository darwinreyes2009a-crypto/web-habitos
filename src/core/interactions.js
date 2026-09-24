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

  Object.assign(app.core, { startLongPress, cancelLongPress, longPressFired });
}
