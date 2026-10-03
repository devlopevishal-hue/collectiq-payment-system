const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../ai-tools.js');

const TODAY = '2026-10-02';

function bill(id, policyDate, balance, extra = {}) {
  return { id, firstDate: policyDate, policyDate, balance, sourceAmount: balance, billNos: [String(id)], ...extra };
}

function fixtureMarkas() {
  return [
    {
      id: 'a', marka: 'JGG', master: 'BABLU SHERA MASTER', owner: 'Surendra', crr: 'Ravi Bhai',
      nextDate: '2026-09-30', lastDate: '2026-09-25', lastStatus: 'Promise to Pay', remark: 'call back', ptp: '',
      bills: [bill(1, '2026-09-01', 50000), bill(2, '2026-11-01', 20000)],
      history: [1, 2, 3, 4, 5, 6, 7].map(i => ({ type: 'followup', date: `2026-09-0${i}`, status: 'Promise to Pay', mode: 'Phone call', remark: `h${i}`, followper: 'Surendra' })),
      escalations: [], fmsTasks: []
    },
    {
      id: 'b', marka: 'MAU', master: 'BABLU SHERA MASTER', owner: 'Surendra', crr: 'Nayan Bhai',
      nextDate: '2026-10-02', lastDate: '', lastStatus: '', remark: '', ptp: '',
      bills: [bill(3, '2026-09-15', 90000)], history: [], escalations: [], fmsTasks: []
    },
    {
      id: 'c', marka: 'SAN', master: 'KALPESH MASTER', owner: 'Mahavir', crr: 'Mahendra Bhai',
      nextDate: '2026-10-10', lastDate: '', lastStatus: '', remark: '', ptp: '', _locked: true,
      bills: Array.from({ length: 12 }, (_, i) => bill(100 + i, `2026-12-${String(12 - i).padStart(2, '0')}`, 1000)),
      history: [], escalations: [], fmsTasks: []
    },
    {
      id: 'd', marka: 'SANK', master: 'KALPESH MASTER', owner: 'Mahavir', crr: 'Ravi Bhai',
      nextDate: '2026-10-05', lastDate: '', lastStatus: '', remark: '', ptp: '',
      bills: [bill(4, '2026-12-01', 5000)], history: [], escalations: [], fmsTasks: []
    },
    {
      id: 'e', marka: 'ADV', master: 'BABLU SHERA MASTER', owner: 'Surendra', crr: 'Ravi Bhai',
      nextDate: '2026-09-01', lastDate: '', lastStatus: '', remark: '', ptp: '',
      bills: [bill(5, '2026-09-01', -5000)], history: [], escalations: [], fmsTasks: []
    },
    {
      id: 'f', marka: 'XYZ', master: 'AVINASH MASTER', owner: 'Unassigned', crr: 'Unassigned',
      nextDate: '', lastDate: '', lastStatus: '', remark: '', ptp: '',
      bills: [bill(6, '2026-09-01', 3000)], history: [], escalations: [], fmsTasks: []
    }
  ];
}

const helpers = {
  ownerOf: m => m.owner || 'Unassigned',
  crrOf: m => m.crr || 'Unassigned',
  totalOutstanding: m => (m.bills || []).reduce((s, b) => s + (b.balance || 0), 0),
  alreadyDueAmount: m => (m.bills || []).filter(b => b.balance > 0 && (b.policyDate || b.firstDate) <= TODAY).reduce((s, b) => s + b.balance, 0),
  oldestDueDate: m => (m.bills || []).filter(b => b.balance > 0).map(b => b.policyDate || b.firstDate).sort()[0] || '',
  isLocked: m => !!m._locked,
  getFmsTasks: () => []
};

function ctx(user, overrides = {}) {
  return { markas: fixtureMarkas(), payments: [], helpTickets: [], user, today: TODAY, h: helpers, ...overrides };
}

const ADMIN = { email: 'admin@collectiq.com', role: 'admin', followperName: 'all' };
const SURENDRA = { email: 'surendra@collectiq.com', role: 'user', followperName: 'Surendra' };
const names = list => list.map(m => m.marka).sort();

test('scopeMarkas: doer sees only own parties with positive balance', () => {
  assert.deepEqual(names(T.scopeMarkas(ctx(SURENDRA))), ['JGG', 'MAU']);
});

