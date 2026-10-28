const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../supabase-store.js');

const clone = x => JSON.parse(JSON.stringify(x));
const wait = ms => new Promise(r => setTimeout(r, ms));

// An in-memory stand-in for the Supabase client, with the same rules as the
// database functions in supabase/schema.sql.
function fakeClient() {
  const rows = new Map(); // "coll/id" -> { collection, id, data, version }
  const fake = { rows, offline: false, live: null, rpcCalls: 0 };
  const key = (c, id) => `${c}/${id}`;
  const err = (code, message) => ({ data: null, error: { code, message } });

  function applyOps(ops) {
    const work = new Map([...rows].map(([k, v]) => [k, clone(v)]));
    const events = [];
    for (const op of ops) {
      const k = key(op.coll, op.id);
      const cur = work.get(k);
      const exp = op.expected == null ? null : Number(op.expected);
      if (op.op === 'put') {
        if (exp === 0 && cur) return err('40001', 'conflict');
        if (exp > 0 && (!cur || cur.version !== exp)) return err('40001', 'conflict');
        const row = { collection: op.coll, id: op.id, data: clone(op.data), version: cur ? cur.version + 1 : 1 };
        work.set(k, row);
        events.push([cur ? 'UPDATE' : 'INSERT', row]);
      } else if (op.op === 'patch') {
        if (!cur) return err('P0002', 'not-found');
        const d = { ...cur.data, ...op.set };
        (op.unset || []).forEach(f => delete d[f]);
        Object.entries(op.union || {}).forEach(([f, items]) => {
          if (!Array.isArray(d[f])) d[f] = [];
          items.forEach(it => { if (!d[f].some(e => JSON.stringify(e) === JSON.stringify(it))) d[f].push(it); });
        });
        const row = { ...cur, data: d, version: cur.version + 1 };
        work.set(k, row);
        events.push(['UPDATE', row]);
      } else if (op.op === 'delete') {
        if (exp != null && (!cur || cur.version !== exp)) return err('40001', 'conflict');
        if (cur) { work.delete(k); events.push(['DELETE', cur]); }
      }
    }
    rows.clear();
    work.forEach((v, k) => rows.set(k, v));
    fake.lastEvents = events;
    return { data: true, error: null };
  }

  fake.emitLast = () => (fake.lastEvents || []).forEach(([t, row]) => fake.live({ eventType: t, new: t === 'DELETE' ? {} : clone(row), old: t === 'DELETE' ? clone(row) : {} }));

  fake.rpc = async (fn, args) => {
    fake.rpcCalls++;
    if (fake.offline) return err('', 'TypeError: Failed to fetch');
    if (fn !== 'cq_batch') throw new Error('unexpected rpc ' + fn);
    return applyOps(args.p_ops);
  };

  fake.from = () => {
    const f = {};
    const q = {
      select: () => q,
      eq: (col, v) => { f[col] = v; return q; },
      order: () => q,
      range: (a, b) => { f.range = [a, b]; return q; },
      then: (res, rej) => {
        if (fake.offline) return Promise.resolve(err('', 'TypeError: Failed to fetch')).then(res, rej);
        const list = [...rows.values()]
          .filter(r => r.collection === f.collection && (f.id == null || r.id === f.id))
          .sort((a, b) => a.id.localeCompare(b.id))
          .slice(f.range[0], f.range[1] + 1)
          .map(r => ({ id: r.id, data: clone(r.data), version: r.version }));
        return Promise.resolve({ data: list, error: null }).then(res, rej);
      }
    };
    return q;
  };

  fake.channel = () => {
    const ch = {
      on: (_e, _f, cb) => { fake.live = cb; return ch; },
      subscribe: cb => { fake.status = cb; setTimeout(() => cb('SUBSCRIBED'), 0); return ch; }
    };
    return ch;
  };
  return fake;
}

function memStorage() {
  const d = {};
  return { getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); } };
}

test('splitUpdate turns Firestore-style updates into set / unset / union', () => {
  const FV = S.FieldValue;
  const p = S.splitUpdate({ owner: 'Ram', old: FV.delete(), history: FV.arrayUnion({ t: 1 }, { t: 2 }) });
  assert.deepEqual(p, { set: { owner: 'Ram' }, unset: ['old'], union: { history: [{ t: 1 }, { t: 2 }] } });
});

test('set, update and get work like Firestore, and a missing record says not-found', async () => {
  const c = fakeClient();
  const db = S.create(c, { storage: memStorage() });
  const ref = db.collection('collectiq_markas').doc('7');
  await ref.set({ id: '7', marka: 'A', history: [{ t: 1 }] });
  await ref.update({ owner: 'Ram', history: db.FieldValue.arrayUnion({ t: 1 }, { t: 2 }) });
  const snap = await ref.get();
  assert.equal(snap.exists, true);
  assert.deepEqual(snap.data(), { id: '7', marka: 'A', owner: 'Ram', history: [{ t: 1 }, { t: 2 }] });
  await assert.rejects(db.collection('collectiq_markas').doc('nope').update({ a: 1 }), e => e.code === 'not-found');
  assert.equal((await db.collection('collectiq_markas').doc('nope').get()).exists, false);
});

