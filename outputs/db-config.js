// Which live database CollectIQ uses.
//   provider: 'firebase'  -> Google Firebase Firestore (as before)
//   provider: 'supabase'  -> Supabase (Postgres + Realtime), see supabase/README.md
// supabaseUrl and supabaseAnonKey come from Supabase: Project Settings -> API.
// The anon (public) key is meant to sit in the app, like the Firebase key.
// Never put the service_role key or the database password here.
window.COLLECTIQ_DB = {
  provider: 'firebase',
  supabaseUrl: '',
  supabaseAnonKey: ''
};
