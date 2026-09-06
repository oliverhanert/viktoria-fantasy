/**
 * Seed Supabase med sample-season.json
 * Kør: node scripts/seed-supabase.js
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  try {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m || line.trimStart().startsWith('#')) continue;
      let val = m[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[m[1]]) process.env[m[1]] = val;
    }
  } catch { /* ignore */ }
}

loadEnv();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Sæt SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY i .env');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const sample = JSON.parse(readFileSync(path.join(__dirname, '../public/data/sample-season.json'), 'utf8'));

// Deaktiver gamle aktive sæsoner
await db.from('seasons').update({ is_active: false }).eq('is_active', true);

const { data: season, error: sErr } = await db
  .from('seasons')
  .insert({ rules: sample.rules, is_active: true })
  .select('id, share_id')
  .single();
if (sErr) throw sErr;

const playerRows = sample.players.map((p, i) => ({
  season_id: season.id,
  idx: i,
  name: p.n,
  pos: p.pos,
  photo_url: p.photo || null,
  avatar_seed: p.avatarSeed || null,
}));
await db.from('players').insert(playerRows);

for (let mi = 0; mi < sample.matches.length; mi++) {
  const m = sample.matches[mi];
  const { data: matchRow } = await db
    .from('matches')
    .insert({
      season_id: season.id,
      idx: mi,
      date: m.d,
      opponent: m.o,
      gf: m.gf,
      ga: m.ga,
      pom_idx: m.pom,
      lineup: m.lineup,
    })
    .select('id')
    .single();

  const statRows = Object.entries(m.pl || {}).map(([idx, st]) => ({
    match_id: matchRow.id,
    player_idx: +idx,
    pos: st.p,
    goals: st.g || 0,
    assists: st.a || 0,
    votes: st.v || 0,
    joga: st.j || 0,
    yellow: st.y || 0,
    red: st.r || 0,
  }));
  if (statRows.length) await db.from('match_player_stats').insert(statRows);
}

console.log('\n✓ Sæson seedet i Supabase');
console.log(`  Share link: /standings.html#i${season.share_id}`);
console.log(`  Share ID:   ${season.share_id}\n`);
