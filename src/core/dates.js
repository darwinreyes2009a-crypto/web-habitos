export function registerDates(app) {
  const cap = (value) => value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
  const toYmd = (date) => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  const todayStr = () => toYmd(new Date());
  const parseYmd = (value) => new Date(value + 'T00:00:00');
  const addDaysYmd = (ymd, amount) => {
    const date = parseYmd(ymd);
    date.setDate(date.getDate() + amount);
    return toYmd(date);
  };
  const dowIdx = (ymd) => (parseYmd(ymd).getDay() + 6) % 7;
  const weekStartOf = (ymd) => addDaysYmd(ymd, -dowIdx(ymd));
  const fmtLong = (ymd) => cap(parseYmd(ymd).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }));
  const fmtShort = (ymd) => parseYmd(ymd).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

  function fmtRange(start, end) {
    const startDate = parseYmd(start);
    const endDate = parseYmd(end);
    if (startDate.getMonth() === endDate.getMonth()) {
      return startDate.getDate() + ' – ' + endDate.getDate() + ' de ' + endDate.toLocaleDateString('es-ES', { month: 'long' });
    }
    return fmtShort(start) + ' – ' + fmtShort(end);
  }

  Object.assign(app.core, {
    cap,
    toYmd,
    todayStr,
    parseYmd,
    addDaysYmd,
    dowIdx,
    weekStartOf,
    fmtLong,
    fmtShort,
    fmtRange
  });
}