test('scopeMarkas: doer matching no marka gets an empty scope', () => {
  assert.deepEqual(T.scopeMarkas(ctx({ email: 'x@y', role: 'user', followperName: 'Nobody' })), []);
});

test('scopeMarkas: doer named all or Unassigned gets an empty scope', () => {
  assert.deepEqual(T.scopeMarkas(ctx({ email: 'x@y', role: 'user', followperName: 'all' })), []);
  assert.deepEqual(T.scopeMarkas(ctx({ email: 'x@y', role: 'user', followperName: 'Unassigned' })), []);
});

test('scopeMarkas: admin sees every positive-balance party', () => {
  assert.deepEqual(names(T.scopeMarkas(ctx(ADMIN))), ['JGG', 'MAU', 'SAN', 'SANK', 'XYZ']);
});

test('scopeMarkas: crr sees own CRR parties, Mahendra sees all', () => {
  assert.deepEqual(names(T.scopeMarkas(ctx({ email: 'ravi@collectiq.com', role: 'crr', followperName: 'Ravi Bhai' }))), ['JGG', 'SANK']);
  assert.deepEqual(names(T.scopeMarkas(ctx({ email: 'mahendra@collectiq.com', role: 'crr', followperName: 'Mahendra Bhai' }))), ['JGG', 'MAU', 'SAN', 'SANK', 'XYZ']);
});

test('findParty: exact case-insensitive match wins over partial matches', () => {
  assert.equal(T.findParty(ctx(ADMIN), ' san ').marka.marka, 'SAN');
});

test('findParty: ambiguous partial name returns candidates', () => {
  assert.deepEqual(T.findParty(ctx(ADMIN), 'SA').candidates.sort(), ['SAN', 'SANK']);
});

test('findParty: unknown name returns an error', () => {
  assert.ok(T.findParty(ctx(ADMIN), 'nothing-like-this').error);
});

test('get_today_followups: due and overdue parties sorted by already-due, advance excluded', () => {
  const r = T.tools.get_today_followups(ctx(ADMIN), {});
  assert.deepEqual(r.rows.map(x => x.marka), ['MAU', 'JGG', 'SAN']);
  assert.equal(r.total, 3);
  const jgg = r.rows.find(x => x.marka === 'JGG');
  assert.deepEqual(
    { owner: jgg.owner, outstanding: jgg.outstanding, alreadyDue: jgg.alreadyDue, daysOverdue: jgg.daysOverdue, lastStatus: jgg.lastStatus, remark: jgg.remark, master: jgg.master },
    { owner: 'Surendra', outstanding: 70000, alreadyDue: 50000, daysOverdue: 2, lastStatus: 'Promise to Pay', remark: 'call back', master: 'BABLU SHERA MASTER' }
  );
});

test('get_today_followups: include_overdue false returns only parties due today', () => {
  const r = T.tools.get_today_followups(ctx(ADMIN), { include_overdue: false });
  assert.deepEqual(r.rows.map(x => x.marka), ['MAU']);
});

test('get_today_followups: respects doer scope', () => {
  const r = T.tools.get_today_followups(ctx(SURENDRA), {});
  assert.deepEqual(r.rows.map(x => x.marka), ['MAU', 'JGG']);
});

test('get_today_followups: returns at most 20 rows but reports the full total', () => {
  const many = Array.from({ length: 25 }, (_, i) => ({
    id: 'm' + i, marka: 'P' + i, master: 'M', owner: 'Surendra', nextDate: '2026-10-01',
    bills: [bill(500 + i, '2026-09-01', 1000 + i)], history: [], escalations: []
  }));
  const r = T.tools.get_today_followups(ctx(ADMIN, { markas: many }), {});
  assert.equal(r.rows.length, 20);
  assert.equal(r.total, 25);
});

test('get_party_details: 10 oldest bills and last 5 history entries', () => {
  const san = T.tools.get_party_details(ctx(ADMIN), { name: 'SAN' });
  assert.equal(san.bills.length, 10);
  assert.equal(san.activeBillCount, 12);
  assert.equal(san.bills[0].policyDate, '2026-12-01');
  assert.equal(san.gpLocked, true);
  const jgg = T.tools.get_party_details(ctx(ADMIN), { name: 'jgg' });
  assert.deepEqual(jgg.recentHistory.map(h => h.remark), ['h7', 'h6', 'h5', 'h4', 'h3']);
  assert.equal(jgg.outstanding, 70000);
});

