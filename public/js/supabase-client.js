/** Supabase client til admin (browser) */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';

let supabase = null;
let config = null;

export async function initSupabase() {
  if (supabase) return { supabase, config };
  const r = await fetch('/api/config', { cache: 'no-store' });
  config = await r.json();
  if (!config.hasSupabase) {
    return { supabase: null, config };
  }
  supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'vf-supabase-auth',
    },
  });
  return { supabase, config };
}

export function getSupabase() {
  return supabase;
}

export function getConfig() {
  return config;
}

export async function getAccessToken() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

export async function authHeaders() {
  const token = await getAccessToken();
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
