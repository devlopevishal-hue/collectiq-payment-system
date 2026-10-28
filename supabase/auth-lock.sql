-- CollectIQ logins and access rules, step 2 of 2. Run after auth-setup.sql,
-- once the new app is live and everyone has their login (see supabase/README.md).
-- From here on only logged-in staff can read or change anything; the public
-- app key alone gets nothing. Safe to run again.

drop policy if exists cq_docs_app on public.cq_docs;
drop policy if exists cq_files_app on public.cq_files;
revoke all on public.cq_docs, public.cq_files from anon;
revoke all on public.cq_parties, public.cq_payments from anon;

revoke execute on function public.cq_put(text, text, jsonb, bigint), public.cq_patch(text, text, jsonb, text[], jsonb),
  public.cq_delete(text, text, bigint), public.cq_batch(jsonb), public.cq_table(text) from public, anon;
grant execute on function public.cq_put(text, text, jsonb, bigint), public.cq_patch(text, text, jsonb, text[], jsonb),
  public.cq_delete(text, text, bigint), public.cq_batch(jsonb), public.cq_table(text) to authenticated;

-- Passwords are no longer kept in the settings records, and cannot be put back.
create or replace function public.cq_strip_users() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.collection in ('collectiq_config', 'collectiq') and new.data ? 'users' then
    new.data := new.data - 'users';
  end if;
  return new;
end $$;
revoke execute on function public.cq_strip_users() from public, anon, authenticated;

drop trigger if exists cq_docs_strip_users on public.cq_docs;
create trigger cq_docs_strip_users before insert or update on public.cq_docs
  for each row execute function public.cq_strip_users();

update public.cq_docs set data = data - 'users'
 where collection in ('collectiq_config', 'collectiq') and data ? 'users';
