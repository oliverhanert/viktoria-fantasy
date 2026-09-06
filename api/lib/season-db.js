import { getServiceClient } from './supabase.js';

const DEFAULT_RULES = {
  bestOf: 6,
  win: 8,
  margin_per_goal: 1,
  draw: 4,
  loss: -1,
  goal: { GK: 40, DEF: 30, MID: 25, ATT: 20 },
  assist: { GK: 20, DEF: 16, MID: 16, ATT: 16 },
  clean_sheet: { GK: 25, DEF: 20, MID: 10, ATT: 0 },
  conceded_per_goal: { GK: -2, DEF: -2, MID: -1, ATT: 0 },
  yellow: -10,
  red: -30,
  vote: 2,
  motm: 5,
  joga: 3,
};

function statRowToLegacy(st) {
  const o = { p: st.pos };
  if (st.goals) o.g = st.goals;
  if (st.assists) o.a = st.assists;
  if (st.votes) o.v = st.votes;
  if (st.joga) o.j = st.joga;
  if (st.yellow) o.y = st.yellow;
  if (st.red) o.r = st.red;
  return o;
}

function legacyStatToRow(idx, st) {
  return {
    player_idx: idx,
    pos: st.p,
    goals: st.g || 0,
    assists: st.a || 0,
    votes: st.v || 0,
    joga: st.j || 0,
    yellow: st.y || 0,
    red: st.r || 0,
  };
}

function pomFromRow(m) {
  const arr = m.pom_idxs;
  if (Array.isArray(arr) && arr.length) {
    return arr.length === 1 ? arr[0] : arr;
  }
  if (m.pom_idx != null) return m.pom_idx;
  return undefined;
}

function pomToDb(pom) {
  const idxs = pom == null || pom === ''
    ? []
    : Array.isArray(pom) ? pom.map((x) => +x) : [+pom];
  return {
    pom_idx: idxs.length === 1 ? idxs[0] : idxs[0] ?? null,
    pom_idxs: idxs,
  };
}

/** DB → legacy JSON (fantasy-engine format) */
export function rowsToSeason({ season, players, matches, stats }) {
  const statsByMatch = {};
  for (const s of stats || []) {
    if (!statsByMatch[s.match_id]) statsByMatch[s.match_id] = {};
    statsByMatch[s.match_id][s.player_idx] = statRowToLegacy(s);
  }

  const rawRules = season.rules || DEFAULT_RULES;
  const squad = rawRules.squad || { weeks: [] };
  const { squad: _sq, ...rules } = rawRules;

  return {
    id: season.id,
    shareId: season.share_id,
    made: season.updated_at,
    rules,
    squad,
    players: (players || [])
      .sort((a, b) => a.idx - b.idx)
      .map((p) => ({
        id: p.id,
        n: p.name,
        pos: p.pos,
        photo: p.photo_url || undefined,
        avatarSeed: p.avatar_seed || undefined,
        profile: p.profile || undefined,
      })),
    matches: (matches || [])
      .sort((a, b) => a.idx - b.idx)
      .map((m) => ({
        id: m.id,
        d: m.date || '',
        o: m.opponent || '',
        gf: m.gf ?? 0,
        ga: m.ga ?? 0,
        pom: pomFromRow(m),
        lineup: m.lineup || undefined,
        pl: statsByMatch[m.id] || {},
      })),
  };
}

async function getActiveSeasonId(db) {
  const { data } = await db.from('seasons').select('id').eq('is_active', true).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  return data?.id;
}

export async function loadSeasonByShareId(shareId) {
  const db = getServiceClient();
  const { data: season } = await db.from('seasons').select('*').eq('share_id', shareId).maybeSingle();
  if (!season) return null;
  return loadSeasonFull(season.id);
}

export async function loadActiveSeason() {
  const db = getServiceClient();
  const seasonId = await getActiveSeasonId(db);
  if (!seasonId) return null;
  return loadSeasonFull(seasonId);
}

