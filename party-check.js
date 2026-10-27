// CollectIQ party check: a party is Master + Marka together. Finds the same
// party saved more than once, and one marka name used under several masters.
// Read-only report; pure functions, no DOM.
(function (root) {
  function normKey(v) {
    return String(v == null ? '' : v).toUpperCase().replace(/\s+/g, ' ').trim();
  }

  function partyKey(marka, master) {
    return `${normKey(master)}|${normKey(marka)}`;
  }

  // Old records keep dates as "YYYY-MM-DD…" or 20261006.
  function isoDate(v) {
    const s = String(v == null ? '' : v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    return '';
  }

  function describe(doc, shownIds, payments) {
    const bills = Array.isArray(doc.bills) ? doc.bills.filter(Boolean) : [];
    const history = Array.isArray(doc.history) ? doc.history.filter(h => h && typeof h === 'object') : [];
    const billIds = new Set(bills.map(b => String(b.id)));
    const lastEntry = history.map(h => isoDate(h.date)).filter(Boolean).sort().pop() || '';
    return {
      id: String(doc.id),
      marka: normKey(doc.marka),
      master: normKey(doc.master),
      owner: String(doc.owner || ''),
      bills: bills.length,
      outstanding: bills.reduce((s, b) => s + Math.max(0, Number(b.balance) || 0), 0),
      history: history.length,
      lastEntry,
      payments: (payments || []).filter(p => p && Array.isArray(p.allocations) &&
        p.allocations.some(a => a && billIds.has(String(a.billId)))).length,
      shown: shownIds ? shownIds.has(String(doc.id)) : true
    };
  }

  // Richest copy first: most history, then most bills, then most payments.
  const richest = (a, b) => b.history - a.history || b.bills - a.bills || b.payments - a.payments || a.id.localeCompare(b.id);

  function checkParties(docs, { shownIds = null, payments = [] } = {}) {
    const groups = new Map();
    let records = 0;
    (docs || []).forEach(doc => {
      if (!doc || typeof doc !== 'object' || !normKey(doc.marka)) return;
      records++;
      const key = partyKey(doc.marka, doc.master);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(describe(doc, shownIds, payments));
    });

    const duplicates = [];
    const byName = new Map();
    groups.forEach(copies => {
      copies.sort(richest);
      const { marka, master } = copies[0];
      if (copies.length > 1) duplicates.push({ marka, master, copies });
      if (!byName.has(marka)) byName.set(marka, []);
      byName.get(marka).push({
        master,
        copies: copies.length,
        shown: copies.some(c => c.shown),
        lastEntry: copies.map(c => c.lastEntry).filter(Boolean).sort().pop() || '',
        outstanding: copies[0].outstanding
      });
    });

    const sharedNames = [];
    byName.forEach((parties, marka) => {
      if (parties.length > 1) sharedNames.push({ marka, parties: parties.sort((a, b) => a.master.localeCompare(b.master)) });
    });

    const byMarka = (a, b) => a.marka.localeCompare(b.marka) || (a.master || '').localeCompare(b.master || '');
    return {
      records,
      parties: groups.size,
      extraCopies: records - groups.size,
      duplicates: duplicates.sort(byMarka),
      sharedNames: sharedNames.sort(byMarka)
    };
  }

  // Record IDs used by two different parties. The live database saves each
  // party under its ID, so such parties overwrite each other.
  function findSharedIds(...lists) {
    const byId = new Map();
    lists.forEach(list => (list || []).forEach(doc => {
      if (!doc || typeof doc !== 'object' || doc.id == null || !normKey(doc.marka)) return;
      const id = String(doc.id);
      if (!byId.has(id)) byId.set(id, new Map());
      const key = partyKey(doc.marka, doc.master);
      if (!byId.get(id).has(key)) byId.get(id).set(key, { marka: normKey(doc.marka), master: normKey(doc.master) });
    }));
    const out = [];
    byId.forEach((parties, id) => {
      if (parties.size > 1) out.push({ id, parties: [...parties.values()].sort((a, b) => a.marka.localeCompare(b.marka)) });
    });
    return out.sort((a, b) => a.id.localeCompare(b.id));
  }

  const keyOf = m => partyKey(m && m.marka, m && m.master);
  const size = v => (Array.isArray(v) ? v.length : 0);
  // Which copy of one party to show: most history, then most bills.
  const hasMoreData = (a, b) => size(a.history) - size(b.history) || size(a.bills) - size(b.bills);

  // Where a record from the live database goes in the app's party list.
  // 1. same record ID and same party → update it
  // 2. same party under another record ID (a duplicate) → show it only if it has more data
  // 3. same record ID, party renamed / master changed elsewhere → update it
  // 4. otherwise it is a new party (e.g. same marka name under another master)
  function placeCloudDoc(list, doc) {
    const items = list || [];
    const key = keyOf(doc);
    const id = String(doc && doc.id);
    let index = items.findIndex(m => m && String(m.id) === id && keyOf(m) === key);
    if (index !== -1) return { index, replace: true };
    index = items.findIndex(m => m && keyOf(m) === key);
    if (index !== -1) {
      // A local copy whose record ID is shared with another party cannot be
      // trusted to be its own record: the party's own live record wins.
      const mine = items[index];
      const idShared = items.some(m => m && m !== mine && String(m.id) === String(mine.id) && keyOf(m) !== key);
      return { index, replace: idShared || hasMoreData(doc, mine) > 0 };
    }
    const sameId = items.filter(m => m && String(m.id) === id);
    if (sameId.length === 1) return { index: items.indexOf(sameId[0]), replace: true };
    return { index: -1, replace: false };
  }

  // Marka names used under more than one master.
  function sharedNameSet(list) {
    const masters = new Map();
    (list || []).forEach(m => {
      if (!m || !normKey(m.marka)) return;
      const name = normKey(m.marka);
      if (!masters.has(name)) masters.set(name, new Set());
      masters.get(name).add(normKey(m.master));
    });
    return new Set([...masters].filter(([, s]) => s.size > 1).map(([name]) => name));
  }

  // A party by master + marka; by name alone only when that name is one party.
  function findParty(list, marka, master) {
    const items = (list || []).filter(Boolean);
    const name = normKey(marka);
    if (!name) return null;
    if (master != null && normKey(master)) return items.find(m => keyOf(m) === partyKey(marka, master)) || null;
    const hits = items.filter(m => normKey(m.marka) === name);
    return hits.length && hits.every(m => keyOf(m) === keyOf(hits[0])) ? hits[0] : null;
  }

  // The party a payment belongs to: saved party ID, then its bills, then its name.
  function partyOfPayment(p, list) {
    if (!p) return null;
    const items = (list || []).filter(Boolean);
    if (p.markaId != null && p.markaId !== '') {
      const byId = items.filter(m => String(m.id) === String(p.markaId));
      if (byId.length === 1) return byId[0];
      if (byId.length > 1) return byId.find(m => normKey(m.marka) === normKey(p.marka)) || null;
    }
    const billIds = new Set((Array.isArray(p.allocations) ? p.allocations : []).filter(Boolean).map(a => String(a.billId)));
    if (billIds.size) {
      const byBill = items.find(m => Array.isArray(m.bills) && m.bills.some(b => b && billIds.has(String(b.id))));
      if (byBill) return byBill;
    }
    return findParty(items, p.marka, p.master);
  }

  function paymentBelongs(p, m, list) {
    const found = m ? partyOfPayment(p, list) : null;
    return !!found && String(found.id) === String(m.id) && keyOf(found) === keyOf(m);
  }

  // "JVDT · RIPTESH MASTER" when JVDT is used under several masters, else "JVDT".
  function partyLabel(m, names) {
    const marka = String((m && m.marka) || '').trim();
    return names && names.has(normKey(marka)) ? `${marka} · ${normKey(m.master) || 'NO MASTER'}` : marka;
  }

  // Parties whose live record has fewer bills than the old Excel file built into
  // the app (which no longer fills them in), so the admin can check them.
  function fewerBillsThanFile(live, file) {
    const fileByKey = new Map();
    (file || []).forEach(f => { if (f && normKey(f.marka)) fileByKey.set(keyOf(f), f); });
    const out = [];
    (live || []).forEach(m => {
      if (!m || !normKey(m.marka)) return;
      const f = fileByKey.get(keyOf(m));
      if (f && size(m.bills) < size(f.bills)) out.push({ marka: normKey(m.marka), master: normKey(m.master), live: size(m.bills), file: size(f.bills) });
    });
    return out.sort((a, b) => a.marka.localeCompare(b.marka));
  }

  // Two parties using one record ID: the party the live record holds now keeps
  // the ID (else the first by name); every other party gets "<id>~<MARKA>".
  function planIdSplit(id, parties, liveDoc) {
    const distinct = [];
    (parties || []).forEach(p => {
      if (p && normKey(p.marka) && !distinct.some(d => keyOf(d) === keyOf(p))) distinct.push(p);
    });
    distinct.sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
    const keeper = (liveDoc && distinct.find(p => keyOf(p) === keyOf(liveDoc))) || distinct[0] || null;
    const moves = distinct.filter(p => p !== keeper).map(party => ({
      party,
      newId: `${id}~${normKey(party.marka).replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`
    }));
    return { keeper, moves };
  }

  const api = { normKey, partyKey, checkParties, findSharedIds, placeCloudDoc, fewerBillsThanFile, planIdSplit, sharedNameSet, findParty, partyOfPayment, paymentBelongs, partyLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PartyCheck = api;
})(typeof window !== 'undefined' ? window : globalThis);
