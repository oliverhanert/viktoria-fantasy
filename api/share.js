import { handleOptions, send } from './lib/http.js';
import { envOk } from './lib/supabase.js';
import { loadSeasonByShareId } from './lib/season-db.js';
import { loadShare } from './lib/storage.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return handleOptions(res);
  if (req.method !== 'GET') return send(res, 405, { error: 'method' });

  const id = req.query?.id;
  if (!id) return send(res, 400, { error: 'missing id' });

  try {
    if (envOk()) {
      const data = await loadSeasonByShareId(id);
      if (data) return send(res, 200, { data, id, source: 'supabase' });
    }
    const data = await loadShare(id);
    if (!data) return send(res, 404, { error: 'not found' });
    return send(res, 200, { data, id, source: 'file' });
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
}
