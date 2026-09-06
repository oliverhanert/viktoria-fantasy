import { handleOptions, send } from './lib/http.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return handleOptions(res);
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  } catch {
    return send(res, 400, { error: 'invalid json' });
  }

  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) {
    return send(res, 503, { error: 'ADMIN_PASSWORD er ikke sat på serveren' });
  }
  if (body.password !== secret) {
    return send(res, 401, { error: 'Forkert adgangskode' });
  }

  return send(res, 200, { ok: true, token: secret });
}
