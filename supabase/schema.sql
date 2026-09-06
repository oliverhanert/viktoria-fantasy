-- BK Viktoria Fantasy — kør i Supabase SQL Editor
-- https://supabase.com/dashboard → SQL → New query

-- Inviterede trænere (email skal stå her før signup)
create table if not exists coach_invites (
  email text primary key,
  name text,
  created_at timestamptz default now()
);

-- Aktive trænere (knyttet til Supabase Auth)
create table if not exists coaches (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text,
  created_at timestamptz default now()
);

create table if not exists seasons (
  id uuid primary key default gen_random_uuid(),
  share_id text unique not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  rules jsonb not null default '{}',
  is_active boolean not null default true,
  updated_at timestamptz default now()
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  idx int not null,
  name text not null,
  pos text not null check (pos in ('GK', 'DEF', 'MID', 'ATT')),
  photo_url text,
  avatar_seed text,
  unique (season_id, idx)
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  idx int not null,
  date text,
  opponent text,
  gf int not null default 0,
  ga int not null default 0,
  pom_idx int,
  lineup jsonb,
  unique (season_id, idx)
);

create table if not exists match_player_stats (
  match_id uuid not null references matches(id) on delete cascade,
  player_idx int not null,
  pos text,
  goals int default 0,
  assists int default 0,
  votes int default 0,
  joga int default 0,
  yellow int default 0,
  red int default 0,
  primary key (match_id, player_idx)
);

create index if not exists players_season_idx on players(season_id, idx);
create index if not exists matches_season_idx on matches(season_id, idx);

-- RLS
alter table coach_invites enable row level security;
alter table coaches enable row level security;
alter table seasons enable row level security;
alter table players enable row level security;
alter table matches enable row level security;
alter table match_player_stats enable row level security;

-- Offentlig læsning (standings-siden)
create policy "public_read_seasons" on seasons for select using (true);
create policy "public_read_players" on players for select using (true);
create policy "public_read_matches" on matches for select using (true);
create policy "public_read_stats" on match_player_stats for select using (true);

-- Trænere må skrive
create policy "coaches_write_seasons" on seasons for all
  using (exists (select 1 from coaches c where c.id = auth.uid()))
  with check (exists (select 1 from coaches c where c.id = auth.uid()));

create policy "coaches_write_players" on players for all
  using (exists (select 1 from coaches c where c.id = auth.uid()))
  with check (exists (select 1 from coaches c where c.id = auth.uid()));

create policy "coaches_write_matches" on matches for all
  using (exists (select 1 from coaches c where c.id = auth.uid()))
  with check (exists (select 1 from coaches c where c.id = auth.uid()));

create policy "coaches_write_stats" on match_player_stats for all
  using (exists (select 1 from coaches c where c.id = auth.uid()))
  with check (exists (select 1 from coaches c where c.id = auth.uid()));

create policy "coaches_read_self" on coaches for select
  using (id = auth.uid());

create policy "invites_read_authenticated" on coach_invites for select
  using (auth.role() = 'authenticated');

-- Storage bucket: opret "avatars" som public i Supabase Dashboard → Storage
-- Policies (kør efter bucket er oprettet):
-- insert/update/delete: authenticated + coach
-- select: public

-- Eksempel invites (erstat med rigtige emails):
insert into coach_invites (email, name) values
  ('oliver@example.com', 'Oliver'),
  ('traener@example.com', 'Træner')
on conflict (email) do nothing;

-- Auto-opret coach ved signup hvis email er inviteret
create or replace function public.handle_new_coach()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from coach_invites where lower(email) = lower(new.email)) then
    insert into coaches (id, email, name)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
    )
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_coach();
