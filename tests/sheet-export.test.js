const test = require('node:test');
const assert = require('node:assert/strict');
const SE = require('../sheet-export.js');

const TODAY = '2026-10-30';
const config = { masterFollowpers: { 'BABLU SHERA MASTER': 'Surendra' } };

function party(extra) {
  return {
    id: 'p1', marka: 'DYNAMIC FABRIC', markaCode: 'RDY', master: 'BABLU SHERA MASTER', crr: 'Ravi Bhai',
    bills: [{ id: 1, balance: 1000, firstDate: '2026-10-01', policyDate: '2026-10-10' }],
    history: [], escalations: [], ...extra
  };
}

function tab(out, name) {
  const t = out.tabs[name];
  return t.rows.map(r => Object.fromEntries(t.headers.map((h, i) => [h, r[i]])));
}

test('score: on time 1, late 0.5, missed 0, not due blank', () => {
  assert.equal(SE.score('2026-10-20', '2026-10-20', TODAY), 1);
  assert.equal(SE.score('2026-10-20', '2026-10-22', TODAY), 0.5);
  assert.equal(SE.score('2026-10-20', '', TODAY), 0);
  assert.equal(SE.score('2026-11-05', '', TODAY), '');
});

test('follow-ups: next date is the plan, the following contact is the actual', () => {
  const m = party({
    nextDate: '2026-11-02',
    history: [
      { date: '2026-10-20', followper: 'Surendra', mode: 'Phone call', status: 'Promise to Pay', next: '2026-10-24' },
      { date: '2026-10-26', followper: 'Surendra', mode: 'In person (Field Visit)', status: 'Promise to Pay', next: '2026-11-02' }
    ]
  });
  const rows = tab(SE.buildSheet({ markas: [m], config, today: TODAY }), 'Follow Up Schedule');
  assert.equal(rows.length, 2);
  const late = rows.find(r => r['Actual Date'] === '2026-10-26');
  assert.equal(late.Marka, 'RDY');
  assert.equal(late['Party Name'], 'DYNAMIC FABRIC');
  assert.equal(late['Next Followup Date/ plan Date'], '2026-10-24');
  assert.equal(late.Score, 0.5);
  const open = rows.find(r => r['Actual Date'] === '');
  assert.equal(open.Doer, 'Surendra');
  assert.equal(open.Result, 'Not due');
});

test('follow-ups: FMS and ticket log lines do not count as contacts', () => {
  const m = party({
    nextDate: '2026-10-28',
    history: [
      { date: '2026-10-20', followper: 'Surendra', status: 'Promise to Pay', next: '2026-10-28' },
      { date: '2026-10-29', followper: 'Admin', status: 'FMS Task Completed', remark: '[FMS-1 COMPLETED]' }
    ]
  });
  const rows = tab(SE.buildSheet({ markas: [m], config, today: TODAY }), 'Follow Up Schedule');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Result, 'Missed');
});

test('follow-ups: dates the app sets after a payment are Policy plans and are scored', () => {
  const m = party({
    nextDate: '2026-10-29',
    history: [
      { date: '2026-10-19', followper: 'Surendra', type: 'followup', status: 'Promise to Pay', next: '2026-10-26' },
      { date: '2026-10-27', followper: 'Surendra', type: 'payment', status: 'Payment Received', next: '' },
      { date: '2026-10-30', followper: 'Admin', type: 'followup', status: 'FMS Task Completed' }
    ]
  });
  const rows = tab(SE.buildSheet({ markas: [m], config, today: TODAY }), 'Follow Up Schedule');
  const open = rows.find(r => r['Next Followup Date/ plan Date'] === '2026-10-29');
  assert.equal(open['Plan Set By'], 'Policy');
  assert.equal(open.Result, 'Missed');
  assert.equal(open.Score, 0);
  const done = rows.find(r => r['Next Followup Date/ plan Date'] === '2026-10-26');
  assert.equal(done.Score, 0.5);
  assert.equal(done['Plan Set By'], 'Person');
  const score = tab(SE.buildSheet({ markas: [m], config, today: TODAY }), 'Score').filter(r => r.Tab === 'Follow Up Schedule');
  assert.equal(score.length, 1);
  assert.equal(score[0]['Tasks Due'], 2);
});

