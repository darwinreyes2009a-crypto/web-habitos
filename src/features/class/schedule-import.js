// Lectura e importación transaccional de horarios desde tablas TSV/CSV pegadas.

const normalize = value => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

function readRecords(source, delimiter) {
  const text = String(source || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const records = [];
  let cells = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;

  const finishCell = () => { cells.push(cell.trim()); cell = ''; };
  const finishRecord = () => {
    finishCell();
    if (cells.some(value => value !== '')) records.push({ cells, line: recordLine });
    cells = [];
    recordLine = line + 1;
  };

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (quoted) {
        quoted = false;
      } else if (!cell.trim()) {
        quoted = true;
      } else {
        cell += char;
      }
    } else if (char === delimiter && !quoted) {
      finishCell();
    } else if (char === '\n') {
      if (quoted) {
        cell += '\n';
        line++;
      } else {
        finishRecord();
        line++;
      }
    } else {
      cell += char;
    }
  }

  if (quoted) return { records: [], error: 'Hay una comilla sin cerrar en la tabla.' };
  if (cell || cells.length) {
    finishCell();
    if (cells.some(value => value !== '')) records.push({ cells, line: recordLine });
  }
  return { records, error: '' };
}

function parseTime(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return '';
  return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
}

const timeMinutes = value => {
  const [hour, minute] = String(value || '').split(':').map(Number);
  return hour * 60 + minute;
};

const DAY_MAP = new Map([
  ['lunes', 0], ['lun', 0], ['lu', 0], ['monday', 0], ['mon', 0],
  ['martes', 1], ['mar', 1], ['ma', 1], ['tuesday', 1], ['tue', 1],
  ['miercoles', 2], ['mie', 2], ['mx', 2], ['wednesday', 2], ['wed', 2],
  ['jueves', 3], ['jue', 3], ['ju', 3], ['thursday', 3], ['thu', 3],
  ['viernes', 4], ['vie', 4], ['vi', 4], ['friday', 4], ['fri', 4],
  ['sabado', 5], ['sab', 5], ['sa', 5], ['saturday', 5], ['sat', 5],
  ['domingo', 6], ['dom', 6], ['do', 6], ['sunday', 6], ['sun', 6]
]);

const HEADER_ALIASES = {
  day: ['dia', 'day', 'weekday', 'dia semana', 'day of week'],
  start: ['inicio', 'desde', 'start', 'hora inicio', 'entrada'],
  end: ['fin', 'hasta', 'end', 'hora fin', 'salida'],
  subject: ['asignatura', 'materia', 'subject', 'clase'],
  room: ['aula', 'sala', 'ubicacion', 'room', 'lugar'],
  kind: ['tipo', 'kind']
};

/** Convierte una tabla pegada en filas válidas y errores por línea. */
export function parseScheduleText(source) {
  const text = String(source || '').replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : firstLine.includes(',') ? ',' : '';
  if (!text.trim()) return { rows: [], errors: ['Pega una tabla con al menos una fila.'] };
  if (!delimiter) return { rows: [], errors: ['Separa las columnas con tabuladores, punto y coma o comas.'] };

  const read = readRecords(text, delimiter);
  if (read.error) return { rows: [], errors: [read.error] };
  if (!read.records.length) return { rows: [], errors: ['No se encontraron filas de horario.'] };

  const firstCells = read.records[0].cells.map(normalize);
  const header = {};
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    header[key] = firstCells.findIndex(cell => aliases.includes(cell));
  }
  const hasHeader = ['day', 'start', 'end'].every(key => header[key] >= 0);
  const indexes = hasHeader ? header : { day: 0, start: 1, end: 2, subject: 3, room: 4, kind: 5 };
  const records = read.records.slice(hasHeader ? 1 : 0);
  const rows = [];
  const errors = [];

  for (const record of records) {
    const get = key => {
      const index = indexes[key];
      return index >= 0 && index < record.cells.length ? record.cells[index] : '';
    };
    const rawDay = normalize(get('day'));
    const day = DAY_MAP.has(rawDay)
      ? DAY_MAP.get(rawDay)
      : /^\d$/.test(rawDay) && Number(rawDay) <= 6 ? Number(rawDay) : null;
    const start = parseTime(get('start'));
    const end = parseTime(get('end'));
    if (day == null || !start || !end || timeMinutes(end) <= timeMinutes(start)) {
      errors.push('Fila ' + record.line + ': día u hora no válidos. Usa Lunes–Domingo y HH:MM.');
      continue;
    }
    const subjectName = get('subject').slice(0, 120);
    const kindText = normalize(get('kind') + ' ' + subjectName);
    const patio = /patio|recreo|descanso/.test(kindText);
    rows.push({
      day,
      start,
      end,
      subjectName: patio ? '' : subjectName,
      room: patio ? 'patio' : get('room').slice(0, 80),
      kind: patio ? 'patio' : 'class',
      line: record.line
    });
  }
  if (!rows.length && !errors.length) errors.push('No se encontraron filas de horario.');
  return { rows, errors };
}

