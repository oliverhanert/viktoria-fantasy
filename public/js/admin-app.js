import { initSupabase, getSupabase, authHeaders } from './supabase-client.js';
import { playerAvatarHtml } from './player-avatar.js';
import { renderAdminPitch, BENCH_COUNT } from './pitch.js';
import { pomIndices } from './fantasy-engine.js';
import {
  ensureSquad as mergeSquad,
  resetSquadMerge,
  totalActiveSessions,
  playerTrainingAttended,
  playerTrainingPct,
  sessionByDate,
  formatDateLong,
  calendarCells,
  isTrainingDay,
  MONTHS_DA,
  DAYS_DA,
  periodCalendarBounds,
  defaultCalendarMonthForPeriod,
  normalizeAttendance,
  toggleAttendance,
  periodIdForDate,
  periodLabel,
  seasonNavButtonLabel,
  listPeriodIds,
  isDateInPeriod,
  matchDateIso,
  comparePeriodIds,
  sessionsForPeriod,
  filterMatchesByPeriod,
} from './admin-squad.js';
import {
  ensureCoveredRoles,
  roleLabelsShort,
  renderRolePickerHtml,
  readRolePicker,
  bindRolePicker,
} from './player-roles.js';
import { buildLogoMap, logoForOpponent } from './team-logos.js';

const TOKEN_KEY = 'vf_admin_token';
const LIVE_URL = '/standings.html';

const DEFAULT_RULES = {
  bestOf: 6, win: 8, margin_per_goal: 1, draw: 4, loss: -1,
  goal: { GK: 40, DEF: 30, MID: 25, ATT: 20 },
  assist: { GK: 20, DEF: 16, MID: 16, ATT: 16 },
  clean_sheet: { GK: 25, DEF: 20, MID: 10, ATT: 0 },
  conceded_per_goal: { GK: -2, DEF: -2, MID: -1, ATT: 0 },
  yellow: -10, red: -30, vote: 2, motm: 5, joga: 3,
};

const POS_LABEL = { GK: 'Målmand', DEF: 'Forsvar', MID: 'Midtbane', ATT: 'Angreb' };

const DEFAULT_PROFILE = {
  benchedAvailable: 0,
  coveredRoles: [],
  notes: '',
};

const PERIOD_STORAGE_KEY = 'vf-admin-period';

const POS_ORDER = { GK: 0, DEF: 1, MID: 2, ATT: 3 };

let profileSort = 'pos';
let playerHighlightTimer = null;
let selectedPeriod = periodIdForDate();
let authBooted = false;

let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth() + 1;
let calBounds = null;
let selectedTrainingDate = null;
let slotPickerTarget = null;

let state = null;
let matchIdx = 0;
let supabase = null;
let useSupabase = false;
let localToken = localStorage.getItem(TOKEN_KEY);
let isDirty = false;
let avatarLibrary = [];
let modalEditIndex = null;
let modalSelectedAvatar = '';
let modalPendingFile = null;
let modalPreviewUrl = '';
const pendingUploads = new Map();
let dbuLogoMap = {};

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function playerKey(p, i) {
  return p.id || p._localId || `idx-${i}`;
}

function markDirty() {
  isDirty = true;
  $('btn-save')?.classList.add('is-dirty');
}

function markClean() {
  isDirty = false;
  $('btn-save')?.classList.remove('is-dirty');
}

function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { t.hidden = true; }, 2800);
}

function setSaveStatus(msg, type = '') {
  const el = $('save-status');
  if (!msg) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.textContent = msg;
  el.className = `status${type ? ` ${type}` : ''}`;
}

const PAGE_TABS = { players: 'tab-players', match: 'tab-match', profile: 'tab-profile' };
const ADMIN_TITLES = { match: 'Kampe', players: 'Spillere', profile: 'Holdinfo' };

