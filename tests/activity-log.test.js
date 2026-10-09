const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../activity-log.js');

const ownerOf = m => m.owner || 'Unassigned';
const markas = [
  {
    id: 'a', marka: 'ACT', master: 'BABLU SHERA MASTER', owner: 'Surendra',
    history: [
      { type: 'followup', date: '2026-09-30', followper: 'Surendra', status: 'Help Ticket', mode: 'Phone call', remark: '[Help Ticket: x] Assigned to: Saurav. Note: Hii', next: '2026-10-02' },
      { type: 'followup', date: '2026-10-06', followper: 'Surendra', status: 'Promise to Pay', mode: 'Phone call', contact: 'Seth ji', remark: 'Maal checking me hai', expected: 50000, promise: '2026-10-15', next: '2026-10-15' },
      { type: 'payment', date: '2026-10-06', followper: 'Mahavir', status: 'Payment Received', mode: 'WhatsApp', amount: 30000, ref: '777', remark: 'cheque mila' }
    ]
  },
  {
    id: 'b', marka: 'JGG', master: 'BABLU SHERA MASTER', owner: 'Mahavir',
    history: [
      { type: 'followup', date: '2026-10-06', status: 'WhatsApp Complaint / Claim Matter', mode: 'In person (Field Visit)', remark: 'rate diff' },
      { type: 'followup', date: '2026-10-06', followper: 'Mahavir', status: 'FMS Task Completed', remark: '[FMS-1 COMPLETED] …' },
      { type: 'followup', date: '2026-10-07', followper: 'Mahavir', status: 'Promise to Pay', mode: 'Email', promise: '2026-10-20' }
    ]
  }
];

test('classify: payment, FMS, help ticket and complaint win over the contact mode', () => {
  const h = markas[0].history;
  assert.equal(A.classify(h[0]), 'help');
  assert.equal(A.classify(h[1]), 'call');
  assert.equal(A.classify(h[2]), 'payment');
  assert.equal(A.classify(markas[1].history[0]), 'complaint');
  assert.equal(A.classify(markas[1].history[1]), 'fms');
  assert.equal(A.classify(markas[1].history[2]), 'email');
  assert.equal(A.classify({ mode: 'WhatsApp' }), 'whatsapp');
  assert.equal(A.classify({ mode: 'In person (Field Visit)', status: 'Promise to Pay' }), 'visit');
});

test('collectActivity: one day, newest first, doer is who did it (owner as fallback)', () => {
  const rows = A.collectActivity(markas, { from: '2026-10-06', to: '2026-10-06', ownerOf });
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map(r => r.doer).sort(), ['Mahavir', 'Mahavir', 'Mahavir', 'Surendra']);
  const ptp = rows.find(r => r.status === 'Promise to Pay');
  assert.deepEqual(
    { marka: ptp.marka, master: ptp.master, doer: ptp.doer, kind: ptp.kind, ptp: ptp.ptp, promise: ptp.promise, expected: ptp.expected, remark: ptp.remark, contact: ptp.contact, next: ptp.next, markaId: ptp.markaId },
    { marka: 'ACT', master: 'BABLU SHERA MASTER', doer: 'Surendra', kind: 'call', ptp: true, promise: '2026-10-15', expected: 50000, remark: 'Maal checking me hai', contact: 'Seth ji', next: '2026-10-15', markaId: 'a' }
  );
  assert.equal(rows.find(r => r.status === 'WhatsApp Complaint / Claim Matter').doer, 'Mahavir');
});

test('collectActivity: date range, doer and search filters', () => {
  assert.equal(A.collectActivity(markas, { from: '2026-09-01', to: '2026-10-31', ownerOf }).length, 6);
  const range = A.collectActivity(markas, { from: '2026-09-01', to: '2026-10-31', ownerOf });
  assert.deepEqual(range.map(r => r.date), ['2026-10-07', '2026-10-06', '2026-10-06', '2026-10-06', '2026-10-06', '2026-09-30']);
  assert.equal(A.collectActivity(markas, { from: '2026-09-01', to: '2026-10-31', doer: 'surendra', ownerOf }).length, 2);
  assert.equal(A.collectActivity(markas, { from: '2026-09-01', to: '2026-10-31', search: 'maal', ownerOf }).length, 1);
  assert.equal(A.collectActivity(markas, { from: '2026-09-01', to: '2026-10-31', search: 'jgg', ownerOf }).length, 3);
});

