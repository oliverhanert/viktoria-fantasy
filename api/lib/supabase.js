import { createClient } from '@supabase/supabase-js';

export function envOk() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getServiceClient() {
  if (!envOk()) throw new Error('SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY mangler');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getAnonClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_URL og SUPABASE_ANON_KEY mangler');
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Verificer Supabase JWT og at brugeren er træner */
export async function verifyCoach(req) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  const token = h.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  const anon = getAnonClient();
  const { data: { user }, error } = await anon.auth.getUser(token);
  if (error || !user) return null;

  const db = getServiceClient();
  const { data: coach } = await db.from('coaches').select('id, email, name').eq('id', user.id).maybeSingle();
  if (!coach) return null;

  return { user, coach, token };
}
