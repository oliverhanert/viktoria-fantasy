import { handleOptions, send, originBase, authOk } from './lib/http.js';
import { envOk, verifyCoach } from './lib/supabase.js';
import { loadActiveSeason, saveSeasonData } from './lib/season-db.js';
import { loadSeason, saveSeason as saveSeasonFile } from './lib/storage.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return handleOptions(res);

  if (req.method === 'GET') {
    try {
      if (envOk()) {
        const season = await loadActiveSeason();
        if (season) return send(res, 200, { data: season, source: 'supabase' });
      }
      const season = await loadSeason();
      if (!season) return send(res, 404, { error: 'Ingen gemt sæson endnu' });
      return send(res, 200, { data: season, source: 'file' });
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  }

  if (req.method === 'PUT') {
    const coach = envOk() ? await verifyCoach(req) : null;
    if (envOk() && !coach) return send(res, 401, { error: 'Log ind som træner først' });
    if (!envOk()) {
      if (!authOk(req)) return send(res, 401, { error: 'Log ind først' });
    }

    let data;
    try {
      data = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    } catch {
      return send(res, 400, { error: 'invalid json' });
    }
    if (!data.players || !data.matches) {
      return send(res, 400, { error: 'Mangler players eller matches' });
    }

    try {
      if (envOk()) {
        const { shareId, seasonId } = await saveSeasonData(data, data.id);
        const base = originBase(req) || '';
        return send(res, 200, {
          ok: true,
          seasonId,
          shareId,
          publicUrl: `${base}/standings.html`,
        });
      }
      const { shareId } = await saveSeasonFile(data);
      const base = originBase(req) || '';
      return send(res, 200, {
        ok: true,
        shareId,
        publicUrl: `${base}/standings.html`,
      });
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  }

  return send(res, 405, { error: 'method' });
}
