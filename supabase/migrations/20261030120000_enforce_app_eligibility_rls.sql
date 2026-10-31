-- Week 7 security follow-up: enforce the main-app eligibility rule at the
-- database boundary as well as in Next.js routes.
-- Apply after the Week 7 schema and Columbia policy migrations. This migration
-- preserves anonymous public reads, admin roles, and service_role privileges.

begin;

-- Reassert the exact Columbia domain and normalized enabled-email policy.
create or replace function public.current_user_signup_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with current_email as (
    select lower(trim(u.email)) as email
    from auth.users u
    where u.id = auth.uid()
  )
  select exists (
    select 1
    from current_email c
    where split_part(c.email, '@', 2) = 'columbia.edu'
       or exists (
         select 1
         from public.whitelisted_emails e
         where e.enabled and lower(trim(e.email)) = c.email
       )
  );
$$;
revoke all on function public.current_user_signup_allowed() from public, anon;
grant execute on function public.current_user_signup_allowed() to authenticated;

do $$
declare
  t text;
  required_tables text[] := array[
    'profiles', 'images', 'generations', 'votes', 'prompt_chains',
    'prompt_chain_steps', 'prompt_chain_mix', 'terms', 'generation_requests',
    'ai_generation_examples', 'llm_providers', 'llm_models', 'llm_responses',
    'allowed_signup_domains', 'whitelisted_emails'
  ];
begin
  if to_regprocedure('public.current_user_signup_allowed()') is null then
    raise exception 'Required function public.current_user_signup_allowed() is missing';
  end if;
  foreach t in array required_tables loop
    if to_regclass(format('public.%I', t)) is null then
      raise exception 'Required table public.% is missing; apply and verify its schema first', t;
    end if;
  end loop;
  if to_regclass('storage.objects') is null then
    raise exception 'Required table storage.objects is missing';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='images' and column_name='owner_id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='generations' and column_name='user_id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='votes' and column_name='user_id') then
    raise exception 'Expected ownership columns are missing from profiles/images/generations/votes';
  end if;
end $$;

alter table public.profiles enable row level security;
alter table public.images enable row level security;
alter table public.generations enable row level security;
alter table public.votes enable row level security;
alter table public.prompt_chains enable row level security;
alter table public.prompt_chain_steps enable row level security;
alter table public.prompt_chain_mix enable row level security;
alter table public.terms enable row level security;
alter table public.generation_requests enable row level security;
alter table public.ai_generation_examples enable row level security;
alter table public.llm_providers enable row level security;
alter table public.llm_models enable row level security;
alter table public.llm_responses enable row level security;
alter table public.allowed_signup_domains enable row level security;
alter table public.whitelisted_emails enable row level security;
alter table storage.objects enable row level security;

