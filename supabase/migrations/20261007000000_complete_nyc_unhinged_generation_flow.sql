-- Assignment #4 follow-up: real AI generations, uploads, votes, and remixes.
-- This migration is additive and must be applied through the normal Supabase
-- migration workflow; it is intentionally not executed by the application.

alter table public.images
  add column if not exists owner_id uuid null references auth.users (id) on delete cascade;

alter table public.generations
  add column if not exists remix_of uuid null references public.generations (id) on delete set null;

create index if not exists generations_remix_of_idx
  on public.generations (remix_of);

-- public.images contains image inputs, not captions. Authenticated users can
-- register the URL of an image they just uploaded to their own storage folder.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'images'
      and policyname = 'Authenticated users can create image inputs'
  ) then
    create policy "Authenticated users can create image inputs"
      on public.images for insert to authenticated with check (owner_id = (select auth.uid()));
  end if;
end;
$$;

-- Curated, clean image assets bundled at public/reactions/. These are visual
-- inputs only; there is deliberately no caption field or caption seed data.
insert into public.images (image_url, title, tags, owner_id)
select seed.image_url, seed.title, seed.tags, null
from (
  values
    ('/reactions/blank-stare.png', 'Blank Stare', array['reaction', 'deadpan', 'exhausted', 'study', 'college']),
    ('/reactions/phone-shock.png', 'Phone Shock', array['reaction', 'shocked', 'phone', 'deadline', 'student']),
    ('/reactions/celebration.png', 'Academic Victory', array['reaction', 'celebration', 'win', 'relief']),
    ('/reactions/academic-panic.png', 'Academic Panic', array['reaction', 'confused', 'panic', 'studying']),
    ('/reactions/peek.png', 'Caught Peeking', array['reaction', 'hiding', 'awkward', 'late']),
    ('/reactions/broke.png', 'Financial Damage', array['reaction', 'broke', 'nyc', 'coffee'])
) as seed(image_url, title, tags)
where not exists (select 1 from public.images where images.image_url = seed.image_url);

-- Vote rows remain private. This narrowly-scoped RPC exposes only aggregate
-- totals, remix counts, and the caller's own vote state for each feed card.
create or replace function public.get_feed_generations()
returns table (
  id uuid,
  image_id uuid,
  image_url text,
  image_title text,
  caption text,
  created_at timestamptz,
  creator_name text,
  vote_count bigint,
  remix_count bigint,
  current_user_vote smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    generation.id,
    generation.image_id,
    image.image_url,
    image.title as image_title,
    generation.caption,
    generation.created_at,
    coalesce(nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), ''), 'NYC creator') as creator_name,
    coalesce((select sum(vote.vote)::bigint from public.votes vote where vote.generation_id = generation.id), 0) as vote_count,
    (select count(*)::bigint from public.generations child where child.remix_of = generation.id) as remix_count,
    coalesce((select vote.vote from public.votes vote where vote.generation_id = generation.id and vote.user_id = auth.uid()), 0)::smallint as current_user_vote
  from public.generations generation
  join public.images image on image.id = generation.image_id
  left join public.profiles profile on profile.id = generation.user_id
  order by generation.created_at desc;
$$;

revoke all on function public.get_feed_generations() from public;
grant execute on function public.get_feed_generations() to anon, authenticated;