function gotoTab(tab) {
  if (!PAGE_TABS[tab]) return;
  document.querySelectorAll('[data-tab]').forEach((el) => {
    const on = el.dataset.tab === tab;
    el.classList.toggle('is-on', on);
    if (el.getAttribute('role') === 'tab') el.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.view').forEach((el) => el.classList.remove('is-on'));
  $(PAGE_TABS[tab])?.classList.add('is-on');
  const title = $('page-title');
  if (title) title.textContent = ADMIN_TITLES[tab] || '';
}

function setupAdminNav() {
  if (document.body.dataset.adminNavBound) return;
  document.body.dataset.adminNavBound = '1';
  document.querySelectorAll('[data-tab]').forEach((el) => {
    el.addEventListener('click', () => gotoTab(el.dataset.tab));
  });
}
setupAdminNav();

async function ensureCoach(accessToken) {
  const r = await fetch('/api/ensure-coach', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const j = await parseJson(r);
  if (!r.ok) throw new Error(j.error || 'Kunne ikke godkende træner');
  return j;
}

async function completeSupabaseAuth(session) {
  if (!session?.access_token) {
    throw new Error('Konto oprettet — tjek din email for bekræftelse, eller slå "Confirm email" fra i Supabase.');
  }
  await ensureCoach(session.access_token);
}

async function parseJson(r) {
  const text = await r.text();
  try { return text ? JSON.parse(text) : {}; }
  catch { throw new Error(r.ok ? 'Ugyldigt svar' : 'Start serveren med: npm run dev'); }
}

async function getHeaders() {
  if (useSupabase) return authHeaders();
  return localToken
    ? { Authorization: `Bearer ${localToken}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

function showApp() {
  $('auth-loading').hidden = true;
  $('login-view').hidden = true;
  $('app-view').hidden = false;
}
function showLogin() {
  $('auth-loading').hidden = true;
  $('login-view').hidden = false;
  $('app-view').hidden = true;
}
function showAuthLoading() {
  $('auth-loading').hidden = false;
  $('login-view').hidden = true;
  $('app-view').hidden = true;
}

async function checkApi() {
  const banner = $('api-banner');
  try {
    const r = await fetch('/api/season', { cache: 'no-store' });
    if (r.status === 404 || r.ok) { banner.hidden = true; return true; }
    throw new Error();
  } catch {
    banner.innerHTML = 'Serveren kører ikke. Åbn terminal og kør:<code>npm run dev</code>';
    banner.hidden = false;
    return false;
  }
}

async function loadDefaultSeason() {
  try {
    const r = await fetch('/api/season');
    if (r.ok) return (await r.json()).data;
  } catch { /* ignore */ }
  return (await fetch('/data/sample-season.json')).json();
}

async function loadAvatarLibrary() {
  try {
    const r = await fetch('/api/avatar-library');
    if (r.ok) avatarLibrary = (await r.json()).avatars || [];
  } catch {
    avatarLibrary = [];
  }
  renderAvatarLibraryGrid($('avatar-library-grid'));
}

function renderAvatarPickerGrid(container, selected, onPick, { deletable = false } = {}) {
  if (!container) return;
  if (!avatarLibrary.length) {
    container.innerHTML = '<p class="hint">Ingen avatars endnu — upload ovenfor.</p>';
    return;
  }
  container.innerHTML = avatarLibrary.map((url) =>
    `<div class="avatar-pick-wrap${deletable ? ' avatar-pick-wrap--lib' : ''}">
      <button type="button" class="avatar-pick${url === selected ? ' is-on' : ''}" data-url="${esc(url)}" title="Vælg avatar">
        <img src="${esc(url)}" alt="">
      </button>
      ${deletable ? `<button type="button" class="avatar-del" data-del-url="${esc(url)}" title="Slet">×</button>` : ''}
    </div>`
  ).join('');

  container.querySelectorAll('.avatar-pick').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.avatar-pick').forEach((b) => b.classList.remove('is-on'));
      btn.classList.add('is-on');
      onPick(btn.dataset.url);
    });
  });

  if (deletable) {
    container.querySelectorAll('.avatar-del').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Slet denne avatar?')) return;
        try {
          const headers = await getHeaders();
          const r = await fetch('/api/avatar-library', {
            method: 'DELETE',
            headers,
            body: JSON.stringify({ url: btn.dataset.delUrl }),
          });
          const j = await parseJson(r);
          if (!r.ok) throw new Error(j.error || 'Kunne ikke slette');
          avatarLibrary = avatarLibrary.filter((a) => a !== btn.dataset.delUrl);
          renderAvatarLibraryGrid($('avatar-library-grid'));
          showToast('Avatar slettet');
        } catch (err) {
          showToast(err.message);
        }
      });
    });
  }
}

function renderAvatarLibraryGrid(container) {
  renderAvatarPickerGrid(container, null, () => {}, { deletable: true });
}

async function uploadToLibrary(file) {
  if (!file?.type?.startsWith('image/')) {
    showToast('Vælg et billede (svg/png/jpg)');
    return null;
  }
  const name = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  if (useSupabase) {
    const bucket = getSupabase().storage.from('avatars');
    const path = `library/${name}`;
    const { error } = await bucket.upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw new Error(error.message);
    const { data } = bucket.getPublicUrl(path);
    return data.publicUrl;
  }
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

$('avatar-lib-upload')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const url = await uploadToLibrary(file);
    if (url) {
      avatarLibrary.unshift(url);
      renderAvatarLibraryGrid($('avatar-library-grid'));
      showToast('Avatar tilføjet til bibliotek');
    }
  } catch (err) {
    showToast(err.message);
  }
});

// ——— Auth ———

function showAuthTab(tab) {
  $('login-panel').hidden = tab !== 'login';
  $('signup-panel').hidden = tab !== 'signup';
  document.querySelectorAll('[data-auth-tab]').forEach((b) => {
    b.classList.toggle('is-on', b.dataset.authTab === tab);
  });
}
document.querySelectorAll('[data-auth-tab]').forEach((btn) => {
  btn.addEventListener('click', () => showAuthTab(btn.dataset.authTab));
});

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  $('login-err').hidden = true;
  btn.disabled = true;
  const prev = btn.textContent;
  btn.textContent = 'Logger ind…';
  try {
    if (useSupabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: $('login-email').value.trim(),
        password: $('login-pw').value,
      });
      if (error) {
        if (/invalid|credentials/i.test(error.message)) {
          throw new Error('Forkert email eller adgangskode. Har du oprettet konto? Prøv "Opret konto".');
        }
        throw error;
      }
      await completeSupabaseAuth(data.session);
      showApp();
      await init();
    } else {
      const r = await fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: $('login-pw').value }),
      });
      const j = await parseJson(r);
      if (!r.ok) throw new Error(j.error || 'Forkert adgangskode');
      localToken = j.token;
      localStorage.setItem(TOKEN_KEY, localToken);
      showApp();
      await init();
    }
  } catch (err) {
    $('login-err').textContent = err.message;
    $('login-err').hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
});

$('signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!useSupabase) return;
  const btn = e.target.querySelector('button[type="submit"]');
  $('signup-err').hidden = true;
  btn.disabled = true;
  btn.textContent = 'Opretter…';
  try {
    const { data, error } = await supabase.auth.signUp({
      email: $('signup-email').value.trim(),
      password: $('signup-pw').value,
      options: { data: { name: $('signup-name').value.trim() } },
    });
    if (error) {
      if (/already registered|already exists/i.test(error.message)) {
        throw new Error('Email er allerede registreret — brug "Log ind" i stedet.');
      }
      throw error;
    }
    if (data.session) {
      await completeSupabaseAuth(data.session);
      showApp();
      await init();
    } else {
      throw new Error('Konto oprettet! Tjek din email for bekræftelseslink — eller slå "Confirm email" fra i Supabase og prøv igen.');
    }
  } catch (err) {
    $('signup-err').textContent = err.message;
    $('signup-err').hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Opret konto';
  }
});

$('btn-logout').addEventListener('click', async () => {
  if (useSupabase) await supabase.auth.signOut();
  localToken = null;
  localStorage.removeItem(TOKEN_KEY);
  showLogin();
});

function sortedPlayerIndices(players = state?.players || []) {
  return players.map((_, i) => i).sort((a, b) => {
    const pa = players[a];
    const pb = players[b];
    const d = (POS_ORDER[pa.pos] ?? 9) - (POS_ORDER[pb.pos] ?? 9);
    return d || pa.n.localeCompare(pb.n, 'da');
  });
}

// ——— Spillere ———

function previewHtml(p, i, size = 48) {
  const preview = { ...p };
  const key = playerKey(p, i);
  if (pendingUploads.has(key)) preview.photo = pendingUploads.get(key).previewUrl;
  return playerAvatarHtml(preview, i, size);
}

function clearModalPending() {
  if (modalPreviewUrl) URL.revokeObjectURL(modalPreviewUrl);
  modalPreviewUrl = '';
  modalPendingFile = null;
}

function renderModalRolePicker(pos, selected = []) {
  const el = $('modal-roles');
  if (!el) return;
  el.innerHTML = renderRolePickerHtml(selected, pos);
  bindRolePicker(el);
}

function openPlayerModal(editIndex = null) {
  modalEditIndex = editIndex;
  const isEdit = editIndex !== null;
  $('player-modal-title').textContent = isEdit ? 'Rediger spiller' : 'Ny spiller';

  const p = isEdit ? state.players[editIndex] : { n: '', pos: 'MID' };
  $('modal-name').value = p.n || '';
  $('modal-pos').value = p.pos || 'MID';
  ensureProfile(p);
  renderModalRolePicker(p.pos || 'MID', p.profile.coveredRoles || []);
  modalSelectedAvatar = p.photo || avatarLibrary[0] || '';
  clearModalPending();

  renderAvatarPickerGrid($('modal-avatar-picker'), modalSelectedAvatar, (url) => {
    modalSelectedAvatar = url;
    clearModalPending();
  });

  $('player-modal').hidden = false;
  $('modal-name').focus();
}

$('modal-pos')?.addEventListener('change', (e) => {
  const pos = e.target.value;
  const selected = readRolePicker($('modal-roles'));
  renderModalRolePicker(pos, selected);
});

function closePlayerModal() {
  $('player-modal').hidden = true;
  clearModalPending();
  modalEditIndex = null;
}

document.querySelectorAll('[data-close-modal]').forEach((el) => {
  el.addEventListener('click', closePlayerModal);
});

$('modal-avatar-upload')?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  clearModalPending();
  modalPendingFile = file;
  modalPreviewUrl = URL.createObjectURL(file);
  modalSelectedAvatar = modalPreviewUrl;
  $('modal-avatar-picker').querySelectorAll('.avatar-pick').forEach((b) => b.classList.remove('is-on'));
  showToast('Egen avatar valgt — gem spiller for at bruge den');
});

$('modal-save')?.addEventListener('click', async () => {
  const name = $('modal-name').value.trim() || 'Ny spiller';
  const pos = $('modal-pos').value;
  let photo = modalSelectedAvatar;

  if (modalPendingFile) {
    if (useSupabase) {
      try {
        photo = await uploadToLibrary(modalPendingFile);
        if (photo && !avatarLibrary.includes(photo)) avatarLibrary.unshift(photo);
      } catch (err) {
        showToast(err.message);
        return;
      }
    } else {
      photo = modalPreviewUrl;
    }
  }

  const coveredRoles = readRolePicker($('modal-roles'));

  let savedIndex;
  const isEdit = modalEditIndex !== null;

  if (isEdit) {
    savedIndex = modalEditIndex;
    const p = state.players[modalEditIndex];
    p.n = name;
    p.pos = pos;
    if (photo) p.photo = photo;
    ensureProfile(p);
    p.profile.coveredRoles = pos === 'GK' ? ['GK'] : coveredRoles;
    if (!p._localId && !p.id) p._localId = crypto.randomUUID();
  } else {
    state.players.push({
      n: name,
      pos,
      photo: photo || undefined,
      profile: { benchedAvailable: 0, coveredRoles: pos === 'GK' ? ['GK'] : coveredRoles, notes: '' },
      _localId: crypto.randomUUID(),
    });
    savedIndex = state.players.length - 1;
  }

  markDirty();
  closePlayerModal();
  showToast(isEdit ? `${name} er opdateret` : `${name} er tilføjet`);
  if (!isEdit) gotoTab('players');
  renderPlayers(savedIndex);
  renderMatchUI();
  renderAvatarLibraryGrid($('avatar-library-grid'));
  renderProfileList();
});

async function uploadPendingPhotos() {
  if (!useSupabase || !pendingUploads.size) return;
  const bucket = getSupabase().storage.from('avatars');
  for (const [key, item] of pendingUploads) {
    const ext = item.file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `players/${key}.${ext}`;
    const { error } = await bucket.upload(path, item.file, { upsert: true, contentType: item.file.type });
    if (error) throw new Error(`Billede fejlede: ${error.message}`);
    const { data } = bucket.getPublicUrl(path);
    const idx = state.players.findIndex((p, i) => playerKey(p, i) === key);
    if (idx >= 0) state.players[idx].photo = data.publicUrl;
    URL.revokeObjectURL(item.previewUrl);
  }
  pendingUploads.clear();
}

function renderPlayers(highlightIndex = null) {
  const list = $('players-list');
  if (!list) return;
  const indices = sortedPlayerIndices();

  list.innerHTML = indices.length
    ? indices.map((i) => {
      const p = state.players[i];
      const hl = i === highlightIndex ? ' player-row--highlight' : '';
      return `<div class="player-row${hl}" data-i="${i}">
        ${previewHtml(p, i, 44)}
        <div class="player-row__info">
          <span class="player-row__name">${esc(p.n)}</span>
          <span class="player-row__pos">${esc(POS_LABEL[p.pos] || p.pos)}${(() => { ensureProfile(p); const r = roleLabelsShort(p.profile.coveredRoles); return r ? ` · ${esc(r)}` : ''; })()}</span>
        </div>
        <button type="button" class="btn" data-edit="${i}">Rediger</button>
        <button type="button" class="btn-del" data-del="${i}" title="Fjern spiller">×</button>
      </div>`;
    }).join('')
    : '<p class="hint" style="padding:16px">Ingen spillere endnu. Klik + Spiller.</p>';

  list.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openPlayerModal(+btn.dataset.edit));
  });

  list.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!confirm('Fjern spilleren?')) return;
      state.players.splice(+btn.dataset.del, 1);
      markDirty();
      renderPlayers();
      renderMatchUI();
      renderProfileList();
    });
  });

  if (highlightIndex != null) {
    clearTimeout(playerHighlightTimer);
    requestAnimationFrame(() => {
      list.querySelector(`[data-i="${highlightIndex}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    playerHighlightTimer = setTimeout(() => {
      list.querySelector('.player-row--highlight')?.classList.remove('player-row--highlight');
    }, 2400);
  }
}

$('btn-add-player').addEventListener('click', () => openPlayerModal(null));

// ——— Kampe ———

function isPom(match, i) {
  return pomIndices(match).includes(i);
}

function setPom(match, indices) {
  const uniq = [...new Set(indices.map((x) => +x).filter((x) => !Number.isNaN(x)))];
  match.pom = uniq.length === 0 ? undefined : uniq.length === 1 ? uniq[0] : uniq;
}

function formatDateLabel(d) {
  if (!d) return 'Ingen dato';
  const dt = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T12:00:00') : new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  const months = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  return `${dt.getDate()}. ${months[dt.getMonth()]} ${dt.getFullYear()}`;
}

function daDateToIso(da) {
  if (!da) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(da)) return da;
  const months = { jan: '01', feb: '02', mar: '03', apr: '04', maj: '05', jun: '06', jul: '07', aug: '08', sep: '09', okt: '10', nov: '11', dec: '12' };
  const m = String(da).match(/(\d{1,2})\.\s*(\w+)\s*(\d{4})/i);
  if (!m) return '';
  const mon = months[m[2].toLowerCase().slice(0, 3)];
  if (!mon) return '';
  return `${m[3]}-${mon}-${String(m[1]).padStart(2, '0')}`;
}

function ensureProfile(p) {
  if (!p.profile) p.profile = { ...DEFAULT_PROFILE, coveredRoles: [] };
  ensureCoveredRoles(p);
  if (p.profile.trainings != null) delete p.profile.trainings;
  if (p.profile.width != null) delete p.profile.width;
  if (p.profile.roles != null) delete p.profile.roles;
  if (p.profile.bestRole != null) delete p.profile.bestRole;
  return p.profile;
}

function ensureSquad() {
  mergeSquad(state);
  return state.squad;
}

function closeSlotPicker() {
  slotPickerTarget = null;
  const el = $('slot-picker');
  if (el) el.hidden = true;
}

function isHistoryView() {
  return selectedPeriod !== periodIdForDate();
}

function applyViewMode() {
  const hist = isHistoryView();
  const banner = $('history-banner');
  if (banner) banner.hidden = !hist;
  const gotoBtn = $('period-goto-current');
  if (gotoBtn) gotoBtn.hidden = !hist;
  $('btn-save')?.toggleAttribute('disabled', hist);
  $('btn-add-player')?.toggleAttribute('disabled', hist);
  $('btn-add-match')?.toggleAttribute('disabled', hist);
  $('btn-dbu-import')?.toggleAttribute('disabled', hist);
  $('dbu-sync-bar')?.classList.toggle('is-disabled', hist);
}

function periodMatchIndices() {
  const cur = periodIdForDate();
  return (state.matches || [])
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => {
      const iso = matchDateIso(m.d);
      if (!iso) return selectedPeriod === cur;
      return isDateInPeriod(iso, selectedPeriod);
    })
    .map(({ i }) => i);
}

