import { createFantasyEngine, decodeFragment } from './fantasy-engine.js';
import { playerAvatarHtml, playerHeroCard } from './player-avatar.js';
import { fetchDbuData, fetchDbuForPeriod } from './dbu-client.js';
import { assignFromLineup, renderPitch } from './pitch.js';
import { ensureCoveredRoles, roleLabelsShort, roleLabelsLong } from './player-roles.js';
import {
  periodIdForDate,
  periodLabel,
  seasonNavButtonLabel,
  listPeriodIds,
  filterMatchesByPeriod,
} from './admin-squad.js';
import { buildPoolInsights, buildFantasyInsights, insightsHtml } from './pool-insights.js';

const PERIOD_KEY = 'vf-period';
let periodNavRender = null;

function periodListFromSelect() {
  const s = document.getElementById('sp-period-select');
  return s ? [...s.options].map((o) => o.value) : [];
}

function bindSeasonNavOnce() {
  if (document.body.dataset.seasonNavBound) return;
  document.body.dataset.seasonNavBound = '1';

  document.getElementById('sp-period-goto-current')?.addEventListener('click', () => {
    const s = document.getElementById('sp-period-select');
    const current = periodIdForDate();
    const periods = periodListFromSelect();
    if (periods.includes(current) && s) { s.value = current; periodNavRender?.(); }
  });
}

const POS_LABEL = { GK: 'Målmand', DEF: 'Forsvar', MID: 'Midtbane', ATT: 'Angreb' };

function playerPosLine(player) {
  ensureCoveredRoles(player);
  const main = POS_LABEL[player?.pos] || player?.pos || '';
  const roles = roleLabelsShort(player.profile?.coveredRoles);
  return roles ? `${main} · ${roles}` : main;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function normOpp(s) {
  return String(s || '').toLowerCase().replace(/\./g, '').replace(/\s+/g, '').trim();
}

function findFantasyMatch(fantasyMatches, dbuMatch) {
  if (!fantasyMatches?.length) return -1;
  const o = normOpp(dbuMatch.opponent);
  const idx = fantasyMatches.findIndex((fm) => normOpp(fm.o) === o);
  return idx;
}

function formDotsHtml(form) {
  if (!form?.length) return '—';
  return form.map((r) => `<span class="form-dot ${r}"></span>`).join('');
}

function showSheet(title, sub, body) {
  document.querySelectorAll('.ov').forEach((el) => el.remove());
  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.innerHTML = `<div class="ov-sheet"><button type="button" class="ov-close" aria-label="Luk">×</button><h3 class="ov-title">${title}</h3>${sub ? `<p class="ov-sub">${sub}</p>` : ''}${body}</div>`;
  ov.addEventListener('click', (e) => {
    if (e.target === ov || e.target.closest('.ov-close')) ov.remove();
  });
  document.body.appendChild(ov);
}

function bindPitchClicks(container, openPlayer) {
  if (!container) return;
  container.querySelectorAll('[data-p]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openPlayer(+btn.dataset.p);
    });
  });
}