test('a listener gets every record first, then each live change once', async () => {
  const c = fakeClient();
  const db = S.create(c, { storage: memStorage() });
  await db.collection('collectiq_payments').doc('p1').set({ id: 'p1', amount: 100 });
  const seen = [];
  db.collection('collectiq_payments').onSnapshot(s => seen.push(s.docChanges().map(ch => `${ch.type}:${ch.doc.id}`)));
  await wait(20);
  assert.deepEqual(seen, [['added:p1']]);

  await db.collection('collectiq_payments').doc('p2').set({ id: 'p2', amount: 50 });
  c.emitLast();
  await db.collection('collectiq_payments').doc('p1').set({ id: 'p1', amount: 120 });
  c.emitLast();
  c.emitLast(); // the same change twice is shown once
  await db.collection('collectiq_help_tickets').doc('t1').set({ id: 't1' });
  c.emitLast(); // another collection: not for this listener
  await wait(150);
  assert.deepEqual(seen, [['added:p1'], ['added:p2', 'modified:p1']]);

  await db.collection('collectiq_payments').doc('p2').delete();
  c.emitLast();
  await wait(150);
  assert.deepEqual(seen[2], ['removed:p2']);
});

test('a single-record listener (settings) gets that record', async () => {
  const c = fakeClient();
  const db = S.create(c, { storage: memStorage() });
  await db.collection('collectiq_config').doc('settings').set({ users: ['a'] });
  const got = [];
  db.collection('collectiq_config').doc('settings').onSnapshot(d => got.push(d.exists && d.data().users.length));
  await wait(20);
  await db.collection('collectiq_config').doc('settings').set({ users: ['a', 'b'] });
  c.emitLast();
  await wait(150);
  assert.deepEqual(got, [1, 2]);
});

test('a transaction retries when someone else saved the record in between', async () => {
  const c = fakeClient();
  const db = S.create(c, { storage: memStorage() });
  const ref = db.collection('collectiq_markas').doc('9');
  await ref.set({ id: '9', paid: 0 });
  let runs = 0;
  await db.runTransaction(async tx => {
    runs++;
    const s = await tx.get(ref);
    if (runs === 1) await ref.set({ id: '9', paid: 10 }); // another PC saves first
    tx.set(ref, { id: '9', paid: s.data().paid + 5 });
  });
  assert.equal(runs, 2);
  assert.equal((await ref.get()).data().paid, 15);
});

test('a transaction that creates a record does not overwrite one made meanwhile', async () => {
  const c = fakeClient();
  const db = S.create(c, { storage: memStorage() });
  const ref = db.collection('collectiq_markas').doc('n');
  let runs = 0;
  await db.runTransaction(async tx => {
    runs++;
    const s = await tx.get(ref);
    if (runs === 1) await ref.set({ id: 'n', v: 'other' });
    tx.set(ref, { id: 'n', v: s.exists ? 'merged' : 'mine' });
  });
  assert.equal(runs, 2);
  assert.equal((await ref.get()).data().v, 'merged');
});

test('saves made without internet wait on this PC and are sent in order later', async () => {
  const c = fakeClient();
  const storage = memStorage();
  const db = S.create(c, { storage });
  await db.collection('collectiq_markas').doc('1').set({ id: '1', history: [] });
  c.offline = true;
  await db.collection('collectiq_markas').doc('1').update({ history: db.FieldValue.arrayUnion({ t: 'a' }) });
  await db.collection('collectiq_markas').doc('1').update({ history: db.FieldValue.arrayUnion({ t: 'b' }) });
  assert.equal(db.pendingSaves(), 2);
  assert.equal(JSON.parse(storage.getItem('collectiq_supabase_outbox')).length, 2);
  c.offline = false;
  await db.flushOutbox();
  assert.equal(db.pendingSaves(), 0);
  assert.deepEqual((await db.collection('collectiq_markas').doc('1').get()).data().history, [{ t: 'a' }, { t: 'b' }]);
});

test('a batch is all or nothing', async () => {
  const c = fakeClient();
  const db = S.create(c, { storage: memStorage() });
  const col = db.collection('collectiq_markas');
  const b = db.batch();
  b.set(col.doc('a'), { id: 'a' });
  b.update(col.doc('missing'), { x: 1 });
  await assert.rejects(b.commit(), e => e.code === 'not-found');
  assert.equal((await col.doc('a').get()).exists, false);
  const snap = await col.get();
  assert.equal(snap.empty, true);
});
