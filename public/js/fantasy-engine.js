/** BK Viktoria Fantasy — point engine (compatible with coach portal data format) */

export function pomIndices(match) {
  const p = match?.pom;
  if (p == null || p === '') return [];
  if (Array.isArray(p)) return p.map((x) => +x).filter((x) => !Number.isNaN(x));
  return [+p];
}

export function isMotm(match, i) {
  return pomIndices(match).includes(i);
}

export function createFantasyEngine(D) {
  const players = D.players || [];
  const matches = D.matches || [];
  const R = D.rules || {};
  const N = matches.length;
  const CAP = +R.bestOf > 0 ? Math.floor(+R.bestOf) : 0;

  const dispName = (i) => (players[i] ? players[i].n : '?');
  const played = (m, i) => m.pl && m.pl[i] != null;
  const scoreRes = (m) => (m.gf > m.ga ? 'win' : m.gf === m.ga ? 'draw' : 'loss');
  const resLabel = (m) => {
    const r = scoreRes(m);
    return { win: 'Sejr', draw: 'Uafgjort', loss: 'Nederlag' }[r];
  };

  function fpFor(m, i) {
    if (!played(m, i)) return null;
    const st = m.pl[i];
    const pos = st.p || 'MID';
    const gf = m.gf || 0;
    const ga = m.ga || 0;
    const p = {};
    p.result = gf > ga ? R.win + (R.margin_per_goal || 0) * (gf - ga) : gf === ga ? R.draw : R.loss;
    p.goals = (st.g || 0) * (R.goal ? R.goal[pos] : 0);
    p.assists = (st.a || 0) * (R.assist ? R.assist[pos] : 0);
    p.goals_conceded = ga * (R.conceded_per_goal ? R.conceded_per_goal[pos] : 0);
    p.clean_sheet = ga === 0 ? (R.clean_sheet ? R.clean_sheet[pos] : 0) : 0;
    p.yellow = (st.y || 0) * (R.yellow || 0);
    p.red = (st.r || 0) * (R.red || 0);
    p.votes = (st.v || 0) * (R.vote || 0);
    p.motm = isMotm(m, i) ? R.motm || 0 : 0;
    p.joga = (st.j || 0) * (R.joga || 0);
    let t = 0;
    for (const k in p) t += p[k];
    return { pos, total: t, parts: p };
  }

  function counts(i, upto) {
    const c = { mp: 0, w: 0, d: 0, l: 0, g: 0, a: 0, cs: 0, y: 0, r: 0, v: 0, mom: 0, j: 0 };
    for (let idx = 0; idx < upto; idx++) {
      const m = matches[idx];
      if (!played(m, i)) continue;
      c.mp++;
      if (m.gf > m.ga) c.w++;
      else if (m.gf === m.ga) c.d++;
      else c.l++;
      if ((m.ga || 0) === 0) c.cs++;
      const st = m.pl[i];
      c.g += st.g || 0;
      c.a += st.a || 0;
      c.y += st.y || 0;
      c.r += st.r || 0;
      c.v += st.v || 0;
      c.j += st.j || 0;
      if (isMotm(m, i)) c.mom++;
    }
    return c;
  }

  function capSum(vals) {
    if (!CAP || vals.length <= CAP) return vals.reduce((a, b) => a + b, 0);
    return vals.slice().sort((a, b) => b - a).slice(0, CAP).reduce((a, b) => a + b, 0);
  }

  function capIdx(totals) {
    if (!CAP || totals.length <= CAP) return totals.map((_, i) => i);
    return totals
      .map((t, i) => ({ i, t }))
      .sort((a, b) => b.t - a.t)
      .slice(0, CAP)
      .map((x) => x.i);
  }

  function countedRoundSet(i, K) {
    const items = [];
    for (let r = 0; r < K; r++) {
      const f = fpFor(matches[r], i);
      if (f) items.push({ i: r, t: f.total });
    }
    const idxs = capIdx(items.map((x) => x.t));
    const set = {};
    idxs.forEach((pos) => {
      set[items[pos].i] = items[pos].t;
    });
    return set;
  }

  function roundEffect(i, roundNum) {
    const rf = roundNum >= 1 ? fpFor(matches[roundNum - 1], i) : null;
    const setR = countedRoundSet(i, roundNum);
    const setPrev = roundNum >= 1 ? countedRoundSet(i, roundNum - 1) : {};
    const sum = (s) => {
      let t = 0;
      for (const k in s) t += s[k];
      return t;
    };
    const counted = !!rf && setR[roundNum - 1] !== undefined;
    let skR = null;
    let skP = null;
    for (const k in setPrev) {
      if (setR[k] === undefined) {
        skR = +k + 1;
        skP = setPrev[k];
        break;
      }
    }
    return {
      played: !!rf,
      matchPts: rf ? rf.total : 0,
      delta: sum(setR) - sum(setPrev),
      counted,
      skippedRound: skR,
      skippedPts: skP,
    };
  }

  function matchTop(m) {
    let bi = -1;
    let bp = -Infinity;
    for (let i = 0; i < players.length; i++) {
      const f = fpFor(m, i);
      if (f && f.total > bp) {
        bp = f.total;
        bi = i;
      }
    }
    return bi >= 0 ? { i: bi, pts: bp } : null;
  }

  function standings(upto) {
    const arr = players
      .map((pl, i) => {
        const vals = [];
        let mp = 0;
        for (let r = 0; r < upto; r++) {
          const f = fpFor(matches[r], i);
          if (f) {
            vals.push(f.total);
            mp++;
          }
        }
        return { i, pts: capSum(vals), mp };
      })
      .filter((x) => x.mp >= 1);
    arr.sort((a, b) => b.pts - a.pts || b.mp - a.mp || dispName(a.i).localeCompare(dispName(b.i)));
    const ranks = {};
    arr.forEach((x, k) => {
      x.rank = k + 1;
      ranks[x.i] = k + 1;
    });
    return { arr, ranks };
  }

  function avgPts(m) {
    let s = 0;
    let n = 0;
    for (let i = 0; i < players.length; i++) {
      const f = fpFor(m, i);
      if (f) {
        s += f.total;
        n++;
      }
    }
    return n ? Math.round((s / n) * 10) / 10 : 0;
  }

  const CAT = {
    result: 'Kampresultat',
    goals: 'Mål',
    assists: 'Assists',
    clean_sheet: 'Clean sheet',
    goals_conceded: 'Indkasserede mål',
    votes: 'Stemmer',
    motm: 'Kampens spiller',
    joga: 'Joga Bonito',
    yellow: 'Gule kort',
    red: 'Røde kort',
  };
  const CATORD = ['result', 'goals', 'assists', 'clean_sheet', 'goals_conceded', 'votes', 'motm', 'joga', 'yellow', 'red'];

  function partsLine(parts) {
    return CATORD.filter((k) => parts[k])
      .map((k) => `${CAT[k]} ${parts[k] > 0 ? '+' : ''}${parts[k]}`)
      .join(' · ');
  }

  return {
    players,
    matches,
    rules: R,
    N,
    CAP,
    dispName,
    played,
    scoreRes,
    resLabel,
    fpFor,
    counts,
    roundEffect,
    matchTop,
    standings,
    avgPts,
    CAT,
    CATORD,
    partsLine,
  };
}

export async function decodeFragment(raw) {
  const flag = raw.charAt(0);
  const data = raw.slice(1);
  if (flag === 'r') return b64urlToText(data);
  if (flag === 'g') {
    if (typeof DecompressionStream === 'undefined') throw new Error('nogzip');
    const stream = new Blob([b64urlToBytes(data)]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }
  if (flag === 'i') {
    const r = await fetch('/api/share?id=' + encodeURIComponent(data), { cache: 'force-cache' });
    if (!r.ok) throw new Error('gone');
    const rec = await r.json();
    return JSON.stringify(rec && rec.data ? rec.data : rec);
  }
  return b64urlToText(raw);
}

function b64urlToText(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return decodeURIComponent(escape(atob(s)));
}

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}
