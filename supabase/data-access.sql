-- CollectIQ: which parties each login sees (Users → Edit Access → Data
-- visibility). Run once in the SQL Editor after auth-setup.sql. Safe to run again.
--
-- data_access on the staff list:
--   {"mode": "role"}    the role's usual reach (default, nothing changes)
--   {"mode": "all"}     every party
--   {"mode": "custom", "masters": [...], "followpers": [...], "crrs": [...]}
--                       only parties under those masters, doers or CRRs
-- Only admins can change it (the existing cq_staff_admin rule), and every
-- change is in the change log (the existing cq_staff_audit trigger).

alter table public.cq_staff
  add column if not exists data_access jsonb not null default '{"mode": "role"}'::jsonb;

alter table public.cq_staff drop constraint if exists cq_staff_data_access_mode;
alter table public.cq_staff add constraint cq_staff_data_access_mode
  check (jsonb_typeof(data_access) = 'object'
         and coalesce(data_access->>'mode', 'role') in ('role', 'all', 'custom'));
