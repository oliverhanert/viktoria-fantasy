/**
 * Unified DBU data endpoint — puljestilling + kampprogram
 * GET /.netlify/functions/dbu-data?teamId=21239&poolId=496291
 *
 * Strategy:
 * 1. KlubWeb API if DBU_API_KEY is set (official, stable)
 * 2. Public DBU HTML scrape as fallback (no key required)
 */

import * as cheerio from 'cheerio';
import { handleOptions } from './lib/http.js';

const DBU_BASE = 'https://clubservice.dbu.dk/api';
const DEFAULT_TEAM = '21239';
const DEFAULT_POOL = '496291';
const OUR_TEAM = 'Viktoria 2';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return handleOptions(res);

  const q = req.query || {};
  const teamId = q.teamId || DEFAULT_TEAM;
  const poolId = q.poolId || DEFAULT_POOL;
  const teamSlug = `${teamId}_${poolId}`;

  try {
    const apiKey = process.env.DBU_API_KEY;
    let source = 'scrape';
    let pool = null;
    let matches = null;
    let poolInfo = null;

    if (apiKey) {
      try {
        const apiData = await fetchFromApi(apiKey, teamId, poolId);
        if (apiData) {
          source = 'api';
          pool = apiData.pool;
          matches = apiData.matches;
          poolInfo = apiData.poolInfo;
        }
      } catch (e) {
        console.warn('DBU API failed, falling back to scrape:', e.message);
      }
    }

    if (!pool || !matches) {
      const scraped = await scrapeDbu(teamSlug, teamId);
      pool = pool || scraped.pool;
      matches = matches || scraped.matches;
      poolInfo = poolInfo || scraped.poolInfo;
    }

    const summary = buildSummary(pool, matches);

    res.status(200);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({
      source,
      syncedAt: new Date().toISOString(),
      teamId,
      poolId,
      teamSlug,
      poolInfo,
      pool,
      matches,
      summary,
      ourTeam: OUR_TEAM,
    });
  } catch (err) {
    res.status(500);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ error: err.message });
  }
}

async function fetchFromApi(apiKey, teamId, poolId) {
  const matchUrl = `${DBU_BASE}/TeamMatch?APIKey=${encodeURIComponent(apiKey)}&PoolId=${poolId}&TeamId=${teamId}`;
  const posUrl = `${DBU_BASE}/TeamPoolPosition?APIKey=${encodeURIComponent(apiKey)}&PoolId=${poolId}&TeamId=${teamId}`;

  const [matchRes, posRes] = await Promise.all([fetch(matchUrl), fetch(posUrl)]);
  if (!matchRes.ok && !posRes.ok) return null;

  const matchData = matchRes.ok ? await matchRes.json() : null;
  const posData = posRes.ok ? await posRes.json() : null;

  const rawMatches = Array.isArray(matchData) ? matchData : matchData?.Matches || matchData?.matches || [];
  const rawPool = Array.isArray(posData) ? posData : posData?.Teams || posData?.teams || posData?.PoolPositions || [];

  return {
    poolInfo: posData?.PoolName || posData?.poolName || null,
    pool: rawPool.map(normalizeApiPoolRow).filter(Boolean),
    matches: rawMatches.map((m) => normalizeApiMatch(m, teamId)).filter(Boolean),
  };
}

function normalizeApiPoolRow(row) {
  if (!row) return null;
  return {
    rank: row.Position ?? row.position ?? row.Rank,
    name: row.TeamName || row.teamName || row.Name,
    played: row.Played ?? row.played ?? row.Matches,
    won: row.Won ?? row.won ?? 0,
    drawn: row.Drawn ?? row.drawn ?? row.Draw ?? 0,
    lost: row.Lost ?? row.lost ?? 0,
    goalsFor: row.GoalsFor ?? row.goalsFor ?? 0,
    goalsAgainst: row.GoalsAgainst ?? row.goalsAgainst ?? 0,
    points: row.Points ?? row.points ?? 0,
    teamId: row.TeamId || row.teamId,
    isUs: String(row.TeamName || row.teamName || '').includes('Viktoria'),
  };
}

function normalizeApiMatch(m, ourTeamId) {
  const isHome = String(m.IsHomeTeam ?? m.isHome ?? true) === 'true' || m.IsHomeTeam === true;
  const gf = isHome ? (m.HomeGoals ?? m.ResultHome) : (m.AwayGoals ?? m.ResultAway);
  const ga = isHome ? (m.AwayGoals ?? m.ResultAway) : (m.HomeGoals ?? m.ResultHome);
  const hasResult = gf != null && ga != null;
  return {
    matchId: m.MatchId || m.Id,
    date: formatDateDa(m.MatchDate || m.Date),
    time: m.MatchTime || m.Time || null,
    opponent: isHome ? m.AwayTeamName || m.AwayTeam : m.HomeTeamName || m.HomeTeam,
    isHome,
    gf: hasResult ? +gf : null,
    ga: hasResult ? +ga : null,
    played: hasResult,
    venue: m.StadiumName || m.Venue || null,
  };
}

