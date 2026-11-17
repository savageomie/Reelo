-- Reelo: avatar storage bucket and realtime publication.
-- Both blocks are guarded so the migration also applies on plain Postgres (tests).

do $$
begin
  insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

  -- Anyone can view avatars (public bucket); users may only write inside a folder named by their uid.
  execute $p$create policy avatars_read on storage.objects for select using (bucket_id = 'avatars')$p$;
  execute $p$create policy avatars_insert_own on storage.objects for insert to authenticated
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy avatars_update_own on storage.objects for update to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy avatars_delete_own on storage.objects for delete to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
exception when others then
  raise notice 'storage schema not available (%), skipping avatar bucket', sqlerrm;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table
    public.groups, public.group_members, public.group_picks, public.group_votes, public.notifications;
exception when others then
  raise notice 'supabase_realtime publication not available (%)', sqlerrm;
end;
$$;
