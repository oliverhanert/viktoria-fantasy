import { createFantasyEngine, decodeFragment } from './fantasy-engine.js';
import { playerAvatarHtml, playerHeroCard } from './player-avatar.js';
import { fetchDbuData } from './dbu-client.js';
import { assignFromLineup, renderPitch } from './pitch.js';
import { buildLogoMap, matchLogosHtml } from './team-logos.js';

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
  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.innerHTML = `<div class="ov-sheet"><button type="button" class="ov-close" aria-label="Luk">×</button><h3 class="ov-title">${title}</h3>${sub ? `<p class="ov-sub">${sub}</p>` : ''}${body}</div>`;
  ov.addEventListener('click', (e) => {
    if (e.target === ov || e.target.closest('.ov-close')) ov.remove();
  });
  document.body.appendChild(ov);
}

function bindPitchClicks(container, openPlayer) {
  container.querySelectorAll('[data-p]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openPlayer(+btn.dataset.p);
    });
  });
}

function renderPulje(dbu) {
  const el = document.getElementById('panel-pulje');
  const s = dbu.summary || {};

  if (!dbu.pool?.length) {
    el.innerHTML = '<div class="loading"></div>';
    return;
  }

  const rows = dbu.pool
    .map(
      (t) => `<tr class="${t.isUs ? 'is-us' : ''}">
        <td>${t.rank}</td>
        <td><div class="pulje-team">${t.logo ? `<img src="${esc(t.logo)}" alt="" loading="lazy"/>` : ''}${esc(t.name)}</div></td>
        <td>${t.played}</td>
        <td>${t.won}-${t.drawn}-${t.lost}</td>
        <td>${t.goalsFor}:${t.goalsAgainst}</td>
        <td class="pulje-pts">${t.points}</td>
      </tr>`
    )
    .join('');

  el.innerHTML = `
    <div class="pulje-summary">
      <div><strong>#${s.rank ?? '–'}</strong><span>Placering</span></div>
      <div><strong>${s.points ?? 0}</strong><span>Point</span></div>
      <div class="form-row">${formDotsHtml(s.form)}</div>
    </div>
    ${s.nextMatch ? `<p class="next-match">Næste: <strong>${esc(s.nextMatch.opponent)}</strong> · ${esc(s.nextMatch.date || '')}</p>` : ''}
    <div class="pulje-table-wrap">
      <table class="pulje-table">
        <thead><tr><th>#</th><th>Hold</th><th>K</th><th>S-U-N</th><th>Mål</th><th>P</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function matchCardHtml(m, fIdx, fantasyMatch, logoMap) {
  const day = (m.date || '').match(/^(\d+)/)?.[1] || '–';
  const mon = (m.date || '').replace(/^\d+\.\s*/, '').split(' ')[0] || '';
  const resCls = m.result || '';
  const badge = !m.played
    ? '<span class="badge badge-soon">Kommer</span>'
    : `<span class="badge badge-${resCls}">${resCls === 'win' ? 'Sejr' : resCls === 'draw' ? 'Uafgjort' : 'Nederlag'}</span>`;
  const hasLineup = fIdx >= 0 && fantasyMatch?.lineup;

  return `<article class="match-card${hasLineup ? ' has-lineup' : ''}" data-f="${fIdx}">
    <button type="button" class="match-card__head" ${hasLineup ? '' : 'disabled'}>
      <div class="match-card__date"><span class="match-card__day">${day}</span><span class="match-card__mon">${esc(mon)}</span></div>
      ${matchLogosHtml(logoMap, m)}
      <div class="match-card__body">
        <div class="match-card__opp">${m.isHome ? 'vs' : '@'} ${esc(m.opponent)}</div>
        <div class="match-card__meta">${badge}</div>
      </div>
      <div class="match-card__score ${resCls}">${m.played ? `${m.gf}–${m.ga}` : '–'}</div>
      ${hasLineup ? '<span class="match-card__chev" aria-hidden="true">›</span>' : ''}
    </button>
    <div class="match-card__expand"></div>
  </article>`;
}

function renderKampePanelOnlyDbu(dbu) {
  const logoMap = buildLogoMap(dbu.pool);
  document.getElementById('panel-kampe').innerHTML = `<div class="match-list">${(dbu.matches || [])
    .map((m) => matchCardHtml(m, -1, null, logoMap))
    .join('')}</div>`;
}

function renderKampePanel(dbu, fantasyMatches, openPlayer) {
  const el = document.getElementById('panel-kampe');
  const dbuMatches = dbu.matches || [];
  const logoMap = buildLogoMap(dbu.pool);

  el.innerHTML = `<div class="match-list" id="kampe-list">${
    dbuMatches.length
      ? dbuMatches
          .map((m) => {
            const fIdx = findFantasyMatch(fantasyMatches, m);
            const fm = fIdx >= 0 ? fantasyMatches[fIdx] : null;
            return matchCardHtml(m, fIdx, fm, logoMap);
          })
          .join('')
      : '<div class="loading"></div>'
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
        pointsHtml = `<div class="match-points"><div class="match-points__title">Point i kampen</div>${list
          .map(
            (r) => `<button type="button" class="match-points__row" data-p="${r.i}">
              ${playerAvatarHtml(players[r.i], r.i, 36, '', 'row')}
              <span class="match-points__name">${esc(dispName(r.i))}</span>
              <span class="match-points__pos">${esc(players[r.i]?.pos || '')}</span>
              <strong class="match-points__pts${r.total < 0 ? ' neg' : ''}">${r.total > 0 ? '+' : ''}${r.total}</strong>
            </button>`
          )
          .join('')}</div>`;
      }

      expand.innerHTML =
        renderPitch(placed, bench, {
          formation: formationKey,
          opponent: dbuM ? `${dbuM.isHome ? 'vs' : '@'} ${m.o}` : m.o || '',
          score: `${m.gf}–${m.ga}`,
        }) + pointsHtml;

      bindPitchClicks(expand, openPlayer);
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
  document.querySelectorAll('.nav__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav__btn').forEach((b) => {
        b.classList.remove('is-active');
        b.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('is-active'));
      btn.classList.add('is-active');
      btn.setAttribute('aria-selected', 'true');
      document.getElementById('panel-' + btn.dataset.tab)?.classList.add('is-active');
    });
  });
}

