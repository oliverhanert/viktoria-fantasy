/** Træningskalender — man+ons fra uge 32 */

export const TRAINING_START_WEEK = 32;
export const TRAINING_START_YEAR = 2025;
export const TRAINING_SEASON_END = '2026-06-30';

const MONTHS_DA = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
const DAYS_DA = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];

export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function mondayOfISOWeek(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const week1 = new Date(jan4);
  week1.setUTCDate(jan4.getUTCDate() - day + 1);
  const mon = new Date(week1);
  mon.setUTCDate(week1.getUTCDate() + (week - 1) * 7);
  return mon.toISOString().slice(0, 10);
}

export function generateTrainingSessions() {
  const out = [];
  let mon = mondayOfISOWeek(TRAINING_START_YEAR, TRAINING_START_WEEK);
  const end = new Date(TRAINING_SEASON_END + 'T23:59:59');
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
      attendance: Array.isArray(saved.attendance) ? [...saved.attendance] : [],
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
  state.squad = mergeSquadData(state.squad);
  return state.squad;
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
  return activeSessions(squad).filter((s) => s.attendance?.includes(pi)).length;
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
