// Reversing a payment entered by mistake (wrong party, wrong amount, entered
// twice). The bills get back exactly what the payment took from them, the
// payment's follow-up lines are removed, and one "Payment Reversed" line says
// who reversed it and why. The payment record itself is then deleted by the
// app; the database's change log keeps a full copy of it.
(function (root) {
  const ADVANCE = 'ADVANCE PAYMENT';
  const near = (a, b) => Math.abs((+a || 0) - (+b || 0)) < 0.005;

  // The party's follow-up lines written for this payment. Newer lines carry the
  // payment's ID; older ones are matched on date, reference and amount, and
  // each line is used once.
  function linesFor(m, p) {
    const hist = (m && m.history) || [];
    const picked = new Set();
    hist.forEach((h, i) => { if (h && h.paymentId != null && String(h.paymentId) === String(p.id)) picked.add(i); });
    if (picked.size) return [...picked];
    const sameDay = (h, i) => h && !picked.has(i) && h.type === 'payment' && h.paymentId == null &&
      h.date === p.date && String(h.ref || '') === String(p.ref || '');
    const allocs = p.allocations || [];
    allocs.forEach(a => {
      const i = hist.findIndex((h, j) => sameDay(h, j) && h.billId != null && String(h.billId) === String(a.billId) && near(h.amount, a.amount));
      if (i !== -1) picked.add(i);
    });
    // One line for the whole payment (entered from the follow-up form).
    if (!picked.size) {
      const i = hist.findIndex((h, j) => sameDay(h, j) && near(h.amount, p.amount));
      if (i !== -1) picked.add(i);
    }
    return [...picked];
  }

  // Checks first and changes nothing when the payment cannot be reversed
  // cleanly, e.g. its bills were replaced by a newer outstanding upload.
  function check(m, p) {
    if (!m || !p) return { error: 'Payment or party not found.' };
    const bills = m.bills || [];
    const missing = (p.allocations || []).filter(a => !bills.some(b => String(b.id) === String(a.billId)));
    if (missing.length) {
      return { error: `${missing.length} bill(s) this payment settled are no longer on the party (a newer outstanding upload may have replaced them). Correct the bills by hand instead.` };
    }
    return { ok: true };
  }

  function reverse(m, p, { today = '', by = '', reason = '', money = n => String(n) } = {}) {
    const c = check(m, p);
    if (c.error) return c;
    if (!m.history) m.history = [];
    const bills = m.bills || [];
    let restored = 0;
    (p.allocations || []).forEach(a => {
      const b = bills.find(x => String(x.id) === String(a.billId));
      b.balance = Math.round(((+b.balance || 0) + (+a.amount || 0)) * 100) / 100;
      restored += +a.amount || 0;
    });
    // An advance credit made by this payment and not used since goes away.
    m.bills = bills.filter(b => !(b.policyName === ADVANCE && near(b.balance, 0) &&
      (p.allocations || []).some(a => a.isAdvance && String(a.billId) === String(b.id))));

    const drop = new Set(linesFor(m, p));
    m.history = m.history.filter((h, i) => !drop.has(i));

    const stillDue = m.bills.reduce((s, b) => s + (+b.balance || 0), 0);
    const why = String(reason || '').trim();
    const text = `Payment of ${money(p.amount)} dated ${p.date} (${p.mode || 'Payment'} ref: ${p.ref || 'N/A'}) reversed by ${by || 'Admin'}${why ? `: ${why}` : ''}.`;
    m.history.push({ type: 'note', date: today, status: 'Payment Reversed', remark: text, followper: by, reversedPaymentId: p.id });
    m.lastStatus = 'Payment Reversed';
    m.lastDate = today;
    m.remark = stillDue > 0 ? `${text} ${money(stillDue)} due again.` : text;
    if (stillDue > 0 && !m.nextDate) m.nextDate = today;
    return { ok: true, restored, linesRemoved: drop.size, stillDue };
  }

  const api = { reverse, check, linesFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PaymentReverse = api;
})(typeof window !== 'undefined' ? window : globalThis);
