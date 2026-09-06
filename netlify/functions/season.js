const { CORS, json, authOk, loadSeason, saveSeason } = require('./_lib');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  if (event.httpMethod === 'GET') {
    const season = await loadSeason();
    if (!season) {
      return json(404, { error: 'Ingen gemt sæson endnu' });
    }
    return json(200, { data: season });
  }

  if (event.httpMethod === 'PUT') {
    if (!authOk(event)) return json(401, { error: 'Log ind først' });
    let data;
    try {
      data = JSON.parse(event.body || '{}');
    } catch {
      return json(400, { error: 'invalid json' });
    }
    if (!data.players || !data.matches) {
      return json(400, { error: 'Mangler players eller matches' });
    }
    try {
      const { shareId } = await saveSeason(data);
      const origin = event.headers.origin || event.headers.Origin || '';
      const base = origin || 'https://bk-viktoria-coach-portal.netlify.app';
      return json(200, {
        ok: true,
        shareId,
        shareUrl: `${base}/standings.html#i${shareId}`,
        demoHash: `#i${shareId}`,
      });
    } catch (e) {
      return json(500, { error: e.message });
    }
  }

  return json(405, { error: 'method' });
};
