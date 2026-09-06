import { initSupabase, getSupabase, authHeaders } from './supabase-client.js';
import { playerAvatarHtml } from './player-avatar.js';
import { renderAdminPitch, BENCH_COUNT } from './pitch.js';
import { pomIndices } from './fantasy-engine.js';

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
  width: { GK: 0, DEF: 0, MID: 0, ATT: 0 },
  roles: [],
  bestRole: '',
  notes: '',
};

let profileFilterPos = '';
let profileSort = 'name';
let profileSearch = '';
let authBooted = false;

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

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function playerKey(p, i) {
  return p.id || p._localId || `idx-${i}`;
}

function markDirty() {
  isDirty = true;
  $('dirty-label').hidden = false;
}

function markClean() {
  isDirty = false;
  $('dirty-label').hidden = true;
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

function gotoTab(tab) {
  document.querySelectorAll('.tabs__btn').forEach((el) => {
    el.classList.toggle('is-on', el.dataset.tab === tab);
  });
  document.querySelectorAll('.tab').forEach((el) => el.classList.remove('is-on'));
  $(PAGE_TABS[tab])?.classList.add('is-on');
}

document.querySelectorAll('.tabs__btn').forEach((el) => {
  el.addEventListener('click', () => gotoTab(el.dataset.tab));
});

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

function showApp() { $('login-view').hidden = true; $('app-view').hidden = false; }
function showLogin() { $('login-view').hidden = false; $('app-view').hidden = true; }

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

function openPlayerModal(editIndex = null) {
  modalEditIndex = editIndex;
  const isEdit = editIndex !== null;
  $('player-modal-title').textContent = isEdit ? 'Rediger spiller' : 'Ny spiller';

  const p = isEdit ? state.players[editIndex] : { n: '', pos: 'MID' };
  $('modal-name').value = p.n || '';
  $('modal-pos').value = p.pos || 'MID';
  modalSelectedAvatar = p.photo || avatarLibrary[0] || '';
  clearModalPending();

  renderAvatarPickerGrid($('modal-avatar-picker'), modalSelectedAvatar, (url) => {
    modalSelectedAvatar = url;
    clearModalPending();
  });

  $('player-modal').hidden = false;
  $('modal-name').focus();
}

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

  if (modalEditIndex !== null) {
    const p = state.players[modalEditIndex];
    p.n = name;
    p.pos = pos;
    if (photo) p.photo = photo;
    if (!p._localId && !p.id) p._localId = crypto.randomUUID();
  } else {
    state.players.push({
      n: name,
      pos,
      photo: photo || undefined,
      _localId: crypto.randomUUID(),
    });
  }

  markDirty();
  closePlayerModal();
  renderPlayers();
  renderMatchUI();
  renderAvatarLibraryGrid($('avatar-library-grid'));
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

function renderPlayers() {
  $('players-list').innerHTML = state.players.length
    ? state.players.map((p, i) => `
      <div class="player-row" data-i="${i}">
        ${previewHtml(p, i, 44)}
        <div class="player-row__info">
          <span class="player-row__name">${esc(p.n)}</span>
          <span class="player-row__pos">${POS_LABEL[p.pos] || p.pos}</span>
        </div>
        <button type="button" class="btn" data-edit="${i}">Rediger</button>
        <button type="button" class="btn-del" data-del="${i}" title="Fjern spiller">×</button>
      </div>`).join('')
    : '<p class="hint" style="padding:16px">Ingen spillere endnu. Klik + Spiller.</p>';

  $('players-list').querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openPlayerModal(+btn.dataset.edit));
  });

  $('players-list').querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!confirm('Fjern spilleren?')) return;
      state.players.splice(+btn.dataset.del, 1);
      markDirty();
      renderPlayers();
      renderMatchUI();
      renderProfileList();
    });
  });
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
  if (!p.profile) p.profile = { ...DEFAULT_PROFILE, width: { ...DEFAULT_PROFILE.width } };
  if (!p.profile.width) p.profile.width = { ...DEFAULT_PROFILE.width };
  if (p.profile.trainings != null) delete p.profile.trainings;
  return p.profile;
}

