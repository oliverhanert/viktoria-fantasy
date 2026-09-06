export const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export function send(res, status, body, extraHeaders = {}) {
  res.status(status).setHeader('Content-Type', 'application/json');
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.json(body);
}

export function handleOptions(res) {
  res.status(204).setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.end('');
}

export function authOk(req) {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) return false;
  const h = req.headers.authorization || req.headers.Authorization || '';
  const token = h.replace(/^Bearer\s+/i, '');
  return token === secret;
}

export function originBase(req) {
  const host = req.headers.host || req.headers.Host;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  if (host) return `${proto}://${host}`;
  return '';
}
