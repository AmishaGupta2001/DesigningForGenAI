-- Read-only Production verification for the Week 7 sequence.
-- Before running: confirm the Supabase Dashboard project is designing-for-gen-ai
-- (project ref zmlkyxhjslnmihzplkui). This file contains SELECT statements only.
-- Run before deciding whether to apply, reconcile, or record any migration.

-- 1. Supabase migration ledger. Missing versions are not proof that SQL is absent;
-- migrations may have been applied manually.
select version, name
from supabase_migrations.schema_migrations
where version in (
  '20260930000000',
  '20261006044031',
  '20261007000000',
  '20261012000000',
  '20261028000000',
  '20261028120000',
  '20261030120000'
)
order by version;

-- 2. Core and Week 7 relation existence.
with expected(schema_name, table_name) as (
  values
    ('public','profiles'), ('public','images'), ('public','generations'),
    ('public','votes'), ('public','admin_audit_log'), ('public','recipes'),
    ('public','prompt_chains'), ('public','prompt_chain_steps'),
    ('public','prompt_chain_mix'), ('public','terms'), ('public','generation_requests'),
    ('public','ai_generation_examples'), ('public','llm_providers'), ('public','llm_models'),
    ('public','llm_responses'), ('public','allowed_signup_domains'), ('public','whitelisted_emails'),
    ('storage','objects')
)
select schema_name, table_name,
       to_regclass(format('%I.%I', schema_name, table_name)) is not null as exists
from expected
order by schema_name, table_name;

-- 3. Actual columns, types, nullability, and defaults for relevant relations.
select table_schema, table_name, ordinal_position, column_name, data_type,
       udt_name, is_nullable, column_default
from information_schema.columns
where (table_schema = 'public' and table_name = any(array[
  'profiles','images','generations','votes','admin_audit_log','recipes',
  'prompt_chains','prompt_chain_steps','prompt_chain_mix','terms',
  'generation_requests','ai_generation_examples','llm_providers','llm_models',
  'llm_responses','allowed_signup_domains','whitelisted_emails'
]))
   or (table_schema = 'storage' and table_name = 'objects')
order by table_schema, table_name, ordinal_position;

-- 4. Primary, unique, check, and foreign-key constraints.
select n.nspname as schema_name, r.relname as table_name, c.conname,
       c.contype, pg_get_constraintdef(c.oid, true) as definition
from pg_constraint c
join pg_class r on r.oid = c.conrelid
join pg_namespace n on n.oid = r.relnamespace
where n.nspname = 'public'
  and r.relname = any(array[
    'profiles','images','generations','votes','admin_audit_log','recipes',
    'prompt_chains','prompt_chain_steps','prompt_chain_mix','terms',
    'generation_requests','ai_generation_examples','llm_providers','llm_models',
    'llm_responses','allowed_signup_domains','whitelisted_emails'
  ])
order by n.nspname, r.relname, c.conname;

-- 5. RLS enabled/forced state.
select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where (n.nspname = 'public' and c.relname = any(array[
    'profiles','images','generations','votes','recipes',
    'prompt_chains','prompt_chain_steps','prompt_chain_mix','terms',
    'generation_requests','ai_generation_examples','llm_providers','llm_models',
    'llm_responses','allowed_signup_domains','whitelisted_emails'
  ]))
   or (n.nspname = 'storage' and c.relname = 'objects')
order by n.nspname, c.relname;

-- 6. Existing policies, including policies whose names collide with either
-- migration. Review permissive policies as well as restrictive policies.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename = any(array[
    'profiles','images','generations','votes','recipes',
    'prompt_chains','prompt_chain_steps','prompt_chain_mix','terms',
    'generation_requests','ai_generation_examples','llm_providers','llm_models',
    'llm_responses','allowed_signup_domains','whitelisted_emails'
  ]))
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

-- 7. Week 7 function definitions, owner, security mode, search_path, and ACL.
select n.nspname as schema_name, p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_userbyid(p.proowner) as owner, p.prosecdef as security_definer,
       p.proconfig as function_settings, p.proacl as function_acl,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = any(array[
    'current_user_signup_allowed','week7_enforce_signup_allowlist',
    'week7_touch_updated_at','week7_is_admin','week7_set_signup_allowlist_enabled_at',
    'get_feed_generations','get_public_generation'
  ])
order by p.proname, pg_get_function_identity_arguments(p.oid);

-- 8. Relevant trigger names and exact trigger function targets.
select n.nspname as schema_name, r.relname as table_name, t.tgname,
       pg_get_triggerdef(t.oid, true) as trigger_definition,
       pn.nspname as function_schema, p.proname as function_name
from pg_trigger t
join pg_class r on r.oid = t.tgrelid
join pg_namespace n on n.oid = r.relnamespace
join pg_proc p on p.oid = t.tgfoid
join pg_namespace pn on pn.oid = p.pronamespace
where not t.tgisinternal
  and (
    (n.nspname = 'auth' and r.relname = 'users')
    or (n.nspname = 'public' and r.relname = any(array[
      'profiles','prompt_chains','prompt_chain_steps','prompt_chain_mix','terms',
      'llm_providers','llm_models','ai_generation_examples',
      'allowed_signup_domains','whitelisted_emails'
    ]))
  )
order by n.nspname, r.relname, t.tgname;

-- 9. Existing target index names and definitions.
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname = any(array[
    'terms_term_lower_uidx','prompt_chain_mix_enabled_idx',
    'generation_requests_created_idx','generation_requests_status_created_idx',
    'generation_requests_user_created_idx','generation_requests_image_idx',
    'generation_requests_chain_idx','llm_responses_created_idx',
    'llm_responses_request_idx','ai_generation_examples_enabled_idx',
    'llm_models_provider_enabled_idx','allowed_signup_domains_active_domain_idx',
    'whitelisted_emails_active_email_idx'
  ])
order by tablename, indexname;

-- 10. Effective privilege grants for application roles. Does not return data rows.
select table_schema, table_name, grantee, privilege_type
from information_schema.table_privileges
where table_schema in ('public','storage')
  and table_name = any(array[
    'profiles','images','generations','votes','recipes','admin_audit_log',
    'prompt_chains','prompt_chain_steps','prompt_chain_mix','terms',
    'generation_requests','ai_generation_examples','llm_providers','llm_models',
    'llm_responses','allowed_signup_domains','whitelisted_emails','objects'
  ])
  and grantee in ('PUBLIC','anon','authenticated','service_role')
order by table_schema, table_name, grantee, privilege_type;

select rolname, rolsuper, rolbypassrls
from pg_roles
where rolname in ('anon','authenticated','service_role')
order by rolname;

