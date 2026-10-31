-- NYC Unhinged Week 7 admin and generation observability schema.
-- Additive: preserves existing data and does not duplicate core app tables.
-- This is a one-shot migration. Run the sibling preflight script first.

do $$
declare conflicts text;
begin
  select string_agg(name, ', ') into conflicts
  from unnest(array['prompt_chains','prompt_chain_steps','prompt_chain_mix','terms','llm_providers','llm_models','generation_requests','llm_responses','ai_generation_examples','allowed_signup_domains','whitelisted_emails']) as names(name)
  where to_regclass(format('public.%I', name)) is not null;
  if conflicts is not null then
    raise exception 'Week 7 migration stopped: these table names already exist and need schema reconciliation first: %', conflicts;
  end if;

  if exists (
    select 1 from (values ('profiles','id'),('profiles','is_superadmin'),('profiles','role'),('profiles','is_banned'),('images','id'),('generations','id'),('admin_audit_log','id'),('admin_audit_log','created_at'),('admin_audit_log','actor_id'),('admin_audit_log','actor_email'),('admin_audit_log','actor_role'),('admin_audit_log','action'),('admin_audit_log','target_type'),('admin_audit_log','target_id'),('admin_audit_log','metadata')) required(table_name,column_name)
    where not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = required.table_name and c.column_name = required.column_name
    )
  ) then
    raise exception 'Week 7 migration stopped: required existing core columns are missing; run the read-only preflight and reconcile the base schema first';
  end if;

  select string_agg(format('%I.%I', n.nspname, p.proname), ', ') into conflicts
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and proname = any(array['week7_touch_updated_at','week7_is_admin','current_user_signup_allowed','week7_enforce_signup_allowlist','week7_set_signup_allowlist_enabled_at']);
  if conflicts is not null then
    raise exception 'Week 7 migration stopped: function-name conflicts need review first: %', conflicts;
  end if;

  if exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join (values
      ('auth','users','week7_enforce_signup_allowlist'),
      ('public','prompt_chains','prompt_chains_touch_updated_at'),
      ('public','prompt_chain_steps','prompt_chain_steps_touch_updated_at'),
      ('public','prompt_chain_mix','prompt_chain_mix_touch_updated_at'),
      ('public','terms','terms_touch_updated_at'),
      ('public','llm_providers','llm_providers_touch_updated_at'),
      ('public','llm_models','llm_models_touch_updated_at'),
      ('public','ai_generation_examples','ai_generation_examples_touch_updated_at'),
      ('public','allowed_signup_domains','allowed_signup_domains_touch_updated_at'),
      ('public','whitelisted_emails','whitelisted_emails_touch_updated_at'),
      ('public','allowed_signup_domains','allowed_signup_domains_signup_activation'),
      ('public','whitelisted_emails','whitelisted_emails_signup_activation')
    ) expected(schema_name,table_name,trigger_name)
      on expected.schema_name = n.nspname and expected.table_name = c.relname and expected.trigger_name = t.tgname
    where not t.tgisinternal
  ) then
    raise exception 'Week 7 migration stopped: a target trigger name already exists';
  end if;
  if exists (
    select 1 from pg_policies p
    join (values
      ('prompt_chains','Authenticated users read enabled prompt chains'),
      ('prompt_chain_steps','Authenticated users read steps of enabled prompt chains'),
      ('prompt_chain_mix','Authenticated users read enabled prompt chain mix'),
      ('terms','Authenticated users read enabled terms'),
      ('llm_providers','Authenticated users read enabled LLM providers'),
      ('llm_models','Authenticated users read enabled LLM models'),
      ('ai_generation_examples','Authenticated users read enabled generation examples'),
      ('generation_requests','Users read own generation requests')
    ) expected(table_name,policy_name) on expected.table_name = p.tablename and expected.policy_name = p.policyname
    where p.schemaname = 'public'
  ) then
    raise exception 'Week 7 migration stopped: a target policy name already exists; inspect partial application before continuing';
  end if;
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = any(array['terms_term_lower_uidx','prompt_chain_mix_enabled_idx','generation_requests_created_idx','generation_requests_status_created_idx','generation_requests_user_created_idx','generation_requests_image_idx','generation_requests_chain_idx','llm_responses_created_idx','llm_responses_request_idx','ai_generation_examples_enabled_idx','llm_models_provider_enabled_idx','allowed_signup_domains_active_domain_idx','whitelisted_emails_active_email_idx'])) then
    raise exception 'Week 7 migration stopped: a Week 7 index name already exists; inspect partial application before continuing';
  end if;
end $$;

create table public.prompt_chains (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.prompt_chain_steps (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references public.prompt_chains(id) on delete cascade,
  step_order integer not null check (step_order > 0),
  name text not null,
  prompt_template text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chain_id, step_order)
);

