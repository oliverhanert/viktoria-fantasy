-- Kør i Supabase SQL Editor (efter schema.sql)

-- Flere kampens-spillere (ved stemmelighed)
alter table matches add column if not exists pom_idxs jsonb default '[]';

update matches
set pom_idxs = jsonb_build_array(pom_idx)
where pom_idx is not null
  and (pom_idxs is null or pom_idxs = '[]'::jsonb);

-- Trænings-/udtagelsesinfo per spiller (kun admin)
alter table players add column if not exists profile jsonb default '{}';
