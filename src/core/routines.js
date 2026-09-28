// Núcleo de rutinas (tareas y hábitos).
//
// El modelo viejo era `completions: ['2026-09-28', ...]`: un sí/no por día. Aquí
// se generaliza a:
//
//   kind      'check' | 'count' | 'amount' | 'avoid'
//   target    objetivo numérico de los que cuentan (2 vasos, 30 páginas)
//   log       { '2026-09-28': 2 }   valores registrados por día
//   skips     [ '2026-09-28' ]      días saltados: no rompen la racha
//   goal      objetivo semanal (4 de 7)
//
// `completions` se sigue llenando para que todo lo que ya existía (estadísticas,
// racha, nube) siga funcionando sin tocarlo.

export function registerRoutines(app) {
  const { todayStr, parseYmd, addDaysYmd, dowIdx, weekStartOf } = app.core;
  const { S } = app.state;

  const KINDS = [
    { id: 'check', label: 'Sí o no', hint: 'Lo haces o no lo haces' },
    { id: 'count', label: 'Contador', hint: 'Cuántas veces al día' },
    { id: 'amount', label: 'Cantidad', hint: 'Una cifra al día: páginas, minutos, vasos' },
    { id: 'avoid', label: 'Evitar', hint: 'Marca cuando lo haces mal; en los demás días, bien' }
  ];
  const kindOf = task => (task && task.kind) || 'check';
  const isNumeric = task => kindOf(task) === 'count' || kindOf(task) === 'amount';
  const targetOf = task => Number((task && task.target) || 0) || 0;

  /* --- Registro de valores -------------------------------------------------- */

  // Antes de existir `log`, un día completado valía 1. Se lee igual.
  function logOf(task, ymd) {
    if (!task) return 0;
    if (task.log && typeof task.log === 'object' && ymd in task.log) return Number(task.log[ymd]) || 0;
    return (task.completions || []).includes(ymd) ? 1 : 0;
  }

  function setLog(task, ymd, value) {
    if (!task || !isDueOn(task, ymd)) return;
    if (!isNumeric(task) && isSkipped(task, ymd)) return;
    if (isNumeric(task) && isSkipped(task, ymd)) skipOn(task, ymd, false);
    if (!task.log || typeof task.log !== 'object') task.log = {};
    const amount = Number(value) || 0;
    if (amount > 0) task.log[ymd] = amount;
    else delete task.log[ymd];
    task.completions = task.completions || [];
    const at = task.completions.indexOf(ymd);
    const shouldBeListed = isNumeric(task) ? (amount > 0) : true;
    if (amount > 0 && shouldBeListed && at < 0) task.completions.push(ymd);
    if (amount <= 0 && at >= 0) task.completions.splice(at, 1);
  }

  const isSkipped = (task, ymd) => !!(task.skips || []).includes(ymd);
  const skipOn = (task, ymd, value) => {
    if (!task || !isDueOn(task, ymd)) return false;
    task.skips = task.skips || [];
    const at = task.skips.indexOf(ymd);
    const shouldSkip = value === undefined ? at < 0 : !!value;
    if (shouldSkip && at < 0) task.skips.push(ymd);
    if (!shouldSkip && at >= 0) task.skips.splice(at, 1);
    // En un hábito de evitar, saltar un día descarta el fallo registrado. Al
    // restaurarlo, el día vuelve limpio en vez de recuperar una marca obsoleta.
    if (kindOf(task) === 'avoid' && (shouldSkip || at >= 0)) {
      if (task.completions) {
        const completionAt = task.completions.indexOf(ymd);
        if (completionAt >= 0) task.completions.splice(completionAt, 1);
      }
      if (task.log) delete task.log[ymd];
    }
    return shouldSkip;
  };

  /* --- ¿Toca hoy? ----------------------------------------------------------- */

  const lastDayOfMonth = date => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

  // Recurrencia ampliada: además de la anterior acepta "cada N días",
  // "laborables", "cada N semanas" y una fecha de fin (vacaciones, fin de curso).
  function isDueOn(task, ymd) {
    if (!task) return false;
    const freq = task.freq || { type: 'daily' };
    const created = task.createdAt ? String(task.createdAt).slice(0, 10) : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(created) && ymd < created) return false;
    // Un día de fin truncó la repetición: no vuelve a caer más allá.
    if (freq.until && ymd > freq.until) return false;
    // La recurrencia tampoco cuenta antes de su fecha de inicio.
    if (freq.from && ymd < freq.from) return false;
    const date = parseYmd(ymd);
    switch (freq.type) {
      case 'weekdays': {
        const day = dowIdx(ymd);
        if (day > 4) return false;
        if (Array.isArray(freq.days) && freq.days.length && !freq.days.includes(day)) return false;
        return true;
      }
      case 'every': {
        const every = Math.max(1, Number(freq.every) || 1);
        const anchor = freq.from || (task.createdAt ? String(task.createdAt).slice(0, 10) : ymd);
        const diff = Math.round((date - parseYmd(anchor)) / 86400000);
        return diff >= 0 && diff % every === 0;
      }
      case 'weekly': {
        const first = (freq.days || [])[0];
        return first == null ? dowIdx(ymd) === 0 : first === dowIdx(ymd);
      }
      case 'monthly':
        return date.getDate() === Math.min(freq.dom || 1, lastDayOfMonth(date));
      case 'once':
        return freq.date === ymd;
      case 'daily':
      default:
        return true;
    }
  }

  /* --- ¿Cumplido? ----------------------------------------------------------- */

  // 'avoid': cumplido es NO haberlo marcado. Por eso se invierte.
  function isDoneOn(task, ymd) {
    if (!task || !isDueOn(task, ymd)) return false;
    if (isSkipped(task, ymd)) return false;
    const created = task.createdAt ? String(task.createdAt).slice(0, 10) : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(created) && ymd < created) return false;
    if (kindOf(task) === 'avoid') return !(task.completions || []).includes(ymd) && !logOf(task, ymd);
    if (isNumeric(task)) {
      const target = targetOf(task);
      if (!target) return logOf(task, ymd) > 0;
      return logOf(task, ymd) >= target;
    }
    return (task.completions || []).includes(ymd);
  }

  // El día cuenta como "hecho" si se registró algo, aunque no se llegara al
  // objetivo: es lo que usan las gráficas y el "% de la semana".
  const hasEntryOn = (task, ymd) => isDueOn(task, ymd) && !isSkipped(task, ymd) && (logOf(task, ymd) > 0 || isDoneOn(task, ymd));

  function progressOn(task, ymd) {
    const due = isDueOn(task, ymd);
    const value = due ? logOf(task, ymd) : 0;
    const target = targetOf(task);
    return {
      value,
      target,
      done: due && isDoneOn(task, ymd),
      partial: due && isNumeric(task) && !!target && value > 0 && value < target,
      skipped: isDueOn(task, ymd) && isSkipped(task, ymd),
      ratio: target ? Math.min(1, value / target) : (value > 0 ? 1 : 0)
    };
  }

  /* --- Modificar el registro de un día -------------------------------------- */

  // Marca / desmarca. En los que cuentan, `null` sube al objetivo en vez de a 1.
  function toggleOn(task, ymd) {
    if (!task || !isDueOn(task, ymd) || isSkipped(task, ymd)) return false;
    if (isNumeric(task)) {
      const target = targetOf(task);
      const current = logOf(task, ymd);
      if (!target) return bumpOn(task, ymd, current > 0 ? -1 : 1) > 0;
      if (current >= target) {
        setLog(task, ymd, 0);
        return false;
      }
      setLog(task, ymd, target);
      return true;
    }
    const nowDone = isDoneOn(task, ymd);
    if (kindOf(task) === 'avoid') {
      const list = task.completions || (task.completions = []);
      const at = list.indexOf(ymd);
      if (at >= 0) list.splice(at, 1); else list.push(ymd);
      if (task.log) delete task.log[ymd];
      return !nowDone;
    }
    if (nowDone) setLog(task, ymd, 0);
    else setLog(task, ymd, 1);
    return !nowDone;
  }

  // Suma o resta una unidad. Devuelve el valor resultante.
  function bumpOn(task, ymd, delta) {
    if (!task || !isDueOn(task, ymd)) return logOf(task, ymd);
    const amount = Number(delta) || 0;
    if (isSkipped(task, ymd)) {
      if (!isNumeric(task) || amount <= 0) return logOf(task, ymd);
      skipOn(task, ymd, false);
    }
    const next = Math.max(0, logOf(task, ymd) + amount);
    setLog(task, ymd, next);
    return next;
  }

  function clearDay(task, ymd) {
    if (!task || !isDueOn(task, ymd)) return;
    skipOn(task, ymd, false);
    setLog(task, ymd, 0);
  }

  // Limpia solo el historial incompatible al cambiar la semántica del hábito.
  // Las marcas check se conservan al pasar a un tipo numérico (valen 1); en
  // cambio, avoid usa las marcas como fallos y no puede reutilizar ese historial.
  function prepareKindTransition(task, nextKind) {
    if (!task) return;
    const previousKind = kindOf(task);
    if (previousKind === nextKind) return;
    const previousNumeric = isNumeric(task);
    const nextNumeric = nextKind === 'count' || nextKind === 'amount';
    if (previousKind === 'avoid' || nextKind === 'avoid') {
      delete task.log;
      task.completions = [];
    }
    if (previousNumeric && !nextNumeric) {
      const target = targetOf(task) || 1;
      task.completions = (task.completions || []).filter(ymd => logOf(task, ymd) >= target);
      delete task.log;
      delete task.target;
      delete task.unit;
    } else if (!previousNumeric && nextNumeric) {
      // Nunca reutilizar un log numérico residual de una conversión antigua.
      delete task.log;
    }
  }

  /* --- Rachas y objetivos --------------------------------------------------- */

  // Días saltados no rompen la racha, pero tampoco la alargan.
  function streakOf(task) {
    if (!task) return 0;
    let streak = 0;
    let day = todayStr();
    for (let index = 0; index < 800; index++) {
      const created = task.createdAt ? String(task.createdAt).slice(0, 10) : '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(created) && day < created) break;
      if (isSkipped(task, day) && isDueOn(task, day)) {
        day = addDaysYmd(day, -1);
        continue;
      }
      if (!isDueOn(task, day)) {
        day = addDaysYmd(day, -1);
        if (streak === 0 && index > 14) return 0;
        continue;
      }
      if (isDoneOn(task, day)) streak++;
      else break;
      day = addDaysYmd(day, -1);
    }
    return streak;
  }

  // Mejor racha histórica (se recorre todo el histórico, acotado a 3 años).
  function bestStreakOf(task) {
    if (!task) return 0;
    const start = addDaysYmd(todayStr(), -1095);
    let best = 0;
    let run = 0;
    for (let day = start; day <= todayStr(); day = addDaysYmd(day, 1)) {
      const created = task.createdAt ? String(task.createdAt).slice(0, 10) : '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(created) && day < created) continue;
      if (isSkipped(task, day) && isDueOn(task, day)) continue;
      if (!isDueOn(task, day)) continue;
      if (isDoneOn(task, day)) { run++; best = Math.max(best, run); }
      else run = 0;
    }
    return best;
  }

  // Progreso del objetivo semanal: { done, goal, days, start, end }.
  function weekProgress(task, offset) {
    const shift = Number(offset) || 0;
    const start = addDaysYmd(weekStartOf(todayStr()), shift * 7);
    const end = addDaysYmd(start, 6);
    const today = todayStr();
    let done = 0;
    let due = 0;
    let days = 0;
    for (let index = 0; index < 7; index++) {
      const ymd = addDaysYmd(start, index);
      if (ymd > today) break;
      if (!isDueOn(task, ymd)) continue;
      due++;
      if (isDoneOn(task, ymd)) done++;
      days++;
    }
    const goal = Number(task.goal) || 0;
    return { start, end, done, due, days, goal, ratio: goal ? Math.min(1, done / goal) : 0 };
  }

  /* --- Heatmap anual ------------------------------------------------------- */

  // 53 semanas x 7 días, como el gráfico de contribuciones de GitHub.
  function heatmapData(task, year) {
    const target = Number(year) || new Date().getFullYear();
    const start = addDaysYmd(weekStartOf(target + '-01-01'), 0);
    const end = target + '-12-31';
    const today = todayStr();
    const weeks = [];
    let cursor = start;
    for (let guard = 0; guard < 60 && cursor <= end; guard++) {
      const days = [];
      for (let index = 0; index < 7; index++) {
        const ymd = cursor;
        const inYear = ymd.slice(0, 4) === String(target);
        const created = task.createdAt ? String(task.createdAt).slice(0, 10) : '';
        const known = /^\d{4}-\d{2}-\d{2}$/.test(created) && ymd >= created;
        const due = inYear && known && isDueOn(task, ymd);
        days.push({
          ymd,
          inYear,
          future: ymd > today,
          due,
          done: due && isDoneOn(task, ymd),
          value: due ? logOf(task, ymd) : 0,
          skipped: due && isSkipped(task, ymd)
        });
        cursor = addDaysYmd(cursor, 1);
      }
      weeks.push(days);
    }
    return { year: target, weeks };
  }

  // Días lectivos / laborables distintos de la racha: fin de semana excluido.
  function weekdayStreakOf(task) {
    if (!task) return 0;
    let streak = 0;
    let day = todayStr();
    for (let index = 0; index < 400; index++) {
      const created = task.createdAt ? String(task.createdAt).slice(0, 10) : '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(created) && day < created) break;
      if (dowIdx(day) > 4) { day = addDaysYmd(day, -1); continue; }
      if (isSkipped(task, day) && isDueOn(task, day)) { day = addDaysYmd(day, -1); continue; }
      if (!isDueOn(task, day)) { day = addDaysYmd(day, -1); continue; }
      if (isDoneOn(task, day)) streak++; else break;
      day = addDaysYmd(day, -1);
    }
    return streak;
  }

  /* --- Hábitos en riesgo ---------------------------------------------------- */

  // Rutinas que se han dejado hacer. `minDays` = días lectivos seguidos sin cumplir.
  function atRisk(minDays) {
    const limite = Number(minDays) || 5;
    const out = [];
    for (const task of (S.tasks || [])) {
      if (task.freq && task.freq.type === 'once') continue;
      let day = todayStr();
      let missed = 0;
      const created = task.createdAt ? String(task.createdAt).slice(0, 10) : '';
      for (let index = 0; index < 120; index++) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(created) && day < created) break;
        if (isSkipped(task, day) && isDueOn(task, day)) { day = addDaysYmd(day, -1); continue; }
        if (isDueOn(task, day)) {
          if (isDoneOn(task, day)) break;
          missed++;
          if (missed >= limite) break;
        }
        day = addDaysYmd(day, -1);
      }
      if (missed >= limite) out.push({ task, missed });
    }
    return out.sort((first, second) => second.missed - first.missed);
  }

  /* --- Texto de la recurrencia ---------------------------------------------- */

  function freqText(task) {
    if (!task) return '';
    const freq = task.freq || { type: 'daily' };
    const WEEK = app.core.WEEK_FULL;
    let text = '';
    if (freq.type === 'weekdays') text = freq.days && freq.days.length ? 'Los ' + freq.days.map(day => WEEK[day]).join(', ') : 'De lunes a viernes';
    else if (freq.type === 'every') text = 'Cada ' + (Number(freq.every) || 1) + (Number(freq.every) === 1 ? ' día' : ' días');
    else if (freq.type === 'weekly') text = 'Cada semana · ' + (WEEK[(freq.days || [])[0]] || 'lunes');
    else if (freq.type === 'monthly') text = 'Día ' + (freq.dom || 1) + ' de cada mes';
    else if (freq.type === 'once') text = freq.date || 'Una vez';
    else text = 'Todos los días';
    if (freq.until) text += ' · hasta el ' + (app.core.fmtShort(freq.until));
    else if (freq.from && freq.from > todayStr()) text += ' · desde el ' + app.core.fmtShort(freq.from);
    if (kindOf(task) === 'count') text += ' · ' + (targetOf(task) || '?') + ' veces al día';
    if (kindOf(task) === 'amount') text += ' · ' + (targetOf(task) || '?') + (task.unit ? ' ' + task.unit + ' al día' : ' al día');
    if (task.time) text += ' · ' + task.time;
    return text;
  }

  Object.assign(app.core, {
    KINDS,
    kindOf,
    isNumeric,
    targetOf,
    logOf,
    setLog,
    isSkipped,
    skipOn,
    clearDay,
    prepareKindTransition,
    isDueOn,
    isDoneOn,
    toggleOn,
    streakOf,
    progressOn,
    hasEntryOn,
    bumpOn,
    bestStreakOf,
    weekdayStreakOf,
    weekProgress,
    heatmapData,
    atRisk,
    freqText
  });
}
