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
      { id: 'CM', label: 'Central midtbane', short: 'CM' },
    ],
  },
  {
    id: 'ATT',
    label: 'Angreb',
    roles: [
      { id: 'LW', label: 'Venstrekant', short: 'VW' },
      { id: 'RW', label: 'Højrekant', short: 'HW' },
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
  LW: 'LW', VK: 'LW', VW: 'LW', VENSTREKANT: 'LW',
  RW: 'RW', HK: 'RW', HW: 'RW', HØJREKANT: 'RW',
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

export function roleLabelsShort(ids, { primaryOnly = false } = {}) {
  const norm = normalizeCoveredRoles(ids);
  const list = primaryOnly ? norm.slice(0, 1) : norm;
  return list.map((id) => ROLE_BY_ID[id]?.short || id).join(' · ');
}

export function roleLabelsLong(ids) {
  return normalizeCoveredRoles(ids)
    .map((id) => ROLE_BY_ID[id]?.label || id)
    .join(', ');
}

function priorityItemHtml(id, idx, total) {
  const role = ROLE_BY_ID[id];
  if (!role) return '';
  const up = idx > 0
    ? '<button type="button" class="role-priority__btn" data-act="up" aria-label="Højere prioritet">↑</button>'
    : '';
  const down = idx < total - 1
    ? '<button type="button" class="role-priority__btn" data-act="down" aria-label="Lavere prioritet">↓</button>'
    : '';
  return `<li class="role-priority__item" data-role="${id}">
    <span class="role-priority__rank">${idx + 1}</span>
    <span class="role-priority__name">${role.label}</span>
    <span class="role-priority__short">${role.short}</span>
    <span class="role-priority__acts">${up}${down}</span>
  </li>`;
}

function renderPriorityList(order) {
  if (!order.length) {
    return '<p class="role-priority__empty hint">Vælg positioner — øverst = naturlig/bedst</p>';
  }
  return `<ol class="role-priority__list">${order
    .map((id, i) => priorityItemHtml(id, i, order.length))
    .join('')}</ol>`;
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

  const groups = ROLE_GROUPS.map((g) => {
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
  }).join('');

  const order = normalizeCoveredRoles(selected);

  return `<div class="role-picker" data-role-order='${JSON.stringify(order)}'>
    ${groups}
    <div class="role-priority">
      <div class="role-priority__heading">Prioritet <span class="hint">(øverst = naturlig position)</span></div>
      ${renderPriorityList(order)}
    </div>
  </div>`;
}

function readOrderFromDom(container) {
  const raw = container?.dataset?.roleOrder;
  if (raw) {
    try {
      return normalizeCoveredRoles(JSON.parse(raw));
    } catch { /* fall through */ }
  }
  const list = container?.querySelector('.role-priority__list');
  if (list) {
    return [...list.querySelectorAll('[data-role]')].map((el) => el.dataset.role);
  }
  return [];
}

function writeOrderToDom(container, order) {
  if (container) container.dataset.roleOrder = JSON.stringify(order);
  const wrap = container?.querySelector('.role-priority');
  if (!wrap) return;
  wrap.innerHTML = `<div class="role-priority__heading">Prioritet <span class="hint">(øverst = naturlig position)</span></div>${renderPriorityList(order)}`;
}

export function bindRolePicker(container) {
  if (!container) return;

  let order = readOrderFromDom(container);

  function syncFromCheckboxes() {
    const checked = [...container.querySelectorAll('input[type="checkbox"]:checked')].map((el) => el.value);
    order = order.filter((id) => checked.includes(id));
    for (const id of checked) {
      if (!order.includes(id)) order.push(id);
    }
    writeOrderToDom(container, order);
    bindPriorityButtons();
  }

  function bindPriorityButtons() {
    container.querySelectorAll('.role-priority__btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const li = btn.closest('[data-role]');
        const id = li?.dataset.role;
        const act = btn.dataset.act;
        const idx = order.indexOf(id);
        if (idx < 0) return;
        if (act === 'up' && idx > 0) {
          order.splice(idx, 1);
          order.splice(idx - 1, 0, id);
        } else if (act === 'down' && idx < order.length - 1) {
          order.splice(idx, 1);
          order.splice(idx + 1, 0, id);
        }
        writeOrderToDom(container, order);
        bindPriorityButtons();
      });
    });
  }

  container.querySelectorAll('.role-check input').forEach((cb) => {
    cb.addEventListener('change', () => {
      cb.closest('.role-check')?.classList.toggle('is-on', cb.checked);
      syncFromCheckboxes();
    });
  });

  bindPriorityButtons();
}

export function readRolePicker(container) {
  if (!container) return [];
  const order = readOrderFromDom(container);
  const checked = [...container.querySelectorAll('input[type="checkbox"]:checked')].map((el) => el.value);
  if (container.querySelector('.role-priority')) {
    return order.filter((id) => checked.includes(id));
  }
  return checked;
}