test('summarize: counts per doer with payment total', () => {
  const rows = A.collectActivity(markas, { from: '2026-09-01', to: '2026-10-31', ownerOf });
  const s = A.summarize(rows);
  assert.deepEqual(s.find(x => x.doer === 'Surendra'), { doer: 'Surendra', calls: 1, whatsapp: 0, emails: 0, visits: 0, ptp: 1, payments: 0, paymentAmount: 0, complaints: 0, help: 1, fms: 0, total: 2 });
  assert.deepEqual(s.find(x => x.doer === 'Mahavir'), { doer: 'Mahavir', calls: 0, whatsapp: 0, emails: 1, visits: 0, ptp: 1, payments: 1, paymentAmount: 30000, complaints: 1, help: 0, fms: 1, total: 4 });
  assert.equal(s[0].doer, 'Mahavir');
});

test('collectActivity survives odd old data: missing names, numeric or Date dates, empty history', () => {
  const odd = [
    { id: 'x', history: [{ date: '2026-10-06', status: 'Promise to Pay', mode: 'Phone call' }] },
    { id: 'y', marka: 'OK', history: [{ date: 20261006, status: 'x' }, { date: new Date('2026-10-06T00:00:00Z'), mode: 'WhatsApp' }, null, { date: '2026-10-06', remark: 42 }] },
    { id: 'z', marka: 'NOHIST' },
    null
  ];
  const rows = A.collectActivity(odd, { from: '2026-10-01', to: '2026-10-31', ownerOf: m => (m && m.owner) || 'Unassigned', search: '' });
  assert.ok(rows.length >= 2);
  assert.ok(rows.every(r => typeof r.marka === 'string' && typeof r.date === 'string'));
  assert.ok(rows.some(r => r.date === '2026-10-06' && r.kind === 'whatsapp'));
  assert.doesNotThrow(() => A.summarize(rows));
  assert.equal(A.collectActivity(odd, { from: '2026-10-01', to: '2026-10-31', search: '42', ownerOf: () => '' }).length, 1);
});
test('filterActivity: by kind (PTP is a flag), master, doer and search', () => {
  const rows = A.collectActivity(markas, { from: '2026-09-01', to: '2026-10-31', ownerOf });
  assert.equal(A.filterActivity(rows, {}).length, 6);
  assert.equal(A.filterActivity(rows, { kind: 'all' }).length, 6);
  assert.deepEqual(A.filterActivity(rows, { kind: 'payment' }).map(r => r.marka), ['ACT']);
  assert.equal(A.filterActivity(rows, { kind: 'ptp' }).length, 2);
  assert.equal(A.filterActivity(rows, { kind: 'call' }).length, 1);
  assert.equal(A.filterActivity(rows, { master: 'bablu shera master' }).length, 6);
  assert.equal(A.filterActivity(rows, { master: 'RAJESH MASTER' }).length, 0);
  assert.equal(A.filterActivity(rows, { doer: 'Mahavir' }).length, 4);
  assert.equal(A.filterActivity(rows, { doer: 'Mahavir', kind: 'ptp' }).length, 1);
  assert.equal(A.filterActivity(rows, { search: 'cheque' }).length, 1);
  assert.equal(A.filterActivity(rows, { search: 'promise' }).length, 2);
  assert.equal(A.filterActivity(rows, { search: 'jgg', kind: 'fms' }).length, 1);
});

test('kindCounts and totals for the filter buttons', () => {
  const rows = A.collectActivity(markas, { from: '2026-09-01', to: '2026-10-31', ownerOf });
  assert.deepEqual(A.kindCounts(rows), { all: 6, payment: 1, ptp: 2, call: 1, whatsapp: 0, visit: 0, email: 1, complaint: 1, help: 1, fms: 1, other: 0 });
  assert.deepEqual(A.totals(rows), { collected: 30000, payments: 1, expected: 50000, ptps: 2 });
  assert.deepEqual(A.kindCounts([]).all, 0);
  assert.deepEqual(A.totals(null), { collected: 0, payments: 0, expected: 0, ptps: 0 });
});
