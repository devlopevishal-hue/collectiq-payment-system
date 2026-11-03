// CollectIQ party health: one report per party group. A group is every party
// (Master + Marka) that shares a marka / group code, e.g. JGG with 7 firms under
// different masters. Each firm gets its own numbers, score and notes, and the
// group gets a combined view. Pure functions; no DOM, no database.
(function (root) {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const AGE_BUCKETS = [
    { key: 'notDue', label: 'Not due yet', max: -1 },
    { key: 'd0_30', label: '0–30 days', max: 30 },
    { key: 'd31_60', label: '31–60 days', max: 60 },
    { key: 'd61_90', label: '61–90 days', max: 90 },
    { key: 'd91_180', label: '91–180 days', max: 180 },
    { key: 'd180p', label: '180+ days', max: Infinity }
  ];

  const text = v => String(v == null ? '' : v).trim();
  const norm = v => text(v).toUpperCase().replace(/\s+/g, ' ');
  const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const list = v => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []);

  function isoDate(v) {
    const s = text(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    return '';
  }

  // Whole days from `from` to `to` (both YYYY-MM-DD). Positive when `to` is later.
  function dayDiff(from, to) {
    const a = isoDate(from);
    const b = isoDate(to);
    if (!a || !b) return 0;
    const t = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
    return Math.round((t(b) - t(a)) / 86400000);
  }

  function addDays(isoStr, n) {
    const s = isoDate(isoStr);
    if (!s) return '';
    const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10) + n));
    return d.toISOString().slice(0, 10);
  }

  const monthKey = d => (isoDate(d) ? isoDate(d).slice(0, 7) : '');
  function monthLabel(key) {
    const m = /^(\d{4})-(\d{2})$/.exec(key || '');
    return m ? `${MONTHS[+m[2] - 1]} ${m[1]}` : '—';
  }

  // The group a party belongs to: its marka / group code, else its own name.
  function groupKeyOf(m) {
    return norm((m && (m.markaCode || m.marka)) || '');
  }

  // Party groups for the picker: [{ key, code, names, masters, parties, outstanding }].
  function groupParties(markas) {
    const groups = new Map();
    list(markas).forEach(m => {
      const key = groupKeyOf(m);
      if (!key) return;
      if (!groups.has(key)) groups.set(key, { key, code: key, parties: [] });
      groups.get(key).parties.push(m);
    });
    return [...groups.values()].map(g => {
      const names = [...new Set(g.parties.map(p => norm(p.marka)).filter(Boolean))].sort();
      const masters = [...new Set(g.parties.map(p => norm(p.master) || 'NO MASTER'))].sort();
      const outstanding = g.parties.reduce((s, p) => s + list(p.bills).reduce((t, b) => t + Math.max(0, num(b.balance)), 0), 0);
      return { ...g, names, masters, outstanding };
    }).sort((a, b) => b.outstanding - a.outstanding || a.key.localeCompare(b.key));
  }

  const isFollowupEntry = h => h && !/^FMS/i.test(text(h.status)) &&
    !/reassigned|help ticket (progress|resolved)/i.test(text(h.status));
  const isPtpEntry = h => /promise to pay|^ptp$/i.test(text(h.status)) && isoDate(h.promise);
  const isVisitEntry = h => /person|visit/i.test(text(h.mode)) || !!text(h.visitPurpose);

  // Payments for one party: the payments list plus payment lines kept only in its
  // history (old records), each once.
  function partyPayments(m, payments) {
    const out = list(payments).map(p => ({
      date: isoDate(p.date), amount: num(p.amount), ref: text(p.ref), mode: text(p.mode), followper: text(p.followper)
    }));
    list(m.history).forEach(h => {
      if (h.type !== 'payment' && !(num(h.amount) > 0)) return;
      const date = isoDate(h.date);
      const ref = text(h.ref);
      const dup = out.some(p => p.date === date && (p.amount === num(h.amount) || (ref && ref !== 'N/A' && p.ref === ref)));
      if (!dup && num(h.amount) > 0) out.push({ date, amount: num(h.amount), ref, mode: text(h.mode), followper: text(h.followper) });
    });
    return out.filter(p => p.date && p.amount > 0).sort((a, b) => b.date.localeCompare(a.date));
  }

  // Numbers for one firm (one Master + Marka party).
  // input: { party, payments, tickets, complaints, fmsTasks, owner, crr, today }
  function firmStats(input) {
    const m = input.party || {};
    const today = isoDate(input.today);
    const bills = list(m.bills);
    const active = bills.filter(b => num(b.balance) > 0);
    const outstanding = active.reduce((s, b) => s + num(b.balance), 0);
    const credit = bills.filter(b => num(b.balance) < 0).reduce((s, b) => s - num(b.balance), 0);

    const aging = AGE_BUCKETS.map(b => ({ key: b.key, label: b.label, amount: 0, bills: 0 }));
    const byMonth = new Map();
    let dueNow = 0;
    let oldestDue = '';
    const billRows = active.map(b => {
      const billDate = isoDate(b.firstDate);
      const dueDate = isoDate(b.policyDate) || billDate;
      const overdueDays = dueDate ? dayDiff(dueDate, today) : 0;
      const bal = num(b.balance);
      if (overdueDays >= 0) dueNow += bal;
      if (dueDate && (!oldestDue || dueDate < oldestDue)) oldestDue = dueDate;
      const idx = overdueDays < 0 ? 0 : AGE_BUCKETS.findIndex((x, i) => i > 0 && overdueDays <= x.max);
      aging[idx].amount += bal;
      aging[idx].bills += 1;
      const mk = monthKey(billDate || dueDate);
      if (!byMonth.has(mk)) byMonth.set(mk, { month: mk, label: monthLabel(mk), amount: 0, bills: 0 });
      byMonth.get(mk).amount += bal;
      byMonth.get(mk).bills += 1;
      return {
        id: b.id, billNos: Array.isArray(b.billNos) ? b.billNos.map(text).filter(Boolean) : [],
        billDate, dueDate, policyName: text(b.policyName), amount: num(b.sourceAmount) || bal, balance: bal, overdueDays
      };
    }).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));

    const months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
    const oldestMonth = months[0] || null;
    const oldestMonthBills = oldestMonth ? billRows.filter(r => monthKey(r.billDate || r.dueDate) === oldestMonth.month) : [];
    const oldestDueDays = oldestDue ? dayDiff(oldestDue, today) : 0;
    const locked = outstanding > 0 && !!oldestDue && oldestDueDays > 19;

    // Payments
    const pays = partyPayments(m, input.payments);
    const lastPayment = pays[0] || null;
    const paid90 = pays.filter(p => dayDiff(p.date, today) <= 90).reduce((s, p) => s + p.amount, 0);
    const daysSincePayment = lastPayment ? dayDiff(lastPayment.date, today) : null;

    // Follow-ups
    const history = list(m.history).map(h => ({ ...h, date: isoDate(h.date) })).filter(h => h.date)
      .sort((a, b) => a.date.localeCompare(b.date));
    const followups = history.filter(isFollowupEntry);
    let onTime = 0;
    let late = 0;
    let totalGap = 0;
    for (let i = 1; i < followups.length; i++) {
      const planned = isoDate(followups[i - 1].next);
      totalGap += dayDiff(followups[i - 1].date, followups[i].date);
      if (!planned) continue;
      if (followups[i].date <= planned) onTime++;
      else late++;
    }
    const lastFollowup = followups[followups.length - 1] || null;
    const nextDate = isoDate(m.nextDate);
    const nextLateDays = nextDate ? dayDiff(nextDate, today) : 0;
    const followups30 = followups.filter(h => dayDiff(h.date, today) <= 30).length;
    const followups90 = followups.filter(h => dayDiff(h.date, today) <= 90).length;

    // Month-wise follow-up count (last 6 months, oldest first)
    const fuMonths = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1 - i, 1));
      const key = d.toISOString().slice(0, 7);
      fuMonths.push({ month: key, label: monthLabel(key), count: followups.filter(h => h.date.slice(0, 7) === key).length });
    }

    // Who followed this party, in order of first follow-up.
    const people = new Map();
    followups.forEach(h => {
      const who = text(h.followper) || 'Unknown';
      if (!people.has(who)) people.set(who, { name: who, count: 0, first: h.date, last: h.date, lastRemark: '' });
      const p = people.get(who);
      p.count++;
      p.last = h.date;
      p.lastRemark = text(h.remark);
    });
    const followerHistory = [...people.values()].sort((a, b) => a.first.localeCompare(b.first));
    const followers90 = new Set(followups.filter(h => dayDiff(h.date, today) <= 90).map(h => text(h.followper) || 'Unknown')).size;
    // Hand-overs: each time the next follow-up was done by someone else.
    let handovers = 0;
    for (let i = 1; i < followups.length; i++) {
      if ((text(followups[i].followper) || 'Unknown') !== (text(followups[i - 1].followper) || 'Unknown')) handovers++;
    }

    // Promises to pay: kept when a payment came in from the promise day until 3 days after it.
    const ptps = history.filter(isPtpEntry).map(h => {
      const promise = isoDate(h.promise);
      const kept = pays.some(p => p.date >= h.date && p.date <= addDays(promise, 3));
      const state = kept ? 'Kept' : (promise >= today ? 'Pending' : 'Broken');
      return { date: h.date, promise, expected: num(h.expected), followper: text(h.followper), remark: text(h.remark), state };
    }).sort((a, b) => b.date.localeCompare(a.date));
    const brokenPtps90 = ptps.filter(p => p.state === 'Broken' && dayDiff(p.promise, today) <= 90).length;

    const visits = history.filter(isVisitEntry);

    // Help tickets
    const tickets = list(input.tickets).map(t => {
      const status = text(t.status) || 'Open';
      const open = status.toLowerCase() !== 'resolved';
      const date = isoDate(t.date) || isoDate(t.createdAt);
      const next = isoDate(t.nextDate);
      return {
        id: t.id, date, subject: text(t.subject), priority: text(t.priority) || 'Normal', requestedBy: text(t.requestedBy),
        assignedHelper: text(t.assignedHelper), status, open, nextDate: next,
        ageDays: date ? dayDiff(date, today) : 0, nextLate: open && next ? Math.max(0, dayDiff(next, today)) : 0,
        updates: list(t.history).length, remark: text(t.resolutionNote || t.remark), resolvedBy: text(t.resolvedBy)
      };
    }).sort((a, b) => (b.open - a.open) || b.date.localeCompare(a.date));
    const openTickets = tickets.filter(t => t.open);

    // Complaints / claims / escalations
    const complaints = list(input.complaints).map(c => {
      const status = text(c.status) || 'Open';
      const open = !/resolved|settled|closed/i.test(status);
      const date = isoDate(c.date);
      return {
        id: c.id, date, type: text(c.type) || 'Claim Matter', ref: text(c.claimNumber || c.waComplaintNo), escalatedTo: text(c.escalatedTo),
        followper: text(c.followper), status, open, ageDays: date ? dayDiff(date, today) : 0,
        remark: text(c.remark), resolvedDate: isoDate(c.resolvedDate), resolvedBy: text(c.resolvedBy), resolution: text(c.resolutionNote || c.resolutionType)
      };
    }).sort((a, b) => (b.open - a.open) || b.date.localeCompare(a.date));
    const openComplaints = complaints.filter(c => c.open);

    // FMS milestone tasks (already worked out by the app)
    const fms = list(input.fmsTasks).map(t => ({
      code: text(t.code), name: text(t.name), role: text(t.role), responsible: text(t.responsibleName),
      plannedDate: isoDate(t.plannedDate), actualDate: isoDate(t.actualDate), status: text(t.status), delay: num(t.delay), done: !!t.isDone
    }));
    const fmsOverdue = fms.filter(t => !t.done && t.status === 'Overdue');

    const stats = {
      id: m.id, marka: text(m.marka), markaCode: text(m.markaCode), master: text(m.master) || 'NO MASTER',
      owner: text(input.owner) || text(m.owner) || 'Unassigned', crr: text(input.crr) || text(m.crr) || 'Unassigned',
      outstanding, dueNow, upcoming: outstanding - dueNow, credit, billCount: active.length,
      oldestDue, oldestDueDays, locked, aging, months, oldestMonth, oldestMonthBills, bills: billRows,
      payments: pays, lastPayment, daysSincePayment, paid90,
      followupCount: followups.length, followups30, followups90, onTime, late,
      onTimePct: onTime + late ? Math.round((onTime / (onTime + late)) * 100) : null,
      avgGap: followups.length > 1 ? Math.round(totalGap / (followups.length - 1)) : null,
      lastFollowup: lastFollowup ? { date: lastFollowup.date, followper: text(lastFollowup.followper), status: text(lastFollowup.status), remark: text(lastFollowup.remark), mode: text(lastFollowup.mode) } : null,
      nextDate, nextLateDays, lastStatus: text(m.lastStatus), remark: text(m.remark),
      fuMonths, followerHistory, followers90, handovers,
      ptps, brokenPtps90, visits: visits.length, lastVisit: visits.length ? visits[visits.length - 1].date : '',
      tickets, openTickets: openTickets.length, complaints, openComplaints: openComplaints.length,
      fms, fmsOverdue: fmsOverdue.length,
      timeline: history.slice(-25).reverse().map(h => ({
        date: h.date, type: h.type === 'payment' ? 'Payment' : text(h.status) || 'Note', followper: text(h.followper),
        mode: text(h.mode), remark: text(h.remark), next: isoDate(h.next), amount: num(h.amount)
      }))
    };
    stats.score = scoreFirm(stats);
    stats.notes = firmNotes(stats);
    return stats;
  }

  // Health score out of 100, from six parts.
  function scoreFirm(s) {
    const owes = s.dueNow > 0;
    const parts = [];

    // 1. Payment age (30): how old the oldest unpaid bill is past its due date.
    let age = 30;
    if (owes) {
      const d = s.oldestDueDays;
      age = d <= 0 ? 30 : d <= 15 ? 26 : d <= 30 ? 21 : d <= 60 ? 15 : d <= 90 ? 9 : d <= 180 ? 4 : 0;
    }
    parts.push({ key: 'age', label: 'Payment age', max: 30, points: age,
      why: owes ? `Oldest due bill is ${Math.max(0, s.oldestDueDays)} days past due` : 'Nothing is due now' });

    // 2. Payment flow (10): when the last payment came in.
    let flow = 10;
    if (owes) {
      const d = s.daysSincePayment;
      flow = d == null ? 0 : d <= 30 ? 10 : d <= 60 ? 6 : d <= 90 ? 3 : 0;
    }
    parts.push({ key: 'flow', label: 'Payment flow', max: 10, points: flow,
      why: s.lastPayment ? `Last payment ${s.daysSincePayment} days ago` : (owes ? 'No payment on record' : 'Nothing is due now') });

    // 3. Follow-up discipline (25): next date kept, on-time rate, recent contact.
    let fu = 25;
    let fuWhy = 'Nothing is due now';
    if (s.outstanding > 0) {
      let next = 10;
      if (!s.nextDate) next = 0;
      else if (s.nextLateDays > 7) next = 0;
      else if (s.nextLateDays > 3) next = 3;
      else if (s.nextLateDays > 0) next = 6;
      const rate = s.onTimePct == null ? 7 : Math.round((s.onTimePct / 100) * 10);
      const recent = s.followups30 > 0 ? 5 : 0;
      fu = next + rate + recent;
      fuWhy = [
        !s.nextDate ? 'no next date set' : s.nextLateDays > 0 ? `next follow-up ${s.nextLateDays} days late` : 'next follow-up on time',
        s.onTimePct == null ? 'on-time rate not known yet' : `${s.onTimePct}% on time`,
        `${s.followups30} in last 30 days`
      ].join(', ');
    }
    parts.push({ key: 'followup', label: 'Follow-up discipline', max: 25, points: fu, why: fuWhy });

    // 4. Complaints (15): each open complaint costs 5, one open over 15 days costs 3 more.
    const openC = s.complaints.filter(c => c.open);
    const cPts = Math.max(0, 15 - openC.length * 5 - openC.filter(c => c.ageDays > 15).length * 3);
    parts.push({ key: 'complaints', label: 'Complaints', max: 15, points: cPts,
      why: openC.length ? `${openC.length} open complaint(s)` : 'No open complaint' });

    // 5. Help tickets (10): each open ticket costs 3, a ticket past its next date 2 more.
    const openT = s.tickets.filter(t => t.open);
    const tPts = Math.max(0, 10 - openT.length * 3 - openT.filter(t => t.nextLate > 0 || (!t.nextDate && t.ageDays > 7)).length * 2);
    parts.push({ key: 'tickets', label: 'Help tickets', max: 10, points: tPts,
      why: openT.length ? `${openT.length} open ticket(s)` : 'No open ticket' });

    // 6. Promises and FMS (10): broken promises in 90 days, FMS steps overdue.
    const pfPts = Math.max(0, 10 - s.brokenPtps90 * 3 - s.fmsOverdue * 2);
    parts.push({ key: 'promises', label: 'Promises & FMS', max: 10, points: pfPts,
      why: `${s.brokenPtps90} broken promise(s) in 90 days, ${s.fmsOverdue} FMS step(s) overdue` });

    const total = parts.reduce((t, p) => t + p.points, 0);
    return { total, grade: gradeOf(total), parts };
  }

  function gradeOf(total) {
    if (total >= 80) return { key: 'healthy', label: 'Healthy' };
    if (total >= 60) return { key: 'watch', label: 'Watch' };
    if (total >= 40) return { key: 'risk', label: 'At risk' };
    return { key: 'critical', label: 'Critical' };
  }

  // Analysis notes: what is wrong and the next step, worst first.
  // level: 3 = act now, 2 = this week, 1 = keep an eye, 0 = good.
  function firmNotes(s) {
    const notes = [];
    const add = (level, area, textMsg, action) => notes.push({ level, area, text: textMsg, action });
    const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');

    if (s.dueNow > 0) {
      if (s.oldestMonth) {
        const lock = s.locked ? ` GP locked with ${inr(s.dueNow)} due now.` : '';
        add(s.locked || s.oldestDueDays > 60 ? 3 : s.oldestDueDays > 19 ? 2 : 1, 'Payment',
          `Oldest pending month is ${s.oldestMonth.label}: ${inr(s.oldestMonth.amount)} in ${s.oldestMonth.bills} bill(s); oldest bill is ${Math.max(0, s.oldestDueDays)} days past due.${lock}`,
          `Clear the ${s.oldestMonth.label} bills first. ${s.owner} to get a firm payment date from the party${s.locked ? '; raise with the master if no date is given' : ''}.`);
      }
      if (s.daysSincePayment == null) add(2, 'Payment', 'No payment is on record for this firm.', 'Ask for a part payment to start the account moving.');
      else if (s.daysSincePayment > 60) add(2, 'Payment', `No payment for ${s.daysSincePayment} days (last ${inr(s.lastPayment.amount)}).`, 'Ask for at least a part payment against the oldest bills.');
    }
    if (s.outstanding > 0) {
      if (!s.nextDate) add(3, 'Follow-up', 'Amount is pending but no next follow-up date is set.', `${s.owner} to call and set the next date today.`);
      else if (s.nextLateDays > 0) add(s.nextLateDays > 7 ? 3 : 2, 'Follow-up', `Next follow-up was due ${s.nextLateDays} day(s) ago.`, `${s.owner} to call today and record the outcome.`);
      if (s.onTimePct != null && s.onTimePct < 70) {
        add(2, 'Follow-up', `Only ${s.onTimePct}% of follow-ups were done on the planned date (${s.late} late).`, 'Keep to the next date set on each call; set a date you can keep.');
      }
      if (s.followups30 === 0) add(2, 'Follow-up', 'No follow-up in the last 30 days.', 'Restart regular follow-up: at least one call a week while amount is due.');
      if (s.followers90 >= 3) add(1, 'Follow-up', `${s.followers90} different people followed this party in 90 days.`, `Keep one owner (${s.owner}) so the party gets one consistent voice.`);
    }
    s.complaints.filter(c => c.open).forEach(c => {
      add(c.ageDays > 15 ? 3 : 2, 'Complaint', `${c.type}${c.ref ? ' ' + c.ref : ''} open for ${c.ageDays} day(s) with ${c.escalatedTo || 'CRM'}.`,
        'Resolve the complaint first; payment often waits on it. Agree the claim amount and close it.');
    });
    s.tickets.filter(t => t.open).forEach(t => {
      const late = t.nextLate > 0 ? `, next date passed ${t.nextLate} day(s) ago` : '';
      add(t.nextLate > 0 || t.priority === 'Critical' ? 3 : 2, 'Help ticket', `"${t.subject}" with ${t.assignedHelper || 'helper'} open ${t.ageDays} day(s)${late}.`,
        `${t.assignedHelper || 'Helper'} to finish the action or set a new date.`);
    });
    if (s.brokenPtps90 > 0) add(2, 'Promise', `${s.brokenPtps90} promise(s) to pay broken in the last 90 days.`, 'Take smaller, nearer promises and follow up the day after each one.');
    if (s.fmsOverdue > 0) add(2, 'FMS', `${s.fmsOverdue} FMS step(s) overdue.`, 'Complete the overdue FMS steps (account update, master intimation / sign, HOD escalation).');

    if (!notes.length) add(0, 'Overall', 'No open issue found.', 'Keep regular follow-ups and on-time payments going.');
    return notes.sort((a, b) => b.level - a.level);
  }

  // The whole group: every firm, plus combined numbers, score and notes.
  function groupReport(firmInputs, { today } = {}) {
    const firms = (firmInputs || []).map(f => firmStats({ ...f, today }));
    firms.sort((a, b) => a.score.total - b.score.total || b.outstanding - a.outstanding);
    const sum = k => firms.reduce((t, f) => t + (num(f[k]) || 0), 0);

    const aging = AGE_BUCKETS.map((b, i) => ({ key: b.key, label: b.label,
      amount: firms.reduce((t, f) => t + f.aging[i].amount, 0), bills: firms.reduce((t, f) => t + f.aging[i].bills, 0) }));
    const monthMap = new Map();
    firms.forEach(f => f.months.forEach(mo => {
      if (!monthMap.has(mo.month)) monthMap.set(mo.month, { month: mo.month, label: mo.label, amount: 0, bills: 0 });
      monthMap.get(mo.month).amount += mo.amount;
      monthMap.get(mo.month).bills += mo.bills;
    }));
    const months = [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month));
    const oldestMonth = months[0] || null;
    const oldestMonthBills = oldestMonth ? firms.flatMap(f => f.oldestMonthBills
      .filter(r => monthKey(r.billDate || r.dueDate) === oldestMonth.month)
      .map(r => ({ ...r, marka: f.marka, master: f.master }))) : [];
    const fuMonths = (firms[0] ? firms[0].fuMonths : []).map((mo, i) => ({ ...mo, count: firms.reduce((t, f) => t + f.fuMonths[i].count, 0) }));

    // Combined score: half weighted by money due, half by firm count, so a big
    // firm counts more but a small firm with problems still shows.
    const totalOut = sum('outstanding');
    const simple = firms.length ? firms.reduce((t, f) => t + f.score.total, 0) / firms.length : 0;
    const weighted = totalOut > 0 ? firms.reduce((t, f) => t + f.score.total * f.outstanding, 0) / totalOut : simple;
    const total = Math.round(simple * 0.5 + weighted * 0.5);
    const parts = (firms[0] ? firms[0].score.parts : []).map((p, i) => ({
      key: p.key, label: p.label, max: p.max,
      points: Math.round(firms.reduce((t, f) => t + f.score.parts[i].points, 0) / firms.length * 10) / 10
    }));

    const lastPayment = firms.map(f => f.lastPayment && { ...f.lastPayment, marka: f.marka, master: f.master })
      .filter(Boolean).sort((a, b) => b.date.localeCompare(a.date))[0] || null;
    const oldestDueDays = firms.reduce((mx, f) => (f.outstanding > 0 ? Math.max(mx, f.oldestDueDays) : mx), 0);
    const followupCount = sum('followupCount');
    const onTime = sum('onTime');
    const late = sum('late');

    const notes = firms.flatMap(f => f.notes.filter(n => n.level > 0).map(n => ({ ...n, firm: `${f.marka} · ${f.master}`, firmId: f.id })))
      .sort((a, b) => b.level - a.level);
    if (firms.length > 1) {
      const worst = firms[0];
      if (worst && worst.score.total < 60) {
        notes.unshift({ level: 3, area: 'Group', firm: `${worst.marka} · ${worst.master}`, firmId: worst.id,
          text: `Weakest firm is ${worst.marka} under ${worst.master} (score ${worst.score.total}, ${worst.score.grade.label}).`,
          action: 'Start with this firm: its issues pull the whole group down.' });
      }
      const masters = new Set(firms.map(f => f.master));
      if (masters.size > 1) {
        const byMaster = [...masters].map(ms => ({ master: ms, due: firms.filter(f => f.master === ms).reduce((t, f) => t + f.dueNow, 0) }))
          .filter(x => x.due > 0).sort((a, b) => b.due - a.due);
        if (byMaster.length) {
          notes.push({ level: 1, area: 'Group', firm: 'All firms',
            text: `Due now is spread over ${byMaster.length} master(s); most is under ${byMaster[0].master} (₹${Math.round(byMaster[0].due).toLocaleString('en-IN')}).`,
            action: 'Hold one joint review with each master for this party group.' });
        }
      }
    }
    if (!notes.length) notes.push({ level: 0, area: 'Overall', firm: 'All firms', text: 'No open issue found across the firms.', action: 'Keep regular follow-ups and on-time payments going.' });

    const masters = [...new Set(firms.map(f => f.master))].map(ms => {
      const fs = firms.filter(f => f.master === ms);
      return { master: ms, firms: fs.length, outstanding: fs.reduce((t, f) => t + f.outstanding, 0), dueNow: fs.reduce((t, f) => t + f.dueNow, 0),
        openComplaints: fs.reduce((t, f) => t + f.openComplaints, 0), openTickets: fs.reduce((t, f) => t + f.openTickets, 0),
        score: Math.round(fs.reduce((t, f) => t + f.score.total, 0) / fs.length) };
    }).sort((a, b) => b.outstanding - a.outstanding);

    return {
      today: isoDate(today), firms, masters,
      combined: {
        outstanding: totalOut, dueNow: sum('dueNow'), upcoming: sum('upcoming'), credit: sum('credit'), billCount: sum('billCount'),
        aging, months, oldestMonth, oldestMonthBills, oldestDueDays,
        lockedFirms: firms.filter(f => f.locked).length,
        paid90: sum('paid90'), lastPayment,
        followupCount, followups30: sum('followups30'), onTime, late,
        onTimePct: onTime + late ? Math.round((onTime / (onTime + late)) * 100) : null, fuMonths,
        openTickets: sum('openTickets'), tickets: firms.reduce((t, f) => t + f.tickets.length, 0),
        openComplaints: sum('openComplaints'), complaints: firms.reduce((t, f) => t + f.complaints.length, 0),
        brokenPtps90: sum('brokenPtps90'), fmsOverdue: sum('fmsOverdue'), visits: sum('visits'),
        score: { total, grade: gradeOf(total), parts }, notes
      }
    };
  }

  const api = { AGE_BUCKETS, gradeOf, groupKeyOf, groupParties, firmStats, scoreFirm, firmNotes, groupReport, partyPayments, dayDiff, monthLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PartyHealth = api;
})(typeof window !== 'undefined' ? window : globalThis);
