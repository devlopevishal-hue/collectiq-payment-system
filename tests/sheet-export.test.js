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

test('escalations: plan is escalation date + 3 days', () => {
  const m = party({ escalations: [{ id: 'e1', date: '2026-10-19', escalatedTo: 'CRM', status: 'Resolved', resolvedDate: '2026-10-25', type: 'Claim Matter' }] });
  const [row] = tab(SE.buildSheet({ markas: [m], config, today: TODAY }), 'Crm Escalations');
  assert.equal(row['Next Followup Date/ plan Date'], '2026-10-22');
  assert.equal(row.Doer, 'CRM');
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
