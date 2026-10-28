// Which live database CollectIQ uses.
//   provider: 'firebase'  -> Google Firebase Firestore (as before)
//   provider: 'supabase'  -> Supabase (Postgres + Realtime), see supabase/README.md
// supabaseUrl and supabaseAnonKey come from Supabase: Project Settings -> API.
// The anon (public) key is meant to sit in the app, like the Firebase key.
// Never put the service_role key or the database password here.
window.COLLECTIQ_DB = {
  provider: 'supabase',
  supabaseUrl: 'https://oxriijxeiyfubyhbohim.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94cmlpanhlaXlmdWJ5aGJvaGltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNjkzOTQsImV4cCI6MjEwODc0NTM5NH0.cJ5nXNtDMB76R0LScAgUcGgcBVhoHyiODYrtuTlnwLM'
};
