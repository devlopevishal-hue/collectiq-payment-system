const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../party-health.js');

const TODAY = '2026-11-03';

const jggA = {
  id: 'j1', marka: 'JAI GURU GARMENTS', markaCode: 'JGG', master: 'BABLU MASTER', owner: 'Surendra', nextDate: '2026-10-25',
  bills: [
    { id: 1, firstDate: '2026-06-10', policyDate: '2026-07-10', balance: 40000, sourceAmount: 50000, billNos: ['A-11'] },
    { id: 2, firstDate: '2026-06-20', policyDate: '2026-07-20', balance: 10000, billNos: ['A-12'] },
    { id: 3, firstDate: '2026-10-20', policyDate: '2026-11-20', balance: 25000, billNos: ['A-40'] },
    { id: 4, firstDate: '2026-05-01', balance: 0 }
  ],
  history: [
    { type: 'followup', date: '2026-09-01', followper: 'Surendra', status: 'Called', next: '2026-09-05' },
    { type: 'followup', date: '2026-09-10', followper: 'Mahavir', status: 'Promise to Pay', promise: '2026-09-20', expected: 20000, next: '2026-09-20' },
    { type: 'followup', date: '2026-09-20', followper: 'Surendra', status: 'Called', next: '2026-10-25' },
    { type: 'followup', date: '2026-09-25', followper: 'Girdharilal', status: 'FMS Task Completed', remark: '[FMS-1]' }
  ],
  escalations: []
};

const jggB = {
  id: 'j2', marka: 'JGG FABRICS', markaCode: 'JGG', master: 'KUNAL MASTER', owner: 'Mahavir', nextDate: '2026-11-05',
  bills: [{ id: 9, firstDate: '2026-10-15', policyDate: '2026-11-15', balance: 5000 }],
  history: [{ type: 'followup', date: '2026-10-30', followper: 'Mahavir', status: 'Called', next: '2026-11-05' }]
};

const other = { id: 'x', marka: 'SKT', master: 'KUNAL MASTER', bills: [{ id: 1, balance: 900 }] };

test('groupParties: firms with one marka code are one group, biggest first', () => {
  const g = H.groupParties([jggA, jggB, other, { id: 'n', marka: '' }]);
  assert.equal(g.length, 2);
  assert.equal(g[0].key, 'JGG');
  assert.deepEqual(g[0].masters, ['BABLU MASTER', 'KUNAL MASTER']);
  assert.deepEqual(g[0].names, ['JAI GURU GARMENTS', 'JGG FABRICS']);
  assert.equal(g[0].outstanding, 80000);
  assert.equal(g[1].key, 'SKT');
});

test('firmStats: dues, aging, oldest pending month with its bills, GP lock', () => {
  const s = H.firmStats({ party: jggA, today: TODAY, payments: [] });
  assert.equal(s.outstanding, 75000);
  assert.equal(s.dueNow, 50000);
  assert.equal(s.upcoming, 25000);
  assert.equal(s.oldestDue, '2026-07-10');
  assert.equal(s.oldestDueDays, 116);
  assert.equal(s.locked, true);
  assert.equal(s.oldestMonth.label, 'Jun 2026');
  assert.equal(s.oldestMonth.amount, 50000);
  assert.deepEqual(s.oldestMonthBills.map(b => b.billNos[0]), ['A-11', 'A-12']);
  assert.equal(s.aging.find(a => a.key === 'notDue').amount, 25000);
  assert.equal(s.aging.find(a => a.key === 'd91_180').amount, 50000);
});

test('firmStats: follow-up count, on-time rate, follower history, broken promise', () => {
  const s = H.firmStats({ party: jggA, today: TODAY, payments: [] });
  assert.equal(s.followupCount, 3, 'FMS lines are not follow-ups');
  // 09-10 after planned 09-05 = late; 09-20 on planned 09-20 = on time
  assert.equal(s.onTime, 1);
  assert.equal(s.late, 1);
  assert.equal(s.onTimePct, 50);
  assert.equal(s.nextLateDays, 9);
  assert.deepEqual(s.followerHistory.map(p => [p.name, p.count]), [['Surendra', 2], ['Mahavir', 1]]);
  assert.equal(s.handovers, 2);
  assert.equal(s.ptps[0].state, 'Broken');
  assert.equal(s.brokenPtps90, 1);
});

