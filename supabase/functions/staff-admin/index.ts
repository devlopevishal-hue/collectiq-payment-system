// CollectIQ staff logins, for admins only: create a login, set a new password,
// remove a login. Creating Supabase Auth users needs the service key, which
// lives only here on the server (Supabase gives it to every Edge Function),
// never in the app.
//
// Body: { action: 'create', email, password, role, followperName }
//       { action: 'set_password', email, password }
//       { action: 'remove', email }
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const ROLES = ['admin', 'superuser', 'accounts', 'crm', 'crr', 'pc', 'user'];
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader = req.headers.get('Authorization') || '';

  // Who is asking: their own login, checked by the database's own rule.
  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: caller } = await asCaller.auth.getUser();
  if (!caller || !caller.user) return reply(401, { error: 'Please log in again.' });
  const { data: isAdmin, error: roleErr } = await asCaller.rpc('cq_is_admin');
  if (roleErr || !isAdmin) return reply(403, { error: 'Only an admin can manage logins.' });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(400, { error: 'Bad request.' }); }
  const action = String(body.action || '');
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !email.includes('@')) return reply(400, { error: 'A full email address is needed.' });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: staff } = await admin.from('cq_staff').select('*').eq('email', email).maybeSingle();

  if (action === 'create') {
    const role = String(body.role || 'user');
    if (!ROLES.includes(role)) return reply(400, { error: 'Unknown role.' });
    if (password.length < 8) return reply(400, { error: 'The password must be at least 8 characters.' });
    if (staff && staff.user_id) return reply(409, { error: 'This person already has a login. Use Reset password.' });
    const followperName = String(body.followperName || (staff && staff.followper_name) || email.split('@')[0]).trim();
    const { data: made, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !made.user) return reply(400, { error: (error && error.message) || 'The login was not created.' });
    const { error: saveErr } = await admin.from('cq_staff').upsert({
      email, user_id: made.user.id, role, followper_name: role === 'admin' ? 'all' : followperName, active: true
    });
    if (saveErr) {
      await admin.auth.admin.deleteUser(made.user.id);
      return reply(500, { error: saveErr.message });
    }
    return reply(200, { ok: true });
  }

  if (action === 'set_password') {
    if (!staff || !staff.user_id) return reply(404, { error: 'This person has no login yet. Create it first.' });
    if (password.length < 8) return reply(400, { error: 'The password must be at least 8 characters.' });
    const { error } = await admin.auth.admin.updateUserById(staff.user_id, { password });
    if (error) return reply(400, { error: error.message });
    return reply(200, { ok: true });
  }

  if (action === 'remove') {
    if (staff && staff.user_id === caller.user.id) return reply(400, { error: 'You cannot remove your own login.' });
    if (staff && staff.user_id) {
      const { error } = await admin.auth.admin.deleteUser(staff.user_id);
      if (error) return reply(400, { error: error.message });
    }
    await admin.from('cq_staff').delete().eq('email', email);
    return reply(200, { ok: true });
  }

  return reply(400, { error: 'Unknown action.' });
});
