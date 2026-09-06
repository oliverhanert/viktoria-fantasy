import { handleOptions, send } from './lib/http.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return handleOptions(res);
  if (req.method !== 'GET') return send(res, 405, { error: 'method' });

  const url = process.env.SUPABASE_URL || '';
  const anon = process.env.SUPABASE_ANON_KEY || '';

  send(res, 200, {
    supabaseUrl: url,
    supabaseAnonKey: anon,
    hasSupabase: Boolean(url && anon),
    storageBucket: 'avatars',
  });
}
