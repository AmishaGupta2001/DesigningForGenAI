-- Assignment #3: user profiles and profile-photo storage.
-- This migration is additive: it does not recreate existing application tables.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text null,
  last_name text null,
  avatar_url text null
);

-- The function runs with permission to insert into public.profiles when a
-- provider (including Google) creates a user in auth.users.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- PostgreSQL has no CREATE TRIGGER IF NOT EXISTS. Treat only this migration's
-- exact row-level AFTER INSERT trigger as already installed; fail loudly if a
-- different trigger already owns this name.
do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'auth.users'::regclass
      and tgname = 'on_auth_user_created'
      and not tgisinternal
      and tgfoid = 'public.handle_new_user()'::regprocedure
      and tgtype = 5
  ) then
    if exists (
      select 1
      from pg_trigger
      where tgrelid = 'auth.users'::regclass
        and tgname = 'on_auth_user_created'
        and not tgisinternal
    ) then
      raise exception
        'Trigger on_auth_user_created already exists on auth.users and does not match public.handle_new_user()';
    end if;

    execute 'create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user()';
  end if;
end;
$$;

-- Add rows for users created before this migration. New users are handled by
-- the trigger above; existing names and avatar URLs are never overwritten.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- Images live in Supabase Storage, not PostgreSQL. The public bucket lets the
-- application display the URL saved in profiles.avatar_url.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Storage has RLS enabled by default. These policies apply only to the new
-- avatars bucket and let a signed-in user upload files in their own folder.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can upload their own avatars'
  ) then
    create policy "Users can upload their own avatars"
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
      );
  end if;
end;
$$;