function renderPulje(dbu, { periodLabel: pl = '' } = {}) {
  const el = document.getElementById('panel-liga');
  const s = dbu.summary || {};

  if (!dbu.pool?.length) {
    el.innerHTML = `<p class="empty">Ingen puljedata fra DBU${pl ? ` for ${esc(pl)}` : ''}.</p>`;
    return;
  }

  const insights = buildPoolInsights(dbu.pool, dbu.matches, s);
  const formHtml = formDotsHtml(s.form);

  const rows = dbu.pool
    .map(
      (t) => `<tr class="${t.isUs ? 'is-us' : ''}">
        <td class="pulje-rank">${t.rank}</td>
        <td><div class="pulje-team">${t.logo ? `<img src="${esc(t.logo)}" alt="" loading="lazy"/>` : ''}<span>${esc(t.name)}</span></div></td>
        <td class="pulje-num">${t.played}</td>
        <td class="pulje-num">${t.won}-${t.drawn}-${t.lost}</td>
        <td class="pulje-num">${t.goalsFor}:${t.goalsAgainst}</td>
        <td class="pulje-pts">${t.points}</td>
      </tr>`
    )
    .join('');

  el.innerHTML = `
    ${dbu.poolInfo || formHtml ? `<div class="liga-intro">
      ${dbu.poolInfo ? `<p class="liga-intro__pool">${esc(dbu.poolInfo)}</p>` : ''}
      ${formHtml ? `<p class="liga-intro__form"><span class="liga-intro__form-label">Form</span><span class="form-row">${formHtml}</span></p>` : ''}
    </div>` : ''}
    ${insightsHtml(insights, 1)}
    ${s.nextMatch ? `<p class="liga-next">Næste kamp: <strong>${esc(s.nextMatch.opponent)}</strong>${s.nextMatch.date ? ` · ${esc(s.nextMatch.date)}` : ''}</p>` : ''}
    <div class="pulje-table-wrap">
      <table class="pulje-table">
        <thead><tr><th>#</th><th>Hold</th><th>K</th><th>S-U-N</th><th>Mål</th><th>P</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function matchHaBadge(isHome) {
  if (isHome) {
    return '<span class="match-ha match-ha--home" title="Hjemmekamp"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3 3 10v11h7v-7h4v7h7V10L12 3z"/></svg></span>';
  }
  return '<span class="match-ha match-ha--away" title="Udekamp"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 22h20"/><path d="M6.29 17.61 4 17l-1.5-7 1.25-1.2 7.22 2.24 5.55-5.55 2.05 1.09-3.05 8.67 2.09 1.09z"/></svg></span>';
}

function matchCardHtml(m, fIdx, fantasyMatch) {
  const day = (m.date || '').match(/^(\d+)/)?.[1] || '–';
  const mon = (m.date || '').replace(/^\d+\.\s*/, '').split(' ')[0] || '';
  const resCls = m.result || '';
  const badge = !m.played
    ? `<span class="badge badge-plan">${m.time ? esc(m.time) : 'Planlagt'}</span>`
    : `<span class="badge badge-${resCls}">${resCls === 'win' ? 'Sejr' : resCls === 'draw' ? 'Uafgjort' : 'Nederlag'}</span>`;
  const hasLineup = fIdx >= 0 && fantasyMatch?.lineup;
  const venueLine = m.venue
    ? `<div class="match-card__venue">${esc(m.venue)}</div>`
    : '';

  return `<article class="match-card${hasLineup ? ' has-lineup' : ''}${m.isHome ? '' : ' is-away'}" data-f="${fIdx}">
    <button type="button" class="match-card__head" ${hasLineup ? '' : 'disabled'}>
      <div class="match-card__date"><span class="match-card__day">${day}</span><span class="match-card__mon">${esc(mon)}</span></div>
      <div class="match-card__body">
        <div class="match-card__opp">${matchHaBadge(m.isHome)}<span class="match-card__opp-name">${esc(m.opponent)}</span></div>
        <div class="match-card__meta">${badge}${venueLine}</div>
      </div>
      <div class="match-card__score ${resCls}">${m.played ? `${m.gf}–${m.ga}` : '–'}</div>
      ${hasLineup ? '<span class="match-card__chev" aria-hidden="true">›</span>' : ''}
    </button>
    <div class="match-card__expand"></div>
  </article>`;
}

function renderKampePanelOnlyDbu(dbu) {
  document.getElementById('panel-resultater').innerHTML = `<div class="match-list">${(dbu.matches || [])
    .map((m) => matchCardHtml(m, -1, null))
    .join('')}</div>`;
}

function renderKampePanel(dbu, fantasyMatches, openPlayer, { periodLabel: pl = '' } = {}) {
  const el = document.getElementById('panel-resultater');
  const dbuMatches = dbu.matches || [];

  if (!dbuMatches.length) {
    el.innerHTML = `<p class="empty">Ingen kampe i ${pl ? esc(pl) : 'denne halvsæson'}.</p>`;
    return;
  }

  el.innerHTML = `<div class="match-list" id="kampe-list">${
    dbuMatches
      .map((m) => {
        const fIdx = findFantasyMatch(fantasyMatches, m);
        const fm = fIdx >= 0 ? fantasyMatches[fIdx] : null;
        return matchCardHtml(m, fIdx, fm);
      })
      .join('')
  }</div>`;

  document.getElementById('kampe-list')?.querySelectorAll('.match-card.has-lineup').forEach((card) => {
    const fIdx = +card.dataset.f;
    const head = card.querySelector('.match-card__head');
    const expand = card.querySelector('.match-card__expand');

    head.addEventListener('click', () => {
      const wasOpen = card.classList.contains('is-open');
      document.querySelectorAll('.match-card').forEach((c) => c.classList.remove('is-open'));
      if (wasOpen) return;

      card.classList.add('is-open');
      const { players, fpFor, dispName } = window.__fxEngine;
      const m = window.__fxMatches[fIdx];
      const dbuIdx = [...document.querySelectorAll('.match-card')].indexOf(card);
      const dbuM = dbuMatches[dbuIdx];
      const { placed, bench, formationKey } = assignFromLineup(m, players, fpFor, dispName);

      let pointsHtml = '';
      const list = [];
      for (const key in m.pl) {
        const i = +key;
        const f = fpFor(m, i);
        if (f) list.push({ i, total: f.total, parts: f.parts });
      }
      list.sort((a, b) => b.total - a.total);
      if (list.length) {
        pointsHtml = `<div class="match-points">
          <div class="match-points__title">Point i kampen</div>
          <div class="match-points__grid">${list
          .map(
            (r) => `<button type="button" class="match-points__row" data-p="${r.i}">
              ${playerAvatarHtml(players[r.i], r.i, 32, '', 'row')}
              <span class="match-points__name">${esc(dispName(r.i))}</span>
              <strong class="match-points__pts${r.total < 0 ? ' neg' : ''}">${r.total > 0 ? '+' : ''}${r.total}</strong>
            </button>`
          )
          .join('')}</div></div>`;
      }

      expand.innerHTML = `<div class="match-detail">
        <div class="match-detail__pitch">${renderPitch(placed, bench, { formation: formationKey })}</div>
        ${pointsHtml ? `<div class="match-detail__side">${pointsHtml}</div>` : ''}
      </div>`;

      bindPitchClicks(expand.querySelector('.match-detail__pitch'), openPlayer);
      expand.querySelectorAll('.match-points__row').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          openPlayer(+btn.dataset.p);
        });
      });
    });
  });
}

function setupNav() {
  if (document.body.dataset.navBound) return;
  document.body.dataset.navBound = '1';

  const titles = {
    fantasy: 'Fantasy',
    resultater: 'Resultater',
    liga: 'Liga',
  };

  function activate(tab) {
    document.querySelectorAll('[data-tab]').forEach((b) => {
      if (!b.dataset.tab) return;
      const on = b.dataset.tab === tab;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('is-on'));
    document.getElementById('panel-' + tab)?.classList.add('is-on');
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = titles[tab] || '';
  }

  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => activate(btn.dataset.tab));
  });
}

function updateSeasonNavUi(period, periods, isCurrent) {
  const sel = document.getElementById('sp-period-select');
  const bar = document.getElementById('standings-period-bar');
  const goto = document.getElementById('sp-period-goto-current');
  if (sel) sel.value = period;
  if (bar) bar.hidden = periods.length <= 1;
  if (goto) goto.hidden = isCurrent;
}

function fail(msg) {
  document.getElementById('sub').textContent = '';
  document.getElementById('panel-fantasy').innerHTML = `<div class="msg">${msg}</div>`;
}

export function initStandings(D, dbu = {}, opts = {}) {
  const isCurrentPeriod = opts.isCurrentPeriod !== false;
  const engine = createFantasyEngine(D);
  const {
    players,
    matches,
    rules: R,
    N,
    CAP,
    dispName,
    fpFor,
    counts,
    roundEffect,
    standings,
    CAT,
    CATORD,
  } = engine;

  let round = N || 1;
  const cur = N ? standings(round) : { arr: [] };
  const leader = cur.arr[0];

  document.getElementById('sub').textContent = N
    ? `Runde ${round}${matches[round - 1]?.o ? ' · ' + matches[round - 1].o : ''}`
    : '';

  function openPlayer(i) {
    let total = 0;
    const rows = [];
    for (let r = 0; r < N; r++) {
      const f = fpFor(matches[r], i);
      if (!f) continue;
      rows.push({ parts: f.parts });
      total += f.total;
    }

    const catHtml = CATORD.filter((k) => rows.some((r) => r.parts[k]))
      .map((k) => {
        const sum = rows.reduce((a, r) => a + (r.parts[k] || 0), 0);
        return `<div class="ov-row"><span>${CAT[k]}</span><span class="v${sum < 0 ? ' neg' : ''}">${sum > 0 ? '+' : ''}${sum}</span></div>`;
      })
      .join('');

    showSheet(
      esc(dispName(i)),
      `${total} point`,
      `<div class="ov-player">${playerAvatarHtml(players[i], i, 64)}<strong>${total} pt</strong><p class="ov-pos">${esc(playerPosLine(players[i]))}</p>${roleLabelsLong(players[i].profile?.coveredRoles) ? `<p class="ov-roles">${esc(roleLabelsLong(players[i].profile.coveredRoles))}</p>` : ''}</div>${catHtml}`
    );
  }

  const fantasyEl = document.getElementById('panel-fantasy');

  if (!N) {
    fantasyEl.innerHTML = `<p class="empty">Ingen fantasy-data${opts.periodLabel ? ` for ${esc(opts.periodLabel)}` : ' endnu'}.</p>`;
  } else {
    const fxInsights = buildFantasyInsights(engine, round);

    const LB = [
      { k: 'pts', lbl: 'Point', leaderLbl: 'Fører fantasy' },
      { k: 'g', lbl: 'Mål', leaderLbl: 'Flest mål' },
      { k: 'a', lbl: 'Assists', leaderLbl: 'Flest assists' },
      { k: 'v', lbl: 'Stemmer', leaderLbl: 'Flest stemmer' },
      { k: 'mom', lbl: 'Kampens spiller', leaderLbl: 'Mest MOTM' },
      { k: 'j', lbl: 'Joga Bonito', leaderLbl: 'Mest Joga' },
    ];

    let lbMode = 'pts';

    fantasyEl.innerHTML = `
      ${insightsHtml(fxInsights, 1)}
      ${leader ? `<div id="leader-slot"></div>` : ''}
      ${N > 1 ? `<div class="round"><input type="range" min="1" max="${N}" value="${N}" id="rng"><p class="round__lbl" id="slab"></p></div>` : ''}
      <div class="stat-bar">
        <span class="stat-bar__label">Vis</span>
        <div class="chips" id="chips"></div>
      </div>
      <div class="board-head" id="board-head"></div>
      <div class="board" id="board"></div>
      <details class="rules"><summary>Sådan beregnes point</summary>
        <div class="rules__inner">
          ${CAP ? `<p>Kun de ${CAP} bedste kampe tæller.</p>` : ''}
          <p>Sejr +${R.win} · Uafgjort +${R.draw} · Nederlag ${R.loss} · Stemmer +${R.vote} · Kampens spiller +${R.motm} · Joga +${R.joga}</p>
        </div>
      </details>`;

    function modeCfg() {
      return LB.find((x) => x.k === lbMode) || LB[0];
    }

    function statVal(i, mode) {
      if (mode === 'pts') return standings(round).arr.find((r) => r.i === i)?.pts ?? 0;
      return counts(i, round)[mode] ?? 0;
    }

    function sortedRows() {
      const curR = standings(round);
      if (lbMode === 'pts') return curR.arr;
      return curR.arr
        .slice()
        .sort((a, b) => statVal(b.i, lbMode) - statVal(a.i, lbMode) || b.pts - a.pts);
    }

    function topForMode() {
      const rows = sortedRows();
      return rows[0] || null;
    }

    function renderLeader() {
      const slot = document.getElementById('leader-slot');
      if (!slot) return;
      const top = topForMode();
      if (!top) return;
      const cfg = modeCfg();
      const val = statVal(top.i, lbMode);
      const roles = roleLabelsShort(players[top.i].profile?.coveredRoles) || players[top.i]?.pos || '';
      let meta;
      if (lbMode === 'pts') {
        meta = `${val} point · ${roles}`;
      } else {
        meta = `${top.pts} point i alt · ${roles}`;
      }
      slot.innerHTML = playerHeroCard(players[top.i], top.i, {
        pts: val,
        label: cfg.leaderLbl,
        meta,
      });
      slot.querySelector('.leader')?.addEventListener('click', () => openPlayer(top.i));
    }

    if (leader) renderLeader();

    function renderChips() {
      document.getElementById('chips').innerHTML = LB.map(
        (s) => `<button type="button" class="chip${lbMode === s.k ? ' is-on' : ''}" data-k="${s.k}">${s.lbl}</button>`
      ).join('');
    }

    function renderBoardHead() {
      const cfg = modeCfg();
      const head = document.getElementById('board-head');
      if (!head) return;
      head.innerHTML = `
        <span class="board-head__player">Spiller</span>
        ${lbMode === 'pts' ? '<span class="board-head__delta">Δ</span>' : ''}
        <span class="board-head__stat">${esc(cfg.lbl)}</span>`;
    }

    function renderBoard() {
      const disp = sortedRows();
      const cfg = modeCfg();

      document.getElementById('board').innerHTML = disp
        .map((row, k) => {
          const eff = roundEffect(row.i, round);
          const delta = eff.delta;
          const val = statVal(row.i, lbMode);
          const medal = k === 0 ? ' gold' : k === 1 ? ' silver' : k === 2 ? ' bronze' : '';
          const deltaHtml =
            lbMode === 'pts'
              ? `<span class="lb-delta${delta > 0 ? ' up' : delta < 0 ? ' down' : ''}">${eff.played ? (delta > 0 ? '+' + delta : delta) : ''}</span>`
              : '';
          const subPts =
            lbMode !== 'pts'
              ? `<span class="lb-sub">${row.pts} pt</span>`
              : '';

          return `<button type="button" class="lb-row${medal}" data-p="${row.i}">
            <span class="lb-rank">${k + 1}</span>
            ${playerAvatarHtml(players[row.i], row.i, 44)}
            <div class="lb-info">
              <span class="lb-name">${esc(dispName(row.i))}</span>
              <span class="lb-pos">${esc(playerPosLine(players[row.i]))}</span>
            </div>
            ${deltaHtml}
            <div class="lb-stat-wrap">
              <span class="lb-stat">${val}</span>
              ${subPts}
            </div>
          </button>`;
        })
        .join('');

      const slab = document.getElementById('slab');
      if (slab && matches[round - 1]) {
        const lm = matches[round - 1];
        slab.textContent = `Runde ${round} / ${N} — ${lm.d || ''}${lm.o ? ' · ' + lm.o : ''}`;
      }

      renderBoardHead();
      renderLeader();
    }

    renderChips();
    renderBoard();

    document.getElementById('chips').addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      lbMode = b.dataset.k;
      renderChips();
      renderBoard();
    });

    document.getElementById('rng')?.addEventListener('input', (e) => {
      round = +e.target.value;
      renderBoard();
    });

    document.getElementById('board').addEventListener('click', (e) => {
      const row = e.target.closest('.lb-row');
      if (row) openPlayer(+row.dataset.p);
    });
  }

  renderPulje(dbu, { periodLabel: opts.periodLabel });
  renderKampePanel(dbu, matches, openPlayer, { periodLabel: opts.periodLabel });

  if (D.made) {
    document.getElementById('foot').innerHTML = `Opdateret ${new Date(D.made).toLocaleDateString('da-DK')} · BK Viktoria af 1900 · <a href="/admin.html">Admin</a>`;
  }
}

function dataForPeriod(data, periodId) {
  return { ...data, matches: filterMatchesByPeriod(data.matches || [], periodId) };
}

function setupPeriodNav(fullData) {
  const bar = document.getElementById('standings-period-bar');
  const sel = document.getElementById('sp-period-select');
  const current = periodIdForDate();
  const periods = listPeriodIds(fullData.squad, fullData.matches, current);

  const saved = localStorage.getItem(PERIOD_KEY);
  let period = saved && periods.includes(saved) ? saved : current;
  if (!periods.includes(period)) period = current;

  const render = async () => {
    period = sel?.value || period;
    if (!periods.includes(period)) period = current;
    localStorage.setItem(PERIOD_KEY, period);

    const isCurrent = period === current;
    const filtered = dataForPeriod(fullData, period);
    const filteredDbu = await fetchDbuForPeriod(period);
    const eng = createFantasyEngine(filtered);
    window.__fxEngine = { players: eng.players, fpFor: eng.fpFor, dispName: eng.dispName };
    window.__fxMatches = eng.matches;
    initStandings(filtered, filteredDbu, {
      isCurrentPeriod: isCurrent,
      periodLabel: periodLabel(period),
    });

    const periodList = sel?.options?.length ? [...sel.options].map((o) => o.value) : periods;
    updateSeasonNavUi(period, periodList, isCurrent);
  };

  periodNavRender = render;
  bindSeasonNavOnce();

  if (!bar || !sel) {
    render();
    return;
  }

  if (periods.length <= 1) {
    bar.hidden = true;
    render();
    return;
  }

  bar.hidden = false;
  sel.innerHTML = periods.map((id) =>
    `<option value="${id}" title="${periodLabel(id)}">${seasonNavButtonLabel(id)}</option>`
  ).join('');
  sel.value = period;
  updateSeasonNavUi(period, periods, period === current);
  sel.onchange = () => render();

  render();
}

async function boot() {
  setupNav();
  const isDemo = location.hash === '#demo' || new URLSearchParams(location.search).get('demo') === '1';
  const dbu = await fetchDbuData();

  let fantasyData = null;
  if (isDemo) {
    fantasyData = await (await fetch('/data/sample-season.json')).json();
  } else {
    try {
      const r = await fetch('/api/season', { cache: 'no-store' });
      if (r.ok) fantasyData = (await r.json()).data;
    } catch { /* ignore */ }

    if (!fantasyData) {
      const raw = location.hash && location.hash !== '#demo' ? location.hash.slice(1) : '';
      if (raw) {
        try {
          fantasyData = JSON.parse(await decodeFragment(raw));
        } catch {
          fail('Linket virker ikke. Bed træneren om et nyt.');
          renderPulje(dbu);
          renderKampePanelOnlyDbu(dbu);
          return;
        }
      }
    }
  }

  if (!fantasyData) {
    document.getElementById('sub').textContent = 'Pulje';
    document.getElementById('panel-fantasy').innerHTML =
      '<div class="msg">Ingen fantasy-data. <a href="/standings.html#demo">Se demo</a></div>';
    renderPulje(dbu);
    renderKampePanelOnlyDbu(dbu);
    return;
  }

  setupPeriodNav(fantasyData);
}

boot();
window.__fxInit = initStandings;
