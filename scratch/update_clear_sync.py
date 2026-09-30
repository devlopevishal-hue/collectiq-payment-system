import os
import sys

def run_update():
    with open('app.js', 'r', encoding='utf-8') as f:
        code = f.read()

    # 1. Update ensureSeedDataLoaded
    old_seed = """function ensureSeedDataLoaded() {
  if ((!markas || markas.length === 0) && window.latestReportCases && Array.isArray(window.latestReportCases) && window.latestReportCases.length > 0) {"""
    new_seed = """function ensureSeedDataLoaded() {
  if (window._explicitAdminReset || localStorage.getItem('collectiq_admin_cleared')) return;
  if ((!markas || markas.length === 0) && window.latestReportCases && Array.isArray(window.latestReportCases) && window.latestReportCases.length > 0) {"""
    assert old_seed in code, 'old_seed not found'
    code = code.replace(old_seed, new_seed, 1)

    # 2. Update load() seed check
    old_load_seed = """    // Seed fallback if markas is empty (fresh phone / new session)
    if ((!markas || markas.length === 0) && window.latestReportCases && Array.isArray(window.latestReportCases) && window.latestReportCases.length > 0) {"""
    new_load_seed = """    // Seed fallback if markas is empty (fresh phone / new session)
    if (!window._explicitAdminReset && !localStorage.getItem('collectiq_admin_cleared') && (!markas || markas.length === 0) && window.latestReportCases && Array.isArray(window.latestReportCases) && window.latestReportCases.length > 0) {"""
    assert old_load_seed in code, 'old_load_seed not found'
    code = code.replace(old_load_seed, new_load_seed, 1)

    # 3. Update clearAllData
    old_clear = """async function clearAllData() {
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
      await firestoreDb.collection('collectiq').doc('main').set({
        markas: [],
        payments: [],
        helpTickets: [],
        users: users,
        masterFollowpers: masterFollowpers,
        updatedAt: new Date().toISOString()
      });
      toast('✓ Cloud DB collections cleared.');
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
  toast('Clean slate ready! Choose your new CSV file to upload.');
}"""

    new_clear = """async function clearAllData() {
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

      // 4. Update legacy main doc
      await firestoreDb.collection('collectiq').doc('main').set({
        markas: [],
        payments: [],
        helpTickets: [],
        users: users,
        masterFollowpers: masterFollowpers,
        updatedAt: new Date().toISOString()
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
}"""
    assert old_clear in code, 'old_clear not found'
    code = code.replace(old_clear, new_clear, 1)

    # 4. Update processImportedRows start
    old_proc_start = """function processImportedRows(rawRows, fileName = 'Imported File') {
  if (!rawRows || !rawRows.length) {
    return toast('The uploaded file is empty.');
  }"""
    new_proc_start = """function processImportedRows(rawRows, fileName = 'Imported File') {
  if (!rawRows || !rawRows.length) {
    return toast('The uploaded file is empty.');
  }
  window._explicitAdminReset = false;
  localStorage.removeItem('collectiq_admin_cleared');"""
    assert old_proc_start in code, 'old_proc_start not found'
    code = code.replace(old_proc_start, new_proc_start, 1)

    # Write to app.js and outputs/app.js
    with open('app.js', 'w', encoding='utf-8') as f:
        f.write(code)
    with open('outputs/app.js', 'w', encoding='utf-8') as f:
        f.write(code)

    print('Applied clear and import cloud sync enhancements!')

if __name__ == '__main__':
    run_update()
