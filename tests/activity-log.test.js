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
