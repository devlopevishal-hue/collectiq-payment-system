const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../party-sync.js');

const base = () => ({
  id: 'p1', marka: 'ADT', master: 'BABLU SHERA MASTER', owner: 'Surendra', nextDate: '2026-10-20', lastStatus: 'Call',
  history: [{ date: '2026-10-01', status: 'Call', remark: 'first' }],
  bills: [{ id: 1, balance: 50000, sourceAmount: 50000 }, { id: 2, balance: 20000, sourceAmount: 20000 }],
  escalations: [{ id: 'e1', date: '2026-10-02', status: 'Open' }],
  fmsTasks: []
});

test('two people add a follow-up to the same party at the same time: both entries stay', () => {
  const seen = base();
  const surendra = S.clone(seen);
  surendra.history.push({ date: '2026-10-27', status: 'Promise to Pay', remark: 'PTP 10th', _eid: 's1' });
  surendra.nextDate = '2026-11-10';
  const girdharilal = S.clone(seen);
  girdharilal.history.push({ date: '2026-10-27', status: 'Call', remark: 'not picking', _eid: 'g1' });

  let server = S.clone(seen);
  server = S.applyPlan(server, S.diffParty(seen, surendra));
  server = S.applyPlan(server, S.diffParty(seen, girdharilal));
  assert.deepEqual(server.history.map(h => h.remark), ['first', 'PTP 10th', 'not picking']);
  assert.equal(server.nextDate, '2026-11-10');
});

test('two payments on the same party at the same time: both reduce the bills', () => {
  const seen = base();
  const a = S.clone(seen);
  a.bills[0].balance = 40000; // paid 10,000
  const b = S.clone(seen);
  b.bills[0].balance = 45000; // paid 5,000
  b.bills[1].balance = 15000; // and 5,000
  let server = S.clone(seen);
  server = S.applyPlan(server, S.diffParty(seen, a));
  server = S.applyPlan(server, S.diffParty(seen, b));
  assert.deepEqual(server.bills.map(x => x.balance), [35000, 15000]);
});

test('saving the same change twice does not add or deduct twice', () => {
  const seen = base();
  const local = S.clone(seen);
  local.history.push({ date: '2026-10-27', status: 'Call', remark: 'x', _eid: 'e9' });
  const plan = S.diffParty(seen, local);
  const once = S.applyPlan(S.clone(seen), plan);
  const twice = S.applyPlan(once, plan);
  assert.equal(twice.history.length, 2);
});

test('nothing changed = empty plan; only fields and new entries = simple plan', () => {
  const seen = base();
  assert.equal(S.diffParty(seen, S.clone(seen)).empty, true);
  const l = S.clone(seen);
  l.history.push({ date: '2026-10-27', remark: 'n', _eid: 'z' });
  l.lastStatus = 'PTP';
  const p = S.diffParty(seen, l);
  assert.equal(p.empty, false);
  assert.equal(p.simple, true);
  assert.deepEqual(p.fields, { lastStatus: 'PTP' });
  assert.deepEqual(p.history.added.map(h => h.remark), ['n']);
  const pay = S.clone(seen);
  pay.bills[1].balance = 0;
  assert.equal(S.diffParty(seen, pay).simple, false);
});

test('key order and a removed field', () => {
  const seen = base();
  const l = { ...S.clone(seen) };
  l.history = [{ remark: 'first', status: 'Call', date: '2026-10-01' }]; // same entry, other key order
  delete l.lastStatus;
  const p = S.diffParty(seen, l);
  assert.deepEqual(p.history.added, []);
  assert.ok('lastStatus' in p.fields);
  assert.equal(p.fields.lastStatus, undefined);
  const out = S.applyPlan(S.clone(seen), p);
  assert.equal('lastStatus' in out, false);
});

test('escalation resolved on one PC, new escalation on another: both kept', () => {
  const seen = base();
  const a = S.clone(seen);
  a.escalations[0].status = 'Resolved';
  const b = S.clone(seen);
  b.escalations.push({ id: 'e2', date: '2026-10-27', status: 'Open' });
  let server = S.clone(seen);
  server = S.applyPlan(server, S.diffParty(seen, a));
  server = S.applyPlan(server, S.diffParty(seen, b));
  assert.deepEqual(server.escalations.map(e => [e.id, e.status]), [['e1', 'Resolved'], ['e2', 'Open']]);
});

