/** Fetch DBU pulje + kampe — API i prod, statisk cache lokalt */

import { DBU_TEAM_ID, poolIdForPeriod, dbuCacheKey } from './dbu-periods.js';
import { filterDbuMatchesByPeriod } from './admin-squad.js';

const dbuCache = new Map();

const EMPTY_DBU = { pool: [], matches: [], source: 'none', poolInfo: null, summary: {} };

export function buildDbuSummary(pool, matches) {
  const us = pool?.find((t) => t.isUs);
  const leader = pool?.[0];
  const played = (matches || []).filter((m) => m.played);
  const upcoming = (matches || []).filter((m) => !m.played);
  const form = played.slice(-5).map((m) => m.result);

  let gapToLeader = null;
  let gapToAbove = null;
  if (us && leader) {
    gapToLeader = leader.points - us.points;
    const above = pool?.find((t) => t.rank === us.rank - 1);
    if (above) gapToAbove = above.points - us.points;
  }

  return {
    rank: us?.rank ?? null,
    points: us?.points ?? 0,
    played: us?.played ?? 0,
    record: us ? `${us.won}-${us.drawn}-${us.lost}` : null,
    goalDiff: us?.goalDiff ?? 0,
    leader: leader ? { name: leader.name, points: leader.points } : null,
    gapToLeader,
    gapToAbove,
    form,
    nextMatch: upcoming[0] || null,
    lastMatch: played[played.length - 1] || null,
    totalTeams: pool?.length ?? 0,
  };
}

export async function fetchDbuData(teamId = DBU_TEAM_ID, poolId = '496291') {
  const key = dbuCacheKey(teamId, poolId);
  if (dbuCache.has(key)) return dbuCache.get(key);

  const endpoints = [`/api/dbu-data?teamId=${teamId}&poolId=${poolId}`];
  if (poolId === '496291') endpoints.push('/data/dbu-cache.json');

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.pool?.length || data.matches?.length) {
        dbuCache.set(key, data);
        return data;
      }
    } catch { /* try next */ }
  }

  const empty = { ...EMPTY_DBU };
  dbuCache.set(key, empty);
  return empty;
}

export async function fetchDbuForPeriod(periodId) {
  const poolId = poolIdForPeriod(periodId);
  if (!poolId) return { ...EMPTY_DBU };

  const raw = await fetchDbuData(DBU_TEAM_ID, poolId);
  if (!raw.pool?.length && !raw.matches?.length) return { ...EMPTY_DBU };

  const matches = filterDbuMatchesByPeriod(raw.matches || [], periodId);
  return {
    ...raw,
    matches,
    summary: buildDbuSummary(raw.pool, matches),
  };
}

export function nextMatch(matches) {
  return (matches || []).find((m) => !m.played) || null;
}

export function lastResult(matches) {
  const played = (matches || []).filter((m) => m.played);
  return played.length ? played[played.length - 1] : null;
}

export function formDots(matches, n = 5) {
  const played = (matches || []).filter((m) => m.played).slice(-n);
  return played.map((m) => m.result || (m.gf > m.ga ? 'win' : m.gf === m.ga ? 'draw' : 'loss'));
}
