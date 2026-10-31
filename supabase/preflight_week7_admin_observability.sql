-- Read-only preflight for 20261028000000_week7_admin_observability.sql.
-- This script contains SELECT statements only. Run against the intended database
-- before migration review; any existing target object needs manual reconciliation.

with expected(table_name, column_name, data_type) as (
  values
    ('prompt_chains','id','uuid'), ('prompt_chains','name','text'), ('prompt_chains','description','text'), ('prompt_chains','enabled','boolean'), ('prompt_chains','created_at','timestamp with time zone'), ('prompt_chains','updated_at','timestamp with time zone'),
    ('prompt_chain_steps','id','uuid'), ('prompt_chain_steps','chain_id','uuid'), ('prompt_chain_steps','step_order','integer'), ('prompt_chain_steps','name','text'), ('prompt_chain_steps','prompt_template','text'), ('prompt_chain_steps','enabled','boolean'), ('prompt_chain_steps','created_at','timestamp with time zone'), ('prompt_chain_steps','updated_at','timestamp with time zone'),
    ('prompt_chain_mix','id','uuid'), ('prompt_chain_mix','chain_id','uuid'), ('prompt_chain_mix','weight','numeric'), ('prompt_chain_mix','enabled','boolean'), ('prompt_chain_mix','created_at','timestamp with time zone'), ('prompt_chain_mix','updated_at','timestamp with time zone'),
    ('terms','id','uuid'), ('terms','term','text'), ('terms','definition','text'), ('terms','category','text'), ('terms','enabled','boolean'), ('terms','created_at','timestamp with time zone'), ('terms','updated_at','timestamp with time zone'),
    ('llm_providers','id','uuid'), ('llm_providers','provider_key','text'), ('llm_providers','name','text'), ('llm_providers','endpoint_url','text'), ('llm_providers','config','jsonb'), ('llm_providers','enabled','boolean'), ('llm_providers','created_at','timestamp with time zone'), ('llm_providers','updated_at','timestamp with time zone'),
    ('llm_models','id','uuid'), ('llm_models','provider_id','uuid'), ('llm_models','model_key','text'), ('llm_models','display_name','text'), ('llm_models','capabilities','jsonb'), ('llm_models','enabled','boolean'), ('llm_models','created_at','timestamp with time zone'), ('llm_models','updated_at','timestamp with time zone'),
    ('generation_requests','id','uuid'), ('generation_requests','user_id','uuid'), ('generation_requests','image_id','uuid'), ('generation_requests','generation_id','uuid'), ('generation_requests','prompt_chain_id','uuid'), ('generation_requests','provider_id','uuid'), ('generation_requests','model_id','uuid'), ('generation_requests','prompt','text'), ('generation_requests','direction','text'), ('generation_requests','status','text'), ('generation_requests','error_message','text'), ('generation_requests','started_at','timestamp with time zone'), ('generation_requests','completed_at','timestamp with time zone'), ('generation_requests','created_at','timestamp with time zone'),
    ('llm_responses','id','uuid'), ('llm_responses','request_id','uuid'), ('llm_responses','provider_id','uuid'), ('llm_responses','model_id','uuid'), ('llm_responses','status','text'), ('llm_responses','request_content','jsonb'), ('llm_responses','response_content','jsonb'), ('llm_responses','latency_ms','integer'), ('llm_responses','error_message','text'), ('llm_responses','created_at','timestamp with time zone'),
    ('ai_generation_examples','id','uuid'), ('ai_generation_examples','name','text'), ('ai_generation_examples','description','text'), ('ai_generation_examples','input_prompt','text'), ('ai_generation_examples','input_data','jsonb'), ('ai_generation_examples','expected_output','text'), ('ai_generation_examples','prompt_chain_id','uuid'), ('ai_generation_examples','enabled','boolean'), ('ai_generation_examples','created_at','timestamp with time zone'), ('ai_generation_examples','updated_at','timestamp with time zone'),
    ('allowed_signup_domains','id','uuid'), ('allowed_signup_domains','domain','text'), ('allowed_signup_domains','enabled','boolean'), ('allowed_signup_domains','enabled_at','timestamp with time zone'), ('allowed_signup_domains','created_at','timestamp with time zone'), ('allowed_signup_domains','updated_at','timestamp with time zone'),
    ('whitelisted_emails','id','uuid'), ('whitelisted_emails','email','text'), ('whitelisted_emails','enabled','boolean'), ('whitelisted_emails','enabled_at','timestamp with time zone'), ('whitelisted_emails','created_at','timestamp with time zone'), ('whitelisted_emails','updated_at','timestamp with time zone')
), target_tables(table_name) as (
  values ('prompt_chains'), ('prompt_chain_steps'), ('prompt_chain_mix'), ('terms'),
         ('llm_providers'), ('llm_models'), ('generation_requests'), ('llm_responses'),
         ('ai_generation_examples'), ('allowed_signup_domains'), ('whitelisted_emails')
)
select t.table_name,
       to_regclass(format('public.%I', t.table_name)) is not null as table_exists,
       case when to_regclass(format('public.%I', t.table_name)) is null then array[]::text[]
            else array_agg(e.column_name order by e.column_name) filter (where c.column_name is null) end as missing_columns,
       case when to_regclass(format('public.%I', t.table_name)) is null then array[]::text[]
            else array_agg(e.column_name || ' expected ' || e.data_type || ' found ' || c.data_type order by e.column_name)
                 filter (where c.column_name is not null and c.data_type <> e.data_type) end as type_mismatches,
       case when to_regclass(format('public.%I', t.table_name)) is null then array[]::text[]
            else array(select c2.column_name from information_schema.columns c2
                       where c2.table_schema = 'public' and c2.table_name = t.table_name
                         and not exists (select 1 from expected e2 where e2.table_name = t.table_name and e2.column_name = c2.column_name)
                       order by c2.ordinal_position) end as additional_columns