function ensureSquad() {
  if (!state.squad) state.squad = { weeks: [] };
  if (!state.squad.weeks) state.squad.weeks = [];
  return state.squad;
}

function mondayOfWeek(d = new Date()) {
  const x = new Date(d);
  const day = x.getDay();
  x.setDate(x.getDate() - (day === 0 ? 6 : day - 1));
  return x.toISOString().slice(0, 10);
}

function wednesdayOfMonday(monIso) {
  const x = new Date(monIso + 'T12:00:00');
  x.setDate(x.getDate() + 2);
  return x.toISOString().slice(0, 10);
}

function weekLabel(monIso) {
  const d = new Date(monIso + 'T12:00:00');
  const months = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  return `Uge ${monIso.slice(5)} · ${d.getDate()}. ${months[d.getMonth()]}`;
}

function totalTrainingSessions() {
  return ensureSquad().weeks.length * 2;
}

function playerTrainingAttended(pi) {
  let n = 0;
  for (const w of ensureSquad().weeks) {
    if (w.monAtt?.includes(pi)) n++;
    if (w.wedAtt?.includes(pi)) n++;
  }
  return n;
}

function playerTrainingPct(pi) {
  const total = totalTrainingSessions();
  if (!total) return null;
  return Math.round((playerTrainingAttended(pi) / total) * 100);
}

function playerMatchesPlayed(pi) {
  return (state.matches || []).filter((m) => m.pl?.[pi] != null).length;
}

function playerMaxWidth(pi) {
  const w = ensureProfile(state.players[pi]).width || {};
  return Math.max(w.GK || 0, w.DEF || 0, w.MID || 0, w.ATT || 0);
}