function updateAdminSeasonNav(periods) {
  const sel = $('period-select');
  const bar = $('period-bar');
  if (sel) sel.value = selectedPeriod;
  if (bar) bar.hidden = periods.length <= 1;
}

function renderPeriodNav() {
  const sel = $('period-select');
  if (!sel) return;
  const squad = ensureSquad();
  const current = periodIdForDate();
  const periods = listPeriodIds(squad, state.matches, current);
  if (!periods.includes(selectedPeriod)) selectedPeriod = current;
  sel.innerHTML = periods.map((id) =>
    `<option value="${id}" title="${periodLabel(id)}"${id === selectedPeriod ? ' selected' : ''}>${seasonNavButtonLabel(id)}</option>`
  ).join('');
  updateAdminSeasonNav(periods);
  applyViewMode();
}

function onPeriodChange(periodId) {
  selectedPeriod = periodId;
  localStorage.setItem(PERIOD_STORAGE_KEY, periodId);
  calBounds = periodCalendarBounds(periodId);
  const def = defaultCalendarMonthForPeriod(periodId);
  calYear = def.year;
  calMonth = def.month;
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  selectedTrainingDate = isTrainingDay(ensureSquad(), todayIso, periodId) ? todayIso : null;
  const pmi = periodMatchIndices();
  if (pmi.length) {
    if (!pmi.includes(matchIdx)) matchIdx = pmi[pmi.length - 1];
  }
  renderPeriodNav();
  renderPlayers();
  renderMatchUI();
  renderProfileList();
}

