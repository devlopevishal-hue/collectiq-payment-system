// CollectIQ list filter rules shared by the pages: exact name matching, one
// status per party (same as the STATUS column) and the CRM complaint list.
// Pure functions; no DOM.
(function (root) {
  function norm(v) {
    return String(v == null ? '' : v).toLowerCase().replace(/\s+/g, ' ').trim();
  }

  // Exact name match ignoring case and spaces. "Anil" is not "Anil Sharma",
  // master "1" is not master "11".
  function sameName(a, b) {
    const x = norm(a);
    return !!x && x === norm(b);
  }

  // Followper filter: exact name. A user login is already limited to its own
  // parties (that check allows small spelling differences like "Mahavir Ji"),
  // so its own name never hides one of those parties again.
  function followperMatches(owner, filterName, user) {
    if (!filterName || filterName === 'all') return true;
    if (user && user.role === 'user' && sameName(filterName, user.followperName)) return true;
    return sameName(owner, filterName);
  }

  // One status per party: GP lock wins, then no next date (closed), then the
  // next date against today. daysPast > 0 = passed, 0 = today, < 0 = future.
  function partyStatus({ locked, nextDate, daysPast }) {
    if (locked) return 'locked';
    if (!nextDate) return 'closed';
    if (daysPast > 0) return 'overdue';
    if (daysPast === 0) return 'today';
    return 'upcoming';
  }

  // Follow-up schedule tabs: GP locked counts as Overdue, no next date as Upcoming.
  function scheduleTab(status) {
    if (status === 'locked' || status === 'overdue') return 'overdue';
    if (status === 'today') return 'due';
    return 'upcoming';
  }

  const isHelp = type => type === 'Help Ticket' || type === 'Help';
  const isComplaint = s => /claim|complaint|escalat/i.test(s);

  function historyType(status) {
    if (/whatsapp|complaint/i.test(status)) return 'WhatsApp Complaint';
    if (/escalat/i.test(status)) return 'Escalated';
    return 'Claim Matter';
  }

  // Complaints, claims and escalations for the CRM page. A complaint saved with
  // the form is stored twice (an escalation with its real status, plus a history
  // line), so a history line is listed only when no escalation of that party
  // has the same date. "... Resolved" history lines are not complaints.
  function crmItems(markas, ownerOf) {
    const rows = [];
    (markas || []).forEach(m => {
      if (!m || typeof m !== 'object') return;
      const owner = () => (ownerOf ? ownerOf(m) : '');
      const escs = (Array.isArray(m.escalations) ? m.escalations : []).filter(e => e && !isHelp(e.type));
      const escDates = new Set(escs.map(e => String(e.date || '')));
      const seen = new Set();
      escs.forEach((e, i) => {
        // The same escalation saved twice (an old double save) is listed once.
        const key = `e|${e.id || ''}|${e.date || ''}|${e.type || ''}`;
        if (seen.has(key)) return;
        seen.add(key);
        rows.push({
          id: e.id || `esc_${m.id}_${i}`,
          markaName: m.marka,
          markaId: m.id,
          date: e.date,
          type: e.type || 'Claim Matter',
          claimNumber: e.claimNumber,
          waComplaintNo: e.waComplaintNo,
          escalatedTo: e.escalatedTo,
          followper: e.followper || owner(),
          status: e.status || 'Open',
          remark: e.remark,
          resolvedDate: e.resolvedDate,
          resolutionType: e.resolutionType,
          settledAmount: e.settledAmount,
          resolutionNote: e.resolutionNote,
          resolvedBy: e.resolvedBy,
          billIds: e.billIds || [],
          billsList: m.bills || []
        });
      });
      (Array.isArray(m.history) ? m.history : []).forEach((h, i) => {
        if (!h || typeof h !== 'object') return;
        const status = String(h.status || '');
        if (!isComplaint(status) || /resolved/i.test(status)) return;
        if (escDates.has(String(h.date || ''))) return;
        const key = `h|${h.date || ''}|${status}`;
        if (seen.has(key)) return;
        seen.add(key);
        rows.push({
          id: `h_crm_${m.id}_${i}`,
          markaName: m.marka,
          markaId: m.id,
          date: h.date,
          type: historyType(status),
          claimNumber: h.claimNumber || '',
          waComplaintNo: h.waComplaintNo || '',
          escalatedTo: h.escalatedTo || 'CRM',
          followper: h.followper || owner(),
          status: 'Open',
          remark: h.remark || '',
          billIds: h.billIds || [],
          billsList: m.bills || []
        });
      });
    });
    return rows;
  }

  const api = { sameName, followperMatches, partyStatus, scheduleTab, crmItems };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ListFilters = api;
})(typeof window !== 'undefined' ? window : globalThis);
