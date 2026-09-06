import fs from 'fs/promises';
import path from 'path';

const FILE_DIR = path.join(process.cwd(), 'data', '.store');

function safeName(key) {
  return key.replace(/[^a-zA-Z0-9:_-]/g, '_') + '.json';
}

async function fileGetJson(key) {
  try {
    const raw = await fs.readFile(path.join(FILE_DIR, safeName(key)), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function fileSetJson(key, data) {
  await fs.mkdir(FILE_DIR, { recursive: true });
  await fs.writeFile(path.join(FILE_DIR, safeName(key)), JSON.stringify(data), 'utf8');
}

async function fileGetText(key) {
  try {
    return await fs.readFile(path.join(FILE_DIR, safeName(key)), 'utf8');
  } catch {
    return null;
  }
}

async function fileSetText(key, text) {
  await fs.mkdir(FILE_DIR, { recursive: true });
  await fs.writeFile(path.join(FILE_DIR, safeName(key)), text, 'utf8');
}

async function blobGetJson(blobPath) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  try {
    const { get } = await import('@vercel/blob');
    const result = await get(blobPath, { token });
    if (!result?.url) return null;
    const res = await fetch(result.url);
    if (!res.ok) return null;
    return JSON.parse(await res.text());
  } catch {
    return null;
  }
}

async function blobSetJson(blobPath, data) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN mangler — opret Blob storage på Vercel');
  const { put } = await import('@vercel/blob');
  await put(blobPath, JSON.stringify(data), {
    access: 'public',
    token,
    addRandomSuffix: false,
  });
}

async function blobGetText(blobPath) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  try {
    const { get } = await import('@vercel/blob');
    const result = await get(blobPath, { token });
    if (!result?.url) return null;
    const res = await fetch(result.url);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function blobSetText(blobPath, text) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN mangler — opret Blob storage på Vercel');
  const { put } = await import('@vercel/blob');
  await put(blobPath, text, { access: 'public', token, addRandomSuffix: false });
}

function useBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function getJson(key) {
  if (useBlob()) return blobGetJson(key);
  return fileGetJson(key);
}

export async function setJson(key, data) {
  if (useBlob()) return blobSetJson(key, data);
  return fileSetJson(key, data);
}

export async function getText(key) {
  if (useBlob()) return blobGetText(key);
  return fileGetText(key);
}

export async function setText(key, text) {
  if (useBlob()) return blobSetText(key, text);
  return fileSetText(key, text);
}

export function randomId() {
  const a = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

export async function loadSeason() {
  return getJson('season');
}

export async function saveSeason(data) {
  data.made = new Date().toISOString();
  await setJson('season', data);
  const shareId = await ensureShare(data);
  return { shareId };
}

async function ensureShare(data) {
  let shareId = await getText('activeShareId');
  if (!shareId) {
    shareId = randomId();
    await setText('activeShareId', shareId);
  }
  await setJson(`share:${shareId}`, data);
  return shareId;
}

export async function loadShare(id) {
  return getJson(`share:${id}`);
}
