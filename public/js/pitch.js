/**
 * Baneopstilling — bruger match.lineup (4-3-3) når tilgængelig
 */

import { playerAvatarHtml } from './player-avatar.js';

export const SLOT_POS = {
  '4-3-3': [
    { slot: 'GK', x: 50, y: 90, label: 'GK' },
    { slot: 'DEF', x: 16, y: 74, label: 'VB' }, { slot: 'DEF', x: 37, y: 77, label: 'CB' },
    { slot: 'DEF', x: 63, y: 77, label: 'CB' }, { slot: 'DEF', x: 84, y: 74, label: 'HB' },
    { slot: 'MID', x: 28, y: 48, label: 'CM' }, { slot: 'MID', x: 50, y: 44, label: 'CM' },
    { slot: 'MID', x: 72, y: 48, label: 'CM' },
    { slot: 'ATT', x: 22, y: 18, label: 'VW' }, { slot: 'ATT', x: 50, y: 14, label: 'ST' },
    { slot: 'ATT', x: 78, y: 18, label: 'HW' },
  ],
};

export const BENCH_COUNT = 3;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function playerEntry(i, players, fpFor, dispName, match) {
  const f = fpFor(match, i);
  if (!f) return null;
  return { i, player: players[i], name: dispName(i), pos: f.pos, pts: f.total };
}

/** Placer XI + bænk fra match.lineup */
export function assignFromLineup(match, players, fpFor, dispName) {
  const formation = match.lineup?.formation || '4-3-3';
  const slots = SLOT_POS[formation] || SLOT_POS['4-3-3'];
  const xi = match.lineup?.xi || [];
  const benchIds = match.lineup?.bench || [];

  const placed = [];
  xi.forEach((playerIdx, slotIdx) => {
    const p = playerEntry(playerIdx, players, fpFor, dispName, match);
    if (!p || !slots[slotIdx]) return;
    placed.push({ ...p, x: slots[slotIdx].x, y: slots[slotIdx].y });
  });

  const bench = benchIds
    .map((playerIdx) => playerEntry(playerIdx, players, fpFor, dispName, match))
    .filter(Boolean);

  return { placed, bench, formationKey: formation };
}

export function renderPitch(placed, bench, opts = {}) {
  const { formation = '4-3-3', score = '', opponent = '' } = opts;

  const tokens = placed
    .map(
      (p) => `<button type="button" class="pitch-token" data-p="${p.i}" style="left:${p.x}%;top:${p.y}%">
        ${playerAvatarHtml(p.player, p.i, 40, '', 'pitch')}
        <span class="pitch-token__name">${esc((p.name || '').split(' ')[0])}</span>
        ${p.pts != null ? `<span class="pitch-token__pts${p.pts < 0 ? ' neg' : ''}">${p.pts > 0 ? '+' : ''}${p.pts}</span>` : ''}
      </button>`
    )
    .join('');

  const benchHtml = bench.length
    ? `<div class="pitch-bench">
        <span class="pitch-bench__lbl">Udskiftere</span>
        ${bench
          .map(
            (p) =>
              `<button type="button" class="pitch-bench__p" data-p="${p.i}">
                ${playerAvatarHtml(p.player, p.i, 32, '', 'pitch')}
                <span>${esc((p.name || '').split(' ')[0])}</span>
                ${p.pts != null ? `<em class="${p.pts < 0 ? 'neg' : ''}">${p.pts > 0 ? '+' : ''}${p.pts}</em>` : ''}
              </button>`
          )
          .join('')}
      </div>`
    : '';

  return `<div class="pitch-wrap">
    <div class="pitch-head">
      <span class="pitch-head__form">${esc(formation)}</span>
      ${opponent ? `<span class="pitch-head__opp">${esc(opponent)}</span>` : ''}
      ${score ? `<span class="pitch-head__score">${score}</span>` : ''}
    </div>
    <div class="pitch" role="img" aria-label="Fodboldbane">
      <div class="pitch__stripe pitch__stripe--1"></div>
      <div class="pitch__stripe pitch__stripe--2"></div>
      <div class="pitch__stripe pitch__stripe--3"></div>
      <div class="pitch__line pitch__line--outline"></div>
      <div class="pitch__line pitch__line--mid"></div>
      <div class="pitch__circle"></div>
      <div class="pitch__box pitch__box--top"></div>
      <div class="pitch__box pitch__box--bot"></div>
      <div class="pitch__box pitch__box--top-sm"></div>
      <div class="pitch__box pitch__box--bot-sm"></div>
      ${tokens}
    </div>
    ${benchHtml}
  </div>`;
}

/** Interaktiv bane til admin */
export function renderAdminPitch(match, players, esc) {
  const formation = match.lineup?.formation || '4-3-3';
  const slots = SLOT_POS[formation] || SLOT_POS['4-3-3'];
  const xi = match.lineup?.xi || [];
  const bench = match.lineup?.bench || [];

  const tokens = slots.map((slot, i) => {
    const pi = xi[i];
    const p = pi !== '' && pi != null ? players[pi] : null;
    const name = p ? esc((p.n || '').split(' ')[0]) : slot.label;
    const filled = p ? ' is-filled' : '';
    return `<button type="button" class="admin-pitch-slot${filled}" data-key="xi" data-idx="${i}" style="left:${slot.x}%;top:${slot.y}%">
      <span class="admin-pitch-slot__pos">${esc(slot.label)}</span>
      <span class="admin-pitch-slot__name">${name}</span>
    </button>`;
  }).join('');

  const benchHtml = Array.from({ length: BENCH_COUNT }, (_, i) => {
    const pi = bench[i];
    const p = pi !== '' && pi != null ? players[pi] : null;
    const name = p ? esc(p.n) : 'Bænk ' + (i + 1);
    const filled = p ? ' is-filled' : '';
    return `<button type="button" class="admin-pitch-bench${filled}" data-key="bench" data-idx="${i}">${name}</button>`;
  }).join('');

  return `<div class="admin-pitch-wrap">
    <div class="pitch pitch--admin" role="img" aria-label="Opstilling 4-3-3">
      <div class="pitch__stripe pitch__stripe--1"></div>
      <div class="pitch__stripe pitch__stripe--2"></div>
      <div class="pitch__stripe pitch__stripe--3"></div>
      <div class="pitch__line pitch__line--outline"></div>
      <div class="pitch__line pitch__line--mid"></div>
      <div class="pitch__circle"></div>
      <div class="pitch__box pitch__box--top"></div>
      <div class="pitch__box pitch__box--bot"></div>
      <div class="pitch__box pitch__box--top-sm"></div>
      <div class="pitch__box pitch__box--bot-sm"></div>
      ${tokens}
    </div>
    <div class="admin-pitch-bench-row">${benchHtml}</div>
  </div>`;
}