test('get_party_details: ambiguous name passes candidates through', () => {
  assert.deepEqual(T.tools.get_party_details(ctx(ADMIN), { name: 'SA' }).candidates.sort(), ['SAN', 'SANK']);
});

test('search_parties: gp_locked filter', () => {
  const r = T.tools.search_parties(ctx(ADMIN), { gp_locked: true });
  assert.deepEqual(r.rows.map(x => x.marka), ['SAN']);
});

test('search_parties: master and min_outstanding filters, sorted by outstanding', () => {
  const r = T.tools.search_parties(ctx(ADMIN), { master: 'bablu', min_outstanding: 60000 });
  assert.deepEqual(r.rows.map(x => x.marka), ['MAU', 'JGG']);
});

// ---------- Task 2 ----------

const PC = { email: 'pc@collectiq.com', role: 'pc', followperName: 'Process Coordinator (PC)' };

test('get_broken_ptps: past promise with no later payment is broken', () => {
  const c = ctx(ADMIN);
  c.markas[0].ptp = '2026-09-28';
  const r = T.tools.get_broken_ptps(c, {});
  assert.deepEqual(r.rows.map(x => x.marka), ['JGG']);
  assert.equal(r.rows[0].ptp, '2026-09-28');
});

test('get_broken_ptps: a payment on or after the PTP log date clears it', () => {
  const c = ctx(ADMIN, { payments: [{ id: 'p1', marka: 'JGG', date: '2026-09-29', amount: 10000 }] });
  c.markas[0].ptp = '2026-09-28';
  assert.deepEqual(T.tools.get_broken_ptps(c, {}).rows, []);
});

test('get_collections: sums only the date range and groups by owner', () => {
  const payments = [
    { id: 'p1', marka: 'JGG', date: '2026-10-01', amount: 10000, mode: 'cash', ref: 'A' },
    { id: 'p2', marka: 'SAN', date: '2026-10-01', amount: 4000, mode: 'UPI', ref: 'B' },
    { id: 'p3', marka: 'MAU', date: '2026-09-30', amount: 99999, mode: 'cash', ref: 'C' }
  ];
  const r = T.tools.get_collections(ctx(ADMIN, { payments }), { from: '2026-10-01', to: '2026-10-01' });
  assert.equal(r.totalReceived, 14000);
  assert.equal(r.count, 2);
  assert.deepEqual(r.byDoer.map(d => [d.name, d.amount]), [['Surendra', 10000], ['Mahavir', 4000]]);
});

test('get_collections: doer only sees own parties', () => {
  const payments = [
    { id: 'p1', marka: 'JGG', date: '2026-10-02', amount: 10000 },
    { id: 'p2', marka: 'SAN', date: '2026-10-02', amount: 4000 }
  ];
  assert.equal(T.tools.get_collections(ctx(SURENDRA, { payments }), {}).totalReceived, 10000);
});

function scoringCtx(user) {
  const c = ctx(user);
  c.markas[0].history = [
    { type: 'followup', date: '2026-09-20', mode: 'Phone call', status: 'Follow-up' },
    { type: 'followup', date: '2026-09-21', mode: 'Phone call', status: 'Promise to Pay', expected: 30000 },
    { type: 'followup', date: '2026-09-22', mode: 'In person (Field Visit)', status: 'Visited' },
    { type: 'payment', date: '2026-09-23', amount: 50000 }
  ];
  return c;
}

test('doerScores: same formula as the Analysis page', () => {
  const s = T.doerScores(scoringCtx(ADMIN)).find(r => r.name === 'Surendra');
  assert.deepEqual(
    { calls: s.calls, visits: s.visits, wa: s.wa, ptp: s.ptp, collected: s.collected, overdue: s.overdue },
    { calls: 2, visits: 1, wa: 0, ptp: 1, collected: 50000, overdue: 1 }
  );
  assert.equal(s.score, 2 * 5 + 1 * 15 + 1 * 10 + Math.round(50000 / 10000) - 1 * 5);
});

test('get_doer_performance: a doer asking about someone else gets only their own row', () => {
  const r = T.tools.get_doer_performance(scoringCtx(SURENDRA), { name: 'Mahavir' });
  assert.deepEqual(r.rows.map(x => x.name), ['Surendra']);
});