create table public.prompt_chain_mix (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null unique references public.prompt_chains(id) on delete cascade,
  weight numeric(10,4) not null default 1 check (weight > 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.terms (
  id uuid primary key default gen_random_uuid(),
  term text not null,
  definition text,
  category text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index terms_term_lower_uidx on public.terms (lower(term));

create table public.llm_providers (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null unique check (provider_key = lower(provider_key)),
  name text not null,
  endpoint_url text,
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The backend currently supports Google's Gemini REST API only. This seed
-- makes that supported provider selectable without storing credentials.
insert into public.llm_providers(provider_key, name, endpoint_url, config, enabled)
values ('google_gemini', 'Google Gemini', 'https://generativelanguage.googleapis.com/v1beta', '{"runtime":"gemini-rest"}'::jsonb, true)
on conflict (provider_key) do nothing;

create table public.llm_models (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.llm_providers(id) on delete restrict,
  model_key text not null,
  display_name text not null,
  capabilities jsonb not null default '[]'::jsonb,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, model_key)
);

create table public.generation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  image_id uuid references public.images(id) on delete set null,
  generation_id uuid references public.generations(id) on delete set null,
  prompt_chain_id uuid references public.prompt_chains(id) on delete set null,
  provider_id uuid references public.llm_providers(id) on delete set null,
  model_id uuid references public.llm_models(id) on delete set null,
  prompt text not null,
  direction text not null default '',
  status text not null default 'running' check (status in ('running','succeeded','failed')),
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.llm_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.generation_requests(id) on delete restrict,
  provider_id uuid references public.llm_providers(id) on delete set null,
  model_id uuid references public.llm_models(id) on delete set null,
  status text not null check (status in ('succeeded','failed')),
  request_content jsonb,
  response_content jsonb,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error_message text,
  created_at timestamptz not null default now()
);

create table public.ai_generation_examples (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  input_prompt text not null,
  input_data jsonb not null default '{}'::jsonb,
  expected_output text not null,
  prompt_chain_id uuid references public.prompt_chains(id) on delete set null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.allowed_signup_domains (
  id uuid primary key default gen_random_uuid(),
  domain text not null check (domain = lower(domain) and domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  enabled boolean not null default true,
  enabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (domain)
);

create table public.whitelisted_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email) and email ~ '^[^ @]+@[^ @]+\.[^ @]+$'),
  enabled boolean not null default true,
  enabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email)
);

create index prompt_chain_mix_enabled_idx on public.prompt_chain_mix(enabled) where enabled;
create index generation_requests_created_idx on public.generation_requests(created_at desc);
create index generation_requests_status_created_idx on public.generation_requests(status, created_at desc);
create index generation_requests_user_created_idx on public.generation_requests(user_id, created_at desc);
create index generation_requests_image_idx on public.generation_requests(image_id);
create index generation_requests_chain_idx on public.generation_requests(prompt_chain_id, created_at desc);
create index llm_responses_created_idx on public.llm_responses(created_at desc);
create index llm_responses_request_idx on public.llm_responses(request_id, created_at desc);
create index ai_generation_examples_enabled_idx on public.ai_generation_examples(enabled, created_at desc);
create index llm_models_provider_enabled_idx on public.llm_models(provider_id, enabled);
create index allowed_signup_domains_active_domain_idx on public.allowed_signup_domains(domain) where enabled;
create index whitelisted_emails_active_email_idx on public.whitelisted_emails(email) where enabled;

create or replace function public.week7_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
revoke all on function public.week7_touch_updated_at() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['prompt_chains','prompt_chain_steps','prompt_chain_mix','terms','llm_providers','llm_models','ai_generation_examples','allowed_signup_domains','whitelisted_emails'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.week7_touch_updated_at()', t || '_touch_updated_at', t);
  end loop;
end $$;

create or replace function public.week7_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and not coalesce(p.is_banned, false)
      and (p.is_superadmin or p.role in ('admin','superadmin'))
  );
$$;
revoke all on function public.week7_is_admin() from public, anon;
grant execute on function public.week7_is_admin() to authenticated, service_role;

create or replace function public.current_user_signup_allowed()
returns boolean language sql stable security definer set search_path = '' as $$
  with current_email as (
    select lower(trim(u.email)) as email, u.created_at from auth.users u where u.id = auth.uid()
  ), configured as (
    select min(enabled_at) as first_enabled_at
    from (
      select coalesce(d.enabled_at, d.created_at) as enabled_at from public.allowed_signup_domains d where d.enabled
      union all
      select coalesce(e.enabled_at, e.created_at) as enabled_at from public.whitelisted_emails e where e.enabled
    ) active_rules
  )
  select case when configured.first_enabled_at is null then true else exists (
    select 1 from current_email c
    where c.created_at <= configured.first_enabled_at
       or exists(select 1 from public.whitelisted_emails e where e.enabled and e.email = c.email)
       or exists(select 1 from public.allowed_signup_domains d where d.enabled and split_part(c.email, '@', 2) = d.domain)
  ) end from configured;
