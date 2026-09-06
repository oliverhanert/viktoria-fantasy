const { CORS, json, getStore } = require('./_lib');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'GET') return json(405, { error: 'method' });

  const id = event.queryStringParameters?.id;
  if (!id) return json(400, { error: 'missing id' });

  const store = await getStore();
  if (!store) return json(503, { error: 'storage unavailable' });

  const data = await store.get(`share:${id}`, { type: 'json' });
  if (!data) return json(404, { error: 'not found' });

  return json(200, { data, id });
};