function playerMatchesPlayed(pi, periodId = null) {
  const pid = periodId || selectedPeriod;
  const cur = periodIdForDate();
  return (state.matches || []).filter((m) => {
    if (m.pl?.[pi] == null) return false;
    const iso = matchDateIso(m.d);
    if (!iso) return pid === cur;
    return isDateInPeriod(iso, pid);
  }).length;
}

function deleteMatch(idx) {
  if (!state.matches.length) return;
  const m = state.matches[idx];
  const label = `${formatDateLabel(m.d)} vs ${m.o || '?'}`;
  if (!confirm(`Slet kampen ${label}?`)) return;
  state.matches.splice(idx, 1);
  if (!state.matches.length) {
    state.matches.push({ d: '', o: '', gf: 0, ga: 0, pl: {}, lineup: { formation: '4-3-3', xi: [], bench: [] } });
    matchIdx = 0;
  } else if (matchIdx >= state.matches.length) {
    matchIdx = state.matches.length - 1;
  } else if (matchIdx > idx) {
    matchIdx--;
  }
  markDirty();
  renderMatchUI();
  showToast('Kamp slettet');
}

function ensureMatch() {
  if (!state.matches.length) {
    state.matches.push({ d: '', o: '', gf: 0, ga: 0, pl: {}, lineup: { formation: '4-3-3', xi: [], bench: [] } });
  }
}

function ensureLineup(m) {
  if (!m.lineup) m.lineup = { formation: '4-3-3', xi: [], bench: [] };
  while (m.lineup.xi.length < 11) m.lineup.xi.push('');
  while (m.lineup.bench.length < BENCH_COUNT) m.lineup.bench.push('');
}

function cloneLineup(lineup) {
  const l = lineup || { formation: '4-3-3', xi: [], bench: [] };
  return { formation: l.formation || '4-3-3', xi: [...(l.xi || [])], bench: [...(l.bench || [])] };
}

function syncKsFromVotes(m) {
  let maxV = 0;
  const candidates = [];
  for (const [idx, st] of Object.entries(m.pl || {})) {
    const v = st.v || 0;
    if (v > maxV) { maxV = v; candidates.length = 0; candidates.push(+idx); }
    else if (v === maxV && v > 0) candidates.push(+idx);
  }
  setPom(m, maxV > 0 ? candidates : []);
}

function renderMatchNav() {
  ensureMatch();
  const indices = periodMatchIndices();
  if (!indices.length) {
    $('match-nav').innerHTML = '<p class="hint" style="padding:12px">Ingen kampe i denne halvsæson.</p>';
    return;
  }
  if (!indices.includes(matchIdx)) matchIdx = indices[indices.length - 1];

  $('match-nav').innerHTML = indices.map((i) => {
    const m = state.matches[i];
    const score = (m.gf != null && m.o) ? `<span class="match-nav__item__score">${m.gf}–${m.ga}</span>` : '';
    const logo = logoForOpponent(dbuLogoMap, m.o);
    const logoHtml = logo ? `<img src="${esc(logo)}" class="match-nav__logo" alt="" loading="lazy">` : '<span class="match-nav__logo-ph"></span>';
    const ha = m.isHome === false
      ? '<span class="match-nav__away" title="Udebane">↗</span>'
      : m.isHome === true
        ? '<span class="match-nav__home" title="Hjemme">H</span>'
        : '';
    return `<button type="button" class="match-nav__item${i === matchIdx ? ' is-on' : ''}" data-i="${i}">
      ${logoHtml}
      <div class="match-nav__item__body">
        <div class="match-nav__item__date">${esc(formatDateLabel(m.d))}</div>
        <div class="match-nav__item__opp">${ha} ${esc(m.o || 'TBD')} ${score}</div>
      </div>
    </button>`;
  }).join('');

  $('match-nav').querySelectorAll('.match-nav__item').forEach((btn) => {
    btn.addEventListener('click', () => {
      matchIdx = +btn.dataset.i;
      renderMatchUI();
    });
  });
}

function bindAdminPitch(m) {
  const wrap = $('match-detail')?.querySelector('.admin-pitch-wrap');
  if (!wrap) return;
  wrap.querySelectorAll('[data-key]').forEach((btn) => {
    btn.addEventListener('click', () => openSlotPicker(btn.dataset.key, +btn.dataset.idx));
  });
}

function openSlotPicker(key, idx) {
  slotPickerTarget = { key, idx };
  const sel = $('slot-picker-select');
  sel.innerHTML = `<option value="">— Ingen —</option>${state.players.map((p, i) =>
    `<option value="${i}">${esc(p.n)}</option>`
  ).join('')}`;
  const m = state.matches[matchIdx];
  ensureLineup(m);
  const cur = m.lineup[key][idx];
  sel.value = cur === '' || cur == null ? '' : String(cur);
  $('slot-picker').hidden = false;
}

$('slot-picker-select')?.addEventListener('change', () => {
  if (!slotPickerTarget) return;
  const m = state.matches[matchIdx];
  const v = $('slot-picker-select').value;
  m.lineup[slotPickerTarget.key][slotPickerTarget.idx] = v === '' ? '' : +v;
  markDirty();
  renderMatchDetail();
});

$('slot-picker-clear')?.addEventListener('click', () => {
  if (!slotPickerTarget) return;
  const m = state.matches[matchIdx];
  m.lineup[slotPickerTarget.key][slotPickerTarget.idx] = '';
  $('slot-picker-select').value = '';
  markDirty();
  renderMatchDetail();
});

$('slot-picker-close')?.addEventListener('click', closeSlotPicker);
$('slot-picker-done')?.addEventListener('click', closeSlotPicker);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSlotPicker();
});

function statRowHtml(p, i, m) {
  const st = m.pl?.[i] || {};
  const played = m.pl?.[i] != null;
  const ks = isPom(m, i);
  const dis = played ? '' : ' disabled';
  return {
    table: `<tr class="${played ? 'is-played' : ''}" data-i="${i}">
      <td>${esc(p.n)}</td>
      <td><input type="checkbox" data-f="on" ${played ? 'checked' : ''}></td>
      <td class="stat-num"><input type="number" min="0" inputmode="numeric" data-f="g" value="${st.g || 0}"></td>
      <td class="stat-num"><input type="number" min="0" inputmode="numeric" data-f="a" value="${st.a || 0}"></td>
      <td class="stat-num"><input type="number" min="0" inputmode="numeric" data-f="v" value="${st.v || 0}"></td>
      <td class="stat-num"><input type="number" min="0" inputmode="numeric" data-f="j" value="${st.j || 0}"></td>
      <td class="stat-num"><input type="number" min="0" inputmode="numeric" data-f="y" value="${st.y || 0}"></td>
      <td class="stat-num"><input type="number" min="0" inputmode="numeric" data-f="r" value="${st.r || 0}"></td>
      <td class="ks-cell"><input type="checkbox" data-f="mom" ${ks ? 'checked' : ''}${dis}></td>
    </tr>`,
    card: `<div class="stat-mob-card${played ? ' is-played' : ''}" data-i="${i}">
      <label class="stat-mob-card__toggle"><input type="checkbox" data-f="on" ${played ? 'checked' : ''}><span>${esc(p.n)}</span></label>
      <div class="stat-mob-card__grid">
        <label><span>Mål</span><input type="number" min="0" inputmode="numeric" data-f="g" value="${st.g || 0}"></label>
        <label><span>Ast</span><input type="number" min="0" inputmode="numeric" data-f="a" value="${st.a || 0}"></label>
        <label><span>Stem</span><input type="number" min="0" inputmode="numeric" data-f="v" value="${st.v || 0}"></label>
        <label><span>Joga</span><input type="number" min="0" inputmode="numeric" data-f="j" value="${st.j || 0}"></label>
        <label><span>Gult</span><input type="number" min="0" inputmode="numeric" data-f="y" value="${st.y || 0}"></label>
        <label><span>Rødt</span><input type="number" min="0" inputmode="numeric" data-f="r" value="${st.r || 0}"></label>
      </div>
      <label class="stat-mob-card__mom"><input type="checkbox" data-f="mom" ${ks ? 'checked' : ''}${dis}> Kampens spiller</label>
    </div>`,
  };
}

