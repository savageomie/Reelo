-- Reelo: small helper RPCs.

-- Lets the sign-up screen check a username before the account exists (anon can call it).
-- Returns only a boolean, never profile data.
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_username ~ '^[a-z0-9_]{3,20}$'
     and not exists (select 1 from public.profiles where username = lower(p_username));
$$;

grant execute on function public.username_available(text) to anon, authenticated;
