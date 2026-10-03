const test = require('node:test');
const assert = require('node:assert/strict');
const FA = require('../followup-actions.js');

const NOW = Date.parse('2026-10-03T10:00:00Z');
const clone = x => JSON.parse(JSON.stringify(x));

function party() {
  return { id: 'a', marka: 'JGG', master: 'BABLU SHERA MASTER', owner: 'Girdharilal', history: [], fmsTasks: [] };
}

function ptp(extra = {}) {
  return {
    date: '2026-10-03', followper: 'Girdharilal', contactPerson: 'Ramesh ji', contactMode: 'Phone call',
    expected: 50000, promiseDate: '2026-10-15', nextDate: '', remark: '15 ko denge', ownerFallback: 'Girdharilal', ...extra
  };
}

test('applyPtpFollowup writes the same entry and party fields as the form', () => {
  const m = party();
  const r = FA.applyPtpFollowup(m, ptp());
  assert.equal(r.error, undefined);
  assert.deepEqual(r.entry, {
    type: 'followup', date: '2026-10-03', followper: 'Girdharilal', status: 'Promise to Pay', contact: 'Ramesh ji',
    mode: 'Phone call', remark: '15 ko denge', expected: 50000, promise: '2026-10-15', next: '2026-10-15',
    claimNumber: '', waComplaintNo: '', escalatedTo: '', visitPurpose: '', visitPersonMet: '', visitNotes: '',
    billIds: [], amount: 0, ref: '', receiptImage: '', allocations: []
  });
  assert.deepEqual(
    { lastDate: m.lastDate, lastStatus: m.lastStatus, remark: m.remark, expected: m.expected, ptp: m.ptp, nextDate: m.nextDate, owner: m.owner },
    { lastDate: '2026-10-03', lastStatus: 'Promise to Pay', remark: '15 ko denge', expected: 50000, ptp: '2026-10-15', nextDate: '2026-10-15', owner: 'Girdharilal' }
  );
  assert.equal(m.history.at(-1), r.entry);
  assert.deepEqual(r.payload, {
    markaId: 'a', followDate: '2026-10-03', followper: 'Girdharilal', contactPerson: 'Ramesh ji', contactMode: 'Phone call',
    actionStatus: 'Promise to Pay', expected: 50000, promiseDate: '2026-10-15', nextDate: '2026-10-15', remark: '15 ko denge',
    claimNumber: '', waComplaintNo: '', escalateTo: '', billIds: [], payRef: '', payMode: 'cheque', payType: 'Part Payment',
    payAmount: 0, allocations: []
  });
});

test('applyPtpFollowup keeps an explicit next date and falls back for the owner', () => {
  const m = party();
  assert.equal(FA.applyPtpFollowup(m, ptp({ nextDate: '2026-10-12' })).entry.next, '2026-10-12');
  const m2 = party();
  FA.applyPtpFollowup(m2, ptp({ followper: '', ownerFallback: 'Surendra' }));
  assert.equal(m2.owner, 'Surendra');
  const m3 = party();
  FA.applyPtpFollowup(m3, ptp({ followper: '', ownerFallback: '' }));
  assert.equal(m3.owner, 'Unassigned');
});

test('applyPtpFollowup fills visit fields for a field visit', () => {
  const plain = FA.applyPtpFollowup(party(), ptp({ contactMode: 'In person (Field Visit)' })).entry;
  assert.deepEqual([plain.visitPurpose, plain.visitPersonMet, plain.visitNotes], ['Payment Collection', 'Ramesh ji', '']);
  const given = FA.applyPtpFollowup(party(), ptp({ contactMode: 'In person (Field Visit)', visit: { purpose: 'Statement Signing', personMet: 'Owner', notes: 'shop' } })).entry;
  assert.deepEqual([given.visitPurpose, given.visitPersonMet, given.visitNotes], ['Statement Signing', 'Owner', 'shop']);
});

