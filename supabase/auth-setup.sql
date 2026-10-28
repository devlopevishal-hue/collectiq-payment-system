-- CollectIQ logins and access rules, step 1 of 2. Run after schema.sql.
-- Safe to run again. Nothing stops working when this runs: the old open access
-- stays until auth-lock.sql (step 2) is run, after everyone has a login.
--
-- Who may log in is the cq_staff list (no passwords here: passwords live in
-- Supabase Auth, hashed). A row is linked to its login (user_id) only by the
-- staff-admin function or by the owner in the SQL Editor, never by sign-up.

create table if not exists public.cq_staff (
  email text primary key check (email = lower(btrim(email)) and email <> ''),
  user_id uuid unique references auth.users(id) on delete set null,
  role text not null default 'user'
    check (role in ('admin', 'superuser', 'accounts', 'crm', 'crr', 'pc', 'user')),
  followper_name text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The staff list the app kept in its settings record (with passwords) becomes
-- cq_staff (without them). Existing rows are left as they are.
insert into public.cq_staff (email, role, followper_name)
select distinct on (lower(btrim(u->>'email')))
       lower(btrim(u->>'email')),
       case when u->>'role' in ('admin', 'superuser', 'accounts', 'crm', 'crr', 'pc', 'user') then u->>'role'
            when u->>'role' = 'super doer' then 'superuser'
            else 'user' end,
       coalesce(nullif(btrim(u->>'followperName'), ''), split_part(lower(btrim(u->>'email')), '@', 1))
  from public.cq_docs d, jsonb_array_elements(coalesce(d.data->'users', '[]'::jsonb)) u
 where d.collection = 'collectiq_config' and d.id = 'settings'
   and coalesce(btrim(u->>'email'), '') <> ''
on conflict (email) do nothing;

-- The logged-in person's role, or null for anyone not on the active staff list.
create or replace function public.cq_my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.cq_staff where user_id = auth.uid() and active
$$;

create or replace function public.cq_is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select public.cq_my_role() is not null
$$;

-- Admin and Super Doer: everything the app's admin screens do.
create or replace function public.cq_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.cq_my_role() in ('admin', 'superuser'), false)
$$;

-- The login screen accepts an email, the part before @, or the doer name.
-- Returns the email to sign in with (only that, never anything else).
create or replace function public.cq_login_email(p_login text) returns text
language sql stable security definer set search_path = public as $$
  with x as (select lower(btrim(coalesce(p_login, ''))) v)
  select s.email from public.cq_staff s, x
   where s.active and x.v <> ''
     and (s.email = x.v or split_part(s.email, '@', 1) = x.v or lower(btrim(s.followper_name)) = x.v)
   order by (s.email = x.v) desc, (split_part(s.email, '@', 1) = x.v) desc, s.email
   limit 1
$$;

revoke execute on function public.cq_my_role(), public.cq_is_staff(), public.cq_is_admin() from public, anon;
grant execute on function public.cq_my_role(), public.cq_is_staff(), public.cq_is_admin() to authenticated;
revoke execute on function public.cq_login_email(text) from public;
grant execute on function public.cq_login_email(text) to anon, authenticated;

alter table public.cq_staff enable row level security;
drop policy if exists cq_staff_read on public.cq_staff;
create policy cq_staff_read on public.cq_staff for select to authenticated
  using ((select public.cq_is_staff()));
drop policy if exists cq_staff_admin on public.cq_staff;
create policy cq_staff_admin on public.cq_staff for all to authenticated
  using ((select public.cq_is_admin())) with check ((select public.cq_is_admin()));
revoke all on public.cq_staff from anon;
grant select, insert, update, delete on public.cq_staff to authenticated;

-- Records: everyone on the staff list reads and saves parties, payments and
-- tickets. Settings (master assignment) are saved by admins only. Deleting
-- (merge duplicates, reverse a payment, clear all data) is for admins only.
-- These sit next to the old open policy until auth-lock.sql removes it.
drop policy if exists cq_docs_staff_read on public.cq_docs;
create policy cq_docs_staff_read on public.cq_docs for select to authenticated
  using ((select public.cq_is_staff()));
drop policy if exists cq_docs_staff_insert on public.cq_docs;
create policy cq_docs_staff_insert on public.cq_docs for insert to authenticated
  with check ((select public.cq_is_staff())
              and (collection not in ('collectiq_config', 'collectiq') or (select public.cq_is_admin())));
drop policy if exists cq_docs_staff_update on public.cq_docs;
create policy cq_docs_staff_update on public.cq_docs for update to authenticated
  using ((select public.cq_is_staff())
         and (collection not in ('collectiq_config', 'collectiq') or (select public.cq_is_admin())))
  with check ((select public.cq_is_staff())
              and (collection not in ('collectiq_config', 'collectiq') or (select public.cq_is_admin())));
drop policy if exists cq_docs_admin_delete on public.cq_docs;
create policy cq_docs_admin_delete on public.cq_docs for delete to authenticated
  using ((select public.cq_is_admin()));

drop policy if exists cq_files_staff_read on public.cq_files;
create policy cq_files_staff_read on public.cq_files for select to authenticated
  using ((select public.cq_is_staff()));
drop policy if exists cq_files_staff_insert on public.cq_files;
create policy cq_files_staff_insert on public.cq_files for insert to authenticated
  with check ((select public.cq_is_staff()));