do $$
declare t text;
begin
  -- The existing own-row policies stay in place; these restrictive policies
  -- also prevent any broader permissive policy from bypassing ownership.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='week7_eligible_own_profiles') then
    create policy week7_eligible_own_profiles on public.profiles as restrictive for all to authenticated
      using (id = (select auth.uid()) and public.current_user_signup_allowed())
      with check (id = (select auth.uid()) and public.current_user_signup_allowed());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='week7_read_eligible_own_profile') then
    create policy week7_read_eligible_own_profile on public.profiles for select to authenticated
      using (id = (select auth.uid()) and public.current_user_signup_allowed());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='week7_update_eligible_own_profile') then
    create policy week7_update_eligible_own_profile on public.profiles for update to authenticated
      using (id = (select auth.uid()) and public.current_user_signup_allowed())
      with check (id = (select auth.uid()) and public.current_user_signup_allowed());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='votes' and policyname='week7_eligible_own_votes') then
    create policy week7_eligible_own_votes on public.votes as restrictive for all to authenticated
      using (user_id = (select auth.uid()) and public.current_user_signup_allowed())
      with check (user_id = (select auth.uid()) and public.current_user_signup_allowed());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='week7_deny_anonymous_profiles') then
    create policy week7_deny_anonymous_profiles on public.profiles as restrictive for all to anon using (false) with check (false);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='votes' and policyname='week7_deny_anonymous_votes') then
    create policy week7_deny_anonymous_votes on public.votes as restrictive for all to anon using (false) with check (false);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='votes' and policyname='week7_read_eligible_own_votes') then
    create policy week7_read_eligible_own_votes on public.votes for select to authenticated
      using (user_id = (select auth.uid()) and public.current_user_signup_allowed());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='votes' and policyname='week7_insert_eligible_own_votes') then
    create policy week7_insert_eligible_own_votes on public.votes for insert to authenticated
      with check (user_id = (select auth.uid()) and public.current_user_signup_allowed());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='votes' and policyname='week7_update_eligible_own_votes') then
    create policy week7_update_eligible_own_votes on public.votes for update to authenticated
      using (user_id = (select auth.uid()) and public.current_user_signup_allowed())
      with check (user_id = (select auth.uid()) and public.current_user_signup_allowed());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='votes' and policyname='week7_delete_eligible_own_votes') then
    create policy week7_delete_eligible_own_votes on public.votes for delete to authenticated
      using (user_id = (select auth.uid()) and public.current_user_signup_allowed());
  end if;

  -- Anonymous and authenticated public image reads remain untouched.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='images' and policyname='week7_eligible_image_insert') then
    create policy week7_eligible_image_insert on public.images as restrictive for insert to authenticated
      with check (owner_id = (select auth.uid()) and public.current_user_signup_allowed());
    create policy week7_insert_eligible_own_images on public.images for insert to authenticated
      with check (owner_id = (select auth.uid()) and public.current_user_signup_allowed());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='images' and policyname='week7_eligible_image_update') then
    create policy week7_eligible_image_update on public.images as restrictive for update to authenticated
      using (owner_id = (select auth.uid()) and public.current_user_signup_allowed())
      with check (owner_id = (select auth.uid()) and public.current_user_signup_allowed());
    create policy week7_eligible_users_update_own_images on public.images for update to authenticated
      using (owner_id = (select auth.uid()) and public.current_user_signup_allowed())
      with check (owner_id = (select auth.uid()) and public.current_user_signup_allowed());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='images' and policyname='week7_eligible_image_delete') then
    create policy week7_eligible_image_delete on public.images as restrictive for delete to authenticated
      using (owner_id = (select auth.uid()) and public.current_user_signup_allowed());
  end if;

  -- Public generations stay public. Authenticated writes require ownership and
  -- eligibility, including any write grants added in the future.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='generations' and policyname='week7_eligible_generation_insert') then
    create policy week7_eligible_generation_insert on public.generations as restrictive for insert to authenticated
      with check (user_id = (select auth.uid()) and public.current_user_signup_allowed());
    create policy week7_insert_eligible_own_generations on public.generations for insert to authenticated
      with check (user_id = (select auth.uid()) and public.current_user_signup_allowed());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='generations' and policyname='week7_eligible_generation_update') then
    create policy week7_eligible_generation_update on public.generations as restrictive for update to authenticated
      using (user_id = (select auth.uid()) and public.current_user_signup_allowed())
      with check (user_id = (select auth.uid()) and public.current_user_signup_allowed());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='generations' and policyname='week7_eligible_generation_delete') then
    create policy week7_eligible_generation_delete on public.generations as restrictive for delete to authenticated
      using (user_id = (select auth.uid()) and public.current_user_signup_allowed());
  end if;

  -- Restrict authenticated reads of main-app configuration and request rows.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='prompt_chains' and policyname='week7_eligible_prompt_chains') then
    create policy week7_eligible_prompt_chains on public.prompt_chains as restrictive for select to authenticated using (public.current_user_signup_allowed());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='prompt_chain_steps' and policyname='week7_eligible_prompt_steps') then
    create policy week7_eligible_prompt_steps on public.prompt_chain_steps as restrictive for select to authenticated using (public.current_user_signup_allowed());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='prompt_chain_mix' and policyname='week7_eligible_prompt_mix') then
    create policy week7_eligible_prompt_mix on public.prompt_chain_mix as restrictive for select to authenticated using (public.current_user_signup_allowed());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='terms' and policyname='week7_eligible_terms') then
    create policy week7_eligible_terms on public.terms as restrictive for select to authenticated using (public.current_user_signup_allowed());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ai_generation_examples' and policyname='week7_eligible_examples') then
    create policy week7_eligible_examples on public.ai_generation_examples as restrictive for select to authenticated using (public.current_user_signup_allowed());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='llm_providers' and policyname='week7_eligible_llm_providers') then
    create policy week7_eligible_llm_providers on public.llm_providers as restrictive for select to authenticated using (public.current_user_signup_allowed());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='llm_models' and policyname='week7_eligible_llm_models') then
    create policy week7_eligible_llm_models on public.llm_models as restrictive for select to authenticated using (public.current_user_signup_allowed());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='generation_requests' and policyname='week7_eligible_generation_requests') then
    create policy week7_eligible_generation_requests on public.generation_requests as restrictive for select to authenticated using (public.current_user_signup_allowed());
  end if;

  -- Provider responses and access lists are server-only.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='llm_responses' and policyname='week7_deny_authenticated_llm_responses') then
    create policy week7_deny_authenticated_llm_responses on public.llm_responses as restrictive for all to authenticated using (false) with check (false);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='allowed_signup_domains' and policyname='week7_deny_authenticated_signup_domains') then
    create policy week7_deny_authenticated_signup_domains on public.allowed_signup_domains as restrictive for all to authenticated using (false) with check (false);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='whitelisted_emails' and policyname='week7_deny_authenticated_whitelist') then
    create policy week7_deny_authenticated_whitelist on public.whitelisted_emails as restrictive for all to authenticated using (false) with check (false);
  end if;

  -- Main-app clients consume this data through the existing server endpoints;
  -- admin CRUD remains on the separate service-role API.
  for t in select unnest(array[
    'prompt_chains', 'prompt_chain_steps', 'prompt_chain_mix', 'terms',
    'generation_requests', 'ai_generation_examples', 'llm_providers',
    'llm_models', 'llm_responses', 'allowed_signup_domains', 'whitelisted_emails'
  ]) loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname='week7_deny_anonymous_access') then
      execute format('create policy week7_deny_anonymous_access on public.%I as restrictive for all to anon using (false) with check (false)', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname='week7_deny_direct_insert') then
      execute format('create policy week7_deny_direct_insert on public.%I as restrictive for insert to authenticated with check (false)', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname='week7_deny_direct_update') then
      execute format('create policy week7_deny_direct_update on public.%I as restrictive for update to authenticated using (false) with check (false)', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname='week7_deny_direct_delete') then
      execute format('create policy week7_deny_direct_delete on public.%I as restrictive for delete to authenticated using (false)', t);
    end if;
  end loop;