/**
 * Prepara las filas sin mutar el estado. Un solape invalida el lote entero,
 * para no dejar asignaturas o bloques a medias.
 */
export function planScheduleImport(parsed, subjects, slots) {
  if (!parsed || !Array.isArray(parsed.rows) || !parsed.rows.length) {
    return { additions: [], newSubjects: [], error: (parsed && parsed.errors && parsed.errors[0]) || 'No hay filas que importar.' };
  }

  const knownSubjects = new Map();
  for (const subject of subjects || []) {
    const key = normalize(subject && subject.name);
    if (key && !knownSubjects.has(key)) knownSubjects.set(key, subject);
  }
  const stagedSubjects = new Map();
  const additions = [];
  const existingSlots = Array.isArray(slots) ? slots.filter(slot => slot.active !== false) : [];

  for (const row of parsed.rows) {
    const subjectKey = row.kind === 'patio' ? '' : normalize(row.subjectName);
    if (subjectKey && !knownSubjects.has(subjectKey) && !stagedSubjects.has(subjectKey)) {
      stagedSubjects.set(subjectKey, {
        name: String(row.subjectName || '').trim().slice(0, 30),
        key: subjectKey
      });
    }
    const candidate = {
      day: row.day,
      start: row.start,
      end: row.end,
      subjectId: row.kind === 'patio' ? null : (subjectKey && knownSubjects.has(subjectKey) ? knownSubjects.get(subjectKey).id : null),
      subjectKey,
      room: row.kind === 'patio' ? 'patio' : (row.room || ''),
      kind: row.kind === 'patio' ? 'patio' : 'class',
      active: true,
      line: row.line
    };
    const start = timeMinutes(candidate.start);
    const end = timeMinutes(candidate.end);
    const clashes = existingSlots.some(slot => slot.day === candidate.day && start < timeMinutes(slot.end) && end > timeMinutes(slot.start)) ||
      additions.some(slot => slot.day === candidate.day && start < timeMinutes(slot.end) && end > timeMinutes(slot.start));
    if (clashes) {
      return {
        additions: [],
        newSubjects: [],
        error: 'Solape o bloque repetido en fila ' + row.line + '; no se importó ninguna fila.'
      };
    }
    additions.push(candidate);
  }

  return { additions, newSubjects: [...stagedSubjects.values()], error: '' };
}

