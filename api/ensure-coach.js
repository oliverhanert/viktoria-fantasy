import { handleOptions, send } from './lib/http.js';
import { getAnonClient, getServiceClient } from './lib/supabase.js';

/** Sikrer at inviteret bruger er i coaches (fallback hvis trigger manglede) */
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return handleOptions(res);
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });

  const h = req.headers.authorization || req.headers.Authorization || '';
  const token = h.replace(/^Bearer\s+/i, '');
  if (!token) return send(res, 401, { error: 'Ikke logget ind' });

  try {
    const anon = getAnonClient();
    const { data: { user }, error } = await anon.auth.getUser(token);
    if (error || !user) return send(res, 401, { error: 'Ugyldig session' });

    const db = getServiceClient();
    const email = user.email?.toLowerCase();
    const { data: invite } = await db
      .from('coach_invites')
      .select('email, name')
      .ilike('email', email)
      .maybeSingle();

    if (!invite) {
      return send(res, 403, { error: 'Din email er ikke på invitelisten (coach_invites)' });
    }

    const name = user.user_metadata?.name || invite.name || email.split('@')[0];
    const { error: upsertErr } = await db.from('coaches').upsert(
      { id: user.id, email: user.email, name },
      { onConflict: 'id' }
    );
    if (upsertErr) throw upsertErr;

    return send(res, 200, { ok: true, coachId: user.id });
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
}
