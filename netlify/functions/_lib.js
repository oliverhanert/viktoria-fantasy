const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

function json(status, body) {
  return { statusCode: status, headers: CORS, body: JSON.stringify(body) };
}

function authOk(event) {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) return false;
  const h = event.headers.authorization || event.headers.Authorization || '';
  const token = h.replace(/^Bearer\s+/i, '');
  return token === secret;
}

async function getStore() {
  try {
    const { getStore } = require('@netlify/blobs');
    return getStore({ name: 'viktoria-fantasy', consistency: 'strong' });
  } catch {
    return null;
  }
}

async function loadSeason() {
  const store = await getStore();
  if (store) {
    const data = await store.get('season', { type: 'json' });
    if (data) return data;
  }
  return null;
}

async function saveSeason(data) {
  const store = await getStore();
  if (!store) throw new Error('Storage ikke tilgængelig — kør med netlify dev eller deploy');
  data.made = new Date().toISOString();
  await store.setJSON('season', data);
  const shareId = await ensureShare(store, data);
  return { shareId };
}

async function ensureShare(store, data) {
  let shareId = await store.get('activeShareId');
  if (!shareId) {
    shareId = randomId();
    await store.set('activeShareId', shareId);
  }
  await store.setJSON(`share:${shareId}`, data);
  return shareId;
}

function randomId() {
  const a = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

module.exports = { CORS, json, authOk, loadSeason, saveSeason, getStore, randomId };