test('get_doer_performance: admin can ask about anyone', () => {
  const r = T.tools.get_doer_performance(scoringCtx(ADMIN), { name: 'Mahavir' });
  assert.deepEqual(r.rows.map(x => x.name), ['Mahavir']);
});

test('get_pending_work: open tickets assigned to me; FMS only for PC/admin', () => {
  const helpTickets = [
    { id: 't1', markaName: 'JGG', assignedHelper: 'Surendra', status: 'Open', subject: 'Visit' },
    { id: 't2', markaName: 'MAU', assignedHelper: 'Surendra', status: 'Resolved', subject: 'Done' },
    { id: 't3', markaName: 'SAN', assignedHelper: 'Mahavir', status: 'In Progress', subject: 'Other' }
  ];
  const mine = T.tools.get_pending_work(ctx(SURENDRA, { helpTickets }), {});
  assert.deepEqual(mine.myTickets.map(t => t.id), ['t1']);
  assert.equal(mine.fms, null);
  const fmsHelpers = { ...helpers, getFmsTasks: () => [{ code: 'FMS-1', isDone: false, status: 'Overdue', plannedDate: '2026-09-03', role: 'Account Team' }] };
  const pc = T.tools.get_pending_work(ctx(PC, { h: fmsHelpers }), {});
  assert.equal(pc.fms.pending, 5);
  assert.equal(pc.fms.overdue, 5);
});

test('prepare_followup_form: rejects a status the form does not have', () => {
  const r = T.tools.prepare_followup_form(ctx(SURENDRA), { party: 'JGG', status: 'Not Responding' });
  assert.match(r.error, /Promise to Pay/);
});

test('prepare_followup_form: Promise to Pay needs a promise date', () => {
  assert.ok(T.tools.prepare_followup_form(ctx(SURENDRA), { party: 'JGG', status: 'Promise to Pay', expected: 50000 }).error);
});

