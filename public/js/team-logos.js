/** Klublogoer fra DBU pulje */

import { CREST } from './player-avatar.js';

function normOpp(s) {
  return String(s || '').toLowerCase().replace(/\./g, '').replace(/\s+/g, '').trim();
}

export function buildLogoMap(pool) {
  const map = {};
  (pool || []).forEach((t) => {
    if (t.name) map[normOpp(t.name)] = t.logo || null;
  });
  return map;
}

export function logoForOpponent(map, opponent) {
  return map[normOpp(opponent)] || null;
}

export function matchLogosHtml(map, dbuMatch) {
  const oppLogo = logoForOpponent(map, dbuMatch.opponent);
  const vLogo = logoForOpponent(map, 'Viktoria 2') || CREST;
  const home = dbuMatch.isHome
    ? { logo: vLogo, name: 'Viktoria' }
    : { logo: oppLogo, name: dbuMatch.opponent };
  const away = dbuMatch.isHome
    ? { logo: oppLogo, name: dbuMatch.opponent }
    : { logo: vLogo, name: 'Viktoria' };

  return `<div class="match-logos">
    <div class="match-logos__team">${home.logo ? `<img src="${home.logo}" alt="" loading="lazy"/>` : '<span class="match-logos__ph"></span>'}</div>
    <span class="match-logos__vs">–</span>
    <div class="match-logos__team">${away.logo ? `<img src="${away.logo}" alt="" loading="lazy"/>` : '<span class="match-logos__ph"></span>'}</div>
  </div>`;
}
