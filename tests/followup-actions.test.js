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
