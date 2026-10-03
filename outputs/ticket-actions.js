// CollectIQ help-ticket actions.
// Pure functions shared by the Help Ticket forms and the AI Assistant: they
// validate, then mutate the passed arrays the same way the forms always have.
// No DOM, no network, no saving - callers persist with persistTicketChange().
(function (root) {
  const PRIORITIES = ['Normal', 'High', 'Critical'];
  const RESOLUTION_TYPES = [
    'Physical Field Visit & Discussion Completed',
    'Statement Signed & Verified with Master',
    'Cheque / Payment Collected',
    'PDC / Online Payment Commitment Secured',
    'Payment / Accounts Reconciled',
    'Master Meeting Conducted',
    'Other Representative Action'
  ];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function text(v) {
    return String(v == null ? '' : v).trim();
  }

  // Same output as app.js fmt() for YYYY-MM-DD strings.
  function fmtDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? `${m[3]}-${MONTHS[Number(m[2]) - 1]}-${m[1]}` : (iso || '—');
  }

  function newId(now) {
    return 'ht_' + Number(now).toString(36) + Math.random().toString(36).substr(2, 4);
  }

  function markaFor(store, ticket) {
    const list = store.markas || [];
    return list.find(m => m.id === ticket.markaId) ||
      list.find(m => text(m.marka).toUpperCase() === text(ticket.markaName).toUpperCase() && text(ticket.markaName)) || null;
  }

  function openTicket(store, ticketId, allowResolved) {
    const t = (store.helpTickets || []).find(x => String(x.id) === String(ticketId));
    if (!t) return { error: 'Ticket not found.' };
    if (!allowResolved && text(t.status).toLowerCase() === 'resolved') return { error: 'This ticket is already resolved.' };
    return { ticket: t };
  }

  function logMarka(marka, entry) {
    if (!marka) return;
    if (!marka.history) marka.history = [];
    marka.history.push(entry);
  }

  function createTicket(store, input) {
    const subject = text(input.subject);
    const helper = text(input.assignedHelper);
    const priority = input.priority || 'Normal';
    if (!helper) return { error: 'Please select the assigned helper.' };
    if (!subject) return { error: 'Please enter ticket subject.' };
    if (!PRIORITIES.includes(priority)) return { error: `Priority must be one of: ${PRIORITIES.join(', ')}` };
    let marka = null;
    if (input.markaId) {
      marka = (store.markas || []).find(m => m.id === input.markaId) || null;
      if (!marka) return { error: 'Marka not found.' };
    }
    const remark = text(input.remark);
    const ticket = {
      id: newId(input.now),
      markaId: marka ? marka.id : '',
      markaName: marka ? marka.marka : 'General',
      date: input.date,
      requestedBy: text(input.requestedBy) || 'User',
      assignedHelper: helper,
      priority,
      subject,
      remark,
      status: 'Open',
      history: [],
      createdAt: new Date(input.now).toISOString()
    };
    store.helpTickets.unshift(ticket);
    if (marka) {
      marka.activeHelpTicketId = ticket.id;
      logMarka(marka, {
        type: 'followup',
        date: ticket.date,
        followper: ticket.requestedBy,
        status: 'Help Ticket',
        remark: `[Help Ticket: ${subject}] Assigned to: ${helper}. Note: ${remark}`
      });
    }
    return { ticket, marka };
  }

  function progressTicket(store, ticketId, { date, by, note, nextDate, logToHistory = true, allowResolved = false }) {
    const found = openTicket(store, ticketId, allowResolved);
    if (found.error) return found;
    if (!text(note)) return { error: 'Please enter the details / remarks.' };
    if (!text(nextDate)) return { error: 'Please set the next follow-up date for this in-progress ticket.' };
    const t = found.ticket;
    t.status = 'In Progress';
    t.nextDate = nextDate;
    t.remark = text(note);
    t.resolvedAt = '';
    if (!t.history) t.history = [];
    t.history.push({ date, followper: by, actionType: 'Interim Follow-up (Re-planned Next Date)', note: text(note), nextDate, status: 'In Progress' });
    const marka = markaFor(store, t);
    if (logToHistory) {
      logMarka(marka, {
        type: 'followup',
        date,
        followper: by,
        status: 'Help Ticket Progress',
        next: nextDate,
        remark: `[HELP TICKET IN-PROGRESS (Re-planned Next: ${fmtDate(nextDate)})] ${text(note)} (Followed by ${by})`
      });
    }
    return { ticket: t, marka };
  }

  function completeTicket(store, ticketId, { date, by, resolutionType, note, logToHistory = true, now, allowResolved = false }) {
    const found = openTicket(store, ticketId, allowResolved);
    if (found.error) return found;
    if (!RESOLUTION_TYPES.includes(resolutionType)) return { error: `Action must be one of: ${RESOLUTION_TYPES.join(', ')}` };
    if (!text(note)) return { error: 'Please enter the details / remarks.' };
    const t = found.ticket;
    t.status = 'Resolved';
    t.resolvedBy = by;
    t.resolutionType = resolutionType;
    t.resolutionNote = text(note);
    t.nextDate = '';
    t.resolvedAt = new Date(now).toISOString();
    if (!t.history) t.history = [];
    t.history.push({ date, followper: by, actionType: resolutionType, note: text(note), status: 'Resolved' });
    const marka = markaFor(store, t);
    if (logToHistory) {
      logMarka(marka, {
        type: 'followup',
        date,
        followper: by,
        status: 'Help Ticket Resolved',
        remark: `[REPRESENTATIVE ACTION DONE: ${resolutionType}] ${text(note)} (Assisted by ${by})`
      });
    }
    return { ticket: t, marka };
  }

  function reassignTicket(store, ticketId, { newHelper, note, by, date }) {
    const found = openTicket(store, ticketId);
    if (found.error) return found;
    const helper = text(newHelper);
    if (!helper) return { error: 'Please select the new assignee.' };
    const t = found.ticket;
    const oldHelper = t.assignedHelper || 'Previous Helper';
    if (helper === oldHelper) return { error: `Ticket is already assigned to ${helper}.` };
    const noteText = text(note) ? 'Note: ' + text(note) : '';
    t.assignedHelper = helper;
    if (!t.history) t.history = [];
    t.history.push({ date, type: 'Reassigned', note: `Reassigned from ${oldHelper} to ${helper}. ${noteText}`, by });
    const marka = markaFor(store, t);
    logMarka(marka, {
      type: 'followup',
      date,
      followper: by,
      status: 'Ticket Reassigned',
      remark: `[Ticket Reassigned] ${t.subject} transferred from ${oldHelper} to ${helper}. ${noteText}`
    });
    return { ticket: t, marka };
  }

  function canReassign(user) {
    if (!user) return false;
    return user.role === 'admin' || user.role === 'superuser' || user.email === 'devlope.vishal@gmail.com';
  }

  const api = { createTicket, progressTicket, completeTicket, reassignTicket, canReassign, PRIORITIES, RESOLUTION_TYPES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TicketActions = api;
})(typeof window !== 'undefined' ? window : globalThis);