export function registerScheduleImport(app) {
  const { h, uid, todayStr, WEEK_FULL, COLORS } = app.core;
  const { S, save } = app.state;
  const { render } = app.domain;
  const { closeOverlays, toast } = app.components;

  function importScheduleFlow() {
    closeOverlays();
    const overlay = h('div', { class: 'overlay', style: 'z-index:65', onclick: event => { if (event.target === overlay) overlay.remove(); } });
    const text = h('textarea', {
      class: 'input',
      rows: '8',
      placeholder: 'Día\tInicio\tFin\tAsignatura\tAula\nLunes\t09:00\t09:55\tMatemáticas\tAula 2',
      'aria-label': 'Tabla del horario para importar'
    });
    const hint = h('p', { class: 'field-hint', 'aria-live': 'polite' }, 'Columnas: día, inicio, fin, asignatura, aula. Se admiten tabuladores, comas o punto y coma.');
    const preview = h('div', { style: 'max-height:22vh;overflow:auto' });
    const drawPreview = () => {
      const parsed = parseScheduleText(text.value);
      hint.textContent = parsed.errors.length
        ? parsed.rows.length + ' bloques válidos · ' + parsed.errors.slice(0, 2).join(' ')
        : parsed.rows.length + ' bloques reconocidos; se comprobarán solapes al importar.';
      preview.innerHTML = '';
      for (const row of parsed.rows.slice(0, 12)) {
        preview.append(h('p', { class: 'field-hint' },
          WEEK_FULL[row.day] + ' · ' + row.start + '–' + row.end + ' · ' +
          (row.kind === 'patio' ? 'Patio' : row.subjectName || 'Sin asignatura') +
          (row.room && row.kind !== 'patio' ? ' · ' + row.room : '')
        ));
      }
    };
    text.addEventListener('input', drawPreview);
    const sheet = h('div', { class: 'sheet', style: 'max-width:520px', role: 'dialog', 'aria-label': 'Importar horario desde tabla' },
      h('div', { class: 'grabber' }),
      h('h3', { style: 'font-size:17px;font-weight:800;margin-bottom:8px' }, 'Importar horario'),
      h('p', { class: 'field-hint', style: 'margin-bottom:12px' }, 'Pega una hoja de cálculo. También puedes usar filas sin encabezado: día, inicio, fin, asignatura, aula.'),
      text,
      hint,
      preview,
      h('button', {
        class: 'btn btn-primary btn-block btn-lg',
        style: 'margin-top:14px',
        onclick: () => {
          const parsed = parseScheduleText(text.value);
          if (!parsed.rows.length) { toast(parsed.errors[0] || 'No hay filas que importar'); return; }
          if (!Array.isArray(S.subjects)) S.subjects = [];
          if (!Array.isArray(S.slots)) S.slots = [];
          const plan = planScheduleImport(parsed, S.subjects, S.slots);
          if (plan.error) { toast(plan.error); return; }

          const newSubjects = plan.newSubjects.map((subject, index) => ({
            id: uid('s'),
            name: subject.name,
            color: COLORS[(S.subjects.length + index) % COLORS.length],
            icon: 'book',
            createdAt: todayStr(),
            updatedAt: Date.now()
          }));
          const subjectIds = new Map(S.subjects.map(subject => [normalize(subject.name), subject.id]));
          for (let index = 0; index < plan.newSubjects.length; index++) {
            subjectIds.set(plan.newSubjects[index].key, newSubjects[index].id);
          }
          const newSlots = plan.additions.map(({ line, subjectKey, ...candidate }) => Object.assign({
            id: uid('c'),
            createdAt: todayStr(),
            updatedAt: Date.now()
          }, candidate, {
            subjectId: candidate.kind === 'patio' ? null : (subjectIds.get(subjectKey) || candidate.subjectId || null)
          }));

          // Commit atómico: la validación ya terminó y ninguna fila de S se
          // toca hasta tener preparadas todas las asignaturas y todos los bloques.
          S.subjects.push(...newSubjects);
          S.slots.push(...newSlots);
          save();
          overlay.remove();
          render();
          const skipped = parsed.errors.length;
          toast(newSlots.length + (newSlots.length === 1 ? ' bloque importado' : ' bloques importados') +
            (skipped ? ' · se omitieron ' + skipped + ' filas no válidas' : ''));
        }
      }, 'Importar bloques')
    );
    overlay.append(sheet);
    document.body.append(overlay);
  }

  Object.assign(app.class, { parseScheduleText, importScheduleFlow });
}
