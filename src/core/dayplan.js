// Plan del día: qué bloque toca AHORA y cuántos días seguidos llevas
// completando todo lo programado.
//
// Todo aquí es puro (recibe minutos, tareas y funciones de fecha) para poder
// probarlo sin DOM ni reloj real: tools/test-dayplan.mjs es el contrato.

export function registerDayPlan(app) {
  // Una rutina con hora se considera "en curso" durante esta franja: si son
  // las 9:40 y tenías el hábito a las 9:00, sigue siendo lo que toca ahora.
  const HABIT_WINDOW = 90;

  const hmToMinutes = value => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value == null ? '' : value).trim());
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  };

  const minutesTxt = value => {
    const total = ((Number(value) % 1440) + 1440) % 1440;
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  };

  // Un bloque que termina antes de empezar cruza medianoche (23:30–00:30):
  // su final se mueve al día siguiente en vez de quedar como rango vacío.
  function blockBounds(block) {
    const start = hmToMinutes(block && block.start);
    if (start == null) return null;
    let end = hmToMinutes(block && block.end);
    if (end == null) end = start + 60;
    if (end <= start) end += 24 * 60;
    return { start, end };
  }

  /* Bloques del día: las clases del horario y los hábitos con hora. Se
     ordenan por hora de inicio y, a igualdad, la clase va antes que el
     hábito: si coinciden, el bloque con más contexto (aula, asignatura) es
     el que responde mejor a "¿qué toca?". */
  function buildDayBlocks({ slots = [], tasks = [], ymd, isDueOn } = {}) {
    const blocks = [];
    for (const slot of slots) {
      const bounds = blockBounds(slot);
      if (!bounds) continue;
      blocks.push({ kind: 'class', id: String((slot && slot.id) || ''), start: bounds.start, end: bounds.end, slot });
    }
    for (const task of tasks) {
      if (isDueOn && !isDueOn(task, ymd)) continue;
      const start = hmToMinutes(task && task.time);
      if (start == null) continue;
      blocks.push({ kind: 'habit', id: String((task && task.id) || ''), start, end: start + HABIT_WINDOW, task });
    }
    return blocks.sort((first, second) => first.start - second.start ||
      (first.kind === second.kind ? 0 : first.kind === 'class' ? -1 : 1));
  }

  /* Devuelve el bloque en curso y el siguiente. `current` es null cuando no
     hay nada a esta hora (o cuando ya pasó todo), y `next` es null cuando no
     queda nada más hoy. Con un bloque nocturno, la madrugada se mira también
     como continuación del día anterior: a las 00:15, una clase de 23:30 a
     00:30 sigue siendo la de ahora. */
  function pickDayBlock(blocks, minutes) {
    const list = Array.isArray(blocks) ? blocks : [];
    const at = Number.isFinite(Number(minutes)) ? Number(minutes) : 0;
    const current = list.filter(block =>
      (block.start <= at && at < block.end) ||
      (block.end > 24 * 60 && at + 24 * 60 >= block.start && at + 24 * 60 < block.end)
    );
    const now = current.find(block => block.kind === 'class') || current[0] || null;
    const next = list
      .filter(block => block.start > at && block !== now)
      .sort((first, second) => first.start - second.start)[0] || null;
    return { current: now, next };
  }

  /* Días seguidos completando TODOS los hábitos programados. Un día sin nada
     programado no rompe la racha (no había nada que hacer). El día de hoy
     tampoco la rompe mientras no termine: si aún te quedan hábitos, la racha
     se cuenta desde ayer. */
  function allDoneStreak({ tasks = [], ymd, isDueOn, isDoneOn, isSkipped, addDaysYmd, maxDays = 366 } = {}) {
    if (!ymd || typeof addDaysYmd !== 'function') return 0;
    let streak = 0;
    let day = ymd;
    for (let index = 0; index < maxDays; index++) {
      const due = (tasks || []).filter(task =>
        isDueOn(task, day) && !(isSkipped && isSkipped(task, day))
      );
      if (!due.length) {
        day = addDaysYmd(day, -1);
        continue;
      }
      const done = due.filter(task => isDoneOn(task, day)).length;
      if (done === due.length) {
        streak++;
        day = addDaysYmd(day, -1);
        continue;
      }
      // Hoy todavía está en curso: no cuenta, pero no rompe lo de ayer.
      if (index === 0 && streak === 0) {
        day = addDaysYmd(day, -1);
        continue;
      }
      break;
    }
    return streak;
  }

  // Resumen de hoy: cuántos hábitos tocaban, cuántos están hechos y si el día
  // está completo. Los días saltados no cuentan como pendientes.
  function dayCompletion({ tasks = [], ymd, isDueOn, isDoneOn, isSkipped } = {}) {
    const due = (tasks || []).filter(task =>
      isDueOn(task, ymd) && !(isSkipped && isSkipped(task, ymd))
    );
    const done = due.filter(task => isDoneOn(task, ymd)).length;
    return { due: due.length, done, all: due.length > 0 && done === due.length };
  }

  Object.assign(app.core, {
    HABIT_WINDOW,
    hmToMinutes,
    minutesTxt,
    blockBounds,
    buildDayBlocks,
    pickDayBlock,
    allDoneStreak,
    dayCompletion
  });
}
