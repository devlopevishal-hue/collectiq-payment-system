// CollectIQ daily payments bulk upload: reads the "Sales Payment Performance
// Report" sheet (Party, Party Marka, Policy, Bill Amount, Disc/RD/Claim/TDS
// Amount, Paid Amount, Days, Master), matches each row to a party and settles
// its bills oldest first, same as Record Payment.
// Pure functions; no DOM.
(function (root) {
  const COLUMNS = {
    party: ['party', 'partyname'],
    marka: ['partymarka', 'marka', 'markagroup', 'markaname'],
    policy: ['policy', 'policyname'],
    billAmount: ['billamount', 'billamt'],
    disc: ['discamount', 'discount', 'disc', 'discamt'],
    rd: ['rdamount', 'rd', 'rdamt'],
    claim: ['claimamount', 'claim', 'claimamt'],
    tds: ['tdsamount', 'tds', 'tdsamt'],
    paid: ['paidamount', 'paid', 'receivedamount', 'amount'],
    days: ['days'],
    master: ['master', 'mastername'],
    date: ['date', 'paymentdate', 'receiveddate', 'paydate'],
    ref: ['ref', 'refno', 'utr', 'chequeno', 'chqno']
  };

  function cleanHeader(h) {
    return String(h == null ? '' : h).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function normKey(v) {
    return String(v == null ? '' : v).toUpperCase().replace(/\s+/g, ' ').trim();
  }

  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    const n = parseFloat(String(v == null ? '' : v).replace(/[₹,\s'"]/g, ''));
    return isNaN(n) ? 0 : n;
  }

  // "2026-10-28", "28/10/2026", "28-10-26", a Date or an Excel serial number.
  function toIso(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return '';
      const p = n => String(n).padStart(2, '0');
      return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (m) {
      const y = m[3].length === 2 ? '20' + m[3] : m[3];
      return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
    if (/^\d{5}$/.test(s)) {
      const d = new Date(Date.UTC(1899, 11, 30) + (+s) * 86400000);
      return d.toISOString().slice(0, 10);
    }
    return '';
  }

  // Rows of the sheet (first row with "Party Marka"/"Marka" and "Paid" is the
  // header). Total and blank rows have no marka and are left out.
  function parseGrid(grid) {
    const rows = Array.isArray(grid) ? grid : [];
    let headerIdx = -1;
    for (let i = 0; i < Math.min(20, rows.length); i++) {
      const cells = (rows[i] || []).map(cleanHeader);
      if (cells.some(c => COLUMNS.marka.includes(c)) && cells.some(c => COLUMNS.paid.includes(c))) { headerIdx = i; break; }
    }
    if (headerIdx === -1) return { error: 'Header row not found. The sheet needs "Party Marka" and "Paid Amount" columns.', rows: [] };

    const headers = rows[headerIdx].map(cleanHeader);
    const col = {};
    Object.entries(COLUMNS).forEach(([field, names]) => {
      for (const name of names) {
        const i = headers.indexOf(name);
        if (i !== -1) { col[field] = i; break; }
      }
    });
    const cell = (line, field) => (col[field] === undefined ? '' : line[col[field]]);

    const out = [];
    for (let r = headerIdx + 1; r < rows.length; r++) {
      const line = rows[r] || [];
      const marka = normKey(cell(line, 'marka'));
      if (!marka) continue;
      const row = {
        rowNo: r + 1,
        party: String(cell(line, 'party') || '').trim(),
        marka,
        master: normKey(cell(line, 'master')),
        policy: String(cell(line, 'policy') || '').trim(),
        billAmount: num(cell(line, 'billAmount')),
        disc: num(cell(line, 'disc')),
        rd: num(cell(line, 'rd')),
        claim: num(cell(line, 'claim')),
        tds: num(cell(line, 'tds')),
        paid: num(cell(line, 'paid')),
        days: num(cell(line, 'days')),
        date: toIso(cell(line, 'date')),
        ref: String(cell(line, 'ref') || '').trim()
      };
      row.deductions = row.disc + row.rd + row.claim + row.tds;
      out.push(row);
    }
    return { error: '', rows: out };
  }

  function keyOf(m) {
    return `${normKey(m.master)}|${normKey(m.marka)}`;
  }

  // Master + marka first; by marka alone only when that name is one party.
  function findParty(list, marka, master) {
    const items = (list || []).filter(Boolean);
    if (master) {
      const exact = items.find(m => keyOf(m) === `${normKey(master)}|${normKey(marka)}`);
      if (exact) return exact;
    }
    const hits = items.filter(m => normKey(m.marka) === normKey(marka));
    return hits.length === 1 ? hits[0] : null;
  }

  // Same party, date and amount already saved: the file was uploaded before.
  function alreadySaved(payments, m, date, paid) {
    return (payments || []).some(p => p && String(p.markaId) === String(m.id) && p.date === date && Math.round(+p.amount || 0) === Math.round(paid));
  }

  // What each row will do. status: ready | notFound | noAmount | duplicate
  function plan(rows, { markas = [], payments = [], date = '' } = {}) {
    const seen = new Set();
    return (rows || []).map(row => {
      const payDate = row.date || date;
      const settle = row.paid + row.deductions;
      const m = findParty(markas, row.marka, row.master);
      let status = 'ready';
      let note = '';
      if (!m) { status = 'notFound'; note = 'Party not found in CollectIQ'; }
      else if (row.paid <= 0 && settle <= 0) { status = 'noAmount'; note = 'No paid amount'; }
      else {
        const key = `${m.id}|${payDate}|${Math.round(row.paid)}`;
        if (seen.has(key) || alreadySaved(payments, m, payDate, row.paid)) { status = 'duplicate'; note = 'Already saved for this date'; }
        seen.add(key);
      }
      const outstanding = m ? (m.bills || []).reduce((s, b) => s + (b.balance || 0), 0) : 0;
      return { row, party: m, markaId: m ? m.id : null, date: payDate, settle, outstanding, status, note };
    });
  }

  // Settle one planned row on its party (oldest bill first) and return the
  // payment record. Paid amount is the money received; deductions (disc, RD,
  // claim, TDS) also clear the bills. Anything above the dues is advance.
  function apply(item, { mode = 'RTGS', ref = '', today = '', uid, money = n => String(n), fileName = '', nextDateFor = null } = {}) {
    const m = item.party;
    const row = item.row;
    const date = item.date;
    const payRef = row.ref || ref || 'N/A';
    let remaining = item.settle;
    const allocations = [];
    // The payment's ID is on each of its follow-up lines, so it can be reversed.
    const paymentId = uid();
    if (!m.bills) m.bills = [];
    if (!m.history) m.history = [];

    const bills = m.bills.filter(b => b.balance > 0).sort((a, b) => String(a.firstDate).localeCompare(String(b.firstDate)));
    for (const b of bills) {
      if (remaining <= 0) break;
      const amt = Math.min(remaining, b.balance);
      remaining -= amt;
      b.balance = Math.max(0, b.balance - amt);
      allocations.push({ billId: b.id, amount: amt, settled: b.balance <= 0, isAdvance: false });
      m.history.push({
        type: 'payment',
        date,
        status: b.balance === 0 ? 'Payment Received' : 'Part Payment',
        remark: `Payment of ${money(amt)} settled from daily payment upload (${mode} ref: ${payRef}) on bill ${b.firstDate}.`,
        amount: amt,
        ref: payRef,
        billId: b.id,
        paymentId
      });
    }

    if (remaining > 0) {
      const advId = 'adv_' + uid();
      m.bills.push({
        id: advId,
        firstDate: date,
        balance: -remaining,
        sourceAmount: -remaining,
        billCount: 1,
        billNos: [payRef !== 'N/A' ? `ADV/${payRef}` : `ADV/${String(Date.now()).slice(-4)}`],
        policyDate: date,
        policyName: 'ADVANCE PAYMENT'
      });
      allocations.push({ billId: advId, amount: remaining, settled: true, isAdvance: true });
      m.history.push({
        type: 'payment',
        date,
        status: 'Advance Payment',
        remark: `Advance payment credit of ${money(remaining)} recorded from daily payment upload (${mode} ref: ${payRef}).`,
        amount: remaining,
        ref: payRef,
        billId: advId,
        paymentId
      });
    }

    const stillDue = m.bills.reduce((s, b) => s + (b.balance || 0), 0);
    const dedText = row.deductions > 0 ? ` (+ ${money(row.deductions)} deductions)` : '';
    if (stillDue > 0) {
      // Same next date as Record Payment (the app passes its due-date rule); +2 days otherwise.
      if (nextDateFor) m.nextDate = nextDateFor(m);
      else {
        const next = new Date((today || date) + 'T00:00:00');
        next.setDate(next.getDate() + 2);
        const p = n => String(n).padStart(2, '0');
        m.nextDate = `${next.getFullYear()}-${p(next.getMonth() + 1)}-${p(next.getDate())}`;
      }
      m.remark = `Payment ${money(row.paid)}${dedText} received; ${money(stillDue)} still due. Next follow-up ${m.nextDate}.`;
      m.lastStatus = 'Payment Received';
    } else if (stillDue < 0) {
      m.nextDate = '';
      m.remark = `Payment ${money(row.paid)}${dedText} received. Advance balance: ${money(Math.abs(stillDue))}. Follow-up closed.`;
      m.lastStatus = 'Advance Payment';
    } else {
      m.nextDate = '';
      m.remark = 'All dues cleared. Follow-up closed.';
      m.lastStatus = 'Payment Received';
    }
    m.lastDate = date;

    return {
      id: paymentId,
      date,
      ref: payRef,
      mode,
      amount: row.paid,
      marka: m.marka,
      markaId: m.id,
      master: m.master || '',
      receiptImage: '',
      source: 'bulk-upload',
      fileName,
      policy: row.policy,
      billAmount: row.billAmount,
      deductions: { disc: row.disc, rd: row.rd, claim: row.claim, tds: row.tds },
      days: row.days,
      allocations
    };
  }

  // Header row of the blank format the users fill in.
  const TEMPLATE_HEADERS = ['Party', 'Party Marka', 'Policy', 'Bill Amount', 'Disc Amount', 'RD Amount', 'Claim Amount', 'TDS Amount', 'Paid Amount', 'Days', 'Master'];

  const api = { parseGrid, plan, apply, findParty, toIso, num, TEMPLATE_HEADERS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PaymentUpload = api;
})(typeof window !== 'undefined' ? window : globalThis);
