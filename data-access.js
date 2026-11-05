// CollectIQ data visibility: which parties each login may see. An admin sets it
// per person on the Users screen (saved on the staff list as data_access):
//   mode 'role'   - the role's usual reach (Doer: own parties, CRR: own CRR
//                   parties, everyone else: all). Nothing changes for them.
//   mode 'all'    - every party.
//   mode 'custom' - only parties under the chosen masters, doers (followpers)
//                   or CRRs. A party matching any one of them is shown.
// Admins always see everything. Pure functions; no DOM.
(function (root) {
  const MODES = ['role', 'all', 'custom'];

  function norm(v) {
    return String(v == null ? '' : v).toLowerCase().replace(/\s+/g, ' ').trim();
  }

  // Loose match kept for the role defaults (as before: "Mahavir" sees "Mahavir Ji").
  function near(a, b) {
    const x = norm(a);
    const y = norm(b);
    return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
  }

  function cleanList(list) {
    const seen = new Set();
    const out = [];
    (Array.isArray(list) ? list : []).forEach(v => {
      const s = String(v == null ? '' : v).trim();
      const k = norm(s);
      if (s && !seen.has(k)) { seen.add(k); out.push(s); }
    });
    return out;
  }

  // The saved setting, tidied. Anything unknown is the role default.
  function normalize(access) {
    const a = access && typeof access === 'object' ? access : {};
    const mode = MODES.includes(a.mode) ? a.mode : 'role';
    if (mode !== 'custom') return { mode };
    return { mode, masters: cleanList(a.masters), followpers: cleanList(a.followpers), crrs: cleanList(a.crrs) };
  }

  // What the login may see.
  //   all:    sees every party
  //   strict: the limit cannot be switched off from the filters
  //           (false only for a Doer on the role default, who can still pick
  //           "All Team Markas" or search the whole list, as before)
  function ruleFor(user) {
    if (!user) return { all: true, strict: false, mode: 'role' };
    const role = norm(user.role);
    if (role === 'admin') return { all: true, strict: false, mode: 'role' };
    const access = normalize(user.access);
    if (access.mode === 'all') return { all: true, strict: false, mode: 'all' };
    if (access.mode === 'custom') {
      return { all: false, strict: true, mode: 'custom', exact: true,
        masters: access.masters, followpers: access.followpers, crrs: access.crrs };
    }
    let me = norm(user.followperName);
    if (me === 'unassigned') me = '';
    if (role === 'user') {
      return { all: false, strict: false, mode: 'role', exact: false, masters: [], followpers: me && me !== 'all' ? [me] : [], crrs: [] };
    }
    if (role === 'crr') {
      // Mahendra Bhai has always seen every master.
      if (me.includes('mahendra') || me === 'all' || norm(user.email).includes('mahendra')) return { all: true, strict: false, mode: 'role' };
      return { all: false, strict: true, mode: 'role', exact: false, masters: [], followpers: [], crrs: me ? [me] : [] };
    }
    return { all: true, strict: false, mode: 'role' };
  }

  // h = { ownerOf(m), crrOf(m) } from the app.
  function canSee(rule, m, h) {
    if (!rule || rule.all) return true;
    if (!m) return false;
    const match = rule.exact ? (a, b) => { const x = norm(a); return !!x && x === norm(b); } : near;
    if (rule.masters.some(x => match(m.master, x))) return true;
    if (rule.followpers.length && rule.followpers.some(x => match(h.ownerOf(m), x))) return true;
    if (rule.crrs.length && rule.crrs.some(x => match(h.crrOf(m), x))) return true;
    return false;
  }

  function filterParties(rule, list, h) {
    if (!rule || rule.all) return list || [];
    return (list || []).filter(m => canSee(rule, m, h));
  }

  // A line for the Users table and the "Showing only ..." note.
  function describe(access, role) {
    if (norm(role) === 'admin') return 'All parties (admin)';
    const a = normalize(access);
    if (a.mode === 'all') return 'All parties';
    if (a.mode === 'role') return 'Default for role';
    const parts = [];
    if (a.masters.length) parts.push(`Masters: ${a.masters.join(', ')}`);
    if (a.followpers.length) parts.push(`Doers: ${a.followpers.join(', ')}`);
    if (a.crrs.length) parts.push(`CRR: ${a.crrs.join(', ')}`);
    return parts.length ? parts.join(' · ') : 'Nothing (no parties chosen)';
  }

  const api = { MODES, normalize, ruleFor, canSee, filterParties, describe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DataAccess = api;
})(typeof window !== 'undefined' ? window : globalThis);