test('prepare_followup_form: valid input returns an open_followup action', () => {
  const r = T.tools.prepare_followup_form(ctx(SURENDRA), {
    party: 'jgg', status: 'Promise to Pay', expected: 50000, promise_date: '2026-10-10', remark: 'Party ne 10 ko bola'
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.action, {
    type: 'open_followup', markaId: 'a', marka: 'JGG',
    fields: { contactMode: 'Phone call', actionStatus: 'Promise to Pay', expected: 50000, promiseDate: '2026-10-10', nextDate: '2026-10-10', remark: 'Party ne 10 ko bola' }
  });
});

test('runTool: unknown tool and bad JSON return errors instead of throwing', () => {
  assert.ok(T.runTool(ctx(ADMIN), 'no_such_tool', '{}').error);
  assert.ok(T.runTool(ctx(ADMIN), 'get_party_details', '{bad json').error);
});

test('runTool: dispatches with parsed arguments', () => {
  assert.equal(T.runTool(ctx(ADMIN), 'get_party_details', '{"name":"MAU"}').marka, 'MAU');
});

test('trimResult: caps rows at 20 and total size at 3000 characters', () => {
  const big = { total: 30, rows: Array.from({ length: 30 }, (_, i) => ({ marka: 'P' + i, remark: 'x'.repeat(400) })) };
  const r = T.trimResult(big, { maxRows: 20, maxChars: 3000 });
  assert.ok(r.rows.length <= 20);
  assert.equal(r.truncated, true);
  assert.ok(JSON.stringify(r).length <= 3000);
  assert.equal(r.total, 30);
});

test('computeMorningSummary: numbers for a doer, FMS only for PC', () => {
  const payments = [
    { id: 'p1', marka: 'JGG', date: '2026-10-01', amount: 7000 },
    { id: 'p2', marka: 'MAU', date: '2026-10-02', amount: 3000 }
  ];
  const s = T.computeMorningSummary(ctx(SURENDRA, { payments }));
  assert.equal(s.followupsToday, 2);
  assert.deepEqual(s.top5.map(x => x.marka), ['MAU', 'JGG']);
  assert.equal(s.collectedYesterday, 7000);
  assert.equal(s.collectedToday, 3000);
  assert.equal(s.pendingFms, null);
  assert.equal(typeof T.computeMorningSummary(ctx(PC)).pendingFms, 'number');
});

test('list tools number their rows so the model keeps the order', () => {
  const r = T.tools.get_today_followups(ctx(ADMIN), {});
  assert.deepEqual(r.rows.map(x => x.rank), [1, 2, 3]);
  assert.equal(r.rows[0].marka, 'MAU');
  assert.equal(T.tools.search_parties(ctx(ADMIN), {}).rows[0].rank, 1);
});

test('runTool sends amounts as ready-made rupee text so the model copies them', () => {
  const r = T.runTool(ctx(ADMIN), 'get_party_details', '{"name":"JGG"}');
  assert.equal(r.outstanding, '₹70,000');
  assert.equal(r.alreadyDue, '₹50,000');
  assert.equal(r.bills[0].balance, '₹50,000');
  const big = T.runTool(ctx(ADMIN, { markas: [{ id: 'z', marka: 'BIG', master: 'M', owner: 'Girdharilal', nextDate: '2026-09-01', bills: [bill(9, '2026-09-01', 104380733)], history: [], escalations: [] }] }), 'get_doer_performance', '{}');
  assert.equal(big.rows[0].balance, '₹10,43,80,733');
  assert.equal(big.rows[0].overdue, 1);
});

// ---- Help ticket tools ----

function ticketCtx(user, extra = {}) {
  const helpTickets = [
    { id: 't1', markaId: 'a', markaName: 'JGG', date: '2026-09-28', requestedBy: 'Surendra', assignedHelper: 'Saurav Bhai', priority: 'High', subject: 'Visit', status: 'Open', history: [] },
    { id: 't2', markaId: 'a', markaName: 'JGG', date: '2026-10-01', requestedBy: 'Mahavir', assignedHelper: 'Saurav Bhai', priority: 'Normal', subject: 'Statement', status: 'In Progress', nextDate: '2026-10-04', history: [] },
    { id: 't3', markaId: 'b', markaName: 'MAU', date: '2026-09-20', requestedBy: 'Mahavir', assignedHelper: 'Saurav Bhai', priority: 'Normal', subject: 'Old', status: 'Resolved', resolvedBy: 'Saurav Bhai', history: [] },
    { id: 't4', markaId: 'c', markaName: 'SAN', date: '2026-09-30', requestedBy: 'Mahavir', assignedHelper: 'Account Team', priority: 'Normal', subject: 'Cheque', status: 'Open', history: [] }
  ];
  return ctx(user, { helpTickets, assignees: ['Saurav Bhai', 'Mahavir', 'Account Team'], ...extra });
}
const prep = (c, args) => T.tools.prepare_ticket_action(c, args);

test('find_tickets: open tickets by default, newest first, with rank', () => {
  const r = T.tools.find_tickets(ticketCtx(ADMIN), {});
  assert.deepEqual(r.rows.map(x => x.id), ['t2', 't4', 't1']);
  assert.deepEqual(r.rows[0], { rank: 1, id: 't2', marka: 'JGG', subject: 'Statement', assignedHelper: 'Saurav Bhai', requestedBy: 'Mahavir', priority: 'Normal', status: 'In Progress', nextDate: '2026-10-04', date: '2026-10-01' });
});

test('find_tickets: status all includes resolved, marka filters, mine matches the user', () => {
  assert.equal(T.tools.find_tickets(ticketCtx(ADMIN), { status: 'all' }).total, 4);
  assert.deepEqual(T.tools.find_tickets(ticketCtx(ADMIN), { marka: 'jgg' }).rows.map(x => x.id), ['t2', 't1']);
  assert.deepEqual(T.tools.find_tickets(ticketCtx(SURENDRA), { mine: true }).rows.map(x => x.id), ['t1']);
});

test('prepare_ticket_action create: card with Marka and Master', () => {
  const r = prep(ticketCtx(SURENDRA), { op: 'create', marka: 'JGG', helper: 'saurav bhai', priority: 'High', subject: 'Urgent visit', note: 'call first' });
  assert.equal(r.ok, true);
  assert.equal(r.action.type, 'ticket');
  assert.equal(r.action.op, 'create');
  assert.deepEqual(r.action.payload, { markaId: 'a', markaName: 'JGG', assignedHelper: 'Saurav Bhai', priority: 'High', subject: 'Urgent visit', remark: 'call first' });
  assert.equal(r.action.preview.title, '🎫 New ticket');
  assert.deepEqual(r.action.preview.rows.find(x => x[0] === 'Marka'), ['Marka', 'JGG (BABLU SHERA MASTER)']);
  assert.deepEqual(r.action.preview.rows.find(x => x[0] === 'Assign to'), ['Assign to', 'Saurav Bhai']);
});

test('prepare_ticket_action create: helper suggestion, unknown helper, ambiguous Marka, general ticket', () => {
  const c = ticketCtx(SURENDRA);
  const near = prep(c, { op: 'create', marka: 'JGG', helper: 'Saurabh', subject: 'X' });
  assert.ok(near.error);
  assert.equal(near.suggestion, 'Saurav Bhai');
  const none = prep(c, { op: 'create', marka: 'JGG', helper: 'Nobody', subject: 'X' });
  assert.ok(none.error);
  assert.equal(none.suggestion, undefined);
  assert.deepEqual(prep(c, { op: 'create', marka: 'SA', helper: 'Mahavir', subject: 'X' }).candidates.sort(), ['SAN', 'SANK']);
  const general = prep(c, { op: 'create', helper: 'Mahavir', subject: 'Office work' });
  assert.equal(general.action.payload.markaId, '');
  assert.equal(general.action.payload.markaName, 'General');
  assert.equal(general.action.payload.priority, 'Normal');
  assert.ok(prep(c, { op: 'create', helper: 'Mahavir', subject: '' }).error);
  assert.ok(prep(c, { op: 'create', helper: 'Mahavir', subject: 'X', priority: 'Urgent' }).error);
});

test('prepare_ticket_action progress: candidates, single ticket, past date', () => {
  const c = ticketCtx(SURENDRA);
  const many = prep(c, { op: 'progress', marka: 'JGG', note: 'n', next_date: '2026-10-09' });
  assert.deepEqual(many.candidates, [{ id: 't2', subject: 'Statement' }, { id: 't1', subject: 'Visit' }]);
  const one = prep(c, { op: 'progress', marka: 'SAN', note: 'master se baat hui', next_date: '2026-10-09' });
  assert.equal(one.action.preview.title, '⏳ In progress');
  assert.deepEqual(one.action.payload, { ticketId: 't4', note: 'master se baat hui', nextDate: '2026-10-09' });
  assert.ok(prep(c, { op: 'progress', ticket_id: 't4', note: 'n', next_date: '2026-10-01' }).error);
  assert.ok(prep(c, { op: 'progress', ticket_id: 't4', note: '', next_date: '2026-10-09' }).error);
});

test('prepare_ticket_action done: default and invalid resolution type', () => {
  const c = ticketCtx(SURENDRA);
  const r = prep(c, { op: 'done', ticket_id: 't1', note: 'visit ho gaya' });
  assert.equal(r.action.preview.title, '✅ Done');
  assert.deepEqual(r.action.payload, { ticketId: 't1', resolutionType: 'Other Representative Action', note: 'visit ho gaya' });
  assert.ok(prep(c, { op: 'done', ticket_id: 't1', note: 'x', resolution_type: 'Magic' }).error);
});

test('prepare_ticket_action reassign: doer refused, admin gets a card', () => {
  const refused = prep(ticketCtx(SURENDRA), { op: 'reassign', ticket_id: 't1', helper: 'Mahavir' });
  assert.match(refused.error, /admin/i);
  const r = prep(ticketCtx(ADMIN), { op: 'reassign', ticket_id: 't1', helper: 'Mahavir', note: 'area' });
  assert.equal(r.action.preview.title, '🔁 Reassign');
  assert.deepEqual(r.action.payload, { ticketId: 't1', newHelper: 'Mahavir', note: 'area' });
  assert.ok(prep(ticketCtx(ADMIN), { op: 'reassign', ticket_id: 't1', helper: 'Saurav Bhai' }).error);
});

test('prepare_ticket_action: resolved or unknown tickets and bad op are errors', () => {
  const c = ticketCtx(ADMIN);
  for (const op of ['progress', 'done', 'reassign']) {
    assert.ok(prep(c, { op, ticket_id: 't3', note: 'n', next_date: '2026-10-09', helper: 'Mahavir' }).error, op);
    assert.ok(prep(c, { op, ticket_id: 'nope', note: 'n', next_date: '2026-10-09', helper: 'Mahavir' }).error, op);
  }
  assert.ok(prep(c, { op: 'delete' }).error);
  assert.ok(prep(c, { op: 'progress', marka: 'MAU', note: 'n', next_date: '2026-10-09' }).error);
});
