const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../save-guard.js');

function fakeStorage(limit) {
  const data = {};
  return {
    data,
    setItem(k, v) {
      const used = Object.entries(data).filter(([key]) => key !== k).reduce((s, [key, val]) => s + key.length + val.length, 0);
      if (used + k.length + String(v).length > limit) {
        const e = new Error("Failed to execute 'setItem' on 'Storage': Setting the value of 'x' exceeded the quota.");
        e.name = 'QuotaExceededError';
        throw e;
      }
      data[k] = String(v);
    }
  };
}

test('safeSet: saves normally and reports ok', () => {
  const s = fakeStorage(1000);
  assert.deepEqual(G.safeSet(s, 'a', 'hello'), { ok: true, full: false });
  assert.equal(s.data.a, 'hello');
});

test('safeSet: a full browser storage does not throw, it reports full', () => {
  const s = fakeStorage(20);
  const r = G.safeSet(s, 'markas', 'x'.repeat(50));
  assert.deepEqual(r, { ok: false, full: true });
  assert.equal(s.data.markas, undefined);
});

test('safeSet: other storage errors and a missing storage are reported, not thrown', () => {
  const broken = { setItem() { throw new Error('SecurityError'); } };
  assert.deepEqual(G.safeSet(broken, 'a', 'b'), { ok: false, full: false });
  assert.deepEqual(G.safeSet(null, 'a', 'b'), { ok: false, full: false });
});

test('isQuotaError: Chrome, Firefox and Safari wordings', () => {
  assert.equal(G.isQuotaError({ name: 'QuotaExceededError' }), true);
  assert.equal(G.isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' }), true);
  assert.equal(G.isQuotaError({ code: 22 }), true);
  assert.equal(G.isQuotaError({ message: 'exceeded the quota' }), true);
  assert.equal(G.isQuotaError(new Error('other')), false);
  assert.equal(G.isQuotaError(null), false);
});

test('cloudErrorText: tells staff what happened in plain words', () => {
  const big = G.cloudErrorText({ code: 'invalid-argument', message: 'Document cannot be written because its size (1,204,111 bytes) exceeds the maximum allowed size of 1,048,576 bytes.' }, 'JHC');
  assert.match(big, /JHC/);
  assert.match(big, /too big/i);
  assert.match(big, /NOT saved/);
  assert.match(G.cloudErrorText({ code: 'permission-denied' }, 'ADT'), /refused/i);
  assert.match(G.cloudErrorText({ code: 'resource-exhausted' }, 'ADT'), /limit/i);
  assert.match(G.cloudErrorText({ code: 'unavailable' }, 'ADT'), /internet/i);
  const other = G.cloudErrorText(new Error('boom'), 'ADT');
  assert.match(other, /ADT/);
  assert.match(other, /NOT saved/);
  assert.match(G.cloudErrorText(undefined, ''), /NOT saved/);
});

test('backupPayload: every collection, counts and where it came from', () => {
  const now = new Date('2026-10-27T11:05:00');
  const b = G.backupPayload({
    collectiq_markas: [{ id: 'a' }, { id: 'b' }],
    collectiq_payments: [{ id: 'p' }],
    collectiq_help_tickets: [],
    collectiq_config: [{ id: 'settings', users: [] }]
  }, { source: 'live database', now, appVersion: '6.22.0' });
  assert.equal(b.app, 'CollectIQ');
  assert.equal(b.source, 'live database');
  assert.equal(b.appVersion, '6.22.0');
  assert.equal(b.exportedAt, now.toISOString());
  assert.deepEqual(b.counts, { collectiq_markas: 2, collectiq_payments: 1, collectiq_help_tickets: 0, collectiq_config: 1 });
  assert.deepEqual(b.data.collectiq_markas, [{ id: 'a' }, { id: 'b' }]);
});

test('backupPayload: missing collections become empty lists', () => {
  const b = G.backupPayload({ collectiq_markas: null }, { source: 'this browser', now: new Date('2026-01-02T03:04:00') });
  assert.deepEqual(b.counts, { collectiq_markas: 0 });
  assert.deepEqual(b.data.collectiq_markas, []);
});

test('backupFileName: date and time so backups never overwrite each other', () => {
  assert.equal(G.backupFileName(new Date('2026-10-27T09:05:00')), 'collectiq-backup-2026-10-27-0905.json');
});
