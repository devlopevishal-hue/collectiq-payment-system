// CollectIQ logins on Supabase Auth. Passwords are checked by Supabase (stored
// hashed there), never by the app, and the database lets only people on the
// staff list (cq_staff) read or change anything. See supabase/README.md.
(function (root) {
  const DEFAULT_DOMAIN = '@collectiq.com';
  // No 0/O, 1/l/I: passwords are read out over the phone.
  const PASSWORD_CHARS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

  function authError(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
  }

  function isNetworkError(e) {
    const msg = String((e && (e.message || e.name)) || e || '');
    return /Failed to fetch|NetworkError|Network request failed|Load failed|fetch failed|AuthRetryableFetchError/i.test(msg);
  }

  function toUser(row) {
    if (!row) return null;
    return {
      email: row.email,
      role: row.role || 'user',
      followperName: row.followper_name || (row.role === 'admin' ? 'all' : ''),
      active: row.active !== false,
      hasLogin: !!row.user_id
    };
  }

  function generatePassword(length = 10, random) {
    const bytes = new Uint8Array(length);
    if (random) random(bytes);
    else root.crypto.getRandomValues(bytes);
    return Array.from(bytes, b => PASSWORD_CHARS[b % PASSWORD_CHARS.length]).join('');
  }

  function create(client) {
    // An email, the part before @ (surendra) or the doer name (Ravi Kant Sharma).
    async function emailFor(login) {
      const v = String(login || '').trim().toLowerCase();
      if (!v) return '';
      if (v.includes('@')) return v;
      try {
        const { data, error } = await client.rpc('cq_login_email', { p_login: v });
        if (!error && data) return String(data);
      } catch (e) { /* offline: try the usual address */ }
      return v.replace(/\s+/g, '.') + DEFAULT_DOMAIN;
    }

    async function session() {
      const { data } = await client.auth.getSession();
      return (data && data.session) || null;
    }

    // The logged-in person's staff record (role and doer name).
    async function profile() {
      const s = await session();
      if (!s) return null;
      const { data, error } = await client.from('cq_staff').select('*').eq('user_id', s.user.id).maybeSingle();
      if (error) throw isNetworkError(error) ? authError('network', 'No internet connection.') : authError('db', error.message);
      if (!data || data.active === false) return null;
      return toUser(data);
    }

    async function signIn(login, password) {
      const email = await emailFor(login);
      if (!email) throw authError('bad-login', 'Please enter your email or username.');
      let res;
      try {
        res = await client.auth.signInWithPassword({ email, password });
      } catch (e) {
        throw isNetworkError(e) ? authError('network', 'No internet connection.') : e;
      }
      if (res.error) {
        if (isNetworkError(res.error)) throw authError('network', 'No internet connection.');
        throw authError('bad-login', 'Email/username or password is wrong.');
      }
      const user = await profile();
      if (!user) {
        await client.auth.signOut();
        throw authError('no-access', 'This login is not on the CollectIQ staff list. Please ask the admin.');
      }
      return user;
    }

    async function signOut() {
      try { await client.auth.signOut(); } catch (e) { /* offline: the saved session is cleared anyway */ }
    }

    // The current password is checked again before it is changed.
    async function changeOwnPassword(currentPassword, newPassword) {
      const s = await session();
      if (!s) throw authError('bad-login', 'Please log in again.');
      const check = await client.auth.signInWithPassword({ email: s.user.email, password: currentPassword });
      if (check.error) throw authError('bad-login', 'Current password is incorrect.');
      const { error } = await client.auth.updateUser({ password: newPassword });
      if (error) throw authError('db', error.message);
    }

    async function listStaff() {
      const { data, error } = await client.from('cq_staff').select('*').order('email');
      if (error) throw authError('db', error.message);
      return (data || []).map(toUser);
    }

    // Role and doer name are saved straight to cq_staff (admins only, by the
    // database's own rule). Logins and passwords go through staff-admin.
    async function saveStaff(user) {
      const row = {
        email: String(user.email || '').trim().toLowerCase(),
        role: user.role || 'user',
        followper_name: user.role === 'admin' ? 'all' : String(user.followperName || '').trim(),
        active: user.active !== false
      };
      const { error } = await client.from('cq_staff').upsert(row, { onConflict: 'email' });
      if (error) throw authError('db', error.message);
    }

    async function admin(action, body) {
      const { data, error } = await client.functions.invoke('staff-admin', { body: { action, ...body } });
      if (error) {
        let msg = error.message;
        try {
          const ctx = error.context && typeof error.context.json === 'function' ? await error.context.json() : null;
          if (ctx && ctx.error) msg = ctx.error;
        } catch (e) { /* keep the first message */ }
        throw authError('admin', msg);
      }
      if (data && data.error) throw authError('admin', data.error);
      return data;
    }

    return {
      client,
      emailFor,
      session,
      profile,
      signIn,
      signOut,
      changeOwnPassword,
      listStaff,
      saveStaff,
      createLogin: (user, password) => admin('create', { email: user.email, password, role: user.role, followperName: user.followperName }),
      setPassword: (email, password) => admin('set_password', { email, password }),
      removeLogin: email => admin('remove', { email })
    };
  }

  const api = { create, toUser, generatePassword, isNetworkError, DEFAULT_DOMAIN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CollectIQAuth = api;
})(typeof window !== 'undefined' ? window : globalThis);