test('new bills from an upload are added once; bill details update; removed bills go', () => {
  const seen = base();
  const l = S.clone(seen);
  l.bills.push({ id: 3, balance: 7000, sourceAmount: 7000 });
  l.bills[0].policyDate = '2026-11-01';
  l.bills.splice(1, 1);
  const p = S.diffParty(seen, l);
  const server = S.applyPlan(S.clone(seen), p);
  assert.deepEqual(server.bills.map(b => [b.id, b.balance, b.policyDate || '']), [[1, 50000, '2026-11-01'], [3, 7000, '']]);
  assert.deepEqual(S.applyPlan(server, p).bills.length, 2);
});

test('tagNewHistory gives new entries a unique id so equal-looking entries are not merged', () => {
  const seen = base();
  const l = S.clone(seen);
  l.history.push({ date: '2026-10-27', remark: 'not picking' }, { date: '2026-10-27', remark: 'not picking' });
  let n = 0;
  assert.equal(S.tagNewHistory(seen, l, () => 'id' + (++n)), 2);
  assert.deepEqual(l.history.slice(1).map(h => h._eid), ['id1', 'id2']);
  assert.equal(l.history[0]._eid, undefined);
  const server = S.applyPlan(S.clone(seen), S.diffParty(seen, l));
  assert.equal(server.history.length, 3);
});

test('money stays exact to the paisa', () => {
  const seen = base();
  seen.bills[0].balance = 1000.1;
  const l = S.clone(seen);
  l.bills[0].balance = 999.9;
  const server = S.applyPlan(S.clone(seen), S.diffParty(seen, l));
  assert.equal(server.bills[0].balance, 999.9);
});

test('mergeCopies: nothing from any copy is lost', () => {
  const keep = {
    id: 'a', marka: 'ADT', master: 'M', owner: 'Surendra', lastDate: '2026-10-01', nextDate: '2026-10-05', lastStatus: 'Call',
    history: [{ date: '2026-10-01', remark: 'one' }, { date: '2026-10-01', remark: 'one' }],
    bills: [{ id: 1, balance: 100 }, { id: 2, balance: 50 }],
    escalations: [{ id: 'e1', status: 'Open' }],
    fmsTasks: [{ code: 'FMS-1', done: true }]
  };
  const other = {
    id: 'b', marka: 'ADT', master: 'M', owner: 'Mahavir', lastDate: '2026-10-20', nextDate: '2026-10-25', lastStatus: 'Promise to Pay', remark: 'PTP',
    history: [{ date: '2026-10-01', remark: 'one' }, { date: '2026-10-20', remark: 'two' }],
    bills: [{ id: 2, balance: 0 }, { id: 3, balance: 70 }],
    escalations: [{ id: 'e1', status: 'Resolved' }, { id: 'e2', status: 'Open' }],
    fmsTasks: [{ code: 'FMS-2', done: true }]
  };
  const r = S.mergeCopies([keep, other]);
  const m = r.merged;
  assert.equal(m.id, 'a');
  assert.equal(m.owner, 'Surendra');
  assert.deepEqual(m.history.map(h => h.remark), ['one', 'one', 'two']);
  assert.deepEqual(m.bills.map(b => [b.id, b.balance]), [[1, 100], [2, 50], [3, 70]]);
  assert.deepEqual(m.escalations.map(e => [e.id, e.status]), [['e1', 'Open'], ['e2', 'Open']]);
  assert.equal(m.fmsTasks.length, 2);
  // the latest follow-up state comes from the copy contacted last
  assert.deepEqual([m.lastDate, m.nextDate, m.lastStatus, m.remark], ['2026-10-20', '2026-10-25', 'Promise to Pay', 'PTP']);
  assert.deepEqual(r.summary, { historyAdded: 1, billsAdded: 1, escalationsAdded: 1, fmsAdded: 1, billConflicts: 1, removed: ['b'] });
  assert.equal(keep.history.length, 2);
});
