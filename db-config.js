// Which live database CollectIQ uses.
//   provider: 'firebase'  -> Google Firebase Firestore (as before)
//   provider: 'supabase'  -> Supabase (Postgres + Realtime), see supabase/README.md
// supabaseUrl and supabaseAnonKey come from Supabase: Project Settings -> API.
// The anon (public) key is meant to sit in the app, like the Firebase key.
// Never put the service_role key or the database password here.
window.COLLECTIQ_DB = {
  provider: 'firebase',
  supabaseUrl: 'https://aqhzllkdldtztoamyreo.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxaHpsbGtkbGR0enRvYW15cmVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5ODkxNzEsImV4cCI6MjEwMjU2NTE3MX0.GpmiyTWOfvngvPEIWeGxnmoAGtbSoQVcK_YihHTTt_A'
};
