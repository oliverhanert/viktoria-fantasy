/**
 * BK Viktoria kit-avatars — chibi spillere i klubtrøje (Holdet/FPL-inspireret)
 * Ingen ekstern API. Tilpas: player.number, player.skin, player.hair
 */

const SKINS = ['#FFDBAC', '#F1C27D', '#E0AC69', '#C68642', '#8D5524', '#FFE0BD'];
const HAIRS = ['#1a1a1a', '#3d2314', '#6b4423', '#8b6914', '#5c3d2e', '#d4a574'];

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return Math.abs(h);
}

function traits(player, index) {
  const key = player?.n || String(index);
  const h = hash(key);
  return {
    skin: player?.skin || SKINS[h % SKINS.length],
    hair: player?.hair || HAIRS[(h >> 3) % HAIRS.length],
    number: player?.number ?? (h % 99) + 1,
  };
}

const KIT = {
  shirt: '#1f8a4c',
  shirtDark: '#156b3a',
  shorts: '#ffffff',
  socks: '#1f8a4c',
  trim: '#ffffff',
  gk: { shirt: '#ffd700', shirtDark: '#c9a227', shorts: '#1a1a1a', socks: '#ffd700' },
};

export function kitAvatarSvg(player, index, size = 80) {
  const pos = (player?.pos || 'MID').toUpperCase();
  const isGk = pos === 'GK';
  const k = isGk ? KIT.gk : KIT;
  const t = traits(player, index);
  const hairStyle = hash(player?.n || index) % 3;

  let hair = '';
  if (hairStyle === 0) {
    hair = `<ellipse cx="40" cy="22" rx="18" ry="14" fill="${t.hair}"/>`;
  } else if (hairStyle === 1) {
    hair = `<path d="M22 28 Q40 8 58 28 L58 34 Q40 20 22 34 Z" fill="${t.hair}"/>`;
  } else {
    hair = `<rect x="24" y="14" width="32" height="14" rx="5" fill="${t.hair}"/><rect x="20" y="24" width="8" height="10" rx="3" fill="${t.hair}"/><rect x="52" y="24" width="8" height="10" rx="3" fill="${t.hair}"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100" width="${size}" height="${Math.round(size * 1.25)}" class="kit-av-svg" aria-hidden="true">
    <defs>
      <linearGradient id="shirt-${index}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${k.shirt}"/>
        <stop offset="100%" stop-color="${k.shirtDark}"/>
      </linearGradient>
    </defs>
    <!-- skygge -->
    <ellipse cx="40" cy="96" rx="22" ry="4" fill="rgba(0,0,0,0.2)"/>
    <!-- ben -->
    <rect x="30" y="72" width="8" height="18" rx="3" fill="${t.skin}"/>
    <rect x="42" y="72" width="8" height="18" rx="3" fill="${t.skin}"/>
    <!-- shorts -->
    <path d="M26 58 L54 58 L52 74 L28 74 Z" fill="${k.shorts}" stroke="${KIT.trim}" stroke-width="0.5"/>
    <!-- sokker -->
    <rect x="30" y="84" width="8" height="8" rx="1" fill="${k.socks}"/>
    <rect x="42" y="84" width="8" height="8" rx="1" fill="${k.socks}"/>
    <!-- trøje -->
    <path d="M24 38 L56 38 L58 58 L22 58 Z" fill="url(#shirt-${index})"/>
    <path d="M24 38 L18 48 L24 52" fill="url(#shirt-${index})"/>
    <path d="M56 38 L62 48 L56 52" fill="url(#shirt-${index})"/>
    <rect x="34" y="42" width="12" height="2" fill="${KIT.trim}" opacity="0.7"/>
    <!-- nummer -->
    <text x="40" y="52" text-anchor="middle" fill="${isGk ? '#1a1a1a' : '#fff'}" font-size="11" font-weight="800" font-family="system-ui,sans-serif">${t.number}</text>
    <!-- hals/hoved -->
    <rect x="36" y="32" width="8" height="8" fill="${t.skin}"/>
    <ellipse cx="40" cy="28" rx="14" ry="16" fill="${t.skin}"/>
    ${hair}
    <!-- ansigt -->
    <circle cx="34" cy="28" r="2" fill="#2d2d2d"/>
    <circle cx="46" cy="28" r="2" fill="#2d2d2d"/>
    <path d="M36 34 Q40 37 44 34" stroke="#8b6914" stroke-width="1" fill="none" stroke-linecap="round"/>
    <!-- crest mini -->
    <circle cx="40" cy="44" r="4" fill="${KIT.trim}" opacity="0.9"/>
  </svg>`;
}

export function kitAvatarHtml(player, index, size = 80, extraClass = '') {
  return `<span class="kit-av ${extraClass}" style="--av-size:${size}px">${kitAvatarSvg(player, index, size)}</span>`;
}

/** Floating kit card — Drafthound-inspireret */
export function kitHeroCard(player, index, stats = {}) {
  const pos = (player?.pos || 'MID').toUpperCase();
  const pts = stats.pts ?? '–';
  const label = stats.label || '';
  return `<article class="kit-hero" data-p="${index}">
    <div class="kit-hero__glow"></div>
    <div class="kit-hero__shirt">${kitAvatarSvg(player, index, 120)}</div>
    <div class="kit-hero__meta">
      <span class="kit-hero__pts">${pts}</span>
      <span class="kit-hero__pos">${pos}</span>
      <span class="kit-hero__name">${esc(player?.n || '?')}</span>
      ${label ? `<span class="kit-hero__lbl">${label}</span>` : ''}
    </div>
  </article>`;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
