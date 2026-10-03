const test = require('node:test');
const assert = require('node:assert/strict');
const TA = require('../ticket-actions.js');

const NOW = Date.parse('2026-10-03T10:00:00Z');

function store() {
  return {
    markas: [
      { id: 'a', marka: 'JGG', master: 'BABLU SHERA MASTER', history: [] },
      { id: 'b', marka: 'ASY', master: 'BABLU SHERA MASTER', history: [] }
    ],
    helpTickets: [
      { id: 'ht_open', markaId: 'b', markaName: 'ASY', date: '2026-10-01', requestedBy: 'Surendra', assignedHelper: 'Saurav Bhai', priority: 'Normal', subject: 'Statement', remark: 'sign', status: 'Open', history: [] },
      { id: 'ht_done', markaId: 'b', markaName: 'ASY', date: '2026-09-20', requestedBy: 'Surendra', assignedHelper: 'Mahavir', priority: 'Normal', subject: 'Old', remark: '', status: 'Resolved', history: [] }
    ]
  };
}
const clone = x => JSON.parse(JSON.stringify(x));

test('createTicket for a Marka adds the ticket first and logs Marka history', () => {
  const s = store();
  const r = TA.createTicket(s, { markaId: 'a', date: '2026-10-03', requestedBy: 'Surendra', assignedHelper: 'Saurav Bhai', priority: 'High', subject: 'Visit', remark: 'call first', now: NOW });
  assert.equal(r.error, undefined);
  assert.equal(s.helpTickets[0], r.ticket);
  assert.match(r.ticket.id, /^ht_/);
  assert.deepEqual(
    { markaId: r.ticket.markaId, markaName: r.ticket.markaName, status: r.ticket.status, history: r.ticket.history, priority: r.ticket.priority, createdAt: r.ticket.createdAt, requestedBy: r.ticket.requestedBy, assignedHelper: r.ticket.assignedHelper, subject: r.ticket.subject, remark: r.ticket.remark, date: r.ticket.date },
    { markaId: 'a', markaName: 'JGG', status: 'Open', history: [], priority: 'High', createdAt: new Date(NOW).toISOString(), requestedBy: 'Surendra', assignedHelper: 'Saurav Bhai', subject: 'Visit', remark: 'call first', date: '2026-10-03' }
  );
  assert.equal(r.marka.id, 'a');
  assert.equal(r.marka.activeHelpTicketId, r.ticket.id);
  assert.deepEqual(r.marka.history[0], { type: 'followup', date: '2026-10-03', followper: 'Surendra', status: 'Help Ticket', remark: '[Help Ticket: Visit] Assigned to: Saurav Bhai. Note: call first' });
});

test('createTicket without a Marka makes a General ticket', () => {
  const r = TA.createTicket(store(), { date: '2026-10-03', requestedBy: 'A', assignedHelper: 'B', priority: 'Normal', subject: 'X', remark: '', now: NOW });
  assert.equal(r.ticket.markaName, 'General');
  assert.equal(r.ticket.markaId, '');
  assert.equal(r.marka, null);
});

test('createTicket rejects bad input without touching the store', () => {
  const base = { date: '2026-10-03', requestedBy: 'A', assignedHelper: 'B', priority: 'Normal', subject: 'X', remark: '', now: NOW };
  for (const bad of [{ markaId: 'zzz' }, { assignedHelper: '' }, { subject: '  ' }, { priority: 'Urgent' }]) {
    const s = store();
    const before = clone(s);
    assert.ok(TA.createTicket(s, { ...base, ...bad }).error, JSON.stringify(bad));
    assert.deepEqual(s, before);
  }
});

test('progressTicket sets In Progress, next date and history', () => {
  const s = store();
  const r = TA.progressTicket(s, 'ht_open', { date: '2026-10-03', by: 'Surendra', note: 'master se baat hui', nextDate: '2026-10-10' });
  assert.deepEqual(
    { status: r.ticket.status, nextDate: r.ticket.nextDate, remark: r.ticket.remark, resolvedAt: r.ticket.resolvedAt },
    { status: 'In Progress', nextDate: '2026-10-10', remark: 'master se baat hui', resolvedAt: '' }
  );
  assert.deepEqual(r.ticket.history.at(-1), { date: '2026-10-03', followper: 'Surendra', actionType: 'Interim Follow-up (Re-planned Next Date)', note: 'master se baat hui', nextDate: '2026-10-10', status: 'In Progress' });
  const h = r.marka.history.at(-1);
  assert.equal(h.status, 'Help Ticket Progress');
  assert.equal(h.next, '2026-10-10');
  assert.equal(h.remark, '[HELP TICKET IN-PROGRESS (Re-planned Next: 10-Oct-2026)] master se baat hui (Followed by Surendra)');
});

test('progressTicket with logToHistory false leaves Marka history alone', () => {
  const s = store();
  TA.progressTicket(s, 'ht_open', { date: '2026-10-03', by: 'S', note: 'n', nextDate: '2026-10-10', logToHistory: false });
  assert.equal(s.markas[1].history.length, 0);
});

