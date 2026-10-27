// CollectIQ party sync: saves only what changed in a party, so two people
// working on the same party at the same time do not wipe each other's work.
// diffParty(seen, local) = what this PC changed since the live database last
// sent the party; applyPlan(server, plan) = that change on top of the latest
// saved party. Pure functions; no DOM, no database.
(function (root) {
  const LISTS = ['history', 'bills', 'escalations', 'fmsTasks'];

  function clone(x) {
    return x === undefined ? undefined : JSON.parse(JSON.stringify(x));
  }

  // Same text for the same data whatever the key order (the database returns
  // keys sorted, the app writes them in its own order).
  function canon(v) {
    if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
    if (v && typeof v === 'object') {
      return `{${Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
    }
    return JSON.stringify(v === undefined ? null : v);
  }

  const list = v => (Array.isArray(v) ? v.filter(x => x != null) : []);

  // Items added / removed between two lists, counting repeats.
  function multisetDiff(before, after) {
    const counts = new Map();
    list(before).forEach(x => counts.set(canon(x), (counts.get(canon(x)) || 0) + 1));
    const added = [];
    list(after).forEach(x => {
      const k = canon(x);
      if (counts.get(k) > 0) counts.set(k, counts.get(k) - 1);
      else added.push(x);
    });
    const removed = [];
    list(before).forEach(x => {
      const k = canon(x);
      if (counts.get(k) > 0) { removed.push(x); counts.set(k, counts.get(k) - 1); }
    });
    return { added, removed };
  }

  const idOf = x => (x && x.id != null && x.id !== '' ? `id:${x.id}` : `json:${canon(x)}`);

  // Items added / removed / changed between two lists of things with an id.
  function byIdDiff(before, after) {
    const old = new Map(list(before).map(x => [idOf(x), x]));
    const now = new Map(list(after).map(x => [idOf(x), x]));
    const added = [];
    const changed = [];
    now.forEach((x, k) => {
      if (!old.has(k)) added.push(x);
      else if (canon(old.get(k)) !== canon(x)) changed.push({ before: old.get(k), after: x });
    });
    const removed = [...old].filter(([k]) => !now.has(k)).map(([, x]) => x);
    return { added, removed, changed };
  }

  function diffParty(seen, local) {
    const fields = {};
    const keys = new Set([...Object.keys(seen || {}), ...Object.keys(local || {})]);
    keys.forEach(k => {
      if (k === 'id' || LISTS.includes(k)) return;
      if (canon((seen || {})[k]) !== canon((local || {})[k])) fields[k] = clone((local || {})[k]);
    });
    const history = multisetDiff(seen && seen.history, local && local.history);
    const fmsTasks = multisetDiff(seen && seen.fmsTasks, local && local.fmsTasks);
    const escalations = byIdDiff(seen && seen.escalations, local && local.escalations);
    const bills = byIdDiff(seen && seen.bills, local && local.bills);
    const listChanges = n => n.added.length + n.removed.length + (n.changed ? n.changed.length : 0);
    const empty = !Object.keys(fields).length && !listChanges(history) && !listChanges(fmsTasks) && !listChanges(escalations) && !listChanges(bills);
    // Simple = only fields and new history lines: can be sent without reading the party first.
    const simple = !history.removed.length && !listChanges(fmsTasks) && !listChanges(escalations) && !listChanges(bills);
    return { fields, history: { added: clone(history.added), removed: clone(history.removed) }, fmsTasks: clone(fmsTasks), escalations: clone(escalations), bills: clone(bills), empty, simple };
  }

  const round2 = n => Math.round(n * 100) / 100;

  function removeOnce(items, x) {
    const k = canon(x);
    const i = items.findIndex(y => canon(y) === k);
    if (i !== -1) items.splice(i, 1);
  }

  // This PC's change on top of the latest saved party (which may already hold
  // other people's changes). Applying the same plan twice adds nothing twice,
  // except bill payments, which the caller sends once per change.
  function applyPlan(server, plan) {
    const out = clone(server) || {};
    Object.keys(plan.fields || {}).forEach(k => {
      if (plan.fields[k] === undefined) delete out[k];
      else out[k] = clone(plan.fields[k]);
    });

    const history = list(out.history);
    plan.history.removed.forEach(x => removeOnce(history, x));
    plan.history.added.forEach(x => { if (!history.some(y => canon(y) === canon(x))) history.push(clone(x)); });
    out.history = history;

    const fms = list(out.fmsTasks);
    plan.fmsTasks.removed.forEach(x => removeOnce(fms, x));
    plan.fmsTasks.added.forEach(x => { if (!fms.some(y => canon(y) === canon(x))) fms.push(clone(x)); });
    out.fmsTasks = fms;

    let escs = list(out.escalations);
    const escRemoved = new Set(plan.escalations.removed.map(idOf));
    escs = escs.filter(e => !escRemoved.has(idOf(e)));
    plan.escalations.changed.forEach(({ after }) => {
      const i = escs.findIndex(e => idOf(e) === idOf(after));
      if (i === -1) escs.push(clone(after)); else escs[i] = clone(after);
    });
    plan.escalations.added.forEach(x => { if (!escs.some(e => idOf(e) === idOf(x))) escs.push(clone(x)); });
    out.escalations = escs;

    let bills = list(out.bills);
    const billRemoved = new Set(plan.bills.removed.map(idOf));
    bills = bills.filter(b => !billRemoved.has(idOf(b)));
    plan.bills.changed.forEach(({ before, after }) => {
      const i = bills.findIndex(b => idOf(b) === idOf(after));
      if (i === -1) { bills.push(clone(after)); return; }
      const cur = bills[i];
      Object.keys({ ...before, ...after }).forEach(f => {
        if (f === 'balance' || canon(before[f]) === canon(after[f])) return;
        if (after[f] === undefined) delete cur[f]; else cur[f] = clone(after[f]);
      });
      // A payment is a change in balance; it is added to whatever the balance is now.
      const delta = (Number(after.balance) || 0) - (Number(before.balance) || 0);
      if (delta) cur.balance = round2((Number(cur.balance) || 0) + delta);
    });
    plan.bills.added.forEach(x => { if (!bills.some(b => idOf(b) === idOf(x))) bills.push(clone(x)); });
    out.bills = bills;
    return out;
  }

  // New history lines get a unique id, so two equal-looking calls on one day
  // stay two lines when the database merges lists.
  function tagNewHistory(seen, local, makeId) {
    const { added } = multisetDiff(seen && seen.history, local && local.history);
    let n = 0;
    added.forEach(h => { if (h && typeof h === 'object' && !h._eid) { h._eid = makeId(); n++; } });
    return n;
  }

  const FOLLOW_UP_FIELDS = ['lastDate', 'nextDate', 'lastStatus', 'remark', 'ptp', 'expected'];

  // One party saved as several records: everything from every copy goes into
  // the first copy (the one kept). Repeated lines are kept once per copy that
  // has them; a bill / escalation in two copies keeps the first copy's version
  // (counted as a conflict). The follow-up state (next date, last status...)
  // comes from the copy contacted last.
  function mergeCopies(copies) {
    const [keep, ...others] = (copies || []).filter(Boolean);
    const merged = clone(keep);
    const summary = { historyAdded: 0, billsAdded: 0, escalationsAdded: 0, fmsAdded: 0, billConflicts: 0, removed: others.map(o => o.id) };
    merged.history = list(merged.history);
    merged.bills = list(merged.bills);
    merged.escalations = list(merged.escalations);
    merged.fmsTasks = list(merged.fmsTasks);
    let latest = keep;
    others.forEach(o => {
      multisetDiff(merged.history, o.history).added.forEach(h => { merged.history.push(clone(h)); summary.historyAdded++; });
      multisetDiff(merged.fmsTasks, o.fmsTasks).added.forEach(t => { merged.fmsTasks.push(clone(t)); summary.fmsAdded++; });
      list(o.bills).forEach(b => {
        const same = merged.bills.find(x => idOf(x) === idOf(b));
        if (!same) { merged.bills.push(clone(b)); summary.billsAdded++; }
        else if (canon(same) !== canon(b)) summary.billConflicts++;
      });
      list(o.escalations).forEach(e => {
        if (!merged.escalations.some(x => idOf(x) === idOf(e))) { merged.escalations.push(clone(e)); summary.escalationsAdded++; }
      });
      if (String(o.lastDate || '') > String(latest.lastDate || '')) latest = o;
    });
    if (latest !== keep) {
      FOLLOW_UP_FIELDS.forEach(f => {
        if (latest[f] === undefined) delete merged[f]; else merged[f] = clone(latest[f]);
      });
    }
    return { merged, summary };
  }

  const api = { clone, canon, diffParty, applyPlan, tagNewHistory, mergeCopies };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PartySync = api;
})(typeof window !== 'undefined' ? window : globalThis);