test('applyPtpFollowup rejects bad input without touching the party', () => {
  for (const bad of [{ promiseDate: '' }, { promiseDate: '15-10-2026' }, { contactMode: 'Fax' }, { expected: -1 }, { nextDate: '12/10/2026' }]) {
    const m = party();
    const before = clone(m);
    assert.ok(FA.applyPtpFollowup(m, ptp(bad)).error, JSON.stringify(bad));
    assert.deepEqual(m, before);
  }
});

function fms(m, code, extra = {}) {
  return FA.completeFmsTask(m, code, { baseDueDate: '2026-07-16', actualDate: '2026-10-03', completedBy: 'Surendra', remark: 'rokad updated', now: NOW, ...extra });
}

test('completeFmsTask: late milestone gets 0.5 and the form history text', () => {
  const m = party();
  const r = fms(m, 'FMS-1');
  assert.deepEqual(r.task, {
    id: 'fms_a_FMS-1', code: 'FMS-1', taskCode: 'FMS-1', taskName: 'Update Payment in System / Rokad',
    responsibleRole: 'Account Team', responsibleName: 'Account Team', offsetDays: 2, dueDate: '2026-07-16',
    plannedDate: '2026-07-18', actualDate: '2026-10-03', status: 'Done (Delayed)', score: 0.5, remark: 'rokad updated',
    completedBy: 'Surendra', done: true, completedAt: new Date(NOW).toISOString()
  });
  assert.deepEqual(r.entry, {
    type: 'followup', date: '2026-10-03', followper: 'Surendra', status: 'FMS Task Completed',
    remark: '[FMS-1 COMPLETED] Update Payment in System / Rokad. Planned: 2026-07-18, Actual: 2026-10-03 (Delayed: 0.5 pt). Responsible: Account Team (Surendra). Note: rokad updated'
  });
  assert.equal(m.fmsTasks.at(-1), r.task);
  assert.equal(m.history.at(-1), r.entry);
});

test('completeFmsTask: on time, default note, responsible names', () => {
  const r = fms(party(), 'FMS-1', { actualDate: '2026-07-18', remark: '' });
  assert.equal(r.task.status, 'Done (On-Time)');
  assert.equal(r.task.score, 1.0);
  assert.match(r.entry.remark, /\(On-Time: 1\.0 pt\)/);
  assert.match(r.entry.remark, /Note: Milestone achieved\.$/);
  assert.equal(fms(party(), 'FMS-3').task.responsibleName, 'BABLU SHERA MASTER');
  assert.equal(fms(party(), 'FMS-2').task.responsibleName, 'Process Coordinator (PC)');
});

test('completeFmsTask replaces a saved task with the same code', () => {
  const m = party();
  m.fmsTasks.push({ code: 'FMS-2', taskCode: 'FMS-2', done: false }, { code: 'FMS-1', taskCode: 'FMS-1', done: false });
  fms(m, 'FMS-1');
  assert.equal(m.fmsTasks.length, 2);
  assert.equal(m.fmsTasks[1].status, 'Done (Delayed)');
});

test('completeFmsTask errors leave the party unchanged; allowRedo re-marks', () => {
  for (const [code, extra] of [['FMS-9', {}], ['FMS-1', { baseDueDate: '' }], ['FMS-1', { isDone: true }], ['FMS-1', { actualDate: '' }]]) {
    const m = party();
    const before = clone(m);
    assert.ok(fms(m, code, extra).error, code + JSON.stringify(extra));
    assert.deepEqual(m, before);
  }
  assert.equal(fms(party(), 'FMS-1', { isDone: true, allowRedo: true }).error, undefined);
});

test('FMS definitions and contact modes match the app', () => {
  assert.deepEqual(FA.FMS_DEFINITIONS.map(d => [d.code, d.offset, d.role]), [
    ['FMS-1', 2, 'Account Team'], ['FMS-2', 5, 'Process Coordinator (PC)'], ['FMS-3', 14, 'Master'], ['FMS-4', 15, 'Process Coordinator (PC)']
  ]);
  assert.deepEqual(FA.CONTACT_MODES, ['Phone call', 'WhatsApp', 'Email', 'In person (Field Visit)']);
});

