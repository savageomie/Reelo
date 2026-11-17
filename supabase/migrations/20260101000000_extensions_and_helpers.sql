-- Reelo: generic helpers.
-- (gen_random_uuid() is built into Postgres 13+, so no extension is required for UUIDs.)

-- Generic "touch updated_at" trigger function.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
