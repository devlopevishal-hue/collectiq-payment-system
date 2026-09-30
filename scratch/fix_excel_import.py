import os
import sys

def run_fix():
    with open('app.js', 'r', encoding='utf-8') as f:
        code = f.read()

    # Replace parseAmount, parseCsvDate, importFile, and processImportedRows
    start_marker = "function parseAmount(val) {"
    end_marker = "function exportExcel() {"

    start_idx = code.find(start_marker)
    end_idx = code.find(end_marker)

    assert start_idx != -1, 'start_marker not found'
    assert end_idx != -1, 'end_marker not found'

    new_import_section = """function parseAmount(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  let clean = String(val).replace(/[₹\\s'"]/g, '').trim();
  clean = clean.replace(/,/g, '');
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

function parseCsvDate(str) {
  if (!str) return '';
  str = String(str).trim();
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(str)) return str;
  
  // Excel serial number date (e.g. 45532)
  if (/^\\d{5}$/.test(str)) {
    const d = new Date((parseInt(str, 10) - 25569) * 86400 * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Handle month names: 01-Sep-2026, 15-Aug-26, 01/September/2026
  const monthMap = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
  };

  const parts = str.split(/[\\/\\-\\.\\s]+/);
  if (parts.length === 3) {
    let p1 = parts[0].toLowerCase();
    let p2 = parts[1].toLowerCase();
    let p3 = parts[2].toLowerCase();

    // Check if middle part is month name (e.g. 01-Sep-2026 or 01-Sep-26)
    if (monthMap[p2]) {
      const day = String(parseInt(p1, 10)).padStart(2, '0');
      const mon = monthMap[p2];
      let yr = parseInt(p3, 10);
      if (yr < 100) yr += 2000;
      return `${yr}-${mon}-${day}`;
    }
    // Check if first part is month name (e.g. Sep-01-2026)
    if (monthMap[p1]) {
      const mon = monthMap[p1];
      const day = String(parseInt(p2, 10)).padStart(2, '0');
      let yr = parseInt(p3, 10);
      if (yr < 100) yr += 2000;
      return `${yr}-${mon}-${day}`;
    }

    // Numeric parts
    const n1 = parseInt(p1, 10);
    const n2 = parseInt(p2, 10);
    let n3 = parseInt(p3, 10);
    if (n3 < 100) n3 += 2000;

    if (parts[0].length === 4) { // YYYY-MM-DD
      return `${parts[0]}-${String(n2).padStart(2, '0')}-${String(n3).padStart(2, '0')}`;
    }
    // DD-MM-YYYY or MM-DD-YYYY
    if (n1 > 12 && n2 <= 12) {
      return `${n3}-${String(n2).padStart(2, '0')}-${String(n1).padStart(2, '0')}`;
    } else if (n2 > 12 && n1 <= 12) {
      return `${n3}-${String(n1).padStart(2, '0')}-${String(n2).padStart(2, '0')}`;
    } else {
      // Default to DD-MM-YYYY (Indian format)
      return `${n3}-${String(n2).padStart(2, '0')}-${String(n1).padStart(2, '0')}`;
    }
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  return '';
}

// RFC-4180 compliant CSV parser that handles multiline headers & quoted values
function parseRFC4180Csv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(cur.trim());
      cur = '';
    } else if ((char === '\\r' || char === '\\n') && !inQuotes) {
      if (char === '\\r' && next === '\\n') i++;
      row.push(cur.trim());
      cur = '';
      if (row.length > 0 && row.some(cell => cell.trim() !== '')) {
        rows.push(row);
      }
      row = [];
    } else {
      cur += char;
    }
  }
  if (cur || row.length > 0) {
    row.push(cur.trim());
    if (row.some(cell => cell.trim() !== '')) {
      rows.push(row);
    }
  }
  return rows;
}

window.parseCsvLine = parseCsvLine;
window.parseAmount = parseAmount;
window.parseCsvDate = parseCsvDate;
window.parseRFC4180Csv = parseRFC4180Csv;

function importFile(e) {
  const f = e.target.files[0];
  if (!f) return;
  
  toast('Processing ' + f.name + '...');

  const parseWithXlsx = (buffer) => {
    try {
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, raw: false });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
      if (!rawRows || !rawRows.length) {
        return toast('No data rows found in ' + f.name);
      }
      processImportedRows(rawRows, f.name);
    } catch (err) {
      console.warn('XLSX engine notice:', err);
      parseAsTextFallback();
    }
  };

  const parseAsTextFallback = () => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result;
        const rawGrid = parseRFC4180Csv(text);
        if (!rawGrid || !rawGrid.length) return toast('Empty CSV file.');
        const rawHeaders = rawGrid[0];
        const rawRows = [];
        for (let i = 1; i < rawGrid.length; i++) {
          const r = rawGrid[i];
          const rowObj = {};
          rawHeaders.forEach((h, idx) => {
            rowObj[h] = r[idx] || '';
          });
          rawRows.push(rowObj);
        }
        processImportedRows(rawRows, f.name);
      } catch (err) {
        console.error('CSV parse error:', err);
        toast('Failed to parse file: ' + err.message);
      }
    };
    reader.readAsText(f);
  };

  const reader = new FileReader();
  reader.onload = (evt) => {
    const data = new Uint8Array(evt.target.result);
    if (typeof XLSX !== 'undefined') {
      parseWithXlsx(data);
    } else {
      toast('Loading Excel engine...');
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload = () => parseWithXlsx(data);
      s.onerror = () => parseAsTextFallback();
      document.head.appendChild(s);
    }
  };
  reader.readAsArrayBuffer(f);
}

// Keep backwards-compatible alias
const importCSV = importFile;
window.importFile = importFile;
window.importCSV = importCSV;

function processImportedRows(rawRows, fileName = 'Imported File') {
  if (!rawRows || !rawRows.length) {
    return toast('The uploaded file is empty.');
  }
  window._explicitAdminReset = false;
  localStorage.removeItem('collectiq_admin_cleared');

  const markaMap = new Map();
  let totalBillsCount = 0;

  rawRows.forEach(rawRow => {
    // Normalize keys: lowercase without special characters or dots
    const row = {};
    for (const [k, v] of Object.entries(rawRow)) {
      if (!k) continue;
      const cleanKey = String(k).toLowerCase().trim().replace(/[\\s\\-_/\\\\+.\\r\\n]+/g, '');
      row[cleanKey] = v;
    }

    // 1. First check for Marka / Group
    let markaName = (
      row['markagroup'] || row['marka'] || row['group'] || row['markaname'] || ''
    ).trim();

    // 2. Fallback to Party / Account Name
    if (!markaName) {
      markaName = (
        row['party'] || row['partyname'] || row['accaddress'] || row['accaddr'] ||
        row['customername'] || row['accountname'] || row['particulars'] || row['ledger'] || row['name'] || ''
      ).trim();
    }

    if (!markaName) return;

    const rawBillDate = row['billdate'] || row['date'] || row['firstdate'] || row['invoicedate'] || row['voucherdate'] || row['invdate'] || row['docdate'] || '';
    const billDate = parseCsvDate(rawBillDate) || iso(today);

    const rawBalance = (row['balance'] !== undefined && row['balance'] !== '') ? row['balance'] : (
      row['outstanding'] || row['balamt'] || row['netbalance'] || row['billamt'] ||
      row['debit'] || row['dramount'] || row['closingbalance'] || row['amount'] || row['billamount'] || 0
    );
    const balance = parseAmount(rawBalance);

    const master = (row['master'] || row['mastername'] || row['salesmaster'] || row['agent'] || row['broker'] || 'Unassigned Master').trim();
    const own = (row['collectionperson'] || row['collectionp'] || row['collection'] || row['followper'] || row['doer'] || row['salesperson'] || row['assignedto'] || row['executive'] || '').trim();
    const billNo = String(row['billno'] || row['invoiceno'] || row['vchno'] || row['refno'] || row['billnumber'] || row['invno'] || '').trim();

    const rawPolicyDate = row['policydate'] || row['duedate'] || row['policyduedate'] || row['dueon'] || '';
    const policyDate = parseCsvDate(rawPolicyDate) || billDate;
    const policyName = (row['policyname'] || row['policy'] || 'NET').trim();

    totalBillsCount++;

    const cleanMarkaKey = markaName.trim().toUpperCase();
    if (!markaMap.has(cleanMarkaKey)) {
      markaMap.set(cleanMarkaKey, { marka: markaName.trim(), master, own, bills: [] });
    }
    const mg = markaMap.get(cleanMarkaKey);

    // Smart in-file bill deduplication
    const existingInMg = mg.bills.find(b => 
      (billNo && (b.billNos || []).includes(billNo)) ||
      (!billNo && b.firstDate === billDate && Math.abs(b.balance - balance) < 0.01)
    );
    if (existingInMg) {
      existingInMg.balance = balance;
      existingInMg.sourceAmount = balance;
      existingInMg.policyDate = policyDate;
      existingInMg.policyName = policyName;
      if (billNo && !existingInMg.billNos.includes(billNo)) {
        existingInMg.billNos.push(billNo);
      }
    } else {
      mg.bills.push({
        firstDate: billDate,
        balance: balance,
        sourceAmount: balance,
        billCount: 1,
        billNos: billNo ? [billNo] : [],
        policyDate: policyDate,
        policyName: policyName
      });
    }
  });

  if (markaMap.size === 0) {
    return toast('⚠️ No valid Markas found in file. Please check column headers.');
  }

  let updated = 0;
  let addedBills = 0;
  let updatedBills = 0;

  markaMap.forEach((data, cleanMarkaKey) => {
    const targetMarkaName = data.marka;
    let m = markas.find(x => x.marka && x.marka.trim().toUpperCase() === cleanMarkaKey);
    if (m) {
      data.bills.forEach((newBill) => {
        const existingBill = (m.bills || []).find(b => 
          (newBill.billNos.length > 0 && (b.billNos || []).some(no => newBill.billNos.includes(no))) ||
          (b.firstDate === newBill.firstDate && Math.abs((b.sourceAmount || b.balance) - newBill.sourceAmount) < 0.01)
        );
        if (existingBill) {
          existingBill.balance = newBill.balance;
          existingBill.sourceAmount = newBill.sourceAmount || existingBill.sourceAmount;
          if (newBill.policyDate) existingBill.policyDate = newBill.policyDate;
          if (newBill.policyName) existingBill.policyName = newBill.policyName;
          if (newBill.billNos && newBill.billNos.length > 0) {
            if (!existingBill.billNos) existingBill.billNos = [];
            newBill.billNos.forEach(no => {
              if (!existingBill.billNos.includes(no)) existingBill.billNos.push(no);
            });
          }
          updatedBills++;
        } else {
          m.bills.push({
            id: Date.now() + updated + addedBills++,
            firstDate: newBill.firstDate,
            balance: newBill.balance,
            sourceAmount: newBill.sourceAmount,
            billCount: newBill.billCount || 1,
            billNos: newBill.billNos || [],
            policyDate: newBill.policyDate,
            policyName: newBill.policyName
          });
        }
      });
      m.master = data.master || m.master;
      if (ownerOf(m) === 'Unassigned' && data.own) m.owner = data.own;
      if (totalOutstanding(m) > 0 && !m.nextDate) {
        m.nextDate = iso(new Date(today.getTime() + 86400000));
      } else if (totalOutstanding(m) === 0) {
        m.nextDate = '';
      }
    } else {
      const existingOwner = markas.find(x => x.marka && x.marka.trim().toUpperCase() === cleanMarkaKey);
      const bills = [];
      data.bills.forEach((b) => {
        bills.push({
          id: Date.now() + updated + bills.length,
          firstDate: b.firstDate,
          balance: b.balance,
          sourceAmount: b.sourceAmount,
          billCount: b.billCount || 1,
          billNos: b.billNos || [],
          policyDate: b.policyDate,
          policyName: b.policyName
        });
      });
      markas.push({
        id: uid(),
        marka: targetMarkaName,
        master: data.master,
        owner: data.own || (existingOwner && ownerOf(existingOwner)) || getMasterFollowper(data.master) || 'Unassigned',
        nextDate: iso(new Date(today.getTime() + 86400000)),
        lastDate: '',
        lastStatus: '',
        remark: 'New outstanding sync.',
        ptp: '',
        expected: 0,
        history: [],
        bills: bills,
        escalations: []
      });
    }
    updated++;
  });

  save();
  saveAllMarkasCloud(markas);
  closeModal('importModal');
  renderAll();
  switchView('schedule');

  toast(`✓ Successfully imported ${updated} Markas (${totalBillsCount} bills processed) from ${fileName}!`);
}

async function clearAllData() {
  const isMasterAdmin = currentUser && (
    currentUser.email === 'devlope.vishal@gmail.com' ||
    currentUser.email === 'admin@collectiq.com' ||
    (currentUser.role === 'admin' && currentUser.email.includes('admin'))
  );

  if (!isMasterAdmin) {
    return toast('Access Denied: Only devlope.vishal@gmail.com and Primary Admin can reset/clear bills data.');
  }

  if (!confirm('⚠️ Are you sure you want to clear all existing Markas, Bills, and Collection Data?\\n\\nThis will give you a clean slate to upload your new dataset. (User logins and accounts will be preserved).')) {
    return;
  }

  window._explicitAdminReset = true;
  localStorage.setItem('collectiq_admin_cleared', 'true');
  markas = [];
  payments = [];
  helpTickets = [];
  localStorage.removeItem('collectiq_markas_v4');
  localStorage.removeItem('collectiq_rokad_v4');
  localStorage.removeItem('collectiq_markas_v3');
  localStorage.removeItem('collectiq_rojkad_v3');
  localStorage.removeItem('collectiq_help_tickets_v4');

  if (firestoreDb) {
    try {
      // 1. Delete all markas from cloud collection
      const mSnap = await firestoreDb.collection('collectiq_markas').get();
      const batches = [];
      let curBatch = firestoreDb.batch();
      let opCount = 0;
      mSnap.docs.forEach(doc => {
        curBatch.delete(doc.ref);
        opCount++;
        if (opCount >= 400) {
          batches.push(curBatch);
          curBatch = firestoreDb.batch();
          opCount = 0;
        }
      });
      if (opCount > 0) batches.push(curBatch);
      for (const b of batches) {
        await b.commit();
      }

      // 2. Delete all help tickets
      const htSnap = await firestoreDb.collection('collectiq_help_tickets').get();
      const htBatch = firestoreDb.batch();
      htSnap.docs.forEach(doc => htBatch.delete(doc.ref));
      await htBatch.commit();

      // 3. Delete all payments
      const pSnap = await firestoreDb.collection('collectiq_payments').get();
      const pBatch = firestoreDb.batch();
      pSnap.docs.forEach(doc => pBatch.delete(doc.ref));
      await pBatch.commit();

      // 4. Update config settings with broadcast clear timestamp
      const clearTimestamp = new Date().toISOString();
      localStorage.setItem('collectiq_last_cleared_at', clearTimestamp);
      await firestoreDb.collection('collectiq_config').doc('settings').set({
        masterFollowpers,
        masterCrrs,
        users,
        lastClearedAt: clearTimestamp,
        version: APP_STORAGE_VERSION,
        updatedAt: clearTimestamp
      });

      // 5. Update legacy main doc
      await firestoreDb.collection('collectiq').doc('main').set({
        markas: [],
        payments: [],
        helpTickets: [],
        users: users,
        masterFollowpers: masterFollowpers,
        updatedAt: clearTimestamp
      });

      toast('✓ Cloud DB collections completely cleared.');
    } catch (e) {
      console.warn('Cloud DB clear error:', e);
    }
  }

  if (isLocalServer()) {
    try {
      const res = await fetch('/api/clear-all-data', { method: 'POST' });
      if (res.ok) {
        toast('✓ All database collection records cleared.');
      }
    } catch (e) {
      console.warn('Backend clear notice:', e);
    }
  }

  save();
  renderAll();
  switchView('import');
  const modal = document.querySelector('#importModal');
  if (modal) modal.classList.add('open');
  toast('Clean slate ready! Choose your new Excel or CSV file to upload.');
}

"""

    code = code[:start_idx] + new_import_section + code[end_idx:]

    with open('app.js', 'w', encoding='utf-8') as f:
        f.write(code)
    with open('outputs/app.js', 'w', encoding='utf-8') as f:
        f.write(code)

    print('Applied robust Excel & RFC-4180 CSV parser!')

if __name__ == '__main__':
    run_fix()