from target_tables t
join expected e using (table_name)
left join information_schema.columns c
  on c.table_schema = 'public' and c.table_name = e.table_name and c.column_name = e.column_name
group by t.table_name
order by t.table_name;

-- Existing target tables are not automatically compatible, even when all
-- expected columns exist. Inspect constraints, nullability, defaults, and data.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and (tablename = any(array['prompt_chains','prompt_chain_steps','prompt_chain_mix','terms','llm_providers','llm_models','generation_requests','llm_responses','ai_generation_examples','allowed_signup_domains','whitelisted_emails'])
       or policyname = any(array['Authenticated users read enabled prompt chains','Authenticated users read steps of enabled prompt chains','Authenticated users read enabled prompt chain mix','Authenticated users read enabled terms','Authenticated users read enabled LLM providers','Authenticated users read enabled LLM models','Authenticated users read enabled generation examples','Users read own generation requests']));

select n.nspname as schema_name, p.proname as function_name, pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = any(array['week7_touch_updated_at','week7_is_admin','current_user_signup_allowed','week7_enforce_signup_allowlist','week7_set_signup_allowlist_enabled_at'])
order by p.proname;

select n.nspname as schema_name, c.relname as table_name, t.tgname as trigger_name
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
order by n.nspname, c.relname, t.tgname;

select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname = any(array['terms_term_lower_uidx','prompt_chain_mix_enabled_idx','generation_requests_created_idx','generation_requests_status_created_idx','generation_requests_user_created_idx','generation_requests_image_idx','generation_requests_chain_idx','llm_responses_created_idx','llm_responses_request_idx','ai_generation_examples_enabled_idx','llm_models_provider_enabled_idx','allowed_signup_domains_active_domain_idx','whitelisted_emails_active_email_idx'])
order by tablename, indexname;


-- Existing core tables/columns referenced by the migration's foreign keys and
-- admin predicate are prerequisites, not objects this migration creates.
with required(table_name, column_name) as (
  values ('profiles','id'), ('profiles','is_superadmin'), ('profiles','role'), ('profiles','is_banned'),
         ('images','id'), ('generations','id'), ('admin_audit_log','id'), ('admin_audit_log','created_at'),
         ('admin_audit_log','actor_id'), ('admin_audit_log','actor_email'), ('admin_audit_log','actor_role'),
         ('admin_audit_log','action'), ('admin_audit_log','target_type'), ('admin_audit_log','target_id'), ('admin_audit_log','metadata')
)
select r.table_name,
       array_agg(r.column_name order by r.column_name) filter (where c.column_name is null) as missing_required_columns
from required r
left join information_schema.columns c
  on c.table_schema = 'public' and c.table_name = r.table_name and c.column_name = r.column_name
group by r.table_name
order by r.table_name;
