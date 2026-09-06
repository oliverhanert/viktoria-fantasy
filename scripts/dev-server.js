/**
 * Lokal dev-server: statiske filer + API (ingen Netlify/Vercel CLI nødvendig).
 * Brug: ADMIN_PASSWORD=dit-password npm run dev
 */
import http from 'http';
import { readFileSync, existsSync, createReadStream, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trimStart().startsWith('#')) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3456;

const API_MAP = {
  '/api/ensure-coach': () => import('../api/ensure-coach.js'),
  '/api/config': () => import('../api/config.js'),
  '/api/season': () => import('../api/season.js'),
  '/api/admin-login': () => import('../api/admin-login.js'),
  '/api/share': () => import('../api/share.js'),
  '/api/dbu-data': () => import('../api/dbu-data.js'),
  '/api/avatar-library': () => import('../api/avatar-library.js'),
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function parseUrl(raw) {
  const u = new URL(raw, `http://localhost:${PORT}`);
  const query = {};
  u.searchParams.forEach((v, k) => { query[k] = v; });
  return { pathname: u.pathname, query };
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
}

function createRes(serverRes) {
  let statusCode = 200;
  const headers = {};
  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    setHeader(k, v) {
      headers[k] = v;
      return res;
    },
    json(data) {
      const body = JSON.stringify(data);
      serverRes.writeHead(statusCode, { ...headers, 'Content-Type': 'application/json' });
      serverRes.end(body);
    },
    end(data = '') {
      serverRes.writeHead(statusCode, headers);
      serverRes.end(data);
    },
  };
  return res;
}

async function handleApi(pathname, req, serverRes) {
  const loader = API_MAP[pathname];
  if (!loader) {
    serverRes.writeHead(404);
    serverRes.end('Not found');
    return;
  }
  const mod = await loader();
  const body = req.method === 'GET' || req.method === 'OPTIONS' ? '' : await readBody(req);
  const { query } = parseUrl(req.url);
  const vercelReq = {
    method: req.method,
    url: req.url,
    headers: req.headers,
    query,
    body,
  };
  await mod.default(vercelReq, createRes(serverRes));
}

async function serveStatic(pathname, serverRes) {
  let filePath = path.join(PUBLIC, pathname === '/' ? 'standings.html' : pathname);
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    if (!path.extname(filePath) && existsSync(filePath + '.html')) {
      filePath += '.html';
    } else {
      serverRes.writeHead(404);
      serverRes.end('Not found');
      return;
    }
  }
  const ext = path.extname(filePath);
  serverRes.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  createReadStream(filePath).pipe(serverRes);
}

const server = http.createServer(async (req, res) => {
  const { pathname } = parseUrl(req.url);
  try {
    if (pathname.startsWith('/api/')) {
      await handleApi(pathname, req, res);
    } else {
      await serveStatic(pathname, res);
    }
  } catch (err) {
    console.error(err);
    res.writeHead(500);
    res.end('Server error');
  }
});

server.listen(PORT, () => {
  const pw = process.env.ADMIN_PASSWORD ? '✓ sat' : '✗ mangler (admin login virker ikke)';
  console.log(`\n  BK Viktoria Fantasy — http://localhost:${PORT}/standings.html#demo`);
  console.log(`  Admin:           http://localhost:${PORT}/admin.html`);
  console.log(`  ADMIN_PASSWORD:  ${pw}\n`);
});