test('progressTicket needs a note and a next date', () => {
  assert.ok(TA.progressTicket(store(), 'ht_open', { date: '2026-10-03', by: 'S', note: '', nextDate: '2026-10-10' }).error);
  assert.ok(TA.progressTicket(store(), 'ht_open', { date: '2026-10-03', by: 'S', note: 'n', nextDate: '' }).error);
});

test('completeTicket resolves with the representative action', () => {
  const s = store();
  const r = TA.completeTicket(s, 'ht_open', { date: '2026-10-03', by: 'Saurav Bhai', resolutionType: 'Cheque / Payment Collected', note: 'cheque mila', now: NOW });
  assert.deepEqual(
    { status: r.ticket.status, resolvedBy: r.ticket.resolvedBy, resolutionType: r.ticket.resolutionType, resolutionNote: r.ticket.resolutionNote, nextDate: r.ticket.nextDate, resolvedAt: r.ticket.resolvedAt },
    { status: 'Resolved', resolvedBy: 'Saurav Bhai', resolutionType: 'Cheque / Payment Collected', resolutionNote: 'cheque mila', nextDate: '', resolvedAt: new Date(NOW).toISOString() }
  );
  assert.deepEqual(r.ticket.history.at(-1), { date: '2026-10-03', followper: 'Saurav Bhai', actionType: 'Cheque / Payment Collected', note: 'cheque mila', status: 'Resolved' });
  const h = r.marka.history.at(-1);
  assert.equal(h.status, 'Help Ticket Resolved');
  assert.equal(h.remark, '[REPRESENTATIVE ACTION DONE: Cheque / Payment Collected] cheque mila (Assisted by Saurav Bhai)');
});

test('completeTicket rejects an unknown resolution type', () => {
  assert.ok(TA.completeTicket(store(), 'ht_open', { date: '2026-10-03', by: 'S', resolutionType: 'Magic', note: 'n', now: NOW }).error);
});

test('reassignTicket moves the ticket and logs both histories', () => {
  const s = store();
  const r = TA.reassignTicket(s, 'ht_open', { newHelper: 'Mahavir', note: 'area change', by: 'Admin', date: '2026-10-03' });
  assert.equal(r.ticket.assignedHelper, 'Mahavir');
  assert.deepEqual(r.ticket.history.at(-1), { date: '2026-10-03', type: 'Reassigned', note: 'Reassigned from Saurav Bhai to Mahavir. Note: area change', by: 'Admin' });
  const h = r.marka.history.at(-1);
  assert.equal(h.status, 'Ticket Reassigned');
  assert.equal(h.remark, '[Ticket Reassigned] Statement transferred from Saurav Bhai to Mahavir. Note: area change');
});

test('reassignTicket to the same helper is an error', () => {
  assert.ok(TA.reassignTicket(store(), 'ht_open', { newHelper: 'Saurav Bhai', note: '', by: 'A', date: '2026-10-03' }).error);
});

test('actions on unknown or resolved tickets change nothing', () => {
  const calls = [
    (s, id) => TA.progressTicket(s, id, { date: '2026-10-03', by: 'S', note: 'n', nextDate: '2026-10-10' }),
    (s, id) => TA.completeTicket(s, id, { date: '2026-10-03', by: 'S', resolutionType: 'Other Representative Action', note: 'n', now: NOW }),
    (s, id) => TA.reassignTicket(s, id, { newHelper: 'X', note: '', by: 'A', date: '2026-10-03' })
  ];
  for (const call of calls) {
    for (const id of ['nope', 'ht_done']) {
      const s = store();
      const before = clone(s);
      assert.ok(call(s, id).error);
      assert.deepEqual(s, before);
    }
  }
});

test('canReassign follows the app rule', () => {
  assert.equal(TA.canReassign({ role: 'admin', email: 'a@x' }), true);
  assert.equal(TA.canReassign({ role: 'superuser', email: 'a@x' }), true);
  assert.equal(TA.canReassign({ role: 'user', email: 'devlope.vishal@gmail.com' }), true);
  for (const role of ['user', 'crr', 'pc']) assert.equal(TA.canReassign({ role, email: 'x@y' }), false);
  assert.equal(TA.canReassign(null), false);
});

test('the form may still re-edit a resolved ticket with allowResolved', () => {
  const s = store();
  const done = TA.completeTicket(s, 'ht_done', { date: '2026-10-03', by: 'S', resolutionType: 'Master Meeting Conducted', note: 'fixed note', now: NOW, allowResolved: true });
  assert.equal(done.error, undefined);
  assert.equal(done.ticket.resolutionNote, 'fixed note');
  const reopened = TA.progressTicket(s, 'ht_done', { date: '2026-10-03', by: 'S', note: 'reopen', nextDate: '2026-10-10', allowResolved: true });
  assert.equal(reopened.ticket.status, 'In Progress');
  assert.ok(TA.reassignTicket(store(), 'ht_done', { newHelper: 'X', note: '', by: 'A', date: '2026-10-03', allowResolved: true }).error);
});
