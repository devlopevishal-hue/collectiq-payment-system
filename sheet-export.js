// CollectIQ -> "Payment Collection Scoring" Google Sheet.
// Pure functions: turn the stored markas, help tickets and config into the
// rows of each sheet tab. Every task row has a Doer, a Plan date and an Actual
// date, scored the same way as FMS milestones in the app: done on or before
// the plan = 1, done late = 0.5, past the plan and still not done = 0, plan
// still in the future = blank (not counted yet).
(function (root) {
  const DEFAULT_TICKET_DAYS = 2;
  const DEFAULT_ESCALATION_DAYS = 3;
  // The Score tab counts tasks planned on or after this day (system go-live),
  // so years-old unpaid bills do not show up as missed FMS steps.
  const DEFAULT_SCORE_FROM = '2026-10-01';

  const FMS_DEFINITIONS = [
    { code: 'FMS-1', offset: 2, role: 'Account Team', name: 'Update Payment in System / Rokad' },
    { code: 'FMS-2', offset: 5, role: 'Process Coordinator (PC)', name: 'Intimate to Master about Pending Payment' },
    { code: 'FMS-3', offset: 14, role: 'Master', name: 'Get Sign of Master on Outstanding Statement' },
    { code: 'FMS-4', offset: 15, role: 'Process Coordinator (PC)', name: 'Update to Sales HOD about Critical Outstanding' }
  ];

  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  function text(v) {
    return String(v == null ? '' : v).trim();
  }

  function day(v) {
    const s = text(v).slice(0, 10);
    return ISO_DATE.test(s) ? s : '';
  }

  function addDays(isoDate, n) {
    return new Date(Date.parse(isoDate + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  }

  function daysBetween(a, b) {
    return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  }

  // Monday of the plan date's week, as the Score tab's week label.
  function weekStart(isoDate) {
    const dow = new Date(isoDate + 'T00:00:00Z').getUTCDay();
    return addDays(isoDate, -((dow + 6) % 7));
  }

  function score(plan, actual, today) {
    if (!plan) return '';
    if (actual) return actual <= plan ? 1 : 0.5;
    return plan < today ? 0 : '';
  }

  function resultLabel(s) {
    return s === 1 ? 'On time' : s === 0.5 ? 'Late' : s === 0 ? 'Missed' : 'Not due';
  }

  // Marka code is the party's key; the full name sits next to it.
  function markaCode(m) {
    return text(m.markaCode) || text(m.marka);
  }

  // Same lookup as getMasterFollowper() in app.js: exact, then substring.
  function followperFor(master, map) {
    const clean = text(master).toUpperCase();
    if (!clean || clean === 'UNASSIGNED' || clean === 'UNASSIGNED MASTER') return 'Unassigned';
    const entries = Object.entries(map || {}).filter(([, v]) => text(v) && v !== 'Unassigned');
    const exact = entries.find(([k]) => text(k).toUpperCase() === clean);
    if (exact) return text(exact[1]);
    const near = entries.find(([k]) => { const kc = text(k).toUpperCase(); return kc && (clean.includes(kc) || kc.includes(clean)); });
    return near ? text(near[1]) : 'Unassigned';
  }

  function activeBills(m) {
    return (m.bills || []).filter(b => Number(b.balance) > 0);
  }

  function oldestDueDate(m) {
    const active = activeBills(m);
    let oldest = '';
    active.forEach(b => {
      const d = day(b.policyDate) || day(b.firstDate);
      if (d && (!oldest || d < oldest)) oldest = d;
    });
    return oldest;
  }

  function isVisit(h) {
    const mode = text(h.mode).toLowerCase();
    return mode.includes('person') || mode.includes('visit');
  }

  // Back-office log lines (FMS, ticket and escalation updates) are not calls
  // with the party, so they neither close nor open a follow-up.
  function isPartyContact(h) {
    const s = text(h.status);
    return !/^FMS|^Help Ticket|^Escalation/i.test(s);
  }

  // One row per planned follow-up: the "next date" set at a follow-up is the
  // plan, and the date of the following contact is the actual. The open plan
  // is the party's current next date.
  function followupRows(m, ctx) {
    const rows = [];
    const doer = followperFor(m.master, ctx.masterFollowpers);
    const events = (m.history || []).filter(h => day(h.date) && isPartyContact(h))
      .map((h, i) => ({ h, i })).sort((a, b) => (day(a.h.date) < day(b.h.date) ? -1 : day(a.h.date) > day(b.h.date) ? 1 : a.i - b.i))
      .map(x => x.h);
    events.forEach((h, i) => {
      const plan = day(h.next);
      if (!plan) return;
      const done = events.slice(i + 1).find(e => day(e.date) >= day(h.date));
      if (!done) return; // the open plan comes from the party's current next date below
      const actual = day(done.date);
      rows.push(followupRow(m, text(done.followper) || doer, plan, actual, done, ctx.today));
    });
    const openPlan = day(m.nextDate);
    if (openPlan && activeBills(m).length) {
      const last = events[events.length - 1];
      const doneAfter = last && day(last.date) >= openPlan;
      if (!doneAfter) rows.push(followupRow(m, doer, openPlan, '', null, ctx.today));
    }
    return rows;
  }

  function followupRow(m, doer, plan, actual, done, today) {
    const s = score(plan, actual, today);
    return [markaCode(m), text(m.marka), doer, plan, actual,
      done ? text(done.mode) : '', done ? text(done.status) : '', done ? text(done.remark) : '', s, resultLabel(s)];
  }

  function ticketRows(tickets, markaById, today) {
    return (tickets || []).map(t => {
      const m = markaById[t.markaId] || {};
      const opened = day(t.date) || day(t.createdAt);
      const plan = day(t.nextDate) || (opened ? addDays(opened, DEFAULT_TICKET_DAYS) : '');
      const actual = text(t.status).toLowerCase() === 'resolved' ? day(t.resolvedAt) || lastHistoryDate(t) : '';
      const s = score(plan, actual, today);
      return [text(t.assignedHelper) || 'Unassigned', plan, actual,
        markaCode(m) || text(t.markaName), text(m.marka) || text(t.markaName), text(t.subject), text(t.priority),
        text(t.requestedBy), opened, text(t.status), text(t.remark), s, resultLabel(s), text(t.id)];
    }).filter(r => r[1]);
  }

  function lastHistoryDate(t) {
    const h = (t.history || []).filter(x => text(x.status).toLowerCase() === 'resolved');
    return h.length ? day(h[h.length - 1].date) : '';
  }

  function escalationRows(m, today) {
    return (m.escalations || []).map(e => {
      const opened = day(e.date);
      const plan = day(e.nextDate) || (opened ? addDays(opened, DEFAULT_ESCALATION_DAYS) : '');
      const actual = text(e.status).toLowerCase() === 'resolved' ? day(e.resolvedDate) : '';
      const s = score(plan, actual, today);
      return [markaCode(m), text(m.marka), text(e.status) || 'Open', text(e.escalatedTo) || 'Unassigned', plan, actual,
        text(e.type), text(e.claimNumber) || text(e.waComplaintNo), text(e.followper), opened, text(e.remark), s, resultLabel(s), text(e.id)];
    }).filter(r => r[4]);
  }

  // FMS milestones per party, from the oldest due date of its unpaid bills,
  // the same way getFmsTasks() in app.js builds them.
  function fmsRows(m, today) {
    const base = oldestDueDate(m);
    if (!base) return [];
    return FMS_DEFINITIONS.map(def => {
      const plan = addDays(base, def.offset);
      const saved = [...(m.fmsTasks || [])].reverse().find(t => t.taskCode === def.code || t.code === def.code);
      let actual = saved ? day(saved.actualDate) : '';
      if (!actual) {
        const h = [...(m.history || [])].reverse().find(x => /^FMS (Task Completed|Milestone)/.test(text(x.status)) && text(x.remark).includes(`[${def.code}`));
        if (h) actual = day(h.date);
      }
      const doer = def.role === 'Master' ? text(m.master) || 'Master' : def.role;
      const s = score(plan, actual, today);
      return [doer, `${def.code} ${def.name}`, plan, actual, markaCode(m), text(m.marka), base,
        saved ? text(saved.completedBy) : '', s, resultLabel(s)];
    });
  }

  function partyRow(m, ctx) {
    const today = ctx.today;
    const active = activeBills(m);
    const outstanding = active.reduce((s, b) => s + Number(b.balance || 0), 0);
    const overdueBills = active.filter(b => (day(b.policyDate) || day(b.firstDate)) && (day(b.policyDate) || day(b.firstDate)) < today);
    const overdue = overdueBills.reduce((s, b) => s + Number(b.balance || 0), 0);
    const oldest = oldestDueDate(m);
    const pays = (ctx.paymentsByMarka[m.id] || []).slice().sort((a, b) => (day(a.date) < day(b.date) ? 1 : -1));
    const since30 = addDays(today, -30);
    const paid30 = pays.filter(p => day(p.date) >= since30).reduce((s, p) => s + Number(p.amount || 0), 0);
    const hist = m.history || [];
    const visits30 = hist.filter(h => isVisit(h) && day(h.date) >= since30).length;
    const calls30 = hist.filter(h => !isVisit(h) && isPartyContact(h) && h.type !== 'payment' && day(h.date) >= since30).length;
    const openTickets = (ctx.ticketsByMarka[m.id] || []).filter(t => text(t.status).toLowerCase() !== 'resolved').length;
    const openEsc = (m.escalations || []).filter(e => text(e.status).toLowerCase() !== 'resolved').length;
    return [markaCode(m), text(m.marka), text(m.master), followperFor(m.master, ctx.masterFollowpers), text(m.crr),
      outstanding, overdue, active.length, oldest, oldest && oldest < today ? daysBetween(oldest, today) : 0,
      pays[0] ? day(pays[0].date) : '', pays[0] ? Number(pays[0].amount || 0) : '', paid30,
      day(m.ptp), day(m.nextDate), text(m.lastStatus), day(m.lastDate), calls30, visits30, openTickets, openEsc, text(m.id)];
  }

  // Score per Doer per week (week of the plan date), for every task tab.
  function scoreRows(sources, scoreFrom) {
    const groups = {};
    sources.forEach(({ name, rows, doerCol, planCol, scoreCol }) => {
      rows.forEach(r => {
        const s = r[scoreCol];
        if (s === '' || r[planCol] < scoreFrom) return;
        const key = [name, r[doerCol], weekStart(r[planCol])].join('|');
        const g = groups[key] || (groups[key] = { name, doer: r[doerCol], week: weekStart(r[planCol]), due: 0, onTime: 0, late: 0, missed: 0, points: 0 });
        g.due++;
        g.points += s;
        if (s === 1) g.onTime++; else if (s === 0.5) g.late++; else g.missed++;
      });
    });
    return Object.values(groups)
      .sort((a, b) => (a.week < b.week ? 1 : a.week > b.week ? -1 : a.name.localeCompare(b.name) || a.doer.localeCompare(b.doer)))
      .map(g => [g.week, g.name, g.doer, g.due, g.onTime, g.late, g.missed, g.points, Math.round((g.points / g.due) * 1000) / 10]);
  }

  const HEADERS = {
    'Follow Up Schedule': ['Marka', 'Party Name', 'Doer', 'Next Followup Date/ plan Date', 'Actual Date', 'Mode', 'Status', 'Remark', 'Score', 'Result'],
    'Help Tickets': ['Doer', 'Next Followup Date/ plan Date', 'Actual Date', 'Marka', 'Party Name', 'Subject', 'Priority', 'Requested By', 'Ticket Date', 'Status', 'Remark', 'Score', 'Result', 'Ticket ID'],
    'Crm Escalations': ['Marka', 'Party Name', 'Current status', 'Doer', 'Next Followup Date/ plan Date', 'Actual Date', 'Type', 'Claim / Complaint No', 'Raised By', 'Escalation Date', 'Remark', 'Score', 'Result', 'Escalation ID'],
    'FMS Pre-planned': ['Doer', 'Stage stage', 'Next Followup Date/ plan Date', 'Actual Date', 'Marka', 'Party Name', 'Oldest Due Date', 'Completed By', 'Score', 'Result'],
    'Parties': ['Marka', 'Party Name', 'Master', 'Followper', 'CRR', 'Outstanding', 'Overdue', 'Unpaid Bills', 'Oldest Due Date', 'Days Overdue', 'Last Payment Date', 'Last Payment Amount', 'Paid Last 30 Days', 'PTP Date', 'Next Follow-up', 'Last Status', 'Last Follow-up', 'Calls Last 30 Days', 'Visits Last 30 Days', 'Open Tickets', 'Open Escalations', 'CollectIQ ID'],
    'Score': ['Week Starting', 'Tab', 'Doer', 'Tasks Due', 'On Time', 'Late', 'Missed', 'Points', 'Score %']
  };

  // { markas, payments, helpTickets, config, today, scoreFrom } -> { tabs: { name: { headers, rows } } }
  function buildSheet({ markas = [], payments = [], helpTickets = [], config = {}, today, scoreFrom = DEFAULT_SCORE_FROM }) {
    const ctx = {
      today,
      masterFollowpers: config.masterFollowpers || {},
      paymentsByMarka: {},
      ticketsByMarka: {}
    };
    payments.forEach(p => { (ctx.paymentsByMarka[p.markaId] || (ctx.paymentsByMarka[p.markaId] = [])).push(p); });
    helpTickets.forEach(t => { (ctx.ticketsByMarka[t.markaId] || (ctx.ticketsByMarka[t.markaId] = [])).push(t); });
    const markaById = {};
    markas.forEach(m => { markaById[m.id] = m; });
    const byCode = (a, b) => text(a[0]).localeCompare(text(b[0]));
    const byPlanDesc = col => (a, b) => (a[col] < b[col] ? 1 : a[col] > b[col] ? -1 : 0);

    const follow = markas.flatMap(m => followupRows(m, ctx)).sort(byPlanDesc(3));
    const tickets = ticketRows(helpTickets, markaById, today).sort(byPlanDesc(1));
    const esc = markas.flatMap(m => escalationRows(m, today)).sort(byPlanDesc(4));
    const fms = markas.flatMap(m => fmsRows(m, today)).sort(byPlanDesc(2));
    const parties = markas.map(m => partyRow(m, ctx)).sort(byCode);
    const scores = scoreRows([
      { name: 'Follow Up Schedule', rows: follow, doerCol: 2, planCol: 3, scoreCol: 8 },
      { name: 'Help Tickets', rows: tickets, doerCol: 0, planCol: 1, scoreCol: 11 },
      { name: 'Crm Escalations', rows: esc, doerCol: 3, planCol: 4, scoreCol: 11 },
      { name: 'FMS Pre-planned', rows: fms, doerCol: 0, planCol: 2, scoreCol: 8 }
    ], scoreFrom);
    const rows = { 'Follow Up Schedule': follow, 'Help Tickets': tickets, 'Crm Escalations': esc, 'FMS Pre-planned': fms, 'Parties': parties, 'Score': scores };
    const tabs = {};
    Object.keys(HEADERS).forEach(name => { tabs[name] = { headers: HEADERS[name], rows: rows[name] }; });
    return { generatedAt: new Date().toISOString(), today, scoreFrom, tabs };
  }

  const api = { buildSheet, followperFor, score, weekStart, HEADERS, FMS_DEFINITIONS, DEFAULT_TICKET_DAYS, DEFAULT_ESCALATION_DAYS, DEFAULT_SCORE_FROM };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SheetExport = api;
})(typeof window !== 'undefined' ? window : globalThis);