// ---- Payment Received (Update Follow-up form) ----

const money = n => '₹' + n;
let seq = 0;
const newId = () => 'id' + (++seq);

function billedParty() {
  return {
    id: 'p', marka: 'RKC', master: 'KALPESH MASTER', owner: 'Sajjan', expected: 0, ptp: '', history: [], fmsTasks: [],
    bills: [
      { id: 2, firstDate: '2026-07-15', balance: 20000 },
      { id: 1, firstDate: '2026-07-01', balance: 30000 },
      { id: 3, firstDate: '2026-06-01', balance: 0 }
    ]
  };
}

function pay(extra = {}) {
  seq = 0;
  return {
    date: '2026-10-03', followper: 'Sajjan', contactPerson: '', contactMode: 'Phone call', remark: '', expected: 0, promiseDate: '',
    nextDate: '', payRef: '123456', payMode: 'cheque', payType: 'Part Payment', payAmount: 40000, ownerFallback: 'Sajjan',
    paymentFollowperFallback: 'Sajjan', defaultNext: '2026-10-05', newId, money, now: Date.parse('2026-10-03T10:00:00Z'), ...extra
  };
}

test('applyPaymentFollowup: part payment clears oldest bills first', () => {
  const m = billedParty();
  const payments = [];
  const r = FA.applyPaymentFollowup(m, payments, pay());
  assert.equal(r.error, undefined);
  assert.deepEqual(m.bills.map(b => [b.id, b.balance]), [[2, 10000], [1, 0], [3, 0]]);
  assert.deepEqual(r.entry.allocations, [{ billId: 1, amount: 30000, settled: true }, { billId: 2, amount: 10000, settled: false }]);
  assert.deepEqual(
    { type: r.entry.type, status: r.entry.status, next: r.entry.next, amount: r.entry.amount, ref: r.entry.ref, remark: r.entry.remark, followper: r.entry.followper },
    { type: 'payment', status: 'Payment Received', next: '2026-10-05', amount: 40000, ref: '123456', remark: 'Payment ₹40000 received (cheque ref: 123456); ₹10000 still due.', followper: 'Sajjan' }
  );
  assert.deepEqual(payments, [r.payment]);
  assert.deepEqual(r.payment, {
    id: 'id1', date: '2026-10-03', ref: '123456', mode: 'cheque', amount: 40000, marka: 'RKC', receiptImage: '', followper: 'Sajjan',
    allocations: [{ billId: 1, amount: 30000, settled: true, isAdvance: false }, { billId: 2, amount: 10000, settled: false, isAdvance: false }]
  });
  assert.deepEqual({ next: m.nextDate, status: m.lastStatus, owner: m.owner, last: m.lastDate }, { next: '2026-10-05', status: 'Payment Received', owner: 'Sajjan', last: '2026-10-03' });
  assert.equal(m.history.at(-1), r.entry);
  assert.equal(r.payload.actionStatus, 'Payment Received');
  assert.equal(r.payload.payAmount, 40000);
});

test('applyPaymentFollowup: full payment closes the follow-up; extra becomes advance', () => {
  const full = billedParty();
  const r1 = FA.applyPaymentFollowup(full, [], pay({ payAmount: 50000, payType: 'Full Payment' }));
  assert.equal(r1.entry.next, '');
  assert.equal(r1.entry.status, 'Payment Received');
  assert.equal(r1.entry.remark, 'Full payment ₹50000 received (cheque ref: 123456). All dues cleared.');
  const over = billedParty();
  const r2 = FA.applyPaymentFollowup(over, [], pay({ payAmount: 55000, payType: 'Full Payment' }));
  const adv = over.bills.at(-1);
  assert.deepEqual(adv, { id: 'adv_id1', firstDate: '2026-10-03', balance: -5000, sourceAmount: -5000, billCount: 1, billNos: ['ADV/123456'], policyDate: '2026-10-03', policyName: 'ADVANCE PAYMENT' });
  assert.deepEqual(r2.entry.allocations.at(-1), { billId: 'adv_id1', amount: 5000, settled: true, isAdvance: true });
  assert.equal(r2.entry.status, 'Advance Payment');
  assert.equal(r2.entry.next, '');
});

