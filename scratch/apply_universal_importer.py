import os
import sys

def apply_universal_importer():
    with open('app.js', 'r', encoding='utf-8') as f:
        code = f.read()

    start_marker = "function parseAmount(val) {"
    end_marker = "function exportExcel() {"

    start_idx = code.find(start_marker)
    end_idx = code.find(end_marker)

    assert start_idx != -1, 'start_marker not found'
    assert end_idx != -1, 'end_marker not found'

    new_section = """function parseAmount(val) {
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

// Universal CSV parser supporting comma, semicolon, tab and quoted multiline values
function parseUniversalCsv(text) {
  if (!text) return [];
  const sample = text.slice(0, 2000);
  const countComma = (sample.match(/,/g) || []).length;
  const countSemi = (sample.match(/;/g) || []).length;
  const countTab = (sample.match(/\\t/g) || []).length;
  let delim = ',';
  if (countSemi > countComma && countSemi > countTab) delim = ';';
  else if (countTab > countComma && countTab > countSemi) delim = '\\t';

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
    } else if (char === delim && !inQuotes) {
      row.push(cur.trim());
      cur = '';
    } else if ((char === '\\r' || char === '\\n') && !inQuotes) {
      if (char === '\\r' && next === '\\n') i++;
      row.push(cur.trim());
      cur = '';
      if (row.length > 0 && row.some(cell => cell !== '')) {
        rows.push(row);
      }
      row = [];
    } else {
      cur += char;
    }
  }
  if (cur || row.length > 0) {
    row.push(cur.trim());
    if (row.some(cell => cell !== '')) {
      rows.push(row);
    }
  }
  return rows;
}

window.parseCsvLine = parseCsvLine;
window.parseAmount = parseAmount;
window.parseCsvDate = parseCsvDate;
window.parseUniversalCsv = parseUniversalCsv;

function importFile(e) {
  const f = e.target.files[0];
  if (!f) return;
  
  toast('Processing ' + f.name + '...');

  const parseWithXlsx = (buffer) => {
    try {
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, raw: false });
      
      let bestSheet = null;
      let maxRows = 0;
      (workbook.SheetNames || []).forEach(sName => {
        const s = workbook.Sheets[sName];
        if (s) {
          const rows = XLSX.utils.sheet_to_json(s, { header: 1, defval: '', raw: false });
          if (rows && rows.length > maxRows) {
            maxRows = rows.length;
            bestSheet = s;
          }
        }
      });

      if (!bestSheet || maxRows === 0) {
        return parseAsTextFallback();
      }

      const grid = XLSX.utils.sheet_to_json(bestSheet, { header: 1, defval: '', raw: false });
      if (!grid || !grid.length) {
        return parseAsTextFallback();
      }

      processImportedRows(grid, f.name);
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
        const grid = parseUniversalCsv(text);
        if (!grid || !grid.length) return toast('Empty file or unreadable format.');
        processImportedRows(grid, f.name);
      } catch (err) {
        console.error('Fallback CSV parsing error:', err);
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

const importCSV = importFile;
window.importFile = importFile;
window.importCSV = importCSV;

function processImportedRows(rawInput, fileName = 'Imported File') {
  if (!rawInput || !rawInput.length) {
    return toast('The uploaded file is empty.');
  }
  window._explicitAdminReset = false;
  localStorage.removeItem('collectiq_admin_cleared');

  let rowsToProcess = [];

  // 1. If input is 2D array of rows
  if (Array.isArray(rawInput) && rawInput.length > 0 && Array.isArray(rawInput[0])) {
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(15, rawInput.length); i++) {
      const lineStr = rawInput[i].map(c => String(c || '').toLowerCase()).join(' ');
      if (
        (lineStr.includes('marka') || lineStr.includes('party') || lineStr.includes('group') || lineStr.includes('customer') || lineStr.includes('ledger')) ||
        (lineStr.includes('balance') || lineStr.includes('outstanding') || lineStr.includes('amount') || lineStr.includes('bill')) ||
        (lineStr.includes('master') || lineStr.includes('policy'))
      ) {
        headerRowIdx = i;
        break;
      }
    }

    if (headerRowIdx === -1) headerRowIdx = 0;

    const rawHeaders = rawInput[headerRowIdx].map(h => String(h || '').trim());
    const cleanHeaders = rawHeaders.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

    for (let r = headerRowIdx + 1; r < rawInput.length; r++) {
      const line = rawInput[r];
      if (!line || !line.some(c => String(c || '').trim() !== '')) continue;
      const rowObj = {};
      cleanHeaders.forEach((h, colIdx) => {
        if (h) rowObj[h] = line[colIdx] !== undefined ? line[colIdx] : '';
        else rowObj['col_' + colIdx] = line[colIdx] !== undefined ? line[colIdx] : '';
      });
      rowObj._rawLine = line;
      rowsToProcess.push(rowObj);
    }
  } 
  // 2. If input is array of objects
  else if (Array.isArray(rawInput) && rawInput.length > 0 && typeof rawInput[0] === 'object') {
    rowsToProcess = rawInput;
  }

  if (!rowsToProcess.length) {
    return toast('No data rows found to process in ' + fileName);
  }

  const markaMap = new Map();
  let totalBillsCount = 0;

  rowsToProcess.forEach(rawRow => {
    const row = {};
    for (const [k, v] of Object.entries(rawRow)) {
      if (k === '_rawLine') continue;
      const cleanKey = String(k).toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      row[cleanKey] = v;
    }

    // Extract Marka / Party
    let markaName = (
      row['markagroup'] || row['markagrou'] || row['marka'] || row['group'] || row['markaname'] || ''
    );
    if (!markaName) {
      markaName = (
        row['party'] || row['partyname'] || row['accaddress'] || row['accaddr'] ||
        row['customername'] || row['accountname'] || row['particulars'] || row['ledger'] || row['name'] || ''
      );
    }
    // Positional fallback: Column C (index 2) or Column B (index 1)
    if (!markaName && rawRow._rawLine && Array.isArray(rawRow._rawLine)) {
      if (rawRow._rawLine[2] && String(rawRow._rawLine[2]).trim()) {
        markaName = String(rawRow._rawLine[2]);
      } else if (rawRow._rawLine[1] && String(rawRow._rawLine[1]).trim()) {
        markaName = String(rawRow._rawLine[1]);
      }
    }

    markaName = String(markaName || '').trim();
    if (!markaName) return;

    // Extract Bill Date
    let rawBillDate = (
      row['billdate'] || row['date'] || row['firstdate'] || row['invoicedate'] || row['voucherdate'] || row['invdate'] || row['docdate'] || ''
    );
    if (!rawBillDate && rawRow._rawLine && rawRow._rawLine[3]) rawBillDate = rawRow._rawLine[3];
    const billDate = parseCsvDate(rawBillDate) || iso(today);

    // Extract Balance
    let rawBalance = (
      row['balance'] !== undefined && row['balance'] !== '' ? row['balance'] :
      row['outstanding'] !== undefined && row['outstanding'] !== '' ? row['outstanding'] :
      row['balamt'] !== undefined && row['balamt'] !== '' ? row['balamt'] :
      row['netbalance'] !== undefined && row['netbalance'] !== '' ? row['netbalance'] :
      row['billamt'] !== undefined && row['billamt'] !== '' ? row['billamt'] :
      row['debit'] !== undefined && row['debit'] !== '' ? row['debit'] :
      row['dramount'] !== undefined && row['dramount'] !== '' ? row['dramount'] :
      row['amount'] !== undefined && row['amount'] !== '' ? row['amount'] : 0
    );
    if (rawBalance === 0 && rawRow._rawLine && rawRow._rawLine[14] !== undefined) {
      rawBalance = rawRow._rawLine[14];
    }
    const balance = parseAmount(rawBalance);

    // Extract Master
    let master = (
      row['master'] || row['mastername'] || row['salesmaster'] || row['agent'] || row['broker'] || ''
    );
    if (!master && rawRow._rawLine && rawRow._rawLine[17]) master = rawRow._rawLine[17];
    master = String(master || 'Unassigned Master').trim();

    // Extract Collection Person / Followper
    let own = (
      row['collectionperson'] || row['collectionp'] || row['collection'] || row['followper'] || row['doer'] || row['salesperson'] || row['assignedto'] || row['executive'] || ''
    );
    if (!own && rawRow._rawLine && rawRow._rawLine[18]) own = rawRow._rawLine[18];
    own = String(own || '').trim();

    // Extract Bill No
    let billNo = (
      row['billno'] || row['invoiceno'] || row['vchno'] || row['refno'] || row['billnumber'] || row['invno'] || ''
    );
    if (!billNo && rawRow._rawLine && rawRow._rawLine[4]) billNo = rawRow._rawLine[4];
    billNo = String(billNo || '').trim();

    // Extract Policy Date
    let rawPolicyDate = (
      row['policydate'] || row['policyduedate'] || row['duedate'] || row['dueon'] || ''
    );
    if (!rawPolicyDate && rawRow._rawLine && rawRow._rawLine[20]) rawPolicyDate = rawRow._rawLine[20];
    const policyDate = parseCsvDate(rawPolicyDate) || billDate;

    // Extract Policy Name
    let policyName = (
      row['policyname'] || row['policy'] || ''
    );
    if (!policyName && rawRow._rawLine && rawRow._rawLine[21]) policyName = rawRow._rawLine[21];
    policyName = String(policyName || 'NET').trim();

    totalBillsCount++;

    const cleanMarkaKey = markaName.toUpperCase();
    if (!markaMap.has(cleanMarkaKey)) {
      markaMap.set(cleanMarkaKey, { marka: markaName, master, own, bills: [] });
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
    return toast('⚠️ No valid Markas found in file. Please ensure columns include Marka / Party.');
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

      const htSnap = await firestoreDb.collection('collectiq_help_tickets').get();
      const htBatch = firestoreDb.batch();
      htSnap.docs.forEach(doc => htBatch.delete(doc.ref));
      await htBatch.commit();

      const pSnap = await firestoreDb.collection('collectiq_payments').get();
      const pBatch = firestoreDb.batch();
      pSnap.docs.forEach(doc => pBatch.delete(doc.ref));
      await pBatch.commit();

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

    code = code[:start_idx] + new_section + code[end_idx:]

    with open('app.js', 'w', encoding='utf-8') as f:
        f.write(code)
    with open('outputs/app.js', 'w', encoding='utf-8') as f:
        f.write(code)

    print('Applied universal auto-detect importer to app.js and outputs/app.js!')

if __name__ == '__main__':
    apply_universal_importer()
