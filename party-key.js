// CollectIQ party identity.
// A party (Marka) row is identified by its name AND its Master: the same
// party under two Masters is two separate rows, each with its own bills,
// Followper and CRR. Pure functions, no DOM - shared by app.js, the import,
// cloud sync and the tests.
(function (root) {
  const UNASSIGNED_MASTER = 'Unassigned Master';

  function norm(v) {
    return String(v == null ? '' : v).trim().toUpperCase();
  }

  function normMaster(master) {
    return norm(master) || norm(UNASSIGNED_MASTER);
  }

  function partyKey(marka, master) {
    return norm(marka) + '||' + normMaster(master);
  }

  function keyOf(m) {
    return m ? partyKey(m.marka, m.master) : '';
  }

  function findPartyRow(list, marka, master) {
    const key = partyKey(marka, master);
    return (list || []).find(m => m && m.marka && keyOf(m) === key) || null;
  }

  // Which existing row an imported (marka, master) group updates.
  // mastersInFile: every Master the file lists for this party name.
  // 1. The row with the same party + Master.
  // 2. Otherwise, if exactly one row of this party has a Master the file no
  //    longer lists, the party moved to a new Master: reuse that row so its
  //    history is kept.
  // 3. Otherwise null - the caller creates a new row.
  function resolveImportTarget(list, marka, master, mastersInFile) {
    const exact = findPartyRow(list, marka, master);
    if (exact) return exact;
    const inFile = new Set([...(mastersInFile || [])].map(normMaster));
    const name = norm(marka);
    const orphans = (list || []).filter(m => m && norm(m.marka) === name && !inFile.has(normMaster(m.master)));
    return orphans.length === 1 ? orphans[0] : null;
  }

  // Moves bills with any of billNos out of other rows of the same party
  // (other Masters) into target. Used when a merged row is split by Master,
  // so the bills move with their history instead of being cleared.
  function moveBillsFromSiblings(list, target, billNos) {
    const wanted = new Set((billNos || []).map(String).filter(Boolean));
    if (!wanted.size) return 0;
    const name = norm(target.marka);
    let moved = 0;
    (list || []).forEach(m => {
      if (!m || m === target || norm(m.marka) !== name || !Array.isArray(m.bills)) return;
      m.bills = m.bills.filter(b => {
        if (!(b.billNos || []).some(no => wanted.has(String(no)))) return true;
        if (!target.bills) target.bills = [];
        target.bills.push(b);
        moved++;
        return false;
      });
    });
    return moved;
  }

  // Does Rokad payment p belong to party row m?
  // Newer payments carry markaId; older ones are matched through the bills
  // they were allocated to, then by party + Master, then by name alone.
  function paymentBelongsTo(p, m) {
    if (!p || !m) return false;
    if (p.markaId) return String(p.markaId) === String(m.id);
    const billIds = new Set((m.bills || []).map(b => String(b.id)));
    const allocs = (p.allocations || []).filter(a => a && a.billId != null);
    if (allocs.length) return allocs.some(a => billIds.has(String(a.billId)));
    if (norm(p.marka) !== norm(m.marka)) return false;
    return !p.master || normMaster(p.master) === normMaster(m.master);
  }

  function partyForPayment(list, p) {
    return (list || []).find(m => paymentBelongsTo(p, m)) || null;
  }

  // Ticket fallback by name applies only to tickets saved without a markaId.
  function ticketBelongsTo(t, m) {
    if (!t || !m) return false;
    if (t.markaId) return String(t.markaId) === String(m.id);
    return !!t.markaName && norm(t.markaName) === norm(m.marka);
  }

  const api = { UNASSIGNED_MASTER, partyKey, keyOf, findPartyRow, resolveImportTarget, moveBillsFromSiblings, paymentBelongsTo, partyForPayment, ticketBelongsTo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PartyKey = api;
})(typeof window !== 'undefined' ? window : globalThis);
