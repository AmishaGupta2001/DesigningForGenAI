-- Assignment #4: NYC Unhinged database foundation.
-- This migration is additive and does not modify the existing recipes table.

create table if not exists public.images (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  title text not null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  image_id uuid not null references public.images (id) on delete restrict,
  prompt text not null,
  caption text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  generation_id uuid not null references public.generations (id) on delete cascade,
  vote smallint not null check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  unique (user_id, generation_id)
);

-- Query indexes for gallery filtering, feed ordering, remix history, and votes.
create index if not exists images_tags_gin_idx
  on public.images using gin (tags);
create index if not exists images_created_at_idx
  on public.images (created_at desc);
create index if not exists generations_created_at_idx
  on public.generations (created_at desc);
create index if not exists generations_user_id_idx
  on public.generations (user_id);
create index if not exists generations_image_id_idx
  on public.generations (image_id);
create index if not exists votes_generation_id_idx
  on public.votes (generation_id);
-- The unique constraint above creates the supporting user_id/generation_id
-- lookup index used to read or upsert a person's vote on a generation.

alter table public.images enable row level security;
alter table public.generations enable row level security;
alter table public.votes enable row level security;
alter table public.profiles enable row level security;

-- Curated gallery records are intentionally read-only to application users.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'images'
      and policyname = 'Anyone can read curated images'
  ) then
    create policy "Anyone can read curated images"
      on public.images for select
      using (true);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'generations'
      and policyname = 'Anyone can read generations'
  ) then
    create policy "Anyone can read generations"
      on public.generations for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'generations'
      and policyname = 'Users can create their own generations'
  ) then
    create policy "Users can create their own generations"
      on public.generations for insert to authenticated
      with check ((select auth.uid()) = user_id);
  end if;
end;
$$;

-- Vote rows can reveal a person's preferences. Users can read only their own
-- votes; a future public vote-total endpoint should return aggregates only.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'votes'
      and policyname = 'Users can read their own votes'
  ) then
    create policy "Users can read their own votes"
      on public.votes for select to authenticated
      using ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'votes'
      and policyname = 'Users can create their own votes'
  ) then
    create policy "Users can create their own votes"
      on public.votes for insert to authenticated
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'votes'
      and policyname = 'Users can update their own votes'
  ) then
    create policy "Users can update their own votes"
      on public.votes for update to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'votes'
      and policyname = 'Users can delete their own votes'
  ) then
    create policy "Users can delete their own votes"
      on public.votes for delete to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'Users can read their own profile'
  ) then
    create policy "Users can read their own profile"
      on public.profiles for select to authenticated
      using ((select auth.uid()) = id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'Users can update their own profile'
  ) then
    create policy "Users can update their own profile"
      on public.profiles for update to authenticated
      using ((select auth.uid()) = id)
      with check ((select auth.uid()) = id);
  end if;
end;
$$;

-- Generation images are public to display in the feed. Users may upload only
-- into the folder named for their authenticated user ID.
insert into storage.buckets (id, name, public)
values ('generation-images', 'generation-images', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Users can upload their own generation images'
  ) then
    create policy "Users can upload their own generation images"
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'generation-images'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
      );
  end if;
end;
$$;
