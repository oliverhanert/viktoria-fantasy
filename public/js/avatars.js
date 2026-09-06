/**
 * Spiller-avatars via DiceBear (gratis, ingen API-nøgle)
 * https://www.dicebear.com/
 *
 * Styles: lorelei, adventurer, avataaars, personas, micah, fun-emoji
 * Tilpas per spiller med player.avatarStyle
 */

const DICEBEAR = 'https://api.dicebear.com/9.x';
const DEFAULT_STYLE = 'lorelei';

const POS_COLORS = {
  GK: 'ffd700',
  DEF: '2d6a4f',
  MID: '1b3a8c',
  ATT: 'ff6b4a',
};

export function avatarUrl(player, index) {
  const style = player?.avatarStyle || DEFAULT_STYLE;
  const seed = encodeURIComponent(player?.avatarSeed || player?.n || `spiller-${index}`);
  const bg = player?.avatarBg || POS_COLORS[(player?.pos || 'MID').toUpperCase()] || '1b3a8c';
  return `${DICEBEAR}/${style}/svg?seed=${seed}&backgroundColor=${bg}&radius=50&size=128`;
}

export function avatarImg(player, index, size = 64, className = '') {
  const url = avatarUrl(player, index);
  const name = player?.n || 'Spiller';
  return `<img class="av ${className}" src="${url}" width="${size}" height="${size}" alt="" loading="lazy" decoding="async" />`;
}

/** FUT-style player card */
export function playerCard(player, index, stats = {}) {
  const pos = (player?.pos || 'MID').toUpperCase();
  const rating = stats.pts ?? stats.rating ?? '–';
  const name = player?.n || '?';

  return `<article class="fut-card fut-${pos.toLowerCase()}" data-p="${index}">
    <div class="fut-card__shine"></div>
    <div class="fut-card__rating">${rating}</div>
    <div class="fut-card__pos">${pos}</div>
    ${avatarImg(player, index, 80, 'fut-card__face')}
    <div class="fut-card__name">${esc(name)}</div>
    ${stats.sub ? `<div class="fut-card__sub">${stats.sub}</div>` : ''}
  </article>`;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

export const AVATAR_TOOLS_NOTE = `
DiceBear bruges nu (gratis CDN). Alternativer hvis I vil gå videre:
• Upload egne fotos → sæt player.photo URL i data
• Ready Player Me → 3D-avatars (kræver integration)
• AI-genererede portrætter → Midjourney/DALL-E engangsjob
`;
