const { json, authOk } = require('./_lib');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' };
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'method' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'invalid json' });
  }

  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) {
    return json(503, { error: 'ADMIN_PASSWORD er ikke sat på serveren' });
  }
  if (body.password !== secret) {
    return json(401, { error: 'Forkert adgangskode' });
  }

  return json(200, { ok: true, token: secret });
};