test('follow-ups: a same-day repeat does not close the plan, a past next date is Bad date, system lines are not contacts', () => {
  // nextDate was overwritten to the old 19 Oct by the 1 Nov help ticket line.
  const m = party({
    nextDate: '2026-10-19',
    history: [
      { date: '2026-10-16', followper: 'Girdharilal', status: 'Promise to Pay', next: '2026-10-19' },
      { date: '2026-10-16', followper: 'Girdharilal', status: 'Promise to Pay', next: '2026-10-19' },
      { date: '2026-10-22', followper: 'Girdharilal', status: 'Promise to Pay', next: '2026-10-19' },
      { date: '2026-10-29', followper: 'Girdharilal', status: 'Promise to Pay', next: '2026-11-02' },
      { date: '2026-10-31', type: 'payment', status: 'Payment Received', remark: 'daily payment upload' },
      { date: '2026-11-01', followper: 'Girdharilal', status: 'Internal Help Ticket', next: '2026-10-19' }
    ]
  });
  const rows = tab(SE.buildSheet({ markas: [m], config, today: '2026-11-01' }), 'Follow Up Schedule');
  const pairs = rows.map(r => [r['Next Followup Date/ plan Date'], r['Actual Date'], r.Result]);
  assert.deepEqual(pairs, [
    ['2026-10-19', '2026-10-22', 'Late'],
    ['2026-10-19', '2026-10-29', 'Bad date'],
    ['2026-11-02', '', 'Not due']
  ]);
});

test('help tickets: plan is next date or ticket date + 2 days; resolved date is actual', () => {
  const tickets = [
    { id: 't1', markaId: 'p1', date: '2026-10-20', assignedHelper: 'CRM', status: 'Resolved', resolvedAt: '2026-10-21T10:00:00Z' },
    { id: 't2', markaId: 'p1', date: '2026-10-20', assignedHelper: 'CRM', status: 'In Progress', nextDate: '2026-11-03' }
  ];
  const rows = tab(SE.buildSheet({ markas: [party()], helpTickets: tickets, config, today: TODAY }), 'Help Tickets');
  const t1 = rows.find(r => r['Ticket ID'] === 't1');
  assert.equal(t1['Next Followup Date/ plan Date'], '2026-10-22');
  assert.equal(t1.Score, 1);
  assert.equal(t1.Marka, 'RDY');
  assert.equal(rows.find(r => r['Ticket ID'] === 't2').Result, 'Not due');
});

test('escalations: CRM is the Doer, plan is escalation date + 3 days', () => {
  const m = party({ escalations: [{ id: 'e1', date: '2026-10-19', escalatedTo: 'Saurav Bhai', status: 'Resolved', resolvedDate: '2026-10-25', type: 'Claim Matter' }] });
  const [row] = tab(SE.buildSheet({ markas: [m], config, today: TODAY }), 'Crm Escalations');
  assert.equal(row['Next Followup Date/ plan Date'], '2026-10-22');
  assert.equal(row.Doer, 'CRM');
  assert.equal(row['Escalated To'], 'Saurav Bhai');
  assert.equal(row['Current status'], 'Resolved');
  assert.equal(row.Score, 0.5);
});

test('FMS: four steps from the oldest due date, done steps read from fmsTasks', () => {
  const m = party({ fmsTasks: [{ taskCode: 'FMS-1', actualDate: '2026-10-12', completedBy: 'Accounts' }] });
  const rows = tab(SE.buildSheet({ markas: [m], config, today: TODAY }), 'FMS Pre-planned');
  assert.equal(rows.length, 4);
  const f1 = rows.find(r => r['Stage stage'].startsWith('FMS-1'));
  assert.equal(f1['Next Followup Date/ plan Date'], '2026-10-12');
  assert.equal(f1.Score, 1);
  assert.equal(rows.find(r => r['Stage stage'].startsWith('FMS-3')).Doer, 'BABLU SHERA MASTER');
  assert.equal(tab(SE.buildSheet({ markas: [party({ bills: [] })], config, today: TODAY }), 'FMS Pre-planned').length, 0);
});

