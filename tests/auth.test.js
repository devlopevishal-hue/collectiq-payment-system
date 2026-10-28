const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../auth.js');

// A stand-in for the Supabase client: logins, the staff list and the
// staff-admin function, with the same answers the real ones give.
function fakeClient({ logins = {}, staff = [], offline = false } = {}) {
  const fake = { session: null, staff: staff.map(s => ({ ...s })), calls: [], offline };
  const netErr = () => ({ error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch' } });
  fake.auth = {
    async getSession() { return { data: { session: fake.session } }; },
    async signInWithPassword({ email, password }) {
      if (fake.offline) return netErr();
      const u = logins[email];
      if (!u || u.password !== password) return { data: {}, error: { message: 'Invalid login credentials' } };
      fake.session = { user: { id: u.id, email } };
      return { data: { session: fake.session }, error: null };
    },
    async signOut() { fake.session = null; return {}; },
    async updateUser({ password }) {
      const email = fake.session.user.email;
      logins[email].password = password;
      return { error: null };
    }
  };
  fake.rpc = async (fn, args) => {
    fake.calls.push([fn, args]);
    if (fake.offline) throw new Error('Failed to fetch');
    const v = args.p_login;
    const s = fake.staff.find(r => r.active !== false && (r.email === v || r.email.split('@')[0] === v || (r.followper_name || '').toLowerCase() === v));
    return { data: s ? s.email : null, error: null };
  };
  fake.from = () => {
    const q = { filters: [] };
    const run = () => fake.staff.filter(r => q.filters.every(([k, v]) => r[k] === v));
    const api = {
      select() { return api; },
      eq(k, v) { q.filters.push([k, v]); return api; },
      order() { return Promise.resolve({ data: run(), error: null }); },
      maybeSingle() { return Promise.resolve({ data: run()[0] || null, error: null }); },
      upsert(row) {
        const i = fake.staff.findIndex(r => r.email === row.email);
        if (i >= 0) fake.staff[i] = { ...fake.staff[i], ...row }; else fake.staff.push(row);
        return Promise.resolve({ error: null });
      }
    };
    return api;
  };
  fake.functions = {
    async invoke(name, { body }) {
      fake.calls.push([name, body]);
      if (body.password && body.password.length < 8) {
        return { data: null, error: { message: 'Edge Function returned a non-2xx status code', context: { json: async () => ({ error: 'The password must be at least 8 characters.' }) } } };
      }
      return { data: { ok: true }, error: null };
    }
  };
  return fake;
}

const STAFF = [
  { email: 'surendra@collectiq.com', user_id: 'u1', role: 'user', followper_name: 'Surendra', active: true },
  { email: 'ravi.sharma@collectiq.com', user_id: 'u2', role: 'user', followper_name: 'Ravi Kant Sharma', active: true },
  { email: 'devlope.vishal@gmail.com', user_id: 'u3', role: 'admin', followper_name: 'all', active: true },
  { email: 'old@collectiq.com', user_id: 'u4', role: 'user', followper_name: 'Old', active: false }
];
const LOGINS = () => ({
  'surendra@collectiq.com': { id: 'u1', password: 'Secret#123' },
  'ravi.sharma@collectiq.com': { id: 'u2', password: 'Ravi#4567' },
  'devlope.vishal@gmail.com': { id: 'u3', password: 'Admin#999' },
  'old@collectiq.com': { id: 'u4', password: 'Old#00000' },
  'stranger@x.com': { id: 'u9', password: 'Stranger1' }
});

test('signs in with an email, the part before @, or the doer name', async () => {
  for (const login of ['surendra@collectiq.com', 'Surendra', ' surendra ']) {
    const c = fakeClient({ logins: LOGINS(), staff: STAFF });
    const user = await A.create(c).signIn(login, 'Secret#123');
    assert.deepEqual(user, { email: 'surendra@collectiq.com', role: 'user', followperName: 'Surendra', active: true, hasLogin: true });
  }
  const c = fakeClient({ logins: LOGINS(), staff: STAFF });
  assert.equal((await A.create(c).signIn('Ravi Kant Sharma', 'Ravi#4567')).email, 'ravi.sharma@collectiq.com');
});

test('a wrong password is refused and leaves nobody logged in', async () => {
  const c = fakeClient({ logins: LOGINS(), staff: STAFF });
  await assert.rejects(A.create(c).signIn('surendra', '1234'), e => e.code === 'bad-login');
  assert.equal(c.session, null);
});

test('a login that is not on the active staff list gets no access', async () => {
  for (const [login, pw] of [['stranger@x.com', 'Stranger1'], ['old@collectiq.com', 'Old#00000']]) {
    const c = fakeClient({ logins: LOGINS(), staff: STAFF });
    await assert.rejects(A.create(c).signIn(login, pw), e => e.code === 'no-access');
    assert.equal(c.session, null, 'signed out again');
  }
});

test('without internet the login says so instead of "wrong password"', async () => {
  const c = fakeClient({ logins: LOGINS(), staff: STAFF, offline: true });
  await assert.rejects(A.create(c).signIn('surendra', 'Secret#123'), e => e.code === 'network');
});

test('the username falls back to the usual @collectiq.com address when the lookup is unreachable', async () => {
  const c = fakeClient({ logins: LOGINS(), staff: STAFF, offline: true });
  assert.equal(await A.create(c).emailFor('Anil Sharma'), 'anil.sharma@collectiq.com');
});

test('changing your own password checks the current one first', async () => {
  const logins = LOGINS();
  const c = fakeClient({ logins, staff: STAFF });
  const auth = A.create(c);
  await auth.signIn('surendra', 'Secret#123');
  await assert.rejects(auth.changeOwnPassword('wrong', 'NewPass#1'), e => e.code === 'bad-login');
  assert.equal(logins['surendra@collectiq.com'].password, 'Secret#123');
  await auth.changeOwnPassword('Secret#123', 'NewPass#1');
  assert.equal(logins['surendra@collectiq.com'].password, 'NewPass#1');
});

test('admin actions go to the staff-admin function and show its message on failure', async () => {
  const c = fakeClient({ logins: LOGINS(), staff: STAFF });
  const auth = A.create(c);
  await auth.createLogin({ email: 'new@collectiq.com', role: 'crr', followperName: 'New Bhai' }, 'LongEnough1');
  assert.deepEqual(c.calls.at(-1), ['staff-admin', { action: 'create', email: 'new@collectiq.com', password: 'LongEnough1', role: 'crr', followperName: 'New Bhai' }]);
  await assert.rejects(auth.setPassword('new@collectiq.com', 'short'), e => e.message === 'The password must be at least 8 characters.');
});

test('saving a staff member never sends a password, and an admin is always "all"', async () => {
  const c = fakeClient({ logins: LOGINS(), staff: STAFF });
  await A.create(c).saveStaff({ email: ' Surendra@collectiq.com ', role: 'admin', followperName: 'Surendra', password: 'x' });
  const row = c.staff.find(r => r.email === 'surendra@collectiq.com');
  assert.equal(row.role, 'admin');
  assert.equal(row.followper_name, 'all');
  assert.equal(row.password, undefined);
});

test('generated passwords are long enough and avoid look-alike characters', () => {
  let n = 0;
  const pw = A.generatePassword(10, bytes => bytes.forEach((_, i) => { bytes[i] = (n++ * 37) % 256; }));
  assert.equal(pw.length, 10);
  assert.doesNotMatch(pw, /[0O1lI]/);
});
