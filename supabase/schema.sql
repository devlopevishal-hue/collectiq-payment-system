-- CollectIQ live database on Supabase (Postgres + Realtime).
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to run again: it only creates what is missing and replaces the functions.
--
-- Every record the app saves (a party, a payment, a help ticket, the settings)
-- is one row: collection + id + the record as JSON. Every change carries a
-- version number, so two people saving the same party at once never overwrite
-- each other silently. Changes reach every open app within a second (Realtime).

create table if not exists public.cq_docs (
  collection text not null,
  id text not null,
  data jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);

-- Receipt photos: large, read one at a time, so kept out of the live feed.
create table if not exists public.cq_files (
  collection text not null,
  id text not null,
  data jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);

-- Deleted rows must carry their collection in the live feed.
alter table public.cq_docs replica identity full;

-- Reports straight from the database (SQL Editor or any BI tool).
create or replace view public.cq_parties with (security_invoker = true) as
  select id,
         data->>'master' as master,
         data->>'marka' as marka,
         data->>'owner' as owner,
         data->>'crr' as crr,
         jsonb_array_length(coalesce(data->'bills', '[]'::jsonb)) as bills,
         jsonb_array_length(coalesce(data->'history', '[]'::jsonb)) as followups,
         updated_at
    from public.cq_docs where collection = 'collectiq_markas';

create or replace view public.cq_payments with (security_invoker = true) as
  select id,
         data->>'master' as master,
         data->>'marka' as marka,
         data->>'markaId' as party_id,
         case when jsonb_typeof(data->'amount') = 'number' then (data->>'amount')::numeric
              when data->>'amount' ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then trim(data->>'amount')::numeric end as amount,
         data->>'mode' as mode,
         data->>'date' as date,
         updated_at
    from public.cq_docs where collection = 'collectiq_payments';

create or replace function public.cq_table(p_coll text) returns regclass
language sql immutable set search_path = public as $$
  select case when p_coll = 'collectiq_receipts' then 'public.cq_files'::regclass
              else 'public.cq_docs'::regclass end
$$;

-- Save a whole record. p_expected: null = always save; 0 = only if it does not
-- exist yet; n = only if it is still at version n (someone else saved first
-- otherwise). Returns the new version, or null when it was not saved.
create or replace function public.cq_put(p_coll text, p_id text, p_data jsonb, p_expected bigint default null)
returns bigint language plpgsql set search_path = public as $$
declare v bigint;
begin
  if p_expected is null then
    execute format('insert into %s as t (collection, id, data) values ($1, $2, $3)
                    on conflict (collection, id) do update
                    set data = excluded.data, version = t.version + 1, updated_at = now()
                    returning t.version', cq_table(p_coll))
      into v using p_coll, p_id, p_data;
  elsif p_expected = 0 then
    execute format('insert into %s (collection, id, data) values ($1, $2, $3)
                    on conflict (collection, id) do nothing returning version', cq_table(p_coll))
      into v using p_coll, p_id, p_data;
  else
    execute format('update %s set data = $3, version = version + 1, updated_at = now()
                    where collection = $1 and id = $2 and version = $4 returning version', cq_table(p_coll))
      into v using p_coll, p_id, p_data, p_expected;
  end if;
  return v;
end $$;

-- Change part of a record without reading it first: set some fields, remove
-- some fields, and add items to lists (an item already in the list is not added
-- twice). Done inside the database in one step, so two people adding follow-ups
-- to the same party at the same time both keep theirs.
create or replace function public.cq_patch(p_coll text, p_id text, p_set jsonb, p_unset text[], p_union jsonb)
returns bigint language plpgsql set search_path = public as $$
declare
  d jsonb;
  k text;
  items jsonb;
  item jsonb;
  v bigint;
begin
  execute format('select data from %s where collection = $1 and id = $2 for update', cq_table(p_coll))
    into d using p_coll, p_id;
  if d is null then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  d := d || coalesce(p_set, '{}'::jsonb);
  if p_unset is not null then
    d := d - p_unset;
  end if;
  for k, items in select * from jsonb_each(coalesce(p_union, '{}'::jsonb)) loop
    if jsonb_typeof(d->k) is distinct from 'array' then
      d := jsonb_set(d, array[k], '[]'::jsonb);
    end if;
    for item in select * from jsonb_array_elements(items) loop
      if not exists (select 1 from jsonb_array_elements(d->k) e where e = item) then
        d := jsonb_set(d, array[k], (d->k) || jsonb_build_array(item));
      end if;
    end loop;
  end loop;
  execute format('update %s set data = $3, version = version + 1, updated_at = now()
                  where collection = $1 and id = $2 returning version', cq_table(p_coll))
    into v using p_coll, p_id, d;
  return v;
end $$;

create or replace function public.cq_delete(p_coll text, p_id text, p_expected bigint default null)
returns boolean language plpgsql set search_path = public as $$
declare n int;
begin
  execute format('delete from %s where collection = $1 and id = $2 and ($3::bigint is null or version = $3)', cq_table(p_coll))
    using p_coll, p_id, p_expected;
  get diagnostics n = row_count;
  return n > 0 or p_expected is null;
end $$;

-- Several saves at once, all or nothing. Each op: {"op":"put"|"patch"|"delete",
-- "coll", "id", "data"?, "expected"?, "set"?, "unset"?, "union"?}. A put or
-- delete whose expected version no longer matches undoes the whole batch.
create or replace function public.cq_batch(p_ops jsonb)
returns boolean language plpgsql set search_path = public as $$
declare
  op jsonb;
  expected bigint;
begin
  for op in select * from jsonb_array_elements(p_ops) loop
    expected := nullif(op->>'expected', '')::bigint;
    if op->>'op' = 'put' then
      if cq_put(op->>'coll', op->>'id', op->'data', expected) is null then
        raise exception 'conflict' using errcode = '40001';
      end if;
    elsif op->>'op' = 'patch' then
      perform cq_patch(op->>'coll', op->>'id', op->'set',
        array(select jsonb_array_elements_text(coalesce(op->'unset', '[]'::jsonb))), op->'union');
    elsif op->>'op' = 'delete' then
      if not cq_delete(op->>'coll', op->>'id', expected) then
        raise exception 'conflict' using errcode = '40001';
      end if;
    end if;
  end loop;
  return true;
end $$;

-- Access. The app has its own login screen and uses the public (anon) key,
-- the same as it does with Firebase today, so the app key may read and write
-- these tables. (Moving logins to Supabase Auth and limiting each doer to
-- their own parties is the next step; see supabase/README.md.)
alter table public.cq_docs enable row level security;
alter table public.cq_files enable row level security;
drop policy if exists cq_docs_app on public.cq_docs;
create policy cq_docs_app on public.cq_docs for all to anon, authenticated using (true) with check (true);
drop policy if exists cq_files_app on public.cq_files;
create policy cq_files_app on public.cq_files for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.cq_docs, public.cq_files to anon, authenticated;
grant select on public.cq_parties, public.cq_payments to authenticated;
grant execute on function public.cq_put, public.cq_patch, public.cq_delete, public.cq_batch to anon, authenticated;

-- Live feed: every change to cq_docs is pushed to the open apps.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cq_docs') then
    alter publication supabase_realtime add table public.cq_docs;
  end if;
end $$;