test('parties: outstanding, overdue and last payment', () => {
  const m = party({ bills: [{ balance: 500, policyDate: '2026-10-01' }, { balance: 300, policyDate: '2026-12-01' }, { balance: 0, policyDate: '2026-09-01' }] });
  const payments = [{ markaId: 'p1', date: '2026-10-15', amount: 200 }, { markaId: 'p1', date: '2026-10-25', amount: 100 }];
  const [row] = tab(SE.buildSheet({ markas: [m], payments, config, today: TODAY }), 'Parties');
  assert.equal(row.Outstanding, 800);
  assert.equal(row.Overdue, 500);
  assert.equal(row['Days Overdue'], 29);
  assert.equal(row['Last Payment Date'], '2026-10-25');
  assert.equal(row['Paid Last 30 Days'], 300);
  assert.equal(row.Followper, 'Surendra');
});

test('score tab groups by doer and week, and skips tasks planned before scoreFrom', () => {
  const m = party({
    escalations: [
      { id: 'e1', date: '2026-10-19', escalatedTo: 'CRM', status: 'Open' },
      { id: 'e2', date: '2026-10-20', escalatedTo: 'CRM', status: 'Resolved', resolvedDate: '2026-10-21' },
      { id: 'e3', date: '2026-09-01', escalatedTo: 'CRM', status: 'Open' }
    ]
  });
  const rows = tab(SE.buildSheet({ markas: [m], config, today: TODAY }), 'Score').filter(r => r.Tab === 'Crm Escalations');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]['Week Starting'], '2026-10-19');
  assert.equal(rows[0]['Tasks Due'], 2);
  assert.equal(rows[0]['Score %'], 50);
});

test('every task tab shows Master right after Party Name', () => {
  const m = party({
    nextDate: '2026-11-02',
    history: [{ date: '2026-10-20', next: '2026-10-25', followper: 'Surendra', mode: 'Call', status: 'Follow-up' }],
    escalations: [{ id: 'e1', date: '2026-10-20', status: 'Open' }]
  });
  const out = SE.buildSheet({ markas: [m], helpTickets: [{ id: 't1', markaId: 'p1', date: '2026-10-20', status: 'Open' }], config, today: TODAY });
  ['Follow Up Schedule', 'Help Tickets', 'Crm Escalations', 'FMS Pre-planned'].forEach(name => {
    const h = out.tabs[name].headers;
    assert.equal(h[h.indexOf('Party Name') + 1], 'Master', name);
    assert.ok(tab(out, name).length, name);
    tab(out, name).forEach(r => assert.equal(r.Master, 'BABLU SHERA MASTER', name));
  });
});

test('follow-ups: a party that owes money with no next date gets a policy task', () => {
  // Due 10 Nov -> policy date 3 Nov; paid on 30 Oct with no next date kept.
  const m = party({
    nextDate: '',
    bills: [{ id: 1, balance: 5000, firstDate: '2026-10-01', policyDate: '2026-11-10' }],
    history: [{ date: '2026-10-30', followper: 'Surendra', type: 'payment', status: 'Payment Received', next: '' }]
  });
  let rows = tab(SE.buildSheet({ markas: [m], config, today: TODAY }), 'Follow Up Schedule');
  assert.deepEqual(rows.map(r => [r['Next Followup Date/ plan Date'], r['Plan Set By'], r.Result]), [['2026-11-03', 'Policy', 'Not due']]);
  // Already past due: 2 days after the last contact.
  m.bills[0].policyDate = '2026-10-05';
  rows = tab(SE.buildSheet({ markas: [m], config, today: TODAY }), 'Follow Up Schedule');
  assert.equal(rows[0]['Next Followup Date/ plan Date'], '2026-11-01');
  // Nothing owed net of an advance: no task.
  m.bills.push({ id: 2, balance: -6000, firstDate: '2026-10-30', policyDate: '2026-10-30', policyName: 'ADVANCE PAYMENT' });
  assert.equal(tab(SE.buildSheet({ markas: [m], config, today: TODAY }), 'Follow Up Schedule').length, 0);
});