async function loadSeasonFull(seasonId) {
  const db = getServiceClient();
  const [{ data: season }, { data: players }, { data: matches }] = await Promise.all([
    db.from('seasons').select('*').eq('id', seasonId).single(),
    db.from('players').select('*').eq('season_id', seasonId).order('idx'),
    db.from('matches').select('*').eq('season_id', seasonId).order('idx'),
  ]);
  if (!season) return null;

  const matchIds = (matches || []).map((m) => m.id);
  let stats = [];
  if (matchIds.length) {
    const { data } = await db.from('match_player_stats').select('*').in('match_id', matchIds);
    stats = data || [];
  }

  return rowsToSeason({ season, players, matches, stats });
}

/** Legacy JSON → DB (fuld erstatning af sæson-data) */
export async function saveSeasonData(legacy, seasonId = null) {
  const db = getServiceClient();
  const rules = { ...(legacy.rules || DEFAULT_RULES), squad: legacy.squad || { weeks: [] } };
  const now = new Date().toISOString();

  let sid = seasonId;
  let shareId;

  if (sid) {
    const { data: existing } = await db.from('seasons').select('share_id').eq('id', sid).single();
    shareId = existing?.share_id;
    await db.from('seasons').update({ rules, updated_at: now }).eq('id', sid);
  } else {
    sid = await getActiveSeasonId(db);
    if (sid) {
      const { data: existing } = await db.from('seasons').select('share_id').eq('id', sid).single();
      shareId = existing?.share_id;
      await db.from('seasons').update({ rules, updated_at: now }).eq('id', sid);
    } else {
      const { data: created, error } = await db.from('seasons').insert({ rules, is_active: true, updated_at: now }).select('id, share_id').single();
      if (error) throw error;
      sid = created.id;
      shareId = created.share_id;
    }
  }

  // Slet og genindlæs spillere/kampe (simpelt, hold størrelse er lille)
  await db.from('players').delete().eq('season_id', sid);
  await db.from('matches').delete().eq('season_id', sid);

  const players = legacy.players || [];
  const playerRows = players.map((p, i) => ({
    season_id: sid,
    idx: i,
    name: p.n,
    pos: p.pos || 'MID',
    photo_url: p.photo || null,
    avatar_seed: p.avatarSeed || null,
    profile: p.profile || {},
  }));
  if (playerRows.length) {
    let { error } = await db.from('players').insert(playerRows);
    if (error?.message?.includes('profile')) {
      const slim = playerRows.map(({ profile, ...rest }) => rest);
      ({ error } = await db.from('players').insert(slim));
    }
    if (error) throw error;
  }

  const matches = legacy.matches || [];
  for (let mi = 0; mi < matches.length; mi++) {
    const m = matches[mi];
    const pomDb = pomToDb(m.pom);
    const baseRow = {
      season_id: sid,
      idx: mi,
      date: m.d || null,
      opponent: m.o || null,
      gf: m.gf ?? 0,
      ga: m.ga ?? 0,
      pom_idx: pomDb.pom_idx,
      lineup: m.lineup || null,
    };
    let { data: matchRow, error: mErr } = await db
      .from('matches')
      .insert({ ...baseRow, pom_idxs: pomDb.pom_idxs })
      .select('id')
      .single();
    if (mErr?.message?.includes('pom_idxs')) {
      ({ data: matchRow, error: mErr } = await db
        .from('matches')
        .insert(baseRow)
        .select('id')
        .single());
    }
    if (mErr) throw mErr;

    const pl = m.pl || {};
    const statRows = Object.entries(pl).map(([idx, st]) => legacyStatToRow(+idx, st));
    if (statRows.length) {
      const rows = statRows.map((r) => ({ ...r, match_id: matchRow.id }));
      const { error: sErr } = await db.from('match_player_stats').insert(rows);
      if (sErr) throw sErr;
    }
  }

  await db.from('seasons').update({ updated_at: now }).eq('id', sid);

  return { seasonId: sid, shareId };
}

export async function updatePlayerPhoto(playerId, photoUrl) {
  const db = getServiceClient();
  const { error } = await db.from('players').update({ photo_url: photoUrl }).eq('id', playerId);
  if (error) throw error;
}