function renderStatsTable(m) {
  const parts = state.players.map((p, i) => statRowHtml(p, i, m));
  const rows = parts.map((p) => p.table).join('');
  const cards = parts.map((p) => p.card).join('');

  return `<div class="stats-cards">${cards}</div>
    <div class="stats-table-wrap"><table class="stats-table">
    <thead><tr>
      <th>Spiller</th><th>✓</th><th>Mål</th><th>Ast</th><th>Stem</th><th>Joga</th><th>G</th><th>R</th><th title="Kampens spiller">MOTM</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function bindStatInputs(root, m) {
  root.querySelectorAll('[data-i]').forEach((row) => {
    const i = +row.dataset.i;
    const p = state.players[i];
    row.querySelectorAll('input').forEach((inp) => {
      inp.addEventListener('change', () => {
        const f = inp.dataset.f;
        if (f === 'on') {
          if (inp.checked) {
            m.pl[i] = { p: p.pos, ...(m.pl[i] || {}) };
          } else {
            delete m.pl[i];
            if (isPom(m, i)) setPom(m, pomIndices(m).filter((x) => x !== i));
          }
          markDirty();
          renderMatchDetail();
          return;
        }
        if (f === 'mom') {
          if (!m.pl[i]) return;
          const cur = pomIndices(m);
          if (inp.checked) setPom(m, [...cur, i]);
          else setPom(m, cur.filter((x) => x !== i));
          markDirty();
          renderMatchDetail();
          return;
        }
        if (!m.pl[i]) return;
        const n = +inp.value || 0;
        if (n) m.pl[i][f] = n; else delete m.pl[i][f];
        markDirty();
      });
    });
  });
}

function bindStatsTable(m) {
  const root = $('match-detail');
  if (!root) return;
  const cards = root.querySelector('.stats-cards');
  const table = root.querySelector('.stats-table-wrap');
  if (cards) bindStatInputs(cards, m);
  if (table) bindStatInputs(table, m);
}

function renderMatchDetail() {
  closeSlotPicker();
  const el = $('match-detail');
  const indices = periodMatchIndices();
  if (!indices.length) {
    el.innerHTML = `<div class="card match-empty-state">
      <h3 class="card__title">Ingen kampe</h3>
      <p>Der er ingen kampe i <strong>${esc(periodLabel(selectedPeriod))}</strong>.</p>
      ${isHistoryView()
        ? '<p class="hint">Vælg en anden halvsæson i toppen, eller klik «Gå til aktuel».</p>'
        : '<p class="hint">Tryk <strong>+ Kamp</strong> ovenfor, eller importer fra DBU.</p>'}
    </div>`;
    return;
  }
  if (!indices.includes(matchIdx)) matchIdx = indices[indices.length - 1];

  ensureMatch();
  const m = state.matches[matchIdx];
  ensureLineup(m);
  const hist = isHistoryView();
  const dis = hist ? ' disabled' : '';
  const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(m.d || '') ? m.d : daDateToIso(m.d) || '';

  const copyOpts = state.matches.map((om, i) =>
    i !== matchIdx && om.lineup?.xi?.length ? `<option value="${i}">${esc(formatDateLabel(om.d))} · ${esc(om.o || '?')}</option>` : ''
  ).join('');

  el.innerHTML = `
    <div class="match-detail-head">
      <h3 class="card__title">${esc(formatDateLabel(m.d))} · vs ${esc(m.o || 'TBD')}</h3>
      ${hist ? '' : '<button type="button" id="btn-delete-match" class="btn btn--danger btn--sm">Slet kamp</button>'}
    </div>
    <div class="card">
      <h3 class="card__title">Kampinfo</h3>
      <div class="match-meta">
        <div><label for="m-date">Dato</label><input id="m-date" type="date" value="${esc(isoDate)}"${dis}></div>
        <div><label for="m-opp">Modstander</label><input id="m-opp" type="text" value="${esc(m.o || '')}" placeholder="K.B. 3"${dis}></div>
        <div class="match-score">
          <label>Resultat</label>
          <div class="score-in score-in--lg">
            <input id="m-gf" type="number" min="0" value="${m.gf ?? 0}"${dis}>
            <span>–</span>
            <input id="m-ga" type="number" min="0" value="${m.ga ?? 0}"${dis}>
          </div>
        </div>
      </div>
      ${hist ? '' : '<button type="button" id="btn-dbu-match" class="btn btn--dbu btn--sm" style="margin-top:8px">Opdater resultat fra DBU</button>'}
    </div>
    <div class="card">
      <h3 class="card__title">Opstilling 4-3-3</h3>
      <p class="hint">Klik på en plads på banen for at vælge spiller.${hist ? ' (Skrivebeskyttet)' : ' Vil du genbruge en opstilling? Vælg en tidligere kamp og kopiér.'}</p>
      ${hist ? '' : `<div class="lineup-tools">
        <select id="lineup-copy-from" class="lineup-tools__select">
          <option value="">Kopiér opstilling fra kamp…</option>${copyOpts}
        </select>
        <button type="button" id="btn-copy-lineup" class="btn btn--sm">Kopiér opstilling</button>
      </div>`}
      ${renderAdminPitch(m, state.players, esc)}
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <h3 class="card__title" style="margin:0">Spillerstats</h3>
        ${hist ? '' : '<button type="button" id="btn-sync-ks" class="btn btn--ghost btn--sm">Tildel kampens spiller fra stemmer</button>'}
      </div>
      <p class="hint">Kampens spiller (MOTM) — kun spillere der spillede. Flere MOTM ved stemmelighed.</p>
      ${renderStatsTable(m)}
    </div>`;

  if (!hist) {
    bindAdminPitch(m);
    $('m-date')?.addEventListener('change', () => {
      m.d = $('m-date').value;
      markDirty();
      renderMatchNav();
    });
    $('m-opp')?.addEventListener('input', () => {
      m.o = $('m-opp').value.trim();
      markDirty();
      renderMatchNav();
    });
    ['m-gf', 'm-ga'].forEach((id) => {
      $(id)?.addEventListener('input', () => {
        m.gf = +$('m-gf').value || 0;
        m.ga = +$('m-ga').value || 0;
        markDirty();
        renderMatchNav();
      });
    });

    $('btn-copy-lineup')?.addEventListener('click', () => {
      const from = $('lineup-copy-from').value;
      if (from === '') { showToast('Vælg en kamp'); return; }
      const src = state.matches[+from]?.lineup;
      if (!src?.xi?.length) { showToast('Ingen opstilling'); return; }
      m.lineup = cloneLineup(src);
      markDirty();
      renderMatchDetail();
      showToast('Opstilling kopieret');
    });

    $('btn-dbu-match')?.addEventListener('click', () => importDbuForMatch(m));

    $('btn-sync-ks')?.addEventListener('click', () => {
      syncKsFromVotes(m);
      markDirty();
      renderMatchDetail();
      showToast('Kampens spiller opdateret fra stemmer');
    });

    $('btn-delete-match')?.addEventListener('click', () => deleteMatch(matchIdx));
  } else {
    $('match-detail')?.querySelectorAll('[data-key]').forEach((btn) => { btn.disabled = true; });
    $('match-detail')?.querySelectorAll('input, select, button').forEach((inp) => {
      if (!inp.closest('.match-detail-head')) inp.disabled = true;
    });
  }
  bindStatsTable(m);
  if (hist) {
    $('match-detail')?.querySelectorAll('.stats-table input, .stat-mob-card input').forEach((inp) => { inp.disabled = true; });
  }
}

async function importDbuForMatch(m) {
  try {
    const r = await fetch('/api/dbu-data');
    const data = await parseJson(r);
    if (!r.ok) throw new Error(data.error || 'DBU fejl');
    const opp = (m.o || '').toLowerCase().trim();
    const played = (data.matches || []).filter((x) => x.played);
    let found = played.find((x) => opp && x.opponent?.toLowerCase().includes(opp));
    if (!found && m.d) {
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(m.d) ? m.d : daDateToIso(m.d);
      found = played.find((x) => daDateToIso(x.date) === iso);
    }
    if (!found) { showToast('Ingen matchende kamp i DBU'); return; }
    m.gf = found.gf;
    m.ga = found.ga;
    if (!m.o) m.o = found.opponent;
    if (!m.d) m.d = daDateToIso(found.date) || found.date;
    markDirty();
    renderMatchUI();
    showToast(`DBU: ${found.gf}–${found.ga} mod ${found.opponent}`);
  } catch (err) {
    showToast(err.message);
  }
}

async function importDbuMatches() {
  try {
    const r = await fetch('/api/dbu-data');
    const data = await parseJson(r);
    if (!r.ok) throw new Error(data.error || 'DBU fejl');
    const dbuMatches = (data.matches || []).filter((x) => x.opponent);
    let added = 0;
    for (const dm of dbuMatches) {
      const iso = daDateToIso(dm.date);
      const exists = state.matches.some((m) =>
        (iso && (m.d === iso || daDateToIso(m.d) === iso)) &&
        (m.o || '').toLowerCase() === (dm.opponent || '').toLowerCase()
      );
      if (exists) continue;
      state.matches.push({
        d: iso || dm.date || '',
        o: dm.opponent,
        isHome: dm.isHome,
        venue: dm.venue || null,
        gf: dm.played ? dm.gf : 0,
        ga: dm.played ? dm.ga : 0,
        pl: {},
        lineup: { formation: '4-3-3', xi: [], bench: [] },
      });
      added++;
    }
    if (added) {
      matchIdx = state.matches.length - 1;
      markDirty();
      renderMatchUI();
      showToast(`${added} kamp(e) fra DBU`);
    } else {
      showToast('Alle DBU-kampe findes allerede');
    }
  } catch (err) {
    showToast(err.message);
  }
}

$('btn-add-match')?.addEventListener('click', () => {
  state.matches.push({ d: '', o: '', gf: 0, ga: 0, pl: {}, lineup: { formation: '4-3-3', xi: [], bench: [] } });
  matchIdx = state.matches.length - 1;
  markDirty();
  renderMatchUI();
});

$('btn-dbu-import')?.addEventListener('click', importDbuMatches);

function renderMatchUI() {
  renderMatchNav();
  renderMatchDetail();
}

// ——— Holdinfo ———

function computeCoachOverview(squad, periodId) {
  const sessions = totalActiveSessions(squad, periodId);
  const cancelled = sessionsForPeriod(squad, periodId).filter((s) => s.cancelled).length;
  const pcts = state.players.map((_, i) => playerTrainingPct(squad, i, periodId)).filter((x) => x != null);
  const avgPct = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
  const matchIdxs = periodMatchIndices();
  const playedMatches = matchIdxs.filter((i) => {
    const m = state.matches[i];
    return m?.o && Object.keys(m.pl || {}).length > 0;
  }).length;
  const notes = [];

  const noTrain = state.players.filter((_, i) => sessions > 0 && playerTrainingAttended(squad, i, periodId) === 0);
  if (noTrain.length) notes.push(`${noTrain.length} spiller(e) har ikke været til træning`);

  const lowTrain = state.players.filter((_, i) => {
    const pct = playerTrainingPct(squad, i, periodId);
    return pct != null && pct < 50 && playerTrainingAttended(squad, i, periodId) > 0;
  });
  if (lowTrain.length) notes.push(`${lowTrain.length} med under 50% træningsdeltagelse`);

  const missingResult = matchIdxs.filter((i) => {
    const m = state.matches[i];
    return m?.o && (m.gf == null || m.gf === '') && !Object.keys(m.pl || {}).length;
  }).length;
  if (missingResult) notes.push(`${missingResult} kamp(e) mangler resultat/stats`);

  const highTrainNoMatch = state.players.filter((_, i) => {
    const pct = playerTrainingPct(squad, i, periodId);
    const att = playerTrainingAttended(squad, i, periodId);
    return (pct ?? 0) >= 70 && att >= 3 && playerMatchesPlayed(i, periodId) === 0;
  });
  if (highTrainNoMatch.length) {
    notes.push(`${highTrainNoMatch.length} træner flittigt uden kampe: ${highTrainNoMatch.map((p) => p.n).slice(0, 3).join(', ')}${highTrainNoMatch.length > 3 ? '…' : ''}`);
  }

  return { sessions, cancelled, avgPct, playedMatches, players: state.players.length, notes };
}

function getFilteredPlayerIndices() {
  const squad = ensureSquad();
  const indices = sortedPlayerIndices();
  if (profileSort === 'pos') return indices;
  return indices.slice().sort((a, b) => {
    const pa = state.players[a];
    const pb = state.players[b];
    if (profileSort === 'name') return pa.n.localeCompare(pb.n, 'da');
    if (profileSort === 'training') {
      return (playerTrainingPct(squad, b, selectedPeriod) ?? -1)
        - (playerTrainingPct(squad, a, selectedPeriod) ?? -1);
    }
    if (profileSort === 'matches') return playerMatchesPlayed(b) - playerMatchesPlayed(a);
    if (profileSort === 'benched') {
      return (ensureProfile(pb).benchedAvailable || 0) - (ensureProfile(pa).benchedAvailable || 0);
    }
    return pa.n.localeCompare(pb.n, 'da');
  });
}

function renderProfileSummary() {
  const el = $('profile-summary');
  if (!el) return;
  const squad = ensureSquad();
  const o = computeCoachOverview(squad, selectedPeriod);
  const notesHtml = o.notes.length
    ? `<ul class="coach-strip__notes">${o.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`
    : '<p class="coach-strip__ok">Alt ser fint ud i denne halvsæson.</p>';

  el.innerHTML = `
    <div class="coach-strip card">
      <div class="coach-strip__nums">
        <span><strong>${o.sessions}</strong> træningspas</span>
        <span><strong>${o.avgPct}%</strong> gns. deltagelse</span>
        <span><strong>${o.playedMatches}</strong> kampe med stats</span>
        <span><strong>${o.players}</strong> spillere</span>
      </div>
      ${notesHtml}
    </div>`;
}

function renderTrainingCalendar() {
  const el = $('training-calendar');
  const title = $('cal-title');
  if (!el || !title) return;
  const squad = ensureSquad();
  if (!calBounds) calBounds = periodCalendarBounds(selectedPeriod);
  title.textContent = `${MONTHS_DA[calMonth - 1]} ${calYear}`;

  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const cells = calendarCells(calYear, calMonth);
  const minKey = calBounds.minYear * 12 + calBounds.minMonth;
  const maxKey = calBounds.maxYear * 12 + calBounds.maxMonth;
  const curKey = calYear * 12 + calMonth;
  $('cal-prev')?.toggleAttribute('disabled', curKey <= minKey);
  $('cal-next')?.toggleAttribute('disabled', curKey >= maxKey);

  el.innerHTML =
    DAYS_DA.map((d) => `<div class="training-cal__dow">${d}</div>`).join('') +
    cells.map((iso) => {
      if (!iso) return '<div class="training-cal__cell training-cal__cell--empty"></div>';
      const session = sessionByDate(squad, iso);
      const isTrain = isTrainingDay(squad, iso, selectedPeriod);
      const day = +iso.slice(8, 10);
      let cls = 'training-cal__cell';
      if (!isTrain) cls += ' training-cal__cell--off';
      if (isTrain) cls += ' training-cal__cell--train';
      if (session?.cancelled) cls += ' training-cal__cell--cancelled';
      if (iso === selectedTrainingDate) cls += ' training-cal__cell--selected';
      if (iso === todayIso) cls += ' training-cal__cell--today';
      const attended = session ? normalizeAttendance(session.attendance).length : 0;
      const dot = isTrain && attended > 0 && !session.cancelled
        ? `<span class="training-cal__dot" title="${attended} deltog"></span>` : '';
      return isTrain
        ? `<button type="button" class="${cls}" data-date="${iso}"><span class="training-cal__day">${day}</span>${dot}</button>`
        : `<span class="${cls}"><span class="training-cal__day">${day}</span></span>`;
    }).join('');

  el.querySelectorAll('[data-date]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedTrainingDate = btn.dataset.date;
      renderTrainingCalendar();
      renderTrainingDayPanel();
    });
  });
}

function updateTrainingDayStats(session) {
  const attended = normalizeAttendance(session.attendance).length;
  const total = state.players.length;
  const absent = Math.max(0, total - attended);
  const elAtt = $('training-stat-att');
  const elAbs = $('training-stat-abs');
  const elTot = $('training-stat-tot');
  if (elAtt) elAtt.textContent = String(attended);
  if (elAbs) elAbs.textContent = String(absent);
  if (elTot) elTot.textContent = String(total);
}

function renderTrainingDayPanel() {
  const el = $('training-day-panel');
  if (!el) return;
  const squad = ensureSquad();
  if (!selectedTrainingDate) {
    el.innerHTML = '<p class="hint">Vælg en træningsdag i kalenderen (grønne dage = man/ons).</p>';
    return;
  }
  const session = sessionByDate(squad, selectedTrainingDate);
  if (!session || !isTrainingDay(squad, selectedTrainingDate, selectedPeriod)) {
    el.innerHTML = '<p class="hint">Ingen træning denne dag i valgt sæson.</p>';
    return;
  }

  session.attendance = normalizeAttendance(session.attendance);
  const attended = session.attendance.length;
  const total = state.players.length;
  const absent = Math.max(0, total - attended);

  const readOnly = isHistoryView() || session.cancelled;

  const rows = sortedPlayerIndices().map((pi) => {
    const p = state.players[pi];
    const on = session.attendance.includes(pi);
    return `<button type="button" class="training-att-row${on ? ' is-on' : ''}" data-pi="${pi}" ${readOnly ? 'disabled' : ''}>
      <span class="training-att-mark" aria-hidden="true">${on ? '✓' : ''}</span>
      ${previewHtml(p, pi, 28)}
      <span class="training-att-name">${esc(p.n)}</span>
      <span class="training-att-pos">${esc(POS_LABEL[p.pos] || p.pos)}</span>
    </button>`;
  }).join('');

  el.innerHTML = `
    <h3 class="training-day-panel__title">Træning</h3>
    <p class="training-day-panel__meta">${esc(formatDateLong(session.date))}</p>
    <label class="stat-card__toggle" style="margin-bottom:12px">
      <input type="checkbox" id="session-cancelled" ${session.cancelled ? 'checked' : ''} ${isHistoryView() ? 'disabled' : ''}>
      Aflyst (tæller ikke med i statistik)
    </label>
    <div class="training-day-stats">
      <div class="training-day-stat training-day-stat--ok"><span class="training-day-stat__n" id="training-stat-att">${attended}</span><span class="training-day-stat__lbl">Deltog</span></div>
      <div class="training-day-stat training-day-stat--no"><span class="training-day-stat__n" id="training-stat-abs">${absent}</span><span class="training-day-stat__lbl">Udeblev</span></div>
      <div class="training-day-stat training-day-stat--na"><span class="training-day-stat__n" id="training-stat-tot">${total}</span><span class="training-day-stat__lbl">Spillere</span></div>
    </div>
    <label>Noter</label>
    <input type="text" id="session-notes" value="${esc(session.notes || '')}" placeholder="Fx tid, bane, info…" ${isHistoryView() ? 'disabled' : ''}>
    <p class="hint" style="margin-top:10px">${isHistoryView() ? 'Historik — deltagelse kan ikke ændres.' : 'Klik på en spiller for at tilføje/fjerne deltagelse.'}</p>
    <div class="training-att-list">${rows}</div>`;

  $('session-cancelled')?.addEventListener('change', (e) => {
    session.cancelled = e.target.checked;
    markDirty();
    renderTrainingCalendar();
    renderTrainingDayPanel();
    renderProfileSummary();
    renderProfileTable();
  });
  $('session-notes')?.addEventListener('input', (e) => {
    session.notes = e.target.value;
    markDirty();
  });
  el.querySelectorAll('.training-att-row').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (isHistoryView() || session.cancelled) return;
      const pi = +btn.dataset.pi;
      toggleAttendance(session, pi);
      markDirty();
      btn.classList.toggle('is-on', session.attendance.includes(pi));
      btn.querySelector('.training-att-mark').textContent = session.attendance.includes(pi) ? '✓' : '';
      updateTrainingDayStats(session);
      renderTrainingCalendar();
      renderProfileSummary();
      renderProfileTable();
    });
  });
}

$('cal-prev')?.addEventListener('click', () => {
  if (!calBounds) calBounds = periodCalendarBounds(selectedPeriod);
  calMonth--;
  if (calMonth < 1) { calMonth = 12; calYear--; }
  const minKey = calBounds.minYear * 12 + calBounds.minMonth;
  if (calYear * 12 + calMonth < minKey) { calYear = calBounds.minYear; calMonth = calBounds.minMonth; }
  renderTrainingCalendar();
});
$('cal-next')?.addEventListener('click', () => {
  if (!calBounds) calBounds = periodCalendarBounds(selectedPeriod);
  calMonth++;
  if (calMonth > 12) { calMonth = 1; calYear++; }
  const maxKey = calBounds.maxYear * 12 + calBounds.maxMonth;
  if (calYear * 12 + calMonth > maxKey) { calYear = calBounds.maxYear; calMonth = calBounds.maxMonth; }
  renderTrainingCalendar();
});
$('cal-today')?.addEventListener('click', () => {
  const def = defaultCalendarMonthForPeriod(selectedPeriod);
  calYear = def.year;
  calMonth = def.month;
  const today = new Date();
  selectedTrainingDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (!isTrainingDay(ensureSquad(), selectedTrainingDate, selectedPeriod)) {
    selectedTrainingDate = null;
  }
  renderTrainingCalendar();
  renderTrainingDayPanel();
});

function renderProfileTable() {
  const el = $('profile-table-wrap');
  if (!el) return;
  const squad = ensureSquad();
  const indices = getFilteredPlayerIndices();
  const sortBtn = (key, label) =>
    `<button type="button" class="th-sort${profileSort === key ? ' is-on' : ''}" data-sort="${key}">${label}</button>`;

  if (!indices.length) {
    el.innerHTML = '<p class="hint">Ingen spillere endnu.</p>';
    return;
  }

  const rows = indices.map((pi) => {
    const p = state.players[pi];
    const pr = ensureProfile(p);
    const pct = playerTrainingPct(squad, pi, selectedPeriod);
    const pctCls = pct == null ? '' : pct < 50 ? ' profile-pct--low' : ' profile-pct--ok';
    const pctTxt = pct == null ? '—' : `${pct}%`;
    const roles = roleLabelsShort(pr.coveredRoles);
    const mp = playerMatchesPlayed(pi);
    return `<tr data-pi="${pi}">
      <td><div class="profile-player-cell">${previewHtml(p, pi, 32)}<span>${esc(p.n)}</span></div></td>
      <td>${esc(POS_LABEL[p.pos] || p.pos)}</td>
      <td class="profile-roles">${roles ? esc(roles) : '<span class="hint">—</span>'}</td>
      <td class="profile-pct${pctCls}">${pctTxt}<br><small>${playerTrainingAttended(squad, pi, selectedPeriod)}/${totalActiveSessions(squad, selectedPeriod) || '—'}</small></td>
      <td>${mp}</td>
      <td><input type="number" min="0" class="width-mini" data-f="benched" value="${pr.benchedAvailable || 0}"></td>
      <td><input type="text" data-f="notes" value="${esc(pr.notes || '')}"></td>
    </tr>`;
  }).join('');

  el.innerHTML = `<div class="profile-table-head">
      <h3 class="card__title">Spilleroversigt</h3>
    </div>
    <div class="stats-table-wrap"><table class="profile-table">
      <thead><tr>
        <th>${sortBtn('name', 'Spiller')}</th>
        <th>${sortBtn('pos', 'Position')}</th>
        <th>Dækker</th>
        <th>${sortBtn('training', 'Træning')}</th>
        <th>${sortBtn('matches', 'Kampe')}</th>
        <th>${sortBtn('benched', 'Oversiddet')}</th>
        <th>Noter</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;

  bindProfileTableControls(el);

  el.querySelectorAll('input').forEach((inp) => {
    if (isHistoryView()) inp.disabled = true;
    inp.addEventListener('input', () => {
      const pi = +inp.closest('tr').dataset.pi;
      const pr = ensureProfile(state.players[pi]);
      const f = inp.dataset.f;
      if (f === 'benched') pr.benchedAvailable = +inp.value || 0;
      else pr[f] = inp.value.trim();
      markDirty();
      renderProfileSummary();
    });
  });
}

function bindProfileTableControls(container) {
  container.querySelectorAll('[data-sort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      profileSort = btn.dataset.sort;
      renderProfileTable();
    });
  });
}