drop policy if exists cq_files_staff_update on public.cq_files;
create policy cq_files_staff_update on public.cq_files for update to authenticated
  using ((select public.cq_is_staff())) with check ((select public.cq_is_staff()));
drop policy if exists cq_files_admin_delete on public.cq_files;
create policy cq_files_admin_delete on public.cq_files for delete to authenticated
  using ((select public.cq_is_admin()));

-- Change log: every save, by whom and what changed. Written by the database
-- itself, so it cannot be skipped or edited from the app. Admins read it.
create table if not exists public.cq_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  actor_email text,
  collection text not null,
  doc_id text not null,
  op text not null,
  label text,
  changes jsonb
);
create index if not exists cq_audit_doc on public.cq_audit (collection, doc_id, at desc);
create index if not exists cq_audit_at on public.cq_audit (at desc);

alter table public.cq_audit enable row level security;
drop policy if exists cq_audit_admin_read on public.cq_audit;
create policy cq_audit_admin_read on public.cq_audit for select to authenticated
  using ((select public.cq_is_admin()));
revoke all on public.cq_audit from anon, authenticated;
grant select on public.cq_audit to authenticated;

-- What changed between two versions of a record, field by field. For lists
-- (bills, follow-ups, complaints) only the items added and removed are kept.
create or replace function public.cq_diff(p_old jsonb, p_new jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select coalesce(jsonb_object_agg(k,
           case when jsonb_typeof(o) = 'array' and jsonb_typeof(n) = 'array' then
             jsonb_build_object(
               'added', coalesce((select jsonb_agg(e) from jsonb_array_elements(n) e
                                   where not exists (select 1 from jsonb_array_elements(o) f where f = e)), '[]'::jsonb),
               'removed', coalesce((select jsonb_agg(e) from jsonb_array_elements(o) e
                                     where not exists (select 1 from jsonb_array_elements(n) f where f = e)), '[]'::jsonb))
           else jsonb_build_object('old', o, 'new', n) end), '{}'::jsonb)
    from (select k, p_old->k o, p_new->k n
            from (select jsonb_object_keys(coalesce(p_old, '{}'::jsonb)) k
                  union select jsonb_object_keys(coalesce(p_new, '{}'::jsonb))) ks) x
   where o is distinct from n
$$;

create or replace function public.cq_audit_label(p_data jsonb) returns text
language sql immutable set search_path = public as $$
  select nullif(concat_ws(' · ', nullif(p_data->>'marka', ''), nullif(p_data->>'master', ''),
                          nullif(coalesce(p_data->>'title', p_data->>'subject'), '')), '')
$$;

create or replace function public.cq_audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_email text := nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'email';
  v_files boolean := tg_table_name = 'cq_files';
  v_old jsonb;
  v_new jsonb;
begin
  -- The old staff list with passwords (settings record) is never copied here.
  if tg_op <> 'INSERT' then v_old := old.data - 'users'; end if;
  if tg_op <> 'DELETE' then v_new := new.data - 'users'; end if;
  if tg_op = 'UPDATE' and v_old = v_new then
    return null;
  end if;
  insert into public.cq_audit (actor, actor_email, collection, doc_id, op, label, changes)
  values (
    auth.uid(), v_email,
    case when tg_op = 'DELETE' then old.collection else new.collection end,
    case when tg_op = 'DELETE' then old.id else new.id end,
    lower(tg_op),
    public.cq_audit_label(coalesce(v_new, v_old)),
    case when v_files then null  -- receipt photos: who and when only
         when tg_op = 'INSERT' then jsonb_build_object('created', v_new)
         when tg_op = 'DELETE' then jsonb_build_object('deleted', v_old)
         else public.cq_diff(v_old, v_new) end
  );
  return null;
end $$;

drop trigger if exists cq_docs_audit on public.cq_docs;
create trigger cq_docs_audit after insert or update or delete on public.cq_docs
  for each row execute function public.cq_audit_row();
drop trigger if exists cq_files_audit on public.cq_files;
create trigger cq_files_audit after insert or update or delete on public.cq_files
  for each row execute function public.cq_audit_row();

-- Changes to the staff list (role, doer name, login) are logged too.
create or replace function public.cq_audit_staff() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) - 'updated_at' end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) - 'updated_at' end;
begin
  if tg_op = 'UPDATE' and v_old = v_new then
    return null;
  end if;
  insert into public.cq_audit (actor, actor_email, collection, doc_id, op, label, changes)
  values (auth.uid(), nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'email',
          'cq_staff', coalesce(new.email, old.email), lower(tg_op), coalesce(new.followper_name, old.followper_name),
          public.cq_diff(coalesce(v_old, '{}'::jsonb), coalesce(v_new, '{}'::jsonb)));
  return null;
end $$;

drop trigger if exists cq_staff_audit on public.cq_staff;
create trigger cq_staff_audit after insert or update or delete on public.cq_staff
  for each row execute function public.cq_audit_staff();

create or replace function public.cq_touch_staff() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists cq_staff_touch on public.cq_staff;
create trigger cq_staff_touch before update on public.cq_staff
  for each row execute function public.cq_touch_staff();

revoke execute on function public.cq_audit_row(), public.cq_audit_staff(), public.cq_touch_staff() from public, anon, authenticated;
