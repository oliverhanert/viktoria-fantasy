import { handleOptions, send } from './lib/http.js';
import { envOk, getServiceClient, verifyCoach } from './lib/supabase.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';

const LIB_PATH = path.join(process.cwd(), 'public', 'data', 'avatar-library.json');

function readLocal() {
  try {
    if (!existsSync(LIB_PATH)) return [];
    return JSON.parse(readFileSync(LIB_PATH, 'utf8')).avatars || [];
  } catch {
    return [];
  }
}

function writeLocal(avatars) {
  writeFileSync(LIB_PATH, JSON.stringify({ avatars }, null, 2) + '\n');
}

function storagePathFromUrl(url) {
  const marker = '/storage/v1/object/public/avatars/';
  const i = url.indexOf(marker);
  if (i < 0) return null;
  return decodeURIComponent(url.slice(i + marker.length));
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return handleOptions(res);

  if (req.method === 'GET') {
    let avatars = [];
    if (envOk()) {
      try {
        const db = getServiceClient();
        const { data: files } = await db.storage.from('avatars').list('library', { limit: 200 });
        const base = process.env.SUPABASE_URL + '/storage/v1/object/public/avatars/';
        avatars = (files || [])
          .filter((f) => f.name && !f.name.startsWith('.'))
          .map((f) => base + 'library/' + encodeURIComponent(f.name).replace(/%2F/g, '/'));
      } catch { /* ignore */ }
    }
    if (!avatars.length) avatars = readLocal();
    return send(res, 200, { avatars });
  }

  if (req.method === 'DELETE') {
    const coach = envOk() ? await verifyCoach(req) : null;
    if (envOk() && !coach) return send(res, 401, { error: 'Log ind som træner' });

    let body = {};
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    } catch {
      return send(res, 400, { error: 'invalid json' });
    }
    const url = body.url;
    if (!url) return send(res, 400, { error: 'Mangler url' });

    if (envOk()) {
      const storagePath = storagePathFromUrl(url);
      if (!storagePath || !storagePath.startsWith('library/')) {
        return send(res, 400, { error: 'Kan kun slette biblioteks-avatars' });
      }
      const db = getServiceClient();
      const { error } = await db.storage.from('avatars').remove([storagePath]);
      if (error) return send(res, 500, { error: error.message });
      return send(res, 200, { ok: true });
    }

    const local = readLocal().filter((a) => a !== url);
    writeLocal(local);
    return send(res, 200, { ok: true });
  }

  return send(res, 405, { error: 'method' });
}
