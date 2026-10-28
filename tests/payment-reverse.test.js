const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../payment-reverse.js');
const PaymentUpload = require('../payment-upload.js');

const money = n => '₹' + n;

function party() {
  return {
    id: 'm1', marka: 'JGG', master: 'BABLU', nextDate: '', lastStatus: 'Payment Received',
    bills: [
      { id: 1, firstDate: '2026-07-01', balance: 0, sourceAmount: 1000 },
      { id: 2, firstDate: '2026-07-10', balance: 200, sourceAmount: 500 }
    ],
    history: [
      { type: 'followup', date: '2026-10-01', status: 'Called' },
      { type: 'payment', date: '2026-10-20', status: 'Payment Received', amount: 1000, ref: 'UTR9', billId: 1 },
      { type: 'payment', date: '2026-10-20', status: 'Part Payment', amount: 300, ref: 'UTR9', billId: 2 }
    ]
  };
}
const PAY = { id: 'p1', date: '2026-10-20', ref: 'UTR9', mode: 'RTGS', amount: 1300,
  allocations: [{ billId: 1, amount: 1000, settled: true }, { billId: 2, amount: 300, settled: false }] };

test('reversing gives the bills back what the payment took and removes its lines', () => {
  const m = party();
  const r = R.reverse(m, PAY, { today: '2026-10-28', by: 'Vishal', reason: 'wrong party', money });
  assert.equal(r.ok, true);
  assert.deepEqual(m.bills.map(b => b.balance), [1000, 500]);
  assert.equal(r.linesRemoved, 2);
  assert.equal(m.history.filter(h => h.type === 'payment').length, 0);
  assert.equal(m.history[0].status, 'Called', 'other follow-ups stay');
  const last = m.history.at(-1);
  assert.equal(last.status, 'Payment Reversed');
  assert.equal(last.amount, undefined, 'the reversal line is not counted as money received');
  assert.match(last.remark, /reversed by Vishal: wrong party/);
  assert.equal(m.nextDate, '2026-10-28', 'dues are back, so the party is followed up again');
});

test('an advance credit made by the payment is removed', () => {
  const m = party();
  m.bills.push({ id: 'adv_x', balance: -200, sourceAmount: -200, policyName: 'ADVANCE PAYMENT' });
  m.history.push({ type: 'payment', date: '2026-10-20', status: 'Advance Payment', amount: 200, ref: 'UTR9', billId: 'adv_x' });
  const p = { ...PAY, amount: 1500, allocations: [...PAY.allocations, { billId: 'adv_x', amount: 200, settled: true, isAdvance: true }] };
  R.reverse(m, p, { today: '2026-10-28', money });
  assert.deepEqual(m.bills.map(b => b.id), [1, 2]);
  assert.equal(m.history.filter(h => h.type === 'payment').length, 0);
});

test('nothing changes when a settled bill is no longer on the party', () => {
  const m = party();
  m.bills = m.bills.filter(b => b.id !== 1);
  const before = JSON.stringify(m);
  const r = R.reverse(m, PAY, { today: '2026-10-28', money });
  assert.match(r.error, /no longer on the party/);
  assert.equal(JSON.stringify(m), before);
});

test('lines carrying the payment ID are matched on the ID only', () => {
  const m = party();
  m.history.push({ type: 'payment', date: '2026-10-25', amount: 50, ref: 'X', billId: 2, paymentId: 'p2' });
  const lines = R.linesFor(m, { id: 'p2', date: '2026-10-25', ref: 'X', amount: 50, allocations: [{ billId: 2, amount: 50 }] });
  assert.deepEqual(lines, [3]);
});

test('a payment entered from the follow-up form (one line for the whole amount) is found', () => {
  const m = party();
  m.history = [{ type: 'payment', date: '2026-10-20', amount: 1300, ref: 'UTR9', allocations: [] }];
  assert.deepEqual(R.linesFor(m, PAY), [0]);
});

test('a bulk-uploaded payment reverses back to the bills it settled', () => {
  const m = { id: 'm2', marka: 'AKYT', master: 'BABLU SHERA MASTER', bills: [
    { id: 'a', firstDate: '2026-06-01', balance: 1000 }, { id: 'b', firstDate: '2026-07-01', balance: 500 }], history: [] };
  let n = 0;
  const item = { party: m, row: { paid: 1100, deductions: 100, ref: 'R1', policy: 'NET', disc: 100, rd: 0, claim: 0, tds: 0 }, date: '2026-10-27', settle: 1200 };
  const p = PaymentUpload.apply(item, { mode: 'RTGS', uid: () => 'id' + (n++), money });
  assert.deepEqual(m.bills.map(b => b.balance), [0, 300]);
  const r = R.reverse(m, p, { today: '2026-10-28', by: 'Vishal', money });
  assert.equal(r.ok, true);
  assert.deepEqual(m.bills.map(b => b.balance), [1000, 500]);
  assert.equal(m.history.filter(h => h.type === 'payment').length, 0);
});
