// CollectIQ activity log: every follow-up history entry (calls, WhatsApp,
// visits, PTPs, payments, complaints, help tickets, FMS) across parties, for
// the Daily Activity Summary. Pure functions; no DOM.
(function (root) {
  function norm(v) {
    return String(v == null ? '' : v).toLowerCase().trim();
  }

  // What kind of work a history entry was. Payment, FMS, help ticket and
  // complaint describe the outcome, so they win over the contact mode.
  function classify(h) {
    const status = norm(h.status);
    const mode = norm(h.mode);
    if (h.type === 'payment' || status.includes('payment received') || status === 'advance payment') return 'payment';
    if (status.includes('fms')) return 'fms';
    if (status.includes('help ticket') || norm(h.remark).startsWith('[help ticket')) return 'help';
    if (status.includes('complaint') || status.includes('claim') || status.includes('escalat')) return 'complaint';
    if (mode.includes('person') || mode.includes('visit')) return 'visit';
    if (mode.includes('whatsapp')) return 'whatsapp';
    if (mode.includes('email')) return 'email';
    if (mode.includes('phone') || mode.includes('call')) return 'call';
    return 'other';
  }

  // Old records keep dates as "YYYY-MM-DD…", Date objects or 20261006.
  function isoDate(v) {
    if (!v) return '';
    if (v instanceof Date) return isNaN(v) ? '' : v.toISOString().slice(0, 10);
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    return '';
  }

  const text = v => (v == null ? '' : String(v));

  // History entries in [from, to], newest first; doer = who logged it.
  // Broken old entries are skipped instead of stopping the whole list.
  function collectActivity(markas, { from = '', to = '', doer = '', search = '', ownerOf }) {
    const q = norm(search);
    const who = norm(doer);
    const rows = [];
    (markas || []).forEach(m => {
      if (!m || !Array.isArray(m.history)) return;
      m.history.forEach((h, i) => {
        if (!h || typeof h !== 'object') return;
        const date = isoDate(h.date);
        if (!date || (from && date < from) || (to && date > to)) return;
        let owner = '';
        try { owner = ownerOf ? ownerOf(m) : ''; } catch (e) { owner = ''; }
        const by = text(h.followper || owner || 'Unassigned').trim() || 'Unassigned';
        if (who && who !== 'all' && norm(by) !== who) return;
        const row = {
          key: `${m.id}:${i}`,
          markaId: m.id,
          marka: text(m.marka) || '(no name)',
          master: text(m.master),
          date,
          doer: by,
          kind: classify(h),
          status: text(h.status),
          mode: text(h.mode),
          contact: text(h.contact || h.visitPersonMet),
          remark: text(h.remark),
          ptp: norm(h.status) === 'promise to pay',
          promise: isoDate(h.promise),
          expected: Number(h.expected) || 0,
          amount: Number(h.amount) || 0,
          ref: h.ref && h.ref !== 'N/A' ? text(h.ref) : '',
          next: isoDate(h.next),
          order: i
        };
        if (q && ![row.marka, row.master, row.remark, row.contact, row.doer].some(x => norm(x).includes(q))) return;
        rows.push(row);
      });
    });
    return rows.sort((a, b) => b.date.localeCompare(a.date) || a.marka.localeCompare(b.marka) || b.order - a.order);
  }

  // Counts per doer, busiest first.
  function summarize(rows) {
    const map = {};
    (rows || []).forEach(r => {
      const s = map[r.doer] || (map[r.doer] = { doer: r.doer, calls: 0, whatsapp: 0, emails: 0, visits: 0, ptp: 0, payments: 0, paymentAmount: 0, complaints: 0, help: 0, fms: 0, total: 0 });
      s.total++;
      if (r.kind === 'call') s.calls++;
      if (r.kind === 'whatsapp') s.whatsapp++;
      if (r.kind === 'email') s.emails++;
      if (r.kind === 'visit') s.visits++;
      if (r.kind === 'payment') { s.payments++; s.paymentAmount += r.amount; }
      if (r.kind === 'complaint') s.complaints++;
      if (r.kind === 'help') s.help++;
      if (r.kind === 'fms') s.fms++;
      if (r.ptp) s.ptp++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total || a.doer.localeCompare(b.doer));
  }

  const api = { classify, collectActivity, summarize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ActivityLog = api;
})(typeof window !== 'undefined' ? window : globalThis);
