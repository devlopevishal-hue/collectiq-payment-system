# Moving CollectIQ to Supabase

Supabase is a hosted Postgres database with live updates (Realtime). CollectIQ
can run on it instead of Firebase Firestore. The app code stays the same:
`supabase-store.js` takes the same calls the app already makes on Firestore.
`db-config.js` picks which database is used.

Until step 5, everyone keeps working on Firebase as usual.

## 1. Create the Supabase project (admin, 10 minutes)

1. Sign up at https://supabase.com and create a project.
   - Region: **South Asia (Mumbai)**.
   - Plan: Pro ($25/month) for daily use. The Free plan pauses after 7 days
     without use and keeps no backups.
   - Keep the database password in a safe place. It is never needed in the app.
2. Open **SQL Editor → New query**, paste all of `supabase/schema.sql`, and
   click **Run**. Running it again is safe.
3. Open **Project Settings → API** and copy:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon public** key

   The anon key is meant to be public, like the Firebase key already in
   `app.js`. **Never** share or commit the `service_role` key or the database
   password.

## 2. Connect the app (still on Firebase)

In `db-config.js`, fill in `supabaseUrl` and `supabaseAnonKey`. Leave
`provider: 'firebase'` as it is, then deploy.

## 3. Copy the data

1. Log in as admin and go to **Marka & Master Followper assignment**.
2. Click **⬇ Backup all data** and keep the file safe.
3. Click **⇪ Copy data to Supabase**. When it finishes, it shows the record
   count for each collection in Firebase and in Supabase. The counts must
   match.

Firebase is only read during the copy and is not changed. Supabase is made
an exact copy of Firebase, so you can run the copy as many times as you need.

## 4. Check in Supabase

In **Table Editor**, `cq_docs` holds the parties, payments, help tickets and
settings, and `cq_files` holds the receipt photos. Two views give you reports
straight from SQL:

- `cq_parties`: master, marka, owner, number of bills and number of follow-ups
- `cq_payments`: party, amount, mode and date

## 5. Switch over (an evening when nobody is working)

1. Run **⇪ Copy data to Supabase** one last time.
2. In `db-config.js`, set `provider: 'supabase'`, change the version
   (`?v=`) in `index.html` and `sw.js`, and deploy.
3. Ask everyone to refresh the app (Ctrl+Shift+R). The badge at the top shows
   **Live Cloud Database (Connected)**, and its tooltip says Supabase.

Keep Firebase unchanged for a month. To go back, set `provider: 'firebase'`
and deploy. Any changes made in Supabase after the switch would then need to
be copied back.

## How it works

- Each record is one row: `collection`, `id`, `data` (JSON) and `version`.
- Adding a follow-up line or changing a field is done in the database in one
  step (`cq_patch`), so two people adding follow-ups to the same party both
  keep theirs.
- Bill and payment changes read the party, then save only if nobody else
  saved it in between. If someone did, the change is retried on the newer copy
  (`cq_put` with a version check).
- Every change reaches all open apps through Realtime in about a second.
  Bursts are grouped, so a bulk upload does not freeze the screen.
- Saves made while the internet is down wait on that PC and are sent when the
  internet is back.

## Logins and access rules

Logins are Supabase Auth accounts; who may use the app is the staff list
(`cq_staff`: email, role, doer name, no passwords). The database only lets
people on that list in, so the public app key alone gets nothing.

Files:

- `auth-setup.sql`: the staff list (copied from the app's old user list, without
  passwords), the access rules for logged-in staff, and the change log
  (`cq_audit`). Nothing stops working when this runs.
- `functions/staff-admin`: the Edge Function the Users page calls to create a
  login, reset a password or remove a login (admins only). It uses the service
  key, which Supabase gives only to Edge Functions; it is never in the app.
- `auth-lock.sql`: removes the old open access and the passwords from the
  settings record. Run it last.

### Switching over (an evening when nobody is working)

1. SQL Editor: run `auth-setup.sql`. Deploy the Edge Function `staff-admin`
   (Edge Functions → Deploy a new function, name `staff-admin`, paste
   `functions/staff-admin/index.ts`).
2. Authentication → Users → **Add user**: the admin's own email and a strong
   password, "Auto Confirm User" on. Then in SQL Editor link it:

   ```sql
   update public.cq_staff set user_id = (select id from auth.users where email = 'devlope.vishal@gmail.com')
    where email = 'devlope.vishal@gmail.com';
   ```
3. Authentication → Sign In / Providers: turn **Allow new users to sign up**
   off. (Sign-ups get no access anyway, but nobody needs them.)
4. Deploy the new app (merge the pull request). Log in as admin, open the
   Users page and click **Create logins for N staff without one**. Download the
   list and give each person their own password.
5. When the admin login works, run `auth-lock.sql`. From then on the old app
   version (and anyone with only the URL and key) gets nothing. Everyone
   refreshes the app (Ctrl+Shift+R) and logs in with their new password.

### Change log

`cq_audit` gets one row for every save: who (login email), when, which record,
and what changed (fields old → new; for bills and follow-up lists, the items
added and removed). A deleted record is kept in full, so a payment reversed or
a party deleted by mistake can be put back from here. Admins read it on the
Users page (🕘 Change log) or in the Table Editor. Nobody can change or delete
these rows from the app.

### Backups

The Free plan keeps no backups. On the Pro plan Supabase keeps daily backups
for 7 days. Until then, take **⬇ Backup all data** regularly.

### Still open

Doers see only their own parties on screen, but the database gives every
logged-in staff member all parties (the owner of a party is partly worked out
in the app from the master). Limiting this in the database too is a later step.
