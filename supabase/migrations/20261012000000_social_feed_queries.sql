-- Week 5: safe, aggregate-only read models for the social feed.
-- Apply through the normal Supabase migration workflow; the app never runs this.

-- The preceding Week 4 migration already adds this relationship. Keep this
-- migration self-sufficient for databases where that migration was not applied.
alter table public.generations
  add column if not exists remix_of uuid null references public.generations (id) on delete set null;

create index if not exists generations_remix_of_idx
  on public.generations (remix_of);

create or replace function public.get_feed_generations(
  p_sort text default 'fresh',
  p_limit integer default 12,
  p_offset integer default 0,
  p_scope text default 'all'
)
returns table (
  id uuid, image_id uuid, image_url text, image_title text, caption text,
  created_at timestamptz, creator_name text, creator_avatar_url text,
  vote_count bigint, lol_count bigint, nah_count bigint, remix_count bigint,
  current_user_vote smallint
)
language sql stable security definer set search_path = ''
as $$
  with scored as (
    select g.id, g.image_id, i.image_url, i.title as image_title, g.caption, g.created_at,
      coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'NYC creator') as creator_name,
      p.avatar_url as creator_avatar_url,
      coalesce((select sum(v.vote)::bigint from public.votes v where v.generation_id = g.id), 0) as vote_count,
      coalesce((select count(*)::bigint from public.votes v where v.generation_id = g.id and v.vote = 1), 0) as lol_count,
      coalesce((select count(*)::bigint from public.votes v where v.generation_id = g.id and v.vote = -1), 0) as nah_count,
      (select count(*)::bigint from public.generations child where child.remix_of = g.id) as remix_count,
      coalesce((select v.vote from public.votes v where v.generation_id = g.id and v.user_id = auth.uid()), 0)::smallint as current_user_vote,
      g.user_id
    from public.generations g
    join public.images i on i.id = g.image_id
    left join public.profiles p on p.id = g.user_id
    where (p_scope = 'all' or (p_scope = 'mine' and g.user_id = auth.uid()) or
      (p_scope = 'lols' and exists (select 1 from public.votes own where own.generation_id = g.id and own.user_id = auth.uid() and own.vote = 1)))
  )
  select id, image_id, image_url, image_title, caption, created_at, creator_name, creator_avatar_url,
    vote_count, lol_count, nah_count, remix_count, current_user_vote
  from scored
  order by
    case when p_sort = 'cooking' then vote_count + remix_count * 2 end desc nulls last,
    case when p_sort = 'cooking' then created_at end desc nulls last,
    created_at desc
  limit greatest(1, least(p_limit, 30)) offset greatest(p_offset, 0);
$$;

create or replace function public.get_public_generation(p_generation_id uuid)
returns table (
  id uuid, image_id uuid, image_url text, image_title text, caption text,
  created_at timestamptz, creator_name text, creator_avatar_url text,
  vote_count bigint, lol_count bigint, nah_count bigint, remix_count bigint,
  current_user_vote smallint
)
language sql stable security definer set search_path = ''
as $$
  select
    g.id, g.image_id, i.image_url, i.title, g.caption, g.created_at,
    coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'NYC creator'), p.avatar_url,
    coalesce((select sum(v.vote)::bigint from public.votes v where v.generation_id = g.id), 0),
    coalesce((select count(*)::bigint from public.votes v where v.generation_id = g.id and v.vote = 1), 0),
    coalesce((select count(*)::bigint from public.votes v where v.generation_id = g.id and v.vote = -1), 0),
    (select count(*)::bigint from public.generations child where child.remix_of = g.id),
    coalesce((select v.vote from public.votes v where v.generation_id = g.id and v.user_id = auth.uid()), 0)::smallint
  from public.generations g join public.images i on i.id = g.image_id
  left join public.profiles p on p.id = g.user_id where g.id = p_generation_id;
$$;

revoke all on function public.get_feed_generations(text, integer, integer, text) from public;
revoke all on function public.get_public_generation(uuid) from public;
grant execute on function public.get_feed_generations(text, integer, integer, text) to authenticated;
grant execute on function public.get_public_generation(uuid) to anon, authenticated;
