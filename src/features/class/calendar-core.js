// Lógica de calendario escolar: días no lectivos, excepciones puntuales,
// huecos y solapes, carga por asignatura y exportación a ICS.
// Son funciones sobre el estado, sin interfaz: las usan la rejilla semanal,
// la agenda de "hoy" y las estadísticas.

export function registerClassCalendarCore(app) {
  const { todayStr, addDaysYmd, dowIdx, parseYmd, toYmd, uid } = app.core;
  const { S, save } = app.state;
  const { hm, minTxt, timeTxt, subjectById } = app.class;

  // Un descanso (vacaciones, exámenes, día no lectivo) es un rango de fechas
  // con una etiqueta. Oculta el horario esos días sin borrar el patrón.
  function breaks() {
    if (!Array.isArray(S.breaks)) S.breaks = [];
    return S.breaks;
  }

  // Cancelación puntual: este bloque no ocurre en esta fecha concreta
  // ("hoy no hay 3.ª hora"). Es una fila { id, slotId, date }.
  function offs() {
    if (!Array.isArray(S.offs)) S.offs = [];
    return S.offs;
  }

  function inRange(ymd, from, to) {
    if (!ymd) return false;
    if (from && ymd < from) return false;
    if (to && ymd > to) return false;
    return !!(from || to);
  }

  // Descripción del día no lectivo que cubre esa fecha, o null si es lectivo.
  function breakOn(ymd) {
    return breaks().find(item => inRange(ymd, item.from, item.to)) || null;
  }

  const isNonSchool = ymd => !!breakOn(ymd);

  function addBreak(from, to, label, kind) {
    const item = {
      id: uid('b'),
      from: from || todayStr(),
      to: to || from || todayStr(),
      label: label || 'No lectivo',
      kind: kind || 'libre',
      createdAt: todayStr(),
      updatedAt: Date.now()
    };
    breaks().push(item);
    save();
    return item;
  }

  function removeBreak(id) {
    const list = breaks();
    const at = list.findIndex(item => item.id === id);
    if (at < 0) return false;
    list.splice(at, 1);
    save();
    return true;
  }

  // ¿Está este bloque marcado como cancelado en esa fecha?
  function isOff(slotId, ymd) {
    return offs().some(item => item.slotId === slotId && item.date === ymd);
  }

  function setOff(slotId, ymd, value) {
    const list = offs();
    const at = list.findIndex(item => item.slotId === slotId && item.date === ymd);
    const shouldOff = value === undefined ? at < 0 : !!value;
    if (shouldOff && at < 0) {
      list.push({ id: uid('o'), slotId, date: ymd, createdAt: ymd, updatedAt: Date.now() });
      save();
      return true;
    }
    if (!shouldOff && at >= 0) {
      list.splice(at, 1);
      save();
      return true;
    }
    return false;
  }

  // ¿Está el bloque saltado hoy? (cancelación puntual de la fecha de hoy)
  function isOffToday(slot) {
    return isOff(slot.id, todayStr());
  }

  // Un bloque se celebra si está activo, no está cancelado ese día y el día no
  // es no lectivo.
  function slotRunsOn(slot, ymd) {
    if (slot.active === false) return false;
    if (isOff(slot.id, ymd)) return false;
    return true;
  }

  // Bloques de un día de la semana (0-6) tal y como se ven en el horario.
  function slotsOnDay(day) {
    return (S.slots || []).filter(slot => slot.day === day);
  }

  // Bloques de una fecha concreta, ya filtrando cancelaciones y no lectivos.
  function slotsOnDate(ymd) {
    if (isNonSchool(ymd)) return [];
    return slotsOnDay(dowIdx(ymd)).filter(slot => slotRunsOn(slot, ymd));
  }

  const sortByTime = (first, second) => hm(first.start) - hm(second.start) || hm(first.end) - hm(second.end);


  /* --- Huecos y solapes ---------------------------------------------------- */

  // Huecos libres entre el primer y el último bloque del día, a partir de
  // `minGap` minutos. Sirve para ver "tengo 2 huecos de más de una hora".
  function dayGaps(day, minGap) {
    const limit = minGap || 45;
    const blocks = slotsOnDay(day).slice().sort(sortByTime);
    const gaps = [];
    for (let index = 1; index < blocks.length; index++) {
      const from = hm(blocks[index - 1].end);
      const to = hm(blocks[index].start);
      if (to - from >= limit) gaps.push({ from: minTxt(from), to: minTxt(to), minutes: to - from });
    }
    return gaps;
  }

  // Pares de bloques que se pisan. Hoy la app avisa al crear, pero pueden
  // aparecer al importar o al editar en dos dispositivos a la vez.
  function dayOverlaps(day) {
    const blocks = slotsOnDay(day).slice().sort(sortByTime);
    const pairs = [];
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        if (hm(blocks[j].start) < hm(blocks[i].end)) pairs.push([blocks[i], blocks[j]]);
      }
    }
    return pairs;
  }

  /* --- Carga por asignatura ------------------------------------------------ */

  // Minutos por asignatura y día de la semana en el patrón semanal.
  function weekLoad() {
    const bySubject = new Map();
    const byDay = new Array(7).fill(0);
    let classMinutes = 0;
    let patioMinutes = 0;
    for (const slot of (S.slots || [])) {
      if (slot.active === false) continue;
      const minutes = Math.max(0, hm(slot.end) - hm(slot.start));
      if (slot.kind === 'patio' || slot.room === 'patio') {
        patioMinutes += minutes;
        byDay[slot.day] += minutes;
        continue;
      }
      classMinutes += minutes;
      byDay[slot.day] += minutes;
      const key = slot.subjectId || '';
      if (!bySubject.has(key)) bySubject.set(key, { subjectId: slot.subjectId || null, minutes: 0, blocks: 0 });
      const entry = bySubject.get(key);
      entry.minutes += minutes;
      entry.blocks++;
    }
    const subjects = [...bySubject.values()]
      .map(entry => Object.assign(entry, { name: entry.subjectId ? (subjectById(entry.subjectId) || {}).name || 'Sin asignatura' : 'Sin asignatura' }))
      .sort((first, second) => second.minutes - first.minutes);
    return { subjects, byDay, classMinutes, patioMinutes, total: classMinutes + patioMinutes };
  }

  function humanMinutes(minutes) {
    if (!minutes) return '0 min';
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    const parts = [];
    if (hours) parts.push(hours + (hours === 1 ? ' h' : ' h'));
    if (rest) parts.push(rest + ' min');
    return parts.join(' ');
  }

  /* --- Exportación --------------------------------------------------------- */

  // .ics con un evento recurrente por bloque del patrón semanal, para poder
  // seguir el horario en Google Calendar aunque la app esté cerrada.
  function buildICS() {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//DailyHub//Horario//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:DailyHub · Horario'
    ];
    const stampDate = ymd => String(ymd).replace(/-/g, '');
    // La semana base es la del lunes en curso; cada bloque repite cada semana.
    const base = new Date();
    const baseDow = (base.getDay() + 6) % 7;
    base.setDate(base.getDate() - baseDow);
    for (const slot of slotsOnDay(0).concat(slotsOnDay(1), slotsOnDay(2), slotsOnDay(3), slotsOnDay(4), slotsOnDay(5), slotsOnDay(6))) {
      if (slot.active === false) continue;
      const day = new Date(base);
      day.setDate(base.getDate() + slot.day);
      const date = stampDate(toYmd(day));
      const start = date + 'T' + String(timeTxt(slot.start)).replace(':', '') + '00';
      const end = date + 'T' + String(timeTxt(slot.end)).replace(':', '') + '00';
      const name = slot.kind === 'patio' || slot.room === 'patio'
        ? 'Patio'
        : (subjectById(slot.subjectId) || {}).name || 'Clase';
      const stampStart = start + 'Z';
      const stampEnd = end + 'Z';
      lines.push(
        'BEGIN:VEVENT',
        'UID:' + slot.id + '@dailyhub',
        'DTSTAMP:' + stamp,
        'DTSTART:' + stampStart,
        'DTEND:' + stampEnd,
        'RRULE:FREQ=WEEKLY',
        'SUMMARY:' + String(name).replace(/[;,\\]/g, ' '),
        slot.room ? 'LOCATION:' + String(slot.room).replace(/[;,\\]/g, ' ') : 'LOCATION:',
        'END:VEVENT'
      );
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // Enlaces de videollamada detectados en el campo de sala/enlace del bloque.
  const VIDEO_HOSTS = ['classroom.google.com', 'meet.google.com', 'zoom.us', 'teams.microsoft.com', 'whereby.com', 'discord.com'];

  function videoLink(slot) {
    const raw = String((slot && (slot.link || slot.room || slot.url)) || '').trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();
    const host = VIDEO_HOSTS.find(item => lower.includes(item));
    // Un aula normal ("2B", "Aula 3") no es un enlace: solo se ofrece botón
    // si el texto trae un protocolo o el dominio de una plataforma conocida.
    if (!/^https?:\/\//i.test(raw) && !host) return null;
    const url = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
    return { host: host || '', url, label: host ? host.split('.')[0] : 'Abrir enlace' };
  }

  /* --- Ventana temporal del horario ---------------------------------------- */

  // Franjas que abarcan el horario, redondeadas a la hora, para dibujar la
  // rejilla sin mucho espacio muerto.
  function gridWindow(step) {
    const blocks = (S.slots || []).filter(slot => slot.active !== false);
    if (!blocks.length) return { from: 8 * 60, to: 15 * 60, step: step || 15 };
    let from = 1440;
    let to = 0;
    for (const slot of blocks) {
      from = Math.min(from, hm(slot.start));
      to = Math.max(to, hm(slot.end));
    }
    const pad = 30;
    from = Math.max(0, Math.floor((from - pad) / 60) * 60);
    to = Math.min(1440, Math.ceil((to + pad) / 60) * 60);
    if (to - from < 120) to = Math.min(1440, from + 120);
    return { from, to, step: step || 5 };
  }

  Object.assign(app.class, {
    breaks,
    offs,
    breakOn,
    isNonSchool,
    addBreak,
    removeBreak,
    isOff,
    isOffToday,
    setOff,
    slotRunsOn,
    slotsOnDay,
    slotsOnDate,
    dayGaps,
    dayOverlaps,
    weekLoad,
    humanMinutes,
    buildICS,
    download,
    videoLink,
    gridWindow,
    sortByTime
  });
}