$$;
revoke all on function public.current_user_signup_allowed() from public, anon;
grant execute on function public.current_user_signup_allowed() to authenticated;

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

revoke all on public.prompt_chains, public.prompt_chain_steps, public.prompt_chain_mix, public.terms,
  public.generation_requests, public.ai_generation_examples, public.llm_providers, public.llm_models,
  public.llm_responses, public.allowed_signup_domains, public.whitelisted_emails from public, anon, authenticated;

grant select on public.prompt_chains, public.prompt_chain_steps, public.prompt_chain_mix, public.terms,
  public.ai_generation_examples to authenticated;
grant select (id, provider_key, name, enabled) on public.llm_providers to authenticated;
grant select (id, provider_id, model_key, display_name, capabilities, enabled, created_at) on public.llm_models to authenticated;
grant select on public.generation_requests to authenticated;
grant all on public.prompt_chains, public.prompt_chain_steps, public.prompt_chain_mix, public.terms,
  public.generation_requests, public.ai_generation_examples, public.llm_providers, public.llm_models,
  public.llm_responses, public.allowed_signup_domains, public.whitelisted_emails to service_role;

create policy "Authenticated users read enabled prompt chains" on public.prompt_chains for select to authenticated using (enabled or public.week7_is_admin());
create policy "Authenticated users read steps of enabled prompt chains" on public.prompt_chain_steps for select to authenticated using (enabled and exists(select 1 from public.prompt_chains c where c.id = chain_id and (c.enabled or public.week7_is_admin())));
create policy "Authenticated users read enabled prompt chain mix" on public.prompt_chain_mix for select to authenticated using (enabled and exists(select 1 from public.prompt_chains c where c.id = chain_id and c.enabled));
create policy "Authenticated users read enabled terms" on public.terms for select to authenticated using (enabled or public.week7_is_admin());
create policy "Authenticated users read enabled LLM providers" on public.llm_providers for select to authenticated using (enabled or public.week7_is_admin());
create policy "Authenticated users read enabled LLM models" on public.llm_models for select to authenticated using (enabled or public.week7_is_admin());
create policy "Authenticated users read enabled generation examples" on public.ai_generation_examples for select to authenticated using (enabled);

create policy "Users read own generation requests" on public.generation_requests for select to authenticated using (user_id = auth.uid() or public.week7_is_admin());

-- Admin CRUD uses the server-only service-role client after requirePermission;
-- service_role bypasses RLS by design. No client policies expose examples,
-- provider response bodies, or signup allowlist contents.


-- Existing accounts created before the first allowlist is enabled remain eligible.
-- New auth.users inserts are still required to match an active rule.
create or replace function public.week7_set_signup_allowlist_enabled_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.enabled_at := case when new.enabled then statement_timestamp() else null end;
  elsif not new.enabled then
    new.enabled_at := null;
  elsif not old.enabled then
    new.enabled_at := statement_timestamp();
  else
    new.enabled_at := old.enabled_at;
  end if;
  return new;
end;
$$;
revoke all on function public.week7_set_signup_allowlist_enabled_at() from public, anon, authenticated;

create trigger allowed_signup_domains_signup_activation
before insert or update on public.allowed_signup_domains
for each row execute function public.week7_set_signup_allowlist_enabled_at();
create trigger whitelisted_emails_signup_activation
before insert or update on public.whitelisted_emails
for each row execute function public.week7_set_signup_allowlist_enabled_at();

-- Reject only newly inserted accounts that do not match an active exact email
-- or exact domain rule. Existing accounts are judged by the RPC's activation time.
create or replace function public.week7_enforce_signup_allowlist()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  normalized_email text;
  has_rules boolean;
begin
  normalized_email := lower(trim(coalesce(new.email, '')));
  select exists(select 1 from public.allowed_signup_domains where enabled)
      or exists(select 1 from public.whitelisted_emails where enabled)
    into has_rules;
  if has_rules and not (
    exists(select 1 from public.whitelisted_emails e where e.enabled and e.email = normalized_email)
    or exists(select 1 from public.allowed_signup_domains d where d.enabled and split_part(normalized_email, '@', 2) = d.domain)
  ) then
    raise exception 'WEEK7_SIGNUP_NOT_ALLOWED: Signup is not allowed for this email address' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.week7_enforce_signup_allowlist() from public, anon, authenticated;
create trigger week7_enforce_signup_allowlist
before insert on auth.users
for each row execute function public.week7_enforce_signup_allowlist();
