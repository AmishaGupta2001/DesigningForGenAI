-- Main-app access policy: Columbia addresses or exact enabled email allowlist.
-- Replaces the Week 7 signup trigger/RPC without changing admin roles.

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
         where e.enabled and e.email = c.email
       )
  );
$$;
revoke all on function public.current_user_signup_allowed() from public, anon;
grant execute on function public.current_user_signup_allowed() to authenticated;

create or replace function public.week7_enforce_signup_allowlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text;
begin
  normalized_email := lower(trim(coalesce(new.email, '')));
  if split_part(normalized_email, '@', 2) <> 'columbia.edu'
     and not exists (
       select 1
       from public.whitelisted_emails e
       where e.enabled and e.email = normalized_email
     ) then
    raise exception 'WEEK7_SIGNUP_NOT_ALLOWED: Signup is not allowed for this email address' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.week7_enforce_signup_allowlist() from public, anon, authenticated;
