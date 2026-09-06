/** Fetch DBU pulje + kampe — API i prod, statisk cache lokalt */

const DEFAULT_SLUG = '21239_496291';

export async function fetchDbuData(teamId = '21239', poolId = '496291') {
  const endpoints = [
    `/api/dbu-data?teamId=${teamId}&poolId=${poolId}`,
    `/data/dbu-cache.json`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.pool?.length) return data;
    } catch { /* try next */ }
  }

  return { pool: [], matches: [], source: 'none' };
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
