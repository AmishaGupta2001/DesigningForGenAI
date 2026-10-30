-- Expose the existing generation owner/profile relationship to PostgREST.
-- Both columns already identify auth.users(id); profiles.id is populated by
-- the auth user trigger and the profiles migration's backfill.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.generations'::regclass
      and confrelid = 'public.profiles'::regclass
      and contype = 'f'
      and conkey = array[(
        select attnum from pg_attribute
        where attrelid = 'public.generations'::regclass and attname = 'user_id'
      )]::smallint[]
      and confkey = array[(
        select attnum from pg_attribute
        where attrelid = 'public.profiles'::regclass and attname = 'id'
      )]::smallint[]
  ) then
    alter table public.generations
      add constraint generations_user_id_profiles_fkey
      foreign key (user_id) references public.profiles (id) on delete cascade;
  end if;
end;
$$;

-- Make the new relationship visible to PostgREST without waiting for its
-- periodic schema cache refresh.
notify pgrst, 'reload schema';
