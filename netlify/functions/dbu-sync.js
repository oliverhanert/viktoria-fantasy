/**
 * DBU KlubWeb API sync — henter kampprogram og resultater for Viktoria 2
 *
 * Kræver DBU_API_KEY i Netlify environment variables.
 * Bestil nøgle via KlubOffice → KlubWeb → API
 * Docs: https://clubservice.dbu.dk/apiHelp
 *
 * GET /.netlify/functions/dbu-sync?teamId=21239&poolId=496291
 */

const DBU_BASE = 'https://clubservice.dbu.dk/api';

// Viktoria 2 defaults (Serie 2, P2/3 Efterår, Pulje 2)
const DEFAULT_TEAM_ID = '21239';
const DEFAULT_POOL_ID = '496291';

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const apiKey = process.env.DBU_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({
        error: 'DBU_API_KEY not configured',
        hint: 'Aktivér KlubWeb API i KlubOffice og tilføj nøglen som Netlify env var.',
        docs: 'https://www.dbu.dk/klubservice/it-tilbud/data-fra-dbu-s-systemer/',
      }),
    };
  }

  const params = event.queryStringParameters || {};
  const teamId = params.teamId || DEFAULT_TEAM_ID;
  const poolId = params.poolId || DEFAULT_POOL_ID;

  try {
    const url = `${DBU_BASE}/TeamMatch?APIKey=${encodeURIComponent(apiKey)}&PoolId=${encodeURIComponent(poolId)}&TeamId=${encodeURIComponent(teamId)}`;
    const res = await fetch(url);

    if (!res.ok) {
      const text = await res.text();
      return {
        statusCode: res.status,
        headers,
        body: JSON.stringify({ error: 'DBU API error', status: res.status, detail: text.slice(0, 500) }),
      };
    }

    const data = await res.json();

    // Normaliser til vores fantasy-format (kun resultater — spillerstats indtastes stadig manuelt)
    const matches = normalizeDbuMatches(data);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        source: 'dbu',
        syncedAt: new Date().toISOString(),
        teamId,
        poolId,
        matches,
        note: 'DBU giver kampprogram + resultat. Mål, assists, stemmer og Joga Bonito skal stadig registreres i coach portal.',
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

function normalizeDbuMatches(data) {
  const raw = Array.isArray(data) ? data : data?.Matches || data?.matches || [];
  return raw
    .filter((m) => m.HomeGoals != null || m.AwayGoals != null || m.ResultHome != null)
    .map((m) => {
      const isHome = String(m.IsHomeTeam ?? m.isHome ?? true) === 'true' || m.IsHomeTeam === true;
      const gf = isHome ? (m.HomeGoals ?? m.ResultHome ?? 0) : (m.AwayGoals ?? m.ResultAway ?? 0);
      const ga = isHome ? (m.AwayGoals ?? m.ResultAway ?? 0) : (m.HomeGoals ?? m.ResultHome ?? 0);
      const opponent = isHome ? m.AwayTeamName || m.AwayTeam : m.HomeTeamName || m.HomeTeam;
      const date = m.MatchDate || m.Date || m.date;

      return {
        d: date ? formatDate(date) : undefined,
        o: opponent || undefined,
        gf,
        ga,
        dbuMatchId: m.MatchId || m.Id,
        pl: {}, // spillerstats udfyldes i coach portal
      };
    });
}

function formatDate(d) {
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return String(d);
  }
}
