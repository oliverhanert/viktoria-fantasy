# BK Viktoria Fantasy

Fantasy-point platform for **Viktoria 2** med stilling, kampe, pulje og træner-admin.

## Arkitektur

| Komponent | Teknologi |
|-----------|-----------|
| Hjemmeside | Statisk frontend (`public/`) på Vercel |
| Database | **Supabase** (PostgreSQL) |
| Træner-login | Supabase Auth (én konto per træner) |
| Avatar-billeder | Supabase Storage (`avatars` bucket) |
| API | Vercel serverless (`api/`) |

Holdet ser **standings** uden login. Trænere logger ind i **admin** for at opdatere spillere og stats.

---

## 1. Opret Supabase-projekt

1. Gå til [supabase.com](https://supabase.com) → **New project**
2. **SQL Editor** → kør `supabase/schema.sql`
3. **Storage** → **New bucket** → navn: `avatars` → **Public bucket** ✓
4. **SQL Editor** → kør `supabase/storage.sql`
5. **Authentication** → **Providers** → Email → slå **Confirm email** fra (nemmere for trænere)
6. Tilføj træner-emails i `coach_invites` (via Table Editor eller SQL):

```sql
insert into coach_invites (email, name) values
  ('din@email.dk', 'Dit navn');
```

7. **Project Settings** → **API** → kopier URL + `anon` key + `service_role` key

---

## 2. Lokal udvikling

```bash
npm install
cp .env.example .env   # udfyld Supabase-nøgler
npm run seed           # indlæs demo-sæson i databasen
npm run dev
```

- **Standings:** http://localhost:3456/standings.html#demo (eller `#i{shareId}` efter seed)
- **Admin:** http://localhost:3456/admin.html → **Opret konto** med inviteret email

Uden Supabase i `.env` virker admin med `ADMIN_PASSWORD` og fil-lagring (kun lokalt).

---

## 3. Deploy på Vercel + GitHub

```bash
git init
git add .
git commit -m "BK Viktoria Fantasy"
# Opret repo på GitHub og push
```

På [vercel.com](https://vercel.com):

1. **Import** GitHub-repo
2. **Environment Variables** (Production + Preview):

| Variabel | Beskrivelse |
|----------|-------------|
| `SUPABASE_URL` | Fra Supabase API settings |
| `SUPABASE_ANON_KEY` | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (hemmelig!) |

3. **Deploy**

Efter deploy:

- `https://dit-projekt.vercel.app/standings.html`
- `https://dit-projekt.vercel.app/admin.html`

Kør `npm run seed` lokalt én gang (mod din Supabase DB) — eller tilføj data via admin online.

---

## Admin — trænerfunktioner

| Fanen | Funktion |
|-------|----------|
| **Spillere** | Navn, position, avatar fra bibliotek |
| **Kampe** | Kompakt kamp-liste, grafisk 4-3-3 bane, stats-tabel, DBU-import |
| **Holdinfo** | Træninger, udtagelse, positioner (kun admin, ikke på stillingen) |

Live side: `/standings.html` — gem opdaterer databasen med det samme.

Efter schema.sql, kør også `supabase/migration-profile-pom.sql` for holdinfo og flere KS.

---

## Invitere nye trænere

```sql
insert into coach_invites (email, name) values ('ny@email.dk', 'Navn');
```

Træneren går til admin → **Opret konto** → logger ind og kan opdatere stats.

---

## DBU sync

`/api/dbu-data` henter pulje og kampe. Valgfrit: sæt `DBU_API_KEY` på Vercel.