test('applyPaymentFollowup: given allocations (form) are used and capped at the bill balance', () => {
  const m = billedParty();
  const r = FA.applyPaymentFollowup(m, [], pay({ payAmount: 25000, allocations: [{ billId: 2, amount: 25000 }] }));
  assert.deepEqual(r.entry.allocations[0], { billId: 2, amount: 20000, settled: true });
  assert.equal(r.entry.allocations[1].isAdvance, true);
  assert.equal(r.entry.allocations[1].amount, 5000);
});

test('applyPaymentFollowup: bad input changes nothing', () => {
  for (const bad of [{ payAmount: 0 }, { payMode: 'bitcoin' }, { payType: 'Half' }, { allocations: [] }]) {
    const m = billedParty();
    const before = clone(m);
    const payments = [];
    assert.ok(FA.applyPaymentFollowup(m, payments, pay(bad)).error, JSON.stringify(bad));
    assert.deepEqual(m, before);
    assert.equal(payments.length, 0);
  }
});

// ---- WhatsApp Complaint / Claim Matter ----

function complaint(extra = {}) {
  return {
    date: '2026-10-03', followper: 'Sajjan', contactPerson: 'Seth ji', contactMode: 'WhatsApp', remark: 'Rate difference on 2 bills',
    expected: 0, promiseDate: '', nextDate: '', claimNumber: 'CLM-102', escalateTo: '', billIds: [1], minNext: '2026-10-08',
    newEscId: () => 'e_1', ...extra
  };
}

test('applyComplaintFollowup: escalation, owner moves, next date at least +5', () => {
  const m = billedParty();
  const r = FA.applyComplaintFollowup(m, complaint());
  assert.deepEqual(m.escalations, [{ id: 'e_1', date: '2026-10-03', type: 'Claim Matter', claimNumber: 'CLM-102', waComplaintNo: '', escalatedTo: 'CRM', followper: 'Sajjan', status: 'Open', remark: 'Rate difference on 2 bills', billIds: [1] }]);
  assert.deepEqual(
    { status: r.entry.status, next: r.entry.next, claim: r.entry.claimNumber, esc: r.entry.escalatedTo, billIds: r.entry.billIds, type: r.entry.type },
    { status: 'WhatsApp Complaint / Claim Matter', next: '2026-10-08', claim: 'CLM-102', esc: 'CRM', billIds: [1], type: 'followup' }
  );
  assert.equal(m.owner, 'CRM');
  assert.equal(m.nextDate, '2026-10-08');
  assert.equal(r.payload.escId, 'e_1');
  const later = FA.applyComplaintFollowup(billedParty(), complaint({ nextDate: '2026-10-20', escalateTo: 'Account Team', claimNumber: '' }));
  assert.equal(later.entry.next, '2026-10-20');
  assert.equal(later.entry.claimNumber, 'Rate difference on 2 bills');
  assert.equal(later.escalation.escalatedTo, 'Account Team');
});

test('applyComplaintFollowup: needs a claim number or a remark', () => {
  const m = billedParty();
  const before = clone(m);
  assert.ok(FA.applyComplaintFollowup(m, complaint({ claimNumber: '', remark: '', requireDetail: true })).error);
  assert.equal(FA.applyComplaintFollowup(billedParty(), complaint({ claimNumber: '', remark: '' })).error, undefined);
  assert.deepEqual(m, before);
});