function fail(msg) {
  document.getElementById('sub').textContent = '';
  document.getElementById('panel-stilling').innerHTML = `<div class="msg">${msg}</div>`;
}

export function initStandings(D, dbu = {}) {
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
    : 'Pulje';

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
      `<div class="ov-player">${playerAvatarHtml(players[i], i, 64)}<strong>${total} pt</strong></div>${catHtml}`
    );
  }

  const stillingEl = document.getElementById('panel-stilling');

  if (!N) {
    stillingEl.innerHTML = '<div class="msg">Ingen fantasy-data endnu.</div>';
  } else {
    let lbSort = 'pts';
    const LB = [
      { k: 'pts', lbl: 'Point' },
      { k: 'g', lbl: 'Mål' },
      { k: 'a', lbl: 'Assists' },
      { k: 'mom', lbl: 'KS' },
      { k: 'j', lbl: 'Joga Bonito' },
    ];

    stillingEl.innerHTML = `
      ${leader ? `<div id="leader-slot"></div>` : ''}
      ${N > 1 ? `<div class="round-ctrl"><input type="range" min="1" max="${N}" value="${N}" id="rng"><div class="round-ctrl__lbl" id="slab"></div></div>` : ''}
      <div class="chips" id="chips"></div>
      <div class="board" id="board"></div>
      <details class="rules"><summary>Pointregler</summary>
        <div class="rules__body">
          ${CAP ? `<p>Kun de ${CAP} bedste kampe tæller.</p>` : ''}
          <p>Sejr +${R.win} · Uafgjort +${R.draw} · Nederlag ${R.loss} · Stemmer +${R.vote} · KS +${R.motm} · Joga Bonito +${R.joga}</p>
        </div>
      </details>`;

    if (leader) {
      document.getElementById('leader-slot').innerHTML = playerHeroCard(players[leader.i], leader.i, { pts: leader.pts });
      document.getElementById('leader-slot').querySelector('.leader-pill')?.addEventListener('click', () => openPlayer(leader.i));
    }

    function renderChips() {
      document.getElementById('chips').innerHTML = LB.map(
        (s) => `<button type="button" class="chip${lbSort === s.k ? ' on' : ''}" data-k="${s.k}">${s.lbl}</button>`
      ).join('');
    }

    function renderBoard() {
      const curR = standings(round);
      let disp = curR.arr;
      if (lbSort !== 'pts') {
        disp = curR.arr
          .slice()
          .sort((a, b) => counts(b.i, round)[lbSort] - counts(a.i, round)[lbSort] || b.pts - a.pts);
      }

      document.getElementById('board').innerHTML = disp
        .map((row, k) => {
          const eff = roundEffect(row.i, round);
          const delta = eff.delta;

          return `<button type="button" class="lb-row" data-p="${row.i}" style="animation-delay:${k * 0.03}s">
            <span class="lb-rank">${k + 1}</span>
            ${playerAvatarHtml(players[row.i], row.i, 44)}
            <div class="lb-info">
              <span class="lb-name">${esc(dispName(row.i))}</span>
              <span class="lb-pos">${esc(players[row.i]?.pos || '')}</span>
            </div>
            <span class="lb-delta${delta > 0 ? ' up' : delta < 0 ? ' down' : ''}">${eff.played ? (delta > 0 ? '+' + delta : delta) : ''}</span>
            <span class="lb-pts">${row.pts}</span>
          </button>`;
        })
        .join('');

      const slab = document.getElementById('slab');
      if (slab && matches[round - 1]) {
        const lm = matches[round - 1];
        slab.textContent = `Runde ${round} / ${N} — ${lm.d || ''}${lm.o ? ' · ' + lm.o : ''}`;
      }

      if (leader) {
        const l = standings(round).arr[0];
        if (l) {
          document.getElementById('leader-slot').innerHTML = playerHeroCard(players[l.i], l.i, { pts: l.pts });
          document.getElementById('leader-slot').querySelector('.leader-pill')?.addEventListener('click', () => openPlayer(l.i));
        }
      }
    }

    renderChips();
    renderBoard();

    document.getElementById('chips').addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      lbSort = b.dataset.k;
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

  renderPulje(dbu);
  renderKampePanel(dbu, matches, openPlayer);
  setupNav();

  if (D.made) {
    document.getElementById('foot').textContent = `Opdateret ${new Date(D.made).toLocaleDateString('da-DK')}`;
  }
}

async function boot() {
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
          setupNav();
          return;
        }
      }
    }
  }

  if (!fantasyData) {
    document.getElementById('sub').textContent = 'Pulje';
    document.getElementById('panel-stilling').innerHTML =
      '<div class="msg">Ingen fantasy-data. <a href="/standings.html#demo">Se demo</a></div>';
    renderPulje(dbu);
    renderKampePanelOnlyDbu(dbu);
    setupNav();
    return;
  }

  const eng = createFantasyEngine(fantasyData);
  window.__fxEngine = { players: eng.players, fpFor: eng.fpFor, dispName: eng.dispName };
  window.__fxMatches = eng.matches;

  initStandings(fantasyData, dbu);
}

boot();
window.__fxInit = initStandings;
