/**
 * Illustrerede avatars fra bibliotek (player.photo) — ellers initialer med positionsfarve.
 */

import { ensureCoveredRoles, roleLabelsShort } from './player-roles.js';

const CREST = 'https://file.dbu.dk/images/club/1592/Boldklubben_Viktoria.png';

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

export function playerHeroCard(player, index, { pts } = {}) {
  ensureCoveredRoles(player);
  const roles = roleLabelsShort(player.profile?.coveredRoles);
  const posLine = roles
    ? `${pts ?? '–'} pt · ${roles}`
    : `${pts ?? '–'} pt · ${posKey(player)}`;
  return `<div class="leader-pill">
    ${playerAvatarHtml(player, index, 52)}
    <div class="leader-pill__info">
      <span class="leader-pill__name">${esc(player?.n || '')}</span>
      <span class="leader-pill__pts">${esc(posLine)}</span>
    </div>
  </div>`;
}

export { CREST, POS_BG };