$('period-goto-current')?.addEventListener('click', () => onPeriodChange(periodIdForDate()));

function renderProfileList() {
  if (!state?.players) return;
  ensureSquad();
  renderProfileSummary();
  renderTrainingCalendar();
  renderTrainingDayPanel();
  renderProfileTable();
}

$('period-select')?.addEventListener('change', (e) => onPeriodChange(e.target.value));

// ——— Gem ———

async function saveSeason() {
  const btn = $('btn-save');
  btn.disabled = true;
  btn.textContent = 'Gemmer…';
  setSaveStatus('');
  try {
    await uploadPendingPhotos();
    const r = await fetch('/api/season', {
      method: 'PUT',
      headers: await getHeaders(),
      body: JSON.stringify(state),
    });
    const j = await parseJson(r);
    if (!r.ok) throw new Error(j.error || 'Kunne ikke gemme');
    if (j.shareId) state.shareId = j.shareId;
    if (j.seasonId) state.id = j.seasonId;
    markClean();
    showToast('Gemt! Siden opdateres live på /standings.html');
    setSaveStatus('Alt er gemt. Holdet kan altid se stillingen på /standings.html', 'ok');
    state = await loadDefaultSeason();
    if (!state.rules) state.rules = DEFAULT_RULES;
    resetSquadMerge(state);
    ensureSquad();
    renderPlayers();
    renderMatchUI();
    renderProfileList();
  } catch (err) {
    setSaveStatus(err.message, 'err');
    showToast(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Gem';
  }
}

$('btn-save').addEventListener('click', saveSeason);

async function loadDbuLogos() {
  try {
    const r = await fetch('/api/dbu-data');
    if (r.ok) {
      const data = await r.json();
      dbuLogoMap = buildLogoMap(data.pool);
    }
  } catch { /* ignore */ }
}

async function init() {
  await loadAvatarLibrary();
  await loadDbuLogos();
  state = await loadDefaultSeason();
  if (!state.rules) state.rules = DEFAULT_RULES;
  resetSquadMerge(state);
  ensureSquad();
  const savedPeriod = localStorage.getItem(PERIOD_STORAGE_KEY);
  const current = periodIdForDate();
  const periods = listPeriodIds(state.squad, state.matches, current);
  selectedPeriod = savedPeriod && periods.includes(savedPeriod) ? savedPeriod : current;
  calBounds = periodCalendarBounds(selectedPeriod);
  const defCal = defaultCalendarMonthForPeriod(selectedPeriod);
  calYear = defCal.year;
  calMonth = defCal.month;
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (isTrainingDay(state.squad, todayIso, selectedPeriod)) selectedTrainingDate = todayIso;
  matchIdx = Math.max(0, (state.matches?.length || 1) - 1);
  markClean();
  setSaveStatus('');

  renderPeriodNav();
  renderPlayers();
  renderMatchUI();
  renderProfileList();
}

async function enterApp(session) {
  if (authBooted) return;
  authBooted = true;
  showApp();
  try {
    await init();
    if (session?.access_token) {
      ensureCoach(session.access_token).catch(() => {});
    }
  } catch (err) {
    authBooted = false;
    throw err;
  }
}

async function waitForSession(sb) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (s) => { if (!done) { done = true; resolve(s); } };
    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') finish(session);
    });
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) finish(session);
    });
    setTimeout(() => {
      subscription?.unsubscribe();
      finish(null);
    }, 900);
  });
}

