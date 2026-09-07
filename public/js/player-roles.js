/** 4-3-3 positions — shared admin + frontend */

export const GK_ROLE = { id: 'GK', label: 'Målmand', short: 'GK' };

export const ROLE_GROUPS = [
  {
    id: 'DEF',
    label: 'Forsvar',
    roles: [
      { id: 'RB', label: 'Højreback', short: 'HB' },
      { id: 'CB', label: 'Centerback', short: 'CB' },
      { id: 'LB', label: 'Venstreback', short: 'VB' },
    ],
  },
  {
    id: 'MID',
    label: 'Midtbane',
    roles: [
      { id: 'CDM', label: "6'er (CDM)", short: '6' },
      { id: 'CM', label: "8'er / 10'er", short: '8/10' },
    ],
  },
  {
    id: 'ATT',
    label: 'Angreb',
    roles: [
      { id: 'LW', label: 'Venstrekant', short: 'VK' },
      { id: 'RW', label: 'Højrekant', short: 'HK' },
      { id: 'ST', label: 'Angriber', short: 'ST' },
    ],
  },
];

export const ALL_ROLES = [
  GK_ROLE,
  ...ROLE_GROUPS.flatMap((g) => g.roles),
];

export const ROLE_BY_ID = Object.fromEntries(ALL_ROLES.map((r) => [r.id, r]));

const LEGACY_MAP = {
  GK: 'GK', MÅLMAND: 'GK',
  HB: 'RB', HØJREBACK: 'RB', RB: 'RB', RIGHT: 'RB',
  CB: 'CB', CENTERBACK: 'CB',
  VB: 'LB', VENSTREBACK: 'LB', LB: 'LB', LEFT: 'LB',
  CDM: 'CDM', '6': 'CDM', "6'ER": 'CDM', DM: 'CDM',
  CM: 'CM', '8': 'CM', '10': 'CM', "8'ER": 'CM', "10'ER": 'CM',
  LW: 'LW', VK: 'LW', VENSTREKANT: 'LW',
  RW: 'RW', HK: 'RW', HØJREKANT: 'RW',
  ST: 'ST', ANGRIBER: 'ST', CF: 'ST',
};

export function normalizeRoleId(raw) {
  if (!raw) return null;
  const key = String(raw).trim().toUpperCase().replace(/\./g, '');
  return LEGACY_MAP[key] || (ROLE_BY_ID[key] ? key : null);
}

export function normalizeCoveredRoles(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const r of list) {
    const id = normalizeRoleId(r);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

export function migrateCoveredRoles(player) {
  const roles = new Set();
  const pr = player?.profile || {};

  for (const r of pr.roles || []) {
    const id = normalizeRoleId(r);
    if (id) roles.add(id);
  }

  if (Array.isArray(pr.coveredRoles)) {
    for (const r of pr.coveredRoles) {
      const id = normalizeRoleId(r);
      if (id) roles.add(id);
    }
  }

  if (player?.pos === 'GK') roles.add('GK');

  return [...roles];
}

export function ensureCoveredRoles(player) {
  if (!player.profile) player.profile = {};
  if (!Array.isArray(player.profile.coveredRoles) || !player.profile.coveredRoles.length) {
    player.profile.coveredRoles = migrateCoveredRoles(player);
  } else {
    player.profile.coveredRoles = normalizeCoveredRoles(player.profile.coveredRoles);
  }
  if (player.pos === 'GK' && !player.profile.coveredRoles.includes('GK')) {
    player.profile.coveredRoles = ['GK', ...player.profile.coveredRoles];
  }
  return player.profile.coveredRoles;
}

export function roleLabelsShort(ids) {
  return normalizeCoveredRoles(ids)
    .map((id) => ROLE_BY_ID[id]?.short || id)
    .join(' · ');
}

export function roleLabelsLong(ids) {
  return normalizeCoveredRoles(ids)
    .map((id) => ROLE_BY_ID[id]?.label || id)
    .join(', ');
}

export function renderRolePickerHtml(selected = [], primaryPos = 'MID') {
  if (primaryPos === 'GK') {
    const on = selected.includes('GK');
    return `<div class="role-picker">
      <label class="role-check${on ? ' is-on' : ''}">
        <input type="checkbox" value="GK" ${on ? 'checked' : ''}> ${GK_ROLE.label}
      </label>
    </div>`;
  }

  return `<div class="role-picker">${ROLE_GROUPS.map((g) => {
    const rows = g.roles.map((r) => {
      const on = selected.includes(r.id);
      const highlight = g.id === primaryPos ? ' role-check--primary' : '';
      return `<label class="role-check${on ? ' is-on' : ''}${highlight}">
        <input type="checkbox" value="${r.id}" ${on ? 'checked' : ''}>
        <span class="role-check__lbl">${r.label}</span>
        <span class="role-check__short">${r.short}</span>
      </label>`;
    }).join('');
    return `<div class="role-picker__group" data-group="${g.id}">
      <div class="role-picker__heading">${g.label}</div>
      <div class="role-picker__opts">${rows}</div>
    </div>`;
  }).join('')}</div>`;
}

export function readRolePicker(container) {
  if (!container) return [];
  return [...container.querySelectorAll('input[type="checkbox"]:checked')].map((el) => el.value);
}
