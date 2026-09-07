/** DBU pool-mapping per halvsæson — Viktoria 2 (team 21239) */

export const DBU_TEAM_ID = '21239';
export const DBU_CLUB_ID = '1592';

/** Kendte poolId per halvsæson (fra dbu.dk/resultater/klub/1592) */
export const DBU_POOL_MAP = {
  '2025-26-forår': '466001',   // Serie 3, P2/5 Forår
  '2025-26-efterår': '496291', // Serie 2, P2/3 Efterår
  '2026-27-efterår': '496291', // Serie 2, P2/3 Efterår (nuværende)
};

export function hasDbuPoolForPeriod(periodId) {
  return Boolean(DBU_POOL_MAP[periodId]);
}

export function poolIdForPeriod(periodId) {
  return DBU_POOL_MAP[periodId] || null;
}

export function dbuCacheKey(teamId, poolId) {
  return `${teamId}_${poolId}`;
}