end $$;

-- The main app may update a user's display fields but must not let a user
-- self-assign admin/superadmin flags or alter other protected profile fields.
do $$
declare c text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='first_name'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='last_name'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='avatar_url'
  ) then
    raise exception 'Expected user-editable profiles columns are missing';
  end if;

  revoke update on public.profiles from public, anon, authenticated;
  for c in select column_name from information_schema.columns
    where table_schema='public' and table_name='profiles'
  loop
    execute format('revoke update (%I) on public.profiles from public, anon, authenticated', c);
  end loop;
  grant update (first_name, last_name, avatar_url) on public.profiles to authenticated;
  grant update on public.profiles to service_role;
end $$;

-- Recipes are private app data. The application reads them with its
-- cookie-authenticated Supabase server client; keep them available to eligible
-- authenticated users only.
do $$
begin
  if to_regclass('public.recipes') is not null then
    alter table public.recipes enable row level security;
    revoke select on public.recipes from public, anon;
    grant select on public.recipes to authenticated;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='recipes' and policyname='week7_eligible_recipes') then
      create policy week7_eligible_recipes on public.recipes for select to authenticated using (public.current_user_signup_allowed());
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='recipes' and policyname='week7_require_eligible_recipes') then
      create policy week7_require_eligible_recipes on public.recipes as restrictive for select to authenticated using (public.current_user_signup_allowed());
    end if;
  end if;
end $$;

-- Scope only the affected Storage buckets. Public object URLs and all other
-- buckets keep their existing behavior; existing owner-folder policies remain.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='week7_eligible_generation_image_insert') then
    create policy week7_eligible_generation_image_insert on storage.objects as restrictive for insert to authenticated
      with check (bucket_id <> 'generation-images' or public.current_user_signup_allowed());
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='week7_eligible_generation_image_update') then
    create policy week7_eligible_generation_image_update on storage.objects as restrictive for update to authenticated
      using (bucket_id <> 'generation-images' or public.current_user_signup_allowed())
      with check (bucket_id <> 'generation-images' or public.current_user_signup_allowed());
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='week7_eligible_generation_image_delete') then
    create policy week7_eligible_generation_image_delete on storage.objects as restrictive for delete to authenticated
      using (bucket_id <> 'generation-images' or public.current_user_signup_allowed());
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='week7_eligible_avatar_insert') then
    create policy week7_eligible_avatar_insert on storage.objects as restrictive for insert to authenticated
      with check (bucket_id <> 'avatars' or public.current_user_signup_allowed());
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='week7_eligible_avatar_update') then
    create policy week7_eligible_avatar_update on storage.objects as restrictive for update to authenticated
      using (bucket_id <> 'avatars' or public.current_user_signup_allowed())
      with check (bucket_id <> 'avatars' or public.current_user_signup_allowed());
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='week7_eligible_avatar_delete') then
    create policy week7_eligible_avatar_delete on storage.objects as restrictive for delete to authenticated
      using (bucket_id <> 'avatars' or public.current_user_signup_allowed());
  end if;
end $$;

commit;
