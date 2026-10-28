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

## Next step: logins

The app still uses its own login screen and the public key, as it does on
Firebase. Anyone with the app URL and key could read the data. The next step
is to move logins to Supabase Auth and add row-level rules, so each doer sees
only their own parties.
