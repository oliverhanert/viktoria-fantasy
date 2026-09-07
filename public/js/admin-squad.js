/** Træningskalender — man+ons fra uge 32 */

import { DBU_POOL_MAP } from './dbu-periods.js';

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

export function seasonIdForDate(date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const startYear = m >= 7 ? y : y - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

export function seasonLabel(seasonId) {
  const [sy, ey] = seasonId.split('-');
  return `${String(sy).slice(-2)}/${ey}`;
}

export function seasonRange(seasonId) {
  const startYear = parseInt(seasonId.split('-')[0], 10);
  const endYear = startYear + 1;
  const first = mondayOfISOWeek(startYear, TRAINING_START_WEEK);
  const last = `${endYear}-06-30`;
  return { first, last, startYear, endYear };
}

/** Aug–jan = efterår, feb–jun = forår, jul = sommerferie */
export function seasonPhase(date = new Date()) {
  const m = date.getMonth() + 1;
  if (m >= 8) return 'efterår';
  if (m >= 2 && m <= 6) return 'forår';
  return 'sommer';
}

export function seasonPhaseLabel(phase) {
  return { efterår: 'Efterår', forår: 'Forår', sommer: 'Sommerferie' }[phase] || phase;
}

/** Halvsæson-id: 2025-26-efterår */
export function parsePeriodId(periodId) {
  const m = String(periodId).match(/^(\d{4}-\d{2})-(efterår|forår)$/);
  if (m) return { seasonId: m[1], phase: m[2] };
  if (/^\d{4}-\d{2}$/.test(periodId)) return { seasonId: periodId, phase: null };
  const sid = seasonIdForDate();
  return { seasonId: sid, phase: seasonPhase() === 'sommer' ? 'efterår' : seasonPhase() };
}

export function periodIdForDate(date = new Date()) {
  const seasonId = seasonIdForDate(date);
  let phase = seasonPhase(date);
  if (phase === 'sommer') phase = 'efterår';
  return `${seasonId}-${phase}`;
}

export function periodLabel(periodId) {
  const { seasonId, phase } = parsePeriodId(periodId);
  if (!phase) return seasonLabel(seasonId);
  return `${seasonLabel(seasonId)} · ${seasonPhaseLabel(phase)}`;
}

/** Kort sæsonlabel til navigation (fx 25/26) */
export function seasonNavDisplayLabel(periodId) {
  const { seasonId } = parsePeriodId(periodId);
  return seasonLabel(seasonId);
}

/** Label til forrige/næste-knap inkl. halvsæson */
export function seasonNavButtonLabel(periodId) {
  const { seasonId, phase } = parsePeriodId(periodId);
  const s = seasonLabel(seasonId);
  if (!phase) return s;
  return `${s} ${seasonPhaseLabel(phase)}`;
}

export function periodRange(periodId) {
  const { seasonId, phase } = parsePeriodId(periodId);
  const { startYear, endYear } = seasonRange(seasonId);
  if (phase === 'forår') {
    return { first: `${endYear}-02-01`, last: `${endYear}-06-30`, seasonId, phase };
  }
  const first = mondayOfISOWeek(startYear, TRAINING_START_WEEK);
  return { first, last: `${endYear}-01-31`, seasonId, phase: phase || 'efterår' };
}

export function comparePeriodIds(a, b) {
  const pa = parsePeriodId(a);
  const pb = parsePeriodId(b);
  const seasonCmp = pa.seasonId.localeCompare(pb.seasonId);
  if (seasonCmp !== 0) return seasonCmp;
  const phaseOrder = { forår: 0, efterår: 1 };
  return (phaseOrder[pa.phase] ?? 0) - (phaseOrder[pb.phase] ?? 0);
}

export function isDateInRange(iso, first, last) {
  return Boolean(iso && iso >= first && iso <= last);
}

export function isDateInPeriod(iso, periodId) {
  const { first, last } = periodRange(periodId);
  return isDateInRange(iso, first, last);
}

export function matchDateIso(d) {
  if (!d) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const months = {
    jan: '01', feb: '02', mar: '03', apr: '04', maj: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', okt: '10', nov: '11', dec: '12',
  };
  const m = String(d).match(/(\d{1,2})\.\s*(\w+)\s*(\d{4})/i);
  if (!m) return '';
  const mon = months[m[2].toLowerCase().slice(0, 3)];
  if (!mon) return '';
  return `${m[3]}-${mon}-${String(m[1]).padStart(2, '0')}`;
}

export function generatePeriodIds(until = periodIdForDate()) {
  const out = [];
  const curSeasonStart = parseInt(seasonIdForDate().split('-')[0], 10);
  for (let y = TRAINING_START_YEAR; y <= curSeasonStart + 1; y++) {
    const sid = `${y}-${String(y + 1).slice(-2)}`;
    out.push(`${sid}-forår`, `${sid}-efterår`);
  }
  return out.filter((id) => comparePeriodIds(id, until) <= 0);
}

export function listPeriodIds(squad, matches = [], until = periodIdForDate()) {
  const ids = new Set(generatePeriodIds(until));
  ids.add(until);
  for (const s of squad?.sessions || []) {
    if (s.date) ids.add(periodIdForDate(new Date(s.date + 'T12:00:00')));
  }
  for (const m of matches || []) {
    const iso = matchDateIso(m.d);
    if (iso) ids.add(periodIdForDate(new Date(iso + 'T12:00:00')));
  }
  for (const id of Object.keys(DBU_POOL_MAP)) {
    if (comparePeriodIds(id, until) <= 0) ids.add(id);
  }
  return [...ids]
    .filter((id) => comparePeriodIds(id, until) <= 0)
    .sort(comparePeriodIds);
}

export function sessionsForPeriod(squad, periodId) {
  const { first, last } = periodRange(periodId);
  return (squad?.sessions || []).filter((s) => s.date >= first && s.date <= last);
}

export function periodCalendarBounds(periodId) {
  const { first, last } = periodRange(periodId);
  const [fy, fm] = first.split('-').map(Number);
  const [ly, lm] = last.split('-').map(Number);
  return { first, last, minYear: fy, minMonth: fm, maxYear: ly, maxMonth: lm, periodId };
}

export function defaultCalendarMonthForPeriod(periodId) {
  const { minYear, minMonth, maxYear, maxMonth } = periodCalendarBounds(periodId);
  const today = fmtLocal(new Date());
  let y = parseInt(today.slice(0, 4), 10);
  let m = parseInt(today.slice(5, 7), 10);
  const { first, last } = periodRange(periodId);
  if (today < first) { y = minYear; m = minMonth; }
  else if (today > last) { y = maxYear; m = maxMonth; }
  const minKey = minYear * 12 + minMonth;
  const maxKey = maxYear * 12 + maxMonth;
  const curKey = y * 12 + m;
  if (curKey < minKey) { y = minYear; m = minMonth; }
  if (curKey > maxKey) { y = maxYear; m = maxMonth; }
  return { year: y, month: m };
}

export function filterMatchesByPeriod(matches, periodId) {
  const cur = periodIdForDate();
  return (matches || []).filter((m) => {
    const iso = matchDateIso(m.d);
    if (!iso) return periodId === cur;
    return isDateInPeriod(iso, periodId);
  });
}

/** DBU-kampe har dato i samme format som fantasy */
export function filterDbuMatchesByPeriod(matches, periodId) {
  const cur = periodIdForDate();
  return (matches || []).filter((m) => {
    const iso = matchDateIso(m.date);
    if (!iso) return periodId === cur;
    return isDateInPeriod(iso, periodId);
  });
}

export function listSeasonIds(squad, until = activeSeasonEnd()) {
  const ids = new Set();
  ids.add(seasonIdForDate());
  const sessions = squad?.sessions?.length ? squad.sessions : generateTrainingSessions(until);
  for (const s of sessions) {
    ids.add(seasonIdForDate(new Date(s.date + 'T12:00:00')));
  }
  return [...ids].sort();
}

export function sessionsForSeason(squad, seasonId) {
  const { first, last } = seasonRange(seasonId);
  return (squad?.sessions || []).filter((s) => s.date >= first && s.date <= last);
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

export function seasonCalendarBounds(seasonId) {
  const { first, last } = seasonRange(seasonId);
  const [fy, fm] = first.split('-').map(Number);
  const [ly, lm] = last.split('-').map(Number);
  return { first, last, minYear: fy, minMonth: fm, maxYear: ly, maxMonth: lm, seasonId };
}

export function defaultCalendarMonth(seasonId) {
  const { minYear, minMonth, maxYear, maxMonth } = seasonCalendarBounds(seasonId);
  const today = fmtLocal(new Date());
  const t = new Date(today + 'T12:00:00');
  let y = t.getFullYear();
  let m = t.getMonth() + 1;
  const { first, last } = seasonRange(seasonId);
  if (today < first) {
    y = minYear;
    m = minMonth;
  } else if (today > last) {
    y = maxYear;
    m = maxMonth;
  }
  const minKey = minYear * 12 + minMonth;
  const maxKey = maxYear * 12 + maxMonth;
  const curKey = y * 12 + m;
  if (curKey < minKey) { y = minYear; m = minMonth; }
  if (curKey > maxKey) { y = maxYear; m = maxMonth; }
  return { year: y, month: m };
}

/** @deprecated brug seasonCalendarBounds(seasonId) */
export function legacyCalendarBounds() {
  const sessions = generateTrainingSessions();
  const first = sessions[0]?.date || `${TRAINING_START_YEAR}-08-01`;
  const last = sessions[sessions.length - 1]?.date || activeSeasonEnd();
  const [fy, fm] = first.split('-').map(Number);
  const [ly, lm] = last.split('-').map(Number);
  return { first, last, minYear: fy, minMonth: fm, maxYear: ly, maxMonth: lm };
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

export function activeSessions(squad, periodId = null) {
  let list = squad.sessions || [];
  if (periodId) {
    const { phase } = parsePeriodId(periodId);
    list = phase ? sessionsForPeriod(squad, periodId) : sessionsForSeason(squad, parsePeriodId(periodId).seasonId);
  }
  return list.filter((s) => !s.cancelled);
}

export function totalActiveSessions(squad, periodId = null) {
  return activeSessions(squad, periodId).length;
}

export function playerTrainingAttended(squad, pi, periodId = null) {
  const p = +pi;
  return activeSessions(squad, periodId).filter((s) => normalizeAttendance(s.attendance).includes(p)).length;
}

export function playerTrainingPct(squad, pi, periodId = null) {
  const total = totalActiveSessions(squad, periodId);
  if (!total) return null;
  return Math.round((playerTrainingAttended(squad, pi, periodId) / total) * 100);
}

export function formatDateLong(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  const days = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
  const months = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  return `${days[d.getDay()]} ${d.getDate()}. ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function isTrainingDay(squad, iso, periodId = null) {
  const s = sessionByDate(squad, iso);
  if (!s) return false;
  if (!periodId) return true;
  return isDateInPeriod(iso, periodId);
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