function toggleTrainingAtt(weekIdx, day, playerIdx) {
  const w = ensureSquad().weeks[weekIdx];
  const key = day === 'mon' ? 'monAtt' : 'wedAtt';
  if (!w[key]) w[key] = [];
  const i = w[key].indexOf(playerIdx);
  if (i >= 0) w[key].splice(i, 1);
  else w[key].push(playerIdx);
  markDirty();
  renderProfileSummary();
  renderProfileTable();
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
  $('match-nav').innerHTML = state.matches.map((m, i) => {
    const score = (m.gf != null && m.o) ? `<span class="match-nav__item__score">${m.gf}–${m.ga}</span>` : '';
    return `<button type="button" class="match-nav__item${i === matchIdx ? ' is-on' : ''}" data-i="${i}">
      <div>${esc(formatDateLabel(m.d))}</div>
      <div>vs ${esc(m.o || 'TBD')} ${score}</div>
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

function renderStatsTable(m) {
  const rows = state.players.map((p, i) => {
    const st = m.pl?.[i] || {};
    const played = m.pl?.[i] != null;
    const ks = isPom(m, i);
    return `<tr class="${played ? 'is-played' : ''}" data-i="${i}">
      <td>${esc(p.n)}</td>
      <td><input type="checkbox" data-f="on" ${played ? 'checked' : ''}></td>
      <td class="stat-num"><input type="number" min="0" data-f="g" value="${st.g || 0}"></td>
      <td class="stat-num"><input type="number" min="0" data-f="a" value="${st.a || 0}"></td>
      <td class="stat-num"><input type="number" min="0" data-f="v" value="${st.v || 0}"></td>
      <td class="stat-num"><input type="number" min="0" data-f="j" value="${st.j || 0}"></td>
      <td class="stat-num"><input type="number" min="0" data-f="y" value="${st.y || 0}"></td>
      <td class="stat-num"><input type="number" min="0" data-f="r" value="${st.r || 0}"></td>
      <td class="ks-cell"><input type="checkbox" data-f="mom" ${ks ? 'checked' : ''} ${played ? '' : 'disabled'}></td>
    </tr>`;
  }).join('');

  return `<div class="stats-table-wrap"><table class="stats-table">
    <thead><tr>
      <th>Spiller</th><th>✓</th><th>Mål</th><th>Ast</th><th>Stem</th><th>Joga</th><th>G</th><th>R</th><th>KS</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function bindStatsTable(m) {
  $('match-detail').querySelectorAll('.stats-table tbody tr').forEach((row) => {
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

function renderMatchDetail() {
  ensureMatch();
  const m = state.matches[matchIdx];
  ensureLineup(m);
  const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(m.d || '') ? m.d : daDateToIso(m.d) || '';

  const copyOpts = state.matches.map((om, i) =>
    i !== matchIdx ? `<option value="${i}">${esc(formatDateLabel(om.d))} · ${esc(om.o || '?')}</option>` : ''
  ).join('');

  $('match-detail').innerHTML = `
    <div class="match-detail-head">
      <h3 class="card__title">${esc(formatDateLabel(m.d))} · vs ${esc(m.o || 'TBD')}</h3>
      <button type="button" id="btn-delete-match" class="btn btn--danger btn--sm">Slet kamp</button>
    </div>
    <div class="card">
      <h3 class="card__title">Kampinfo</h3>
      <div class="match-meta">
        <div><label for="m-date">Dato</label><input id="m-date" type="date" value="${esc(isoDate)}"></div>
        <div><label for="m-opp">Modstander</label><input id="m-opp" type="text" value="${esc(m.o || '')}" placeholder="K.B. 3"></div>
        <div class="match-score">
          <label>Resultat</label>
          <div class="score-in score-in--lg">
            <input id="m-gf" type="number" min="0" value="${m.gf ?? 0}">
            <span>–</span>
            <input id="m-ga" type="number" min="0" value="${m.ga ?? 0}">
          </div>
        </div>
      </div>
      <button type="button" id="btn-dbu-match" class="btn btn--ghost btn--sm" style="margin-top:8px">Hent resultat fra DBU</button>
    </div>
    <div class="card">
      <h3 class="card__title">Opstilling 4-3-3</h3>
      <div class="lineup-tools">
        <select id="lineup-copy-from" class="lineup-tools__select">
          <option value="">Kopiér fra kamp…</option>${copyOpts}
        </select>
        <button type="button" id="btn-copy-lineup" class="btn btn--sm">Kopiér</button>
        <button type="button" id="btn-save-lineup-template" class="btn btn--ghost btn--sm">Gem standard</button>
        <button type="button" id="btn-apply-lineup-template" class="btn btn--ghost btn--sm">Brug standard</button>
      </div>
      ${renderAdminPitch(m, state.players, esc)}
      <p class="hint">Klik på en plads på banen for at vælge spiller.</p>
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <h3 class="card__title" style="margin:0">Spillerstats</h3>
        <button type="button" id="btn-sync-ks" class="btn btn--ghost btn--sm">KS fra stemmer</button>
      </div>
      <p class="hint">KS kun for spillere der spillede. Flere KS ved stemmelighed.</p>
      ${renderStatsTable(m)}
    </div>`;

  bindAdminPitch(m);
  bindStatsTable(m);

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

  $('btn-save-lineup-template')?.addEventListener('click', () => {
    state.lineupTemplate = cloneLineup(m.lineup);
    try { localStorage.setItem('vf-lineup-template', JSON.stringify(state.lineupTemplate)); } catch { /* ignore */ }
    showToast('Standard gemt');
  });

  $('btn-apply-lineup-template')?.addEventListener('click', () => {
    let tpl = state.lineupTemplate;
    if (!tpl) {
      try { tpl = JSON.parse(localStorage.getItem('vf-lineup-template') || 'null'); } catch { /* ignore */ }
    }
    if (!tpl?.xi?.length) { showToast('Gem en standard først'); return; }
    m.lineup = cloneLineup(tpl);
    markDirty();
    renderMatchDetail();
    showToast('Standard anvendt');
  });

  $('btn-sync-ks')?.addEventListener('click', () => {
    syncKsFromVotes(m);
    markDirty();
    renderMatchDetail();
    showToast('KS opdateret fra stemmer');
  });

  $('btn-dbu-match')?.addEventListener('click', () => importDbuForMatch(m));
  $('btn-delete-match')?.addEventListener('click', () => deleteMatch(matchIdx));
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

function getFilteredPlayerIndices() {
  let indices = state.players.map((_, i) => i);
  if (profileFilterPos) indices = indices.filter((i) => state.players[i].pos === profileFilterPos);
  if (profileSearch.trim()) {
    const q = profileSearch.trim().toLowerCase();
    indices = indices.filter((i) => state.players[i].n.toLowerCase().includes(q));
  }
  indices.sort((a, b) => {
    const pa = state.players[a];
    const pb = state.players[b];
    if (profileSort === 'training') {
      return (playerTrainingPct(b) ?? -1) - (playerTrainingPct(a) ?? -1);
    }
    if (profileSort === 'matches') return playerMatchesPlayed(b) - playerMatchesPlayed(a);
    if (profileSort === 'benched') {
      return (ensureProfile(pb).benchedAvailable || 0) - (ensureProfile(pa).benchedAvailable || 0);
    }
    if (profileSort === 'width') return playerMaxWidth(b) - playerMaxWidth(a);
    return pa.n.localeCompare(pb.n, 'da');
  });
  return indices;
}

function renderProfileSummary() {
  const el = $('profile-summary');
  if (!el) return;
  const sessions = totalTrainingSessions();
  const pcts = state.players.map((_, i) => playerTrainingPct(i)).filter((x) => x != null);
  const avgPct = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
  const lowAtt = state.players.filter((_, i) => {
    const p = playerTrainingPct(i);
    return p != null && p < 50;
  }).length;
  const totalBenched = state.players.reduce((s, p, i) => s + (ensureProfile(p).benchedAvailable || 0), 0);

  el.innerHTML = `
    <div class="profile-stat"><span class="profile-stat__val">${state.players.length}</span><span class="profile-stat__lbl">Spillere</span></div>
    <div class="profile-stat"><span class="profile-stat__val">${ensureSquad().weeks.length}</span><span class="profile-stat__lbl">Træningsuger</span></div>
    <div class="profile-stat"><span class="profile-stat__val">${sessions}</span><span class="profile-stat__lbl">Træningspas</span></div>
    <div class="profile-stat"><span class="profile-stat__val">${avgPct}%</span><span class="profile-stat__lbl">Gns. deltagelse</span></div>
    <div class="profile-stat"><span class="profile-stat__val">${lowAtt}</span><span class="profile-stat__lbl">&lt;50% træning</span></div>
    <div class="profile-stat"><span class="profile-stat__val">${totalBenched}</span><span class="profile-stat__lbl">Oversiddet (ialt)</span></div>`;
}

function renderTrainingWeeks() {
  const el = $('training-weeks');
  if (!el) return;
  const weeks = ensureSquad().weeks;
  if (!weeks.length) {
    el.innerHTML = '<p class="hint">Ingen træningsuger endnu. Klik + Uge for at starte.</p>';
    return;
  }

  el.innerHTML = weeks.map((w, wi) => {
    const mon = w.mon || '';
    const wed = w.wed || (mon ? wednesdayOfMonday(mon) : '');
    const rows = state.players.map((p, pi) => {
      const monOn = w.monAtt?.includes(pi);
      const wedOn = w.wedAtt?.includes(pi);
      return `<tr>
        <td>${esc(p.n)}</td>
        <td><input type="checkbox" data-w="${wi}" data-day="mon" data-pi="${pi}" ${monOn ? 'checked' : ''}></td>
        <td><input type="checkbox" data-w="${wi}" data-day="wed" data-pi="${pi}" ${wedOn ? 'checked' : ''}></td>
      </tr>`;
    }).join('');

    return `<div class="training-week" data-wi="${wi}">
      <div class="training-week__head">
        <span class="training-week__label">${esc(weekLabel(mon || '????-??-??'))}</span>
        <label>Man <input type="date" data-w-mon="${wi}" value="${esc(mon)}"></label>
        <label>Ons <input type="date" data-w-wed="${wi}" value="${esc(wed)}"></label>
        <button type="button" class="btn btn--danger btn--sm" data-del-week="${wi}">Slet uge</button>
      </div>
      <table class="training-grid">
        <thead><tr><th>Spiller</th><th>Man</th><th>Ons</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }).join('');

  el.querySelectorAll('[data-w-mon]').forEach((inp) => {
    inp.addEventListener('change', () => {
      const w = ensureSquad().weeks[+inp.dataset.wMon];
      w.mon = inp.value;
      if (!w.wed) w.wed = wednesdayOfMonday(w.mon);
      markDirty();
      renderTrainingWeeks();
    });
  });
  el.querySelectorAll('[data-w-wed]').forEach((inp) => {
    inp.addEventListener('change', () => {
      ensureSquad().weeks[+inp.dataset.wWed].wed = inp.value;
      markDirty();
    });
  });
  el.querySelectorAll('[data-del-week]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!confirm('Slet træningsugen?')) return;
      ensureSquad().weeks.splice(+btn.dataset.delWeek, 1);
      markDirty();
      renderProfileList();
    });
  });
  el.querySelectorAll('input[type="checkbox"][data-w]').forEach((cb) => {
    cb.addEventListener('change', () => {
      toggleTrainingAtt(+cb.dataset.w, cb.dataset.day, +cb.dataset.pi);
    });
  });
}

function renderProfileTable() {
  const el = $('profile-table-wrap');
  if (!el) return;
  const indices = getFilteredPlayerIndices();
  if (!indices.length) {
    el.innerHTML = '<p class="hint">Ingen spillere matcher filteret.</p>';
    return;
  }

  const rows = indices.map((pi) => {
    const p = state.players[pi];
    const pr = ensureProfile(p);
    const pct = playerTrainingPct(pi);
    const pctCls = pct == null ? '' : pct < 50 ? ' profile-pct--low' : ' profile-pct--ok';
    const pctTxt = pct == null ? '—' : `${pct}%`;
    const roles = (pr.roles || []).join(', ');
    const mp = playerMatchesPlayed(pi);
    return `<tr data-pi="${pi}">
      <td>${previewHtml(p, pi, 32)} ${esc(p.n)}</td>
      <td>${esc(POS_LABEL[p.pos] || p.pos)}</td>
      <td class="profile-pct${pctCls}">${pctTxt}<br><small>${playerTrainingAttended(pi)}/${totalTrainingSessions() || '—'}</small></td>
      <td>${mp}</td>
      <td><input type="number" min="0" class="width-mini" data-f="benched" value="${pr.benchedAvailable || 0}"></td>
      <td><input type="text" data-f="roles" value="${esc(roles)}" placeholder="HB, CB…"></td>
      <td><input type="text" data-f="bestRole" value="${esc(pr.bestRole || '')}"></td>
      <td>
        ${['GK', 'DEF', 'MID', 'ATT'].map((pos) =>
          `<input type="number" min="0" max="10" class="width-mini" title="${pos}" data-f="width-${pos}" value="${pr.width?.[pos] || 0}">`
        ).join('')}
      </td>
      <td><input type="text" data-f="notes" value="${esc(pr.notes || '')}"></td>
    </tr>`;
  }).join('');

  el.innerHTML = `<h3 class="card__title">Spilleroversigt</h3>
    <p class="hint">Bredde: GK · DEF · MID · ATT (0–10). Kampe = spillede i fantasy.</p>
    <div class="stats-table-wrap"><table class="profile-table">
      <thead><tr>
        <th>Spiller</th><th>Pos</th><th>Træning</th><th>Kampe</th><th>Oversiddet</th>
        <th>Roller</th><th>Bedste</th><th>Bredde</th><th>Noter</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;

  el.querySelectorAll('input').forEach((inp) => {
    inp.addEventListener('input', () => {
      const pi = +inp.closest('tr').dataset.pi;
      const pr = ensureProfile(state.players[pi]);
      const f = inp.dataset.f;
      if (f.startsWith('width-')) pr.width[f.replace('width-', '')] = +inp.value || 0;
      else if (f === 'roles') pr.roles = inp.value.split(',').map((s) => s.trim()).filter(Boolean);
      else if (f === 'benched') pr.benchedAvailable = +inp.value || 0;
      else pr[f] = inp.value.trim();
      markDirty();
      renderProfileSummary();
    });
  });
}

function renderProfileList() {
  if (!state?.players) return;
  ensureSquad();
  renderProfileSummary();
  renderTrainingWeeks();
  renderProfileTable();
}

$('btn-add-training-week')?.addEventListener('click', () => {
  const mon = mondayOfWeek();
  ensureSquad().weeks.unshift({
    mon,
    wed: wednesdayOfMonday(mon),
    monAtt: [],
    wedAtt: [],
  });
  markDirty();
  renderProfileList();
});

$('profile-filter-pos')?.addEventListener('change', (e) => {
  profileFilterPos = e.target.value;
  renderProfileTable();
});
$('profile-sort')?.addEventListener('change', (e) => {
  profileSort = e.target.value;
  renderProfileTable();
});
$('profile-search')?.addEventListener('input', (e) => {
  profileSearch = e.target.value;
  renderProfileTable();
});

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

async function init() {
  await loadAvatarLibrary();
  state = await loadDefaultSeason();
  if (!state.rules) state.rules = DEFAULT_RULES;
  ensureSquad();
  matchIdx = Math.max(0, (state.matches?.length || 1) - 1);
  markClean();
  setSaveStatus('');

  $('live-url').href = LIVE_URL;
  $('live-url').textContent = LIVE_URL;
  $('btn-preview').href = LIVE_URL;

  if (useSupabase) {
    const { data: { user } } = await supabase.auth.getUser();
    $('coach-label').textContent = user?.email || '';
  }

  try { state.lineupTemplate = JSON.parse(localStorage.getItem('vf-lineup-template') || 'null'); } catch { /* ignore */ }
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
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (session && ['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED'].includes(event)) {
        try {
          await enterApp(session);
        } catch (err) {
          if (/invitelisten|403|godkende/i.test(err.message)) {
            authBooted = false;
            await supabase.auth.signOut();
            showLogin();
            $('login-err').textContent = err.message;
            $('login-err').hidden = false;
          }
        }
      } else if (event === 'SIGNED_OUT') {
        authBooted = false;
        showLogin();
      }
    });

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      try {
        await enterApp(session);
      } catch (err) {
        if (/invitelisten|403|godkende/i.test(err.message)) {
          authBooted = false;
          await supabase.auth.signOut();
          showLogin();
          $('login-err').textContent = err.message;
          $('login-err').hidden = false;
        } else {
          $('api-banner').textContent = err.message;
          $('api-banner').hidden = false;
        }
      }
      return;
    }

    setTimeout(async () => {
      if (authBooted) return;
      const { data: { session: late } } = await supabase.auth.getSession();
      if (late) {
        try { await enterApp(late); } catch { /* ignore */ }
      } else {
        showLogin();
      }
    }, 400);
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
