-- Realtime: include full old rows on UPDATE/DELETE so `group_id=eq.<id>` filters also match
-- deletions (e.g. a member re-submitting a ranked ballot deletes then inserts their votes).
alter table public.group_votes replica identity full;
alter table public.group_picks replica identity full;
alter table public.group_members replica identity full;