async function scrapeDbu(teamSlug, teamId) {
  const base = `https://www.dbu.dk/resultater/hold/${teamSlug}`;
  const [stillingHtml, kampHtml] = await Promise.all([
    fetch(base + '/stilling').then((r) => r.text()),
    fetch(base + '/kampprogram').then((r) => r.text()),
  ]);

  return {
    poolInfo: extractPoolInfo(stillingHtml),
    pool: parsePoolTable(stillingHtml),
    matches: parseMatchProgram(kampHtml, teamId),
  };
}

function extractPoolInfo(html) {
  const $ = cheerio.load(html);
  const h3 = $('h3').first().text().trim();
  return h3 || null;
}

function parsePoolTable(html) {
  const $ = cheerio.load(html);
  const rows = [];

  $('table.sr--pool-position--table tbody tr[data-teamid]').each((_, tr) => {
    const $tr = $(tr);
    const tds = $tr.find('td');
    const name = $tr.find('.teamname-logo span').text().trim();
    const logo = $tr.find('.teamname-logo img').attr('src') || null;
    const rank = parseInt(tds.eq(0).text(), 10);
    const played = parseInt(tds.eq(2).text(), 10);
    const won = parseInt(tds.eq(3).text(), 10);
    const drawn = parseInt(tds.eq(4).text(), 10);
    const lost = parseInt(tds.eq(5).text(), 10);
    const gf = parseInt($tr.find('.home-score').text(), 10) || 0;
    const ga = parseInt($tr.find('.away-score').text(), 10) || 0;
    const points = parseInt(tds.filter('.centered').last().text(), 10);

    rows.push({
      rank,
      name,
      logo,
      played: played || 0,
      won: won || 0,
      drawn: drawn || 0,
      lost: lost || 0,
      goalsFor: gf,
      goalsAgainst: ga,
      goalDiff: gf - ga,
      points: points || 0,
      teamId: $tr.attr('data-teamid'),
      isUs: name.includes('Viktoria'),
    });
  });

  return rows;
}

function parseMatchProgram(html, ourTeamId) {
  const $ = cheerio.load(html);
  const matches = [];

  $('table.match-program--table tbody tr.has-hover').each((_, tr) => {
    const $tr = $(tr);
    const onclick = $tr.attr('onclick') || '';
    const matchIdMatch = onclick.match(/\/(\d+)_\d+\//);
    const matchId = matchIdMatch ? matchIdMatch[1] : null;

    const dateEl = $tr.find('.matchprogram-date').text().replace(/\s+/g, ' ').trim();
    const time = $tr.find('td.hide-on-mobile').eq(3).text().trim() || null;

    const homeName = $tr.find('td.hide-on-mobile').eq(4).find('a.link').text().trim();
    const awayName = $tr.find('td.hide-on-mobile').eq(5).find('a.link').text().trim();
    const venue = $tr.find('td.hide-on-mobile').eq(6).find('a').text().trim() || null;

    const homeScore = $tr.find('.home-score').first().text().trim();
    const awayScore = $tr.find('.away-score').first().text().trim();
    const hasResult = homeScore !== '' && awayScore !== '' && !isNaN(+homeScore);

    const isHome = homeName.includes('Viktoria');
    const opponent = isHome ? awayName : homeName;
    const gf = hasResult ? (isHome ? +homeScore : +awayScore) : null;
    const ga = hasResult ? (isHome ? +awayScore : +homeScore) : null;

    if (!opponent || opponent === 'Oversidder') return;

    matches.push({
      matchId,
      date: dateEl ? formatDateDa(dateEl) : null,
      rawDate: dateEl,
      time,
      opponent,
      isHome,
      gf,
      ga,
      played: hasResult,
      venue,
      result: hasResult ? (gf > ga ? 'win' : gf === ga ? 'draw' : 'loss') : null,
    });
  });

  return matches;
}

function formatDateDa(d) {
  if (!d) return null;
  const s = String(d).trim();
  // DBU format: "fre.11-09 2026" or "lør.05-09 2026"
  const m = s.match(/(\d{1,2})-(\d{2})\s+(\d{4})/);
  if (m) {
    const months = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
    const day = +m[1];
    const mon = months[+m[2] - 1] || m[2];
    return `${day}. ${mon} ${m[3]}`;
  }
  try {
    const dt = new Date(d);
    if (!isNaN(dt)) return dt.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { /* ignore */ }
  return s;
}

function buildSummary(pool, matches) {
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
