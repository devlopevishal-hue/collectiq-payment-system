// CollectIQ AI Assistant - data tools.
// Pure functions over a context object; no DOM access. The browser builds the
// context from app.js globals, tests build it from fixtures.
//
// ctx = { markas, payments, helpTickets, user: {email, role, followperName},
//         today: 'YYYY-MM-DD', h: { ownerOf, crrOf, totalOutstanding,
//         alreadyDueAmount, oldestDueDate, isLocked, getFmsTasks },
//         assignees: [names a help ticket can be assigned to] }
(function (root) {
  const MAX_ROWS = 20;

  function norm(s) {
    return String(s || '').toLowerCase().trim();
  }

  // Same loose name match the app uses in filtered(): equal, or one contains the other.
  function nameMatches(a, b) {
    const x = norm(a);
    const y = norm(b);
    return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
  }

  function dayDiff(laterIso, earlierIso) {
    if (!laterIso || !earlierIso) return 0;
    const ms = Date.parse(laterIso + 'T00:00:00Z') - Date.parse(earlierIso + 'T00:00:00Z');
    return Math.round(ms / 86400000);
  }

  function role(ctx) {
    return norm(ctx.user && ctx.user.role);
  }

  function seesEverything(ctx) {
    const r = role(ctx);
    if (r === 'user') return false;
    if (r === 'crr') {
      const name = norm(ctx.user.followperName);
      return name.includes('mahendra') || name === 'all' || norm(ctx.user.email).includes('mahendra');
    }
    return true;
  }

  // includeSettled: also keep parties with zero/negative balance (needed for
  // payment history, where a fully paid party still counts).
  function scopeMarkas(ctx, opts = {}) {
    const all = ctx.markas || [];
    const active = opts.includeSettled ? all : all.filter(m => ctx.h.totalOutstanding(m) > 0);
    if (seesEverything(ctx)) return active;
    const name = norm(ctx.user.followperName);
    if (!name || name === 'all' || name === 'unassigned') return [];
    const pick = role(ctx) === 'crr' ? ctx.h.crrOf : ctx.h.ownerOf;
    return active.filter(m => nameMatches(pick(m), name));
  }

  function findParty(ctx, name) {
    const q = norm(name);
    if (!q) return { error: 'No party name given.' };
    const all = ctx.markas || [];
    const exact = all.find(m => norm(m.marka) === q);
    if (exact) return { marka: exact };
    const partial = all.filter(m => norm(m.marka).includes(q));
    if (partial.length === 1) return { marka: partial[0] };
    if (partial.length > 1) return { candidates: partial.slice(0, 10).map(m => m.marka) };
    return { error: `No party named "${name}" was found.` };
  }

  function summaryRow(ctx, m) {
    const h = ctx.h;
    const oldest = h.oldestDueDate(m);
    return {
      marka: m.marka,
      master: m.master,
      owner: h.ownerOf(m),
      outstanding: h.totalOutstanding(m),
      alreadyDue: h.alreadyDueAmount(m),
      daysOverdue: m.nextDate && m.nextDate < ctx.today ? dayDiff(ctx.today, m.nextDate) : 0,
      daysPastDue: oldest && oldest < ctx.today ? dayDiff(ctx.today, oldest) : 0,
      nextDate: m.nextDate || '',
      gpLocked: !!h.isLocked(m),
      lastStatus: m.lastStatus || '',
      remark: m.remark || ''
    };
  }

  // rank tells the model the order to keep (models sometimes skip rows otherwise).
  function limited(rows) {
    return { total: rows.length, rows: rows.slice(0, MAX_ROWS).map((r, i) => ({ rank: i + 1, ...r })) };
  }

  const tools = {
    get_today_followups(ctx, args = {}) {
      const includeOverdue = args.include_overdue !== false;
      const list = scopeMarkas(ctx).filter(m => {
        if (!includeOverdue) return m.nextDate === ctx.today;
        return (m.nextDate && m.nextDate <= ctx.today) || ctx.h.isLocked(m);
      });
      const rows = list.map(m => summaryRow(ctx, m)).sort((a, b) => b.alreadyDue - a.alreadyDue);
      return limited(rows);
    },

    get_party_details(ctx, args = {}) {
      const found = findParty(ctx, args.name);
      if (!found.marka) return found;
      const m = found.marka;
      const h = ctx.h;
      const active = (m.bills || []).filter(b => b.balance > 0);
      const due = b => b.policyDate || b.firstDate || '';
      const bills = active.slice().sort((a, b) => due(a).localeCompare(due(b))).slice(0, 10).map(b => ({
        billNos: (b.billNos || []).join(', '),
        firstDate: b.firstDate,
        policyDate: due(b),
        balance: b.balance
      }));
      const recentHistory = (m.history || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5).map(x => ({
        date: x.date, status: x.status || x.type, mode: x.mode || '', followper: x.followper || '',
        promise: x.promise || '', expected: x.expected || 0, amount: x.amount || 0, remark: x.remark || ''
      }));
      const openEscalations = (m.escalations || []).filter(e => norm(e.status || 'open') === 'open').map(e => ({
        date: e.date, type: e.type, ref: e.claimNumber || e.waComplaintNo || '', escalatedTo: e.escalatedTo || '', remark: e.remark || ''
      }));
      const openHelpTickets = (ctx.helpTickets || []).filter(t =>
        (t.markaId === m.id || norm(t.markaName) === norm(m.marka)) && norm(t.status || 'open') !== 'resolved'
      ).map(t => ({ date: t.date, subject: t.subject, assignedHelper: t.assignedHelper, status: t.status || 'Open', nextDate: t.nextDate || '' }));
      return {
        marka: m.marka,
        master: m.master,
        owner: h.ownerOf(m),
        crr: h.crrOf(m),
        outstanding: h.totalOutstanding(m),
        alreadyDue: h.alreadyDueAmount(m),
        oldestDue: h.oldestDueDate(m),
        gpLocked: !!h.isLocked(m),
        nextDate: m.nextDate || '',
        lastStatus: m.lastStatus || '',
        ptp: m.ptp || '',
        activeBillCount: active.length,
        bills,
        recentHistory,
        openEscalations,
        openHelpTickets
      };
    },

    search_parties(ctx, args = {}) {
      const rows = scopeMarkas(ctx).map(m => summaryRow(ctx, m)).filter(r => {
        if (args.master && !nameMatches(r.master, args.master)) return false;
        if (args.owner && !nameMatches(r.owner, args.owner)) return false;
        if (args.min_outstanding != null && r.outstanding < Number(args.min_outstanding)) return false;
        if (args.min_days_overdue != null && r.daysPastDue < Number(args.min_days_overdue)) return false;
        if (args.gp_locked === true && !r.gpLocked) return false;
        return true;
      }).sort((a, b) => b.outstanding - a.outstanding);
      return limited(rows);
    }
  };

  const FORM_STATUSES = ['Payment Received', 'Promise to Pay', 'WhatsApp Complaint / Claim Matter', 'Internal Help Ticket'];
  const FORM_MODES = ['Phone call', 'WhatsApp', 'Email', 'In person (Field Visit)'];
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  function addDays(iso, n) {
    const d = new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000);
    return d.toISOString().slice(0, 10);
  }

  function isPcOrAdmin(ctx) {
    return ['admin', 'superuser', 'pc'].includes(role(ctx));
  }

  function paymentDatesFor(ctx, m) {
    const key = norm(m.marka);
    const fromRokad = (ctx.payments || []).filter(p => norm(p.marka) === key).map(p => p.date);
    const fromHistory = (m.history || []).filter(x => x.type === 'payment').map(x => x.date);
    return fromRokad.concat(fromHistory).filter(Boolean);
  }

  function paymentsInRange(ctx, from, to) {
    const scoped = new Map(scopeMarkas(ctx, { includeSettled: true }).map(m => [norm(m.marka), m]));
    const everything = seesEverything(ctx);
    return (ctx.payments || []).filter(p => p.date >= from && p.date <= to).map(p => {
      const m = scoped.get(norm(p.marka));
      if (!m && !everything) return null;
      return { p, owner: m ? ctx.h.ownerOf(m) : 'Unassigned' };
    }).filter(Boolean);
  }

  // Mirrors analysis() in app.js: same counters, same overall score formula.
  function doerScores(ctx) {
    const h = ctx.h;
    const blank = () => ({ calls: 0, visits: 0, wa: 0, ptp: 0, ptpAmount: 0, fmsOnTime: 0, fmsDelayed: 0, helpResolved: 0, helpFollowups: 0, crmResolved: 0, collected: 0, overdue: 0, balance: 0, markaCount: 0 });
    const stats = {};
    scopeMarkas(ctx).forEach(m => {
      const owner = h.ownerOf(m);
      const s = stats[owner] || (stats[owner] = blank());
      s.balance += h.totalOutstanding(m);
      s.markaCount++;
      if (m.nextDate && m.nextDate < ctx.today) s.overdue++;
      (h.getFmsTasks(m) || []).forEach(t => {
        if (!t.isDone) return;
        if (t.score === 1.0) s.fmsOnTime++; else s.fmsDelayed++;
      });
      (m.history || []).forEach(x => {
        if (x.type === 'followup') {
          const mode = norm(x.mode);
          if (mode.includes('person') || mode.includes('visit')) s.visits++;
          else if (mode.includes('whatsapp')) s.wa++;
          else s.calls++;
          if (x.status === 'Promise to Pay') { s.ptp++; s.ptpAmount += (x.expected || 0); }
        } else if (x.type === 'payment') {
          s.collected += (x.amount || 0);
        }
      });
    });
    (ctx.helpTickets || []).forEach(t => {
      const doer = t.resolvedBy || t.assignedHelper;
      if (doer && stats[doer] && norm(t.status) === 'resolved') stats[doer].helpResolved++;
      (t.history || []).forEach(x => {
        if (x.followper && stats[x.followper] && x.actionType === 'Interim Follow-up') stats[x.followper].helpFollowups++;
      });
    });
    (ctx.markas || []).forEach(m => (m.escalations || []).forEach(e => {
      const doer = e.resolvedBy || e.escalatedTo || e.followper;
      if (norm(e.status) === 'resolved' && doer && stats[doer]) stats[doer].crmResolved++;
    }));
    return Object.keys(stats).map(name => {
      const s = stats[name];
      const score = Math.round(
        s.calls * 5 + s.visits * 15 + s.wa * 5 + s.ptp * 10 + s.fmsOnTime * 20 + s.fmsDelayed * 10 +
        s.helpResolved * 15 + s.helpFollowups * 5 + s.crmResolved * 15 + Math.round(s.collected / 10000) - s.overdue * 5
      );
      return { name, ...s, score };
    }).sort((a, b) => b.score - a.score).map((r, i) => ({ rank: i + 1, ...r }));
  }

  Object.assign(tools, {
    get_broken_ptps(ctx) {
      const rows = scopeMarkas(ctx).filter(m => {
        if (!m.ptp || !ISO_DATE.test(m.ptp) || m.ptp >= ctx.today) return false;
        const since = m.lastDate || m.ptp;
        return !paymentDatesFor(ctx, m).some(d => d >= since);
      }).map(m => ({
        ...summaryRow(ctx, m),
        ptp: m.ptp,
        expected: m.expected || 0,
        daysSincePtp: dayDiff(ctx.today, m.ptp)
      })).sort((a, b) => b.alreadyDue - a.alreadyDue);
      return limited(rows);
    },

    get_collections(ctx, args = {}) {
      const from = ISO_DATE.test(args.from || '') ? args.from : ctx.today;
      const to = ISO_DATE.test(args.to || '') ? args.to : from;
      const list = paymentsInRange(ctx, from, to);
      const byDoer = {};
      list.forEach(({ p, owner }) => {
        const d = byDoer[owner] || (byDoer[owner] = { name: owner, amount: 0, count: 0 });
        d.amount += p.amount || 0;
        d.count++;
      });
      return {
        from, to,
        totalReceived: list.reduce((s, x) => s + (x.p.amount || 0), 0),
        count: list.length,
        byDoer: Object.values(byDoer).sort((a, b) => b.amount - a.amount),
        receipts: list.map(x => x.p).sort((a, b) => (b.amount || 0) - (a.amount || 0)).slice(0, 10)
          .map(p => ({ date: p.date, marka: p.marka, amount: p.amount, mode: p.mode || '', ref: p.ref || '' }))
      };
    },

    get_doer_performance(ctx, args = {}) {
      let rows = doerScores(ctx);
      if (role(ctx) === 'user') rows = rows.filter(r => nameMatches(r.name, ctx.user.followperName));
      else if (args.name) rows = rows.filter(r => nameMatches(r.name, args.name));
      return limited(rows);
    },

    get_pending_work(ctx) {
      const me = ctx.user.followperName;
      const myTickets = (ctx.helpTickets || []).filter(t =>
        nameMatches(t.assignedHelper, me) && norm(t.status || 'open') !== 'resolved'
      ).map(t => ({ id: t.id, date: t.date, marka: t.markaName, subject: t.subject, priority: t.priority || 'Normal', status: t.status || 'Open', nextDate: t.nextDate || '', requestedBy: t.requestedBy || '' }));
      let fms = null;
      if (isPcOrAdmin(ctx)) {
        const open = [];
        scopeMarkas(ctx).forEach(m => (ctx.h.getFmsTasks(m) || []).forEach(t => {
          if (!t.isDone) open.push({ marka: m.marka, code: t.code, name: t.name || '', role: t.role || '', plannedDate: t.plannedDate, status: t.status });
        }));
        const overdue = open.filter(t => t.status === 'Overdue').sort((a, b) => (a.plannedDate || '').localeCompare(b.plannedDate || ''));
        fms = { pending: open.length, overdue: overdue.length, rows: overdue.slice(0, MAX_ROWS) };
      }
      return { myTickets, fms };
    },

    prepare_followup_form(ctx, args = {}) {
      const found = findParty(ctx, args.party);
      if (!found.marka) return found;
      if (!FORM_STATUSES.includes(args.status)) {
        return { error: `Status must be one of: ${FORM_STATUSES.join(', ')}` };
      }
      const mode = args.contact_mode || 'Phone call';
      if (!FORM_MODES.includes(mode)) return { error: `Contact mode must be one of: ${FORM_MODES.join(', ')}` };
      const promiseDate = args.promise_date || '';
      if (promiseDate && !ISO_DATE.test(promiseDate)) return { error: 'promise_date must be in YYYY-MM-DD format.' };
      if (args.status === 'Promise to Pay' && !promiseDate) return { error: 'A promise date is required for Promise to Pay.' };
      const nextDate = args.next_date || (args.status === 'Promise to Pay' ? promiseDate : '');
      if (nextDate && !ISO_DATE.test(nextDate)) return { error: 'next_date must be in YYYY-MM-DD format.' };
      const expected = Number(args.expected || 0);
      if (!Number.isFinite(expected) || expected < 0) return { error: 'expected must be a valid amount.' };
      return {
        ok: true,
        action: {
          type: 'open_followup', markaId: found.marka.id, marka: found.marka.marka,
          fields: { contactMode: mode, actionStatus: args.status, expected, promiseDate, nextDate, remark: String(args.remark || '') }
        }
      };
    }
  });

  // ---- Help tickets ----
  const TA = (typeof module !== 'undefined' && module.exports) ? require('./ticket-actions.js') : root.TicketActions;
  const TICKET_TITLES = { create: '🎫 New ticket', progress: '⏳ In progress', done: '✅ Done', reassign: '🔁 Reassign' };

  function isResolved(t) {
    return norm(t.status) === 'resolved';
  }

  function ticketMarka(ctx, t) {
    return (ctx.markas || []).find(m => m.id === t.markaId) ||
      (ctx.markas || []).find(m => norm(m.marka) === norm(t.markaName)) || null;
  }

  function markaLabel(m) {
    if (!m) return 'General';
    return m.master ? `${m.marka} (${m.master})` : m.marka;
  }

  function newestFirst(a, b) {
    return (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '');
  }

  // Exact (case-insensitive) assignee, else one close name as a suggestion.
  function matchHelper(ctx, input) {
    const q = norm(input);
    if (!q) return { error: 'Tell me who the ticket should be assigned to.' };
    const list = ctx.assignees || [];
    const exact = list.find(n => norm(n) === q);
    if (exact) return { name: exact };
    const close = list.filter(n => norm(n).startsWith(q.slice(0, 4)) || norm(n).includes(q));
    const error = `"${input}" is not in the assignee list.`;
    return close.length === 1 ? { error: `${error} Did you mean "${close[0]}"?`, suggestion: close[0] } : { error };
  }

  function pickOpenTicket(ctx, args) {
    const all = ctx.helpTickets || [];
    if (args.ticket_id) {
      const t = all.find(x => String(x.id) === String(args.ticket_id));
      if (!t) return { error: 'Ticket not found.' };
      if (isResolved(t)) return { error: 'This ticket is already resolved.' };
      return { ticket: t };
    }
    if (!args.marka) return { error: 'Tell me which ticket: give the party (marka) or the ticket id from find_tickets.' };
    const found = findParty(ctx, args.marka);
    if (!found.marka) return found;
    const m = found.marka;
    const open = all.filter(t => (t.markaId === m.id || norm(t.markaName) === norm(m.marka)) && !isResolved(t)).sort(newestFirst);
    if (!open.length) return { error: `${m.marka} has no open help ticket.` };
    if (open.length > 1) return { candidates: open.slice(0, 10).map(t => ({ id: t.id, subject: t.subject })) };
    return { ticket: open[0] };
  }

  function card(op, payload, rows) {
    return { ok: true, action: { type: 'ticket', op, payload, preview: { title: TICKET_TITLES[op], rows } } };
  }

  Object.assign(tools, {
    find_tickets(ctx, args = {}) {
      const me = ctx.user && ctx.user.followperName;
      const rows = (ctx.helpTickets || []).filter(t => {
        if (args.status !== 'all' && isResolved(t)) return false;
        if (args.marka && !norm(t.markaName).includes(norm(args.marka))) return false;
        if (args.mine && ![t.requestedBy, t.assignedHelper, t.resolvedBy].some(n => nameMatches(n, me))) return false;
        return true;
      }).sort(newestFirst).map(t => ({
        id: t.id, marka: t.markaName || 'General', subject: t.subject || '', assignedHelper: t.assignedHelper || '',
        requestedBy: t.requestedBy || '', priority: t.priority || 'Normal', status: t.status || 'Open',
        nextDate: t.nextDate || '', date: t.date || ''
      }));
      return limited(rows);
    },

    prepare_ticket_action(ctx, args = {}) {
      const op = args.op;
      const note = String(args.note || '').trim();
      if (op === 'create') {
        let m = null;
        if (args.marka) {
          const found = findParty(ctx, args.marka);
          if (!found.marka) return found;
          m = found.marka;
        }
        const helper = matchHelper(ctx, args.helper);
        if (helper.error) return helper;
        const subject = String(args.subject || '').trim();
        if (!subject) return { error: 'A ticket subject is required.' };
        const priority = args.priority || 'Normal';
        if (!TA.PRIORITIES.includes(priority)) return { error: `Priority must be one of: ${TA.PRIORITIES.join(', ')}` };
        const rows = [['Marka', markaLabel(m)], ['Assign to', helper.name], ['Priority', priority], ['Subject', subject]];
        if (note) rows.push(['Note', note]);
        return card('create', { markaId: m ? m.id : '', markaName: m ? m.marka : 'General', assignedHelper: helper.name, priority, subject, remark: note }, rows);
      }
      if (!TICKET_TITLES[op]) return { error: 'op must be one of: create, progress, done, reassign' };
      if (op === 'reassign' && !TA.canReassign(ctx.user)) return { error: 'Only an admin or superuser can reassign tickets.' };
      const picked = pickOpenTicket(ctx, args);
      if (!picked.ticket) return picked;
      const t = picked.ticket;
      const head = [['Ticket', t.subject || t.id], ['Marka', markaLabel(ticketMarka(ctx, t))]];
      if (op === 'progress') {
        if (!note) return { error: 'A note about what happened is required.' };
        const nextDate = args.next_date || '';
        if (!ISO_DATE.test(nextDate)) return { error: 'next_date is required in YYYY-MM-DD format.' };
        if (nextDate < ctx.today) return { error: 'next_date cannot be in the past.' };
        return card('progress', { ticketId: t.id, note, nextDate }, head.concat([['Note', note], ['Next date', nextDate]]));
      }
      if (op === 'done') {
        const resolutionType = args.resolution_type || 'Other Representative Action';
        if (!TA.RESOLUTION_TYPES.includes(resolutionType)) return { error: `resolution_type must be one of: ${TA.RESOLUTION_TYPES.join(', ')}` };
        if (!note) return { error: 'A note about what was done is required.' };
        return card('done', { ticketId: t.id, resolutionType, note }, head.concat([['Action', resolutionType], ['Note', note]]));
      }
      const helper = matchHelper(ctx, args.helper);
      if (helper.error) return helper;
      if (helper.name === t.assignedHelper) return { error: `This ticket is already assigned to ${helper.name}.` };
      const rows = head.concat([['From', t.assignedHelper || '—'], ['To', helper.name]]);
      if (note) rows.push(['Note', note]);
      return card('reassign', { ticketId: t.id, newHelper: helper.name, note }, rows);
    }
  });

  function trimResult(obj, opts = {}) {
    const maxRows = opts.maxRows || MAX_ROWS;
    const maxChars = opts.maxChars || 3000;
    if (!obj || typeof obj !== 'object') return obj;
    const out = JSON.parse(JSON.stringify(obj));
    const arrays = [];
    (function collect(node, depth) {
      if (!node || typeof node !== 'object' || depth > 2) return;
      Object.keys(node).forEach(k => {
        if (Array.isArray(node[k])) {
          if (node[k].length > maxRows) { node[k] = node[k].slice(0, maxRows); out.truncated = true; }
          arrays.push({ node, k });
        }
        collect(node[k], depth + 1);
      });
    })(out, 0);
    const size = () => JSON.stringify(out).length;
    while (size() > maxChars) {
      const longest = arrays.filter(a => a.node[a.k].length > 1).sort((a, b) => b.node[b.k].length - a.node[a.k].length)[0];
      if (!longest) break;
      longest.node[longest.k] = longest.node[longest.k].slice(0, Math.ceil(longest.node[longest.k].length / 2));
      out.truncated = true;
    }
    if (size() > maxChars) {
      (function shorten(node) {
        if (!node || typeof node !== 'object') return;
        Object.keys(node).forEach(k => {
          if (typeof node[k] === 'string' && node[k].length > 120) node[k] = node[k].slice(0, 120) + '…';
          else shorten(node[k]);
        });
      })(out);
      out.truncated = true;
    }
    return out;
  }

  // Models mis-group long Indian amounts, so money goes out pre-formatted.
  const MONEY_KEYS = new Set(['outstanding', 'alreadyDue', 'balance', 'collected', 'amount', 'totalReceived', 'expected', 'ptpAmount', 'collectedYesterday', 'collectedToday']);
  const INR = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

  function formatMoney(node) {
    if (Array.isArray(node)) return node.map(formatMoney);
    if (!node || typeof node !== 'object') return node;
    const out = {};
    Object.keys(node).forEach(k => {
      const v = node[k];
      out[k] = MONEY_KEYS.has(k) && typeof v === 'number'
        ? (v < 0 ? '-₹' : '₹') + INR.format(Math.abs(Math.round(v)))
        : formatMoney(v);
    });
    return out;
  }

  function runTool(ctx, name, argsJson) {
    try {
      if (!Object.prototype.hasOwnProperty.call(tools, name)) return { error: `Unknown tool: ${name}` };
      let args = {};
      if (argsJson && String(argsJson).trim()) {
        try { args = JSON.parse(argsJson); } catch (e) { return { error: 'Tool arguments are not valid JSON.' }; }
      }
      if (!args || typeof args !== 'object' || Array.isArray(args)) return { error: 'Tool arguments must be an object.' };
      return trimResult(formatMoney(tools[name](ctx, args)));
    } catch (e) {
      return { error: 'Tool failed: ' + (e && e.message ? e.message : String(e)) };
    }
  }

  function computeMorningSummary(ctx) {
    const follow = tools.get_today_followups(ctx, {});
    const sumRange = d => paymentsInRange(ctx, d, d).reduce((s, x) => s + (x.p.amount || 0), 0);
    const pending = tools.get_pending_work(ctx);
    return {
      date: ctx.today,
      followupsToday: follow.total,
      top5: follow.rows.slice(0, 5),
      brokenPtps: tools.get_broken_ptps(ctx).total,
      collectedYesterday: sumRange(addDays(ctx.today, -1)),
      collectedToday: sumRange(ctx.today),
      openTicketsForMe: pending.myTickets.length,
      pendingFms: pending.fms ? pending.fms.pending : null
    };
  }

  const api = { scopeMarkas, findParty, tools, doerScores, runTool, trimResult, formatMoney, computeMorningSummary, nameMatches, dayDiff, FORM_STATUSES, FORM_MODES, MAX_ROWS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CollectIQAITools = api;
})(typeof window !== 'undefined' ? window : globalThis);
