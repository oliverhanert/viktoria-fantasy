/** Regelbaserede pulje- og fantasy-facts — ikke AI */

export function buildPoolInsights(pool, matches, summary = {}) {
  const insights = [];
  const us = pool?.find((t) => t.isUs);
  if (!us || !pool?.length) return insights;

  const total = pool.length;
  const relegationSpots = Math.min(2, Math.max(1, Math.floor(total / 4)));
  const dangerRank = total - relegationSpots + 1;

  if (us.rank >= dangerRank) {
    const above = pool.find((t) => t.rank === us.rank - 1);
    const need = above ? above.points - us.points + 1 : 1;
    insights.push({
      tone: 'warn',
      text: `Plads ${us.rank} af ${total} — ${need} point for at komme over nedrykningszonen`,
    });
  } else if (us.rank <= 2 && summary.gapToLeader === 0) {
    insights.push({ tone: 'good', text: 'I top — holdet fører puljen' });
  } else if (summary.gapToLeader > 0) {
    insights.push({
      tone: 'info',
      text: `${summary.gapToLeader} point efter ${summary.leader?.name || 'føreren'} (${summary.leader?.points ?? '?'} p)`,
    });
  }

  if (summary.gapToAbove > 0 && us.rank > 1) {
    insights.push({
      tone: 'neutral',
      text: `${summary.gapToAbove} point fra pladsen over`,
    });
  }

  const remaining = (matches || []).filter((m) => !m.played).length;
  const played = (matches || []).filter((m) => m.played).length;
  if (remaining > 0) {
    insights.push({
      tone: 'neutral',
      text: `${played} spillet · ${remaining} tilbage — max ${remaining * 3} point at hente`,
    });
  }

  const form = summary.form || [];
  if (form.length >= 3) {
    const wins = form.filter((r) => r === 'win').length;
    const losses = form.filter((r) => r === 'loss').length;
    if (wins >= 3) insights.push({ tone: 'good', text: `Stærk form: ${wins} sejre i seneste ${form.length}` });
    else if (losses >= 3) insights.push({ tone: 'warn', text: `Tung periode: ${losses} nederlag i seneste ${form.length}` });
  }

  return insights;
}

export function buildFantasyInsights(engine, round) {
  const insights = [];
  const { standings, N, matches, dispName } = engine;
  if (!N || !standings) return insights;

  const cur = standings(round);
  const leader = cur.arr[0];
  const second = cur.arr[1];
  if (!leader) return insights;

  if (round < N) {
    insights.push({
      tone: 'neutral',
      text: `Efter runde ${round} af ${N} — ${matches[round - 1]?.o ? 'senest mod ' + matches[round - 1].o : ''}`,
    });
  }

  if (second && leader.pts > second.pts) {
    const gap = leader.pts - second.pts;
    insights.push({
      tone: 'good',
      text: `${dispName(leader.i)} fører med ${gap} point foran nr. 2`,
    });
  } else if (cur.arr.length >= 2 && cur.arr[0].pts === cur.arr[1].pts) {
    insights.push({ tone: 'info', text: 'Delt førsteplads — pointene er lige' });
  }

  const last = matches[round - 1];
  if (last?.gf != null && last?.ga != null) {
    const res = last.gf > last.ga ? 'sejr' : last.gf === last.ga ? 'uafgjort' : 'nederlag';
    insights.push({
      tone: last.gf >= last.ga ? 'good' : 'warn',
      text: `Seneste kamp: ${res} ${last.gf}–${last.ga} mod ${last.o || '?'}`,
    });
  }

  return insights;
}

export function insightsHtml(items, max = 2) {
  const slice = items?.slice(0, max);
  if (!slice?.length) return '';
  return `<p class="facts-line">${slice.map((it) => it.text).join('<span class="facts-sep">·</span>')}</p>`;
}