test('firmStats: a payment near the promise keeps it; history payments counted once', () => {
  const party = { ...jggA, history: [...jggA.history, { type: 'payment', date: '2026-09-21', amount: 20000, ref: 'CHQ1' }] };
  const s = H.firmStats({ party, today: TODAY, payments: [{ date: '2026-09-21', amount: 20000, ref: 'CHQ1' }] });
  assert.equal(s.payments.length, 1);
  assert.equal(s.ptps[0].state, 'Kept');
  assert.equal(s.daysSincePayment, 43);
});

test('firmStats: tickets and complaints, open ones counted', () => {
  const s = H.firmStats({
    party: jggA, today: TODAY,
    tickets: [
      { id: 't1', date: '2026-10-01', subject: 'Master meeting', assignedHelper: 'Sales HOD', status: 'In Progress', nextDate: '2026-10-20' },
      { id: 't2', date: '2026-09-01', subject: 'Old', status: 'Resolved' }
    ],
    complaints: [
      { id: 'c1', date: '2026-10-01', type: 'Claim Matter', claimNumber: 'CL-9', status: 'Open', escalatedTo: 'CRM' },
      { id: 'c2', date: '2026-08-01', type: 'WhatsApp Complaint', status: 'Resolved' }
    ]
  });
  assert.equal(s.openTickets, 1);
  assert.equal(s.tickets[0].nextLate, 14);
  assert.equal(s.openComplaints, 1);
  assert.equal(s.complaints[0].ageDays, 33);
});

test('score: a clean party scores 100 and is healthy; a troubled one is lower with notes', () => {
  const clean = H.firmStats({ party: { id: 'c', marka: 'OK', master: 'M', bills: [] }, today: TODAY });
  assert.equal(clean.score.total, 100);
  assert.equal(clean.score.grade.label, 'Healthy');
  assert.equal(clean.notes[0].level, 0);

  const bad = H.firmStats({
    party: jggA, today: TODAY,
    complaints: [{ id: 'c1', date: '2026-10-01', type: 'Claim Matter', status: 'Open' }],
    tickets: [{ id: 't1', date: '2026-10-01', subject: 'x', status: 'Open', nextDate: '2026-10-20' }],
    fmsTasks: [{ code: 'FMS-2', status: 'Overdue', isDone: false }]
  });
  assert.ok(bad.score.total < 40, `score ${bad.score.total}`);
  assert.equal(bad.score.grade.key, 'critical');
  assert.equal(bad.score.parts.reduce((t, p) => t + p.max, 0), 100);
  const areas = bad.notes.map(n => n.area);
  ['Payment', 'Follow-up', 'Complaint', 'Help ticket', 'Promise', 'FMS'].forEach(a => assert.ok(areas.includes(a), a));
  assert.equal(bad.notes[0].level, 3);
});

test('groupReport: per-firm, per-master and combined views', () => {
  const r = H.groupReport([{ party: jggA }, { party: jggB }], { today: TODAY });
  assert.equal(r.firms.length, 2);
  assert.equal(r.firms[0].id, 'j1', 'weakest firm first');
  assert.equal(r.masters.length, 2);
  assert.equal(r.combined.outstanding, 80000);
  assert.equal(r.combined.oldestMonth.label, 'Jun 2026');
  assert.equal(r.combined.oldestMonthBills.length, 2);
  assert.equal(r.combined.oldestMonthBills[0].master, 'BABLU MASTER');
  assert.equal(r.combined.followupCount, 4);
  assert.equal(r.combined.fuMonths.length, 6);
  assert.equal(r.combined.fuMonths[5].label, 'Nov 2026');
  assert.ok(r.combined.score.total > r.firms[0].score.total && r.combined.score.total < r.firms[1].score.total);
  assert.ok(r.combined.notes.every(n => n.firm));
});
