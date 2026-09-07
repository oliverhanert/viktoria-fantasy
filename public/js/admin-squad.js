/** Træningskalender — man+ons fra uge 32 */

export const TRAINING_START_WEEK = 32;
export const TRAINING_START_YEAR = 2025;

/** Sæson slutter 30. juni — efter sommerferie starter ny sæson (uge 32). */
export function activeSeasonEnd(date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  // Jul–dec: vi er i sæsonen der slutter næste sommer. Jan–jun: slutter i år.
  const endYear = m >= 7 ? y + 1 : y;
  return `${endYear}-06-30`;
}

export function generateTrainingSessions(until = activeSeasonEnd()) {
  const out = [];
  let mon = mondayOfISOWeek(TRAINING_START_YEAR, TRAINING_START_WEEK);
  const end = new Date(until + 'T23:59:59');
  while (new Date(mon + 'T12:00:00') <= end) {
    out.push({ date: mon, cancelled: false, attendance: [], notes: '' });
    const wed = addDays(mon, 2);
    if (new Date(wed + 'T12:00:00') <= end) {
      out.push({ date: wed, cancelled: false, attendance: [], notes: '' });
    }
    mon = addDays(mon, 7);
  }
  return out;
}

const MONTHS_DA = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
const DAYS_DA = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];

function fmtLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return fmtLocal(d);
}

export function mondayOfISOWeek(year, week) {
  const jan4 = new Date(year, 0, 4);
  const day = jan4.getDay() || 7;
  const week1 = new Date(year, 0, 4 - day + 1);
  const mon = new Date(week1);
  mon.setDate(week1.getDate() + (week - 1) * 7);
  return fmtLocal(mon);
}

function defaultSession(date) {
  return { date, cancelled: false, attendance: [], notes: '' };
}

/** Slå sammen predefinerede datoer med gemt data + migrér gamle uger */
export function mergeSquadData(squad) {
  const generated = generateTrainingSessions();
  const savedMap = {};

  for (const s of squad?.sessions || []) {
    if (s?.date) savedMap[s.date] = s;
  }

  if (squad?.weeks?.length) {
    for (const w of squad.weeks) {
      if (w.mon) {
        if (!savedMap[w.mon]) savedMap[w.mon] = defaultSession(w.mon);
        savedMap[w.mon].attendance = [...(w.monAtt || [])];
      }
      if (w.wed) {
        if (!savedMap[w.wed]) savedMap[w.wed] = defaultSession(w.wed);
        savedMap[w.wed].attendance = [...(w.wedAtt || [])];
      }
    }
  }

  const sessions = generated.map((g) => {
    const saved = savedMap[g.date];
    if (!saved) return g;
    return {
      date: g.date,
      cancelled: Boolean(saved.cancelled),
      attendance: normalizeAttendance(saved.attendance),
      notes: saved.notes || '',
    };
  });

  return {
    startWeek: TRAINING_START_WEEK,
    startYear: TRAINING_START_YEAR,
    sessions,
  };
}

export function ensureSquad(state) {
  if (!state.squad?._merged) {
    state.squad = mergeSquadData(state.squad);
    state.squad._merged = true;
  }
  return state.squad;
}

export function resetSquadMerge(state) {
  if (state.squad) delete state.squad._merged;
}

export function seasonCalendarBounds() {
  const sessions = generateTrainingSessions();
  const first = sessions[0]?.date || `${TRAINING_START_YEAR}-08-01`;
  const last = sessions[sessions.length - 1]?.date || activeSeasonEnd();
  const [fy, fm] = first.split('-').map(Number);
  const [ly, lm] = last.split('-').map(Number);
  return { first, last, minYear: fy, minMonth: fm, maxYear: ly, maxMonth: lm };
}

export function defaultCalendarMonth() {
  const { minYear, minMonth, maxYear, maxMonth } = seasonCalendarBounds();
  const today = fmtLocal(new Date());
  const t = new Date(today + 'T12:00:00');
  let y = t.getFullYear();
  let m = t.getMonth() + 1;
  const minKey = minYear * 12 + minMonth;
  const maxKey = maxYear * 12 + maxMonth;
  const curKey = y * 12 + m;
  if (curKey < minKey) { y = minYear; m = minMonth; }
  if (curKey > maxKey) { y = maxYear; m = maxMonth; }
  return { year: y, month: m };
}

export function normalizeAttendance(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((x) => +x).filter((x) => !Number.isNaN(x)))];
}

export function toggleAttendance(session, pi) {
  if (!session.attendance) session.attendance = [];
  session.attendance = normalizeAttendance(session.attendance);
  const i = session.attendance.indexOf(pi);
  if (i >= 0) session.attendance.splice(i, 1);
  else session.attendance.push(pi);
  return session.attendance.includes(pi);
}

export function sessionByDate(squad, date) {
  return squad.sessions.find((s) => s.date === date);
}

export function activeSessions(squad) {
  return (squad.sessions || []).filter((s) => !s.cancelled);
}

export function totalActiveSessions(squad) {
  return activeSessions(squad).length;
}

export function playerTrainingAttended(squad, pi) {
  const p = +pi;
  return activeSessions(squad).filter((s) => normalizeAttendance(s.attendance).includes(p)).length;
}

export function playerTrainingPct(squad, pi) {
  const total = totalActiveSessions(squad);
  if (!total) return null;
  return Math.round((playerTrainingAttended(squad, pi) / total) * 100);
}

export function formatDateLong(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  const days = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
  const months = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  return `${days[d.getDay()]} ${d.getDate()}. ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function isTrainingDay(squad, iso) {
  return Boolean(sessionByDate(squad, iso));
}

export function calendarCells(year, month) {
  const first = new Date(year, month - 1, 1);
  const startPad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push(iso);
  }
  return cells;
}

export { MONTHS_DA, DAYS_DA };