async function boot() {
  const apiOk = await checkApi();
  const { supabase: sb, config } = await initSupabase();
  supabase = sb;
  useSupabase = Boolean(config?.hasSupabase);

  $('signup-tab-wrap').hidden = !useSupabase;
  $('login-email-wrap').hidden = !useSupabase;
  $('local-pw-hint').hidden = useSupabase;
  if ($('login-email')) $('login-email').required = useSupabase;

  if (useSupabase) {
    showAuthLoading();
    const session = await waitForSession(supabase);
    if (session) {
      try {
        await enterApp(session);
      } catch (err) {
        authBooted = false;
        if (/invitelisten|403|godkende/i.test(err.message)) {
          await supabase.auth.signOut();
          showLogin();
          $('login-err').textContent = err.message;
          $('login-err').hidden = false;
        } else {
          showApp();
          $('api-banner').textContent = err.message;
          $('api-banner').hidden = false;
        }
      }
    } else {
      showLogin();
    }

    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        authBooted = false;
        showLogin();
      }
    });
    return;
  }

  if (localToken) {
    showApp();
    try { await init(); } catch (err) {
      if (!apiOk) {
        $('api-banner').hidden = false;
      } else {
        localToken = null;
        localStorage.removeItem(TOKEN_KEY);
        showLogin();
        $('login-err').textContent = err.message;
        $('login-err').hidden = false;
      }
    }
  } else {
    showLogin();
  }
}

boot();
