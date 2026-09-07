/**
 * Illustrerede avatars fra bibliotek (player.photo) — ellers initialer med positionsfarve.
 */

import { ensureCoveredRoles, roleLabelsShort } from './player-roles.js';

const CREST = '/images/viktoria-logo.png';

/** Baggrund per position */
const POS_BG = {
  GK: '#ffedd5',
  DEF: '#fef08a',
  MID: '#bbf7d0',
  ATT: '#fecaca',
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function posKey(player) {
  return (player?.pos || 'MID').toUpperCase();
}

function initials(player) {
  return (player?.n || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * @param {'default'|'row'|'pitch'} variant — row = kompakt i pointliste
 */
export function playerAvatarHtml(player, index, size = 48, extraClass = '', variant = 'default') {
  const pos = posKey(player);
  const cls = `avatar avatar--${variant} avatar--${pos.toLowerCase()} ${extraClass}`.trim();
  const init = initials(player);
  const bg = POS_BG[pos] || POS_BG.MID;

  if (player?.photo) {
    return `<span class="${cls}" style="--sz:${size}px" data-pos="${pos}">
      <img src="${esc(player.photo)}" alt="" width="${size}" height="${size}" loading="lazy"
        onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
      <span class="avatar__init" style="display:none;background:${bg}">${init}</span>
    </span>`;
  }

  return `<span class="${cls}" style="--sz:${size}px" data-pos="${pos}">
    <span class="avatar__init" style="background:${bg}">${init}</span>
  </span>`;
}

export function playerHeroCard(player, index, { pts, label, meta } = {}) {
  ensureCoveredRoles(player);
  const roles = roleLabelsShort(player.profile?.coveredRoles);
  const posMeta = roles || posKey(player);
  const metaText = meta ?? `${pts ?? '–'} point · ${posMeta}`;
  return `<button type="button" class="leader" data-p="${index}">
    ${playerAvatarHtml(player, index, 56)}
    <span class="leader__body">
      <span class="leader__label">${esc(label || 'Fører stillingen')}</span>
      <span class="leader__name">${esc(player?.n || '')}</span>
      <span class="leader__meta">${esc(metaText)}</span>
    </span>
    ${pts != null ? `<span class="leader__pts">${pts}</span>` : ''}
  </button>`;
}

/** Én eller flere delte kategori-førere (fx tre på Joga Bonito). */
export function categoryLeadersCard(players, indices, { label, val, meta } = {}) {
  if (!indices?.length) return '';
  const multi = indices.length > 1;
  const names = indices.map((i) => (players[i]?.n || '').split(' ')[0]).filter(Boolean).join(' · ');
  const metaText = meta ?? (multi ? '' : `${val}`);

  if (!multi) {
    const i = indices[0];
    return playerHeroCard(players[i], i, { pts: val, label, meta: metaText });
  }

  const faces = indices
    .map(
      (i) => `<button type="button" class="leader__face" data-p="${i}" aria-label="${esc(players[i]?.n || '')}">
        ${playerAvatarHtml(players[i], i, 40, '', 'row')}
      </button>`
    )
    .join('');

  return `<div class="leader leader--tied">
    <div class="leader__avatars">${faces}</div>
    <span class="leader__body">
      <span class="leader__label">${esc(label || '')}</span>
      <span class="leader__name">${esc(names)}</span>
      ${metaText ? `<span class="leader__meta">${esc(metaText)}</span>` : ''}
    </span>
    <span class="leader__pts">${val}</span>
  </div>`;
}

export { CREST, POS_BG };
