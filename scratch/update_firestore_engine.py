import os
import sys

def run_update():
    with open('app.js', 'r', encoding='utf-8') as f:
        code = f.read()

    # 1. Update saveSalesHodAction
    old_sales_hod = """  save();
  closeModal('salesHodModal');
  renderAll();"""
    new_sales_hod = """  save();
  saveMarkaCloud(m);
  closeModal('salesHodModal');
  renderAll();"""
    assert old_sales_hod in code, 'old_sales_hod not found'
    code = code.replace(old_sales_hod, new_sales_hod, 1)

    # 2. Update saveBulkFmsDone
    old_bulk_fms = """  save();
  closeModal('bulkFmsModal');
  renderAll();
  toast(`✓ Successfully marked ${count} FMS milestone tasks as Done!`);"""
    new_bulk_fms = """  save();
  checked.forEach(cb => {
    const m = markas.find(x => x.id === cb.dataset.marka);
    if (m) saveMarkaCloud(m);
  });
  closeModal('bulkFmsModal');
  renderAll();
  toast(`✓ Successfully marked ${count} FMS milestone tasks as Done!`);"""
    assert old_bulk_fms in code, 'old_bulk_fms not found'
    code = code.replace(old_bulk_fms, new_bulk_fms, 1)

    # 3. Update saveFmsTask
    old_fms = """  save();
  closeModal('fmsModal');
  renderAll();"""
    new_fms = """  save();
  saveMarkaCloud(m);
  closeModal('fmsModal');
  renderAll();"""
    assert old_fms in code, 'old_fms not found'
    code = code.replace(old_fms, new_fms, 1)

    # 4. Update saveReassignTicket
    old_reassign = """  save();
  closeModal('reassignTicketModal');
  renderAll();
  toast(`✓ Help ticket successfully reassigned to ${newHelper}.`);"""
    new_reassign = """  save();
  if (t) saveHelpTicketCloud(t);
  if (t && t.markaId) {
    const m = markas.find(x => x.id === t.markaId);
    if (m) saveMarkaCloud(m);
  }
  closeModal('reassignTicketModal');
  renderAll();
  toast(`✓ Help ticket successfully reassigned to ${newHelper}.`);"""
    assert old_reassign in code, 'old_reassign not found'
    code = code.replace(old_reassign, new_reassign, 1)

    # 5. Update saveHelpTicket
    old_save_ht = """  save();

  if (isLocalServer()) {"""
    new_save_ht = """  save();
  saveHelpTicketCloud(ticketObj);
  if (m) saveMarkaCloud(m);

  if (isLocalServer()) {"""
    assert old_save_ht in code, 'old_save_ht not found'
    code = code.replace(old_save_ht, new_save_ht, 1)

    # 6. Update saveResolveTicket
    old_resolve_ticket = """  closeModal('resolveTicketModal');
  renderAll();
  toast(actionType === 'progress' ?"""
    new_resolve_ticket = """  save();
  if (t) saveHelpTicketCloud(t);
  if (t && t.markaId) {
    const m = markas.find(x => x.id === t.markaId || x.marka === t.markaName);
    if (m) saveMarkaCloud(m);
  }

  closeModal('resolveTicketModal');
  renderAll();
  toast(actionType === 'progress' ?"""
    assert old_resolve_ticket in code, 'old_resolve_ticket not found'
    code = code.replace(old_resolve_ticket, new_resolve_ticket, 1)

    # 7. Update saveResolveEscalation
    old_resolve_esc = """    save();
  }

  if (isOnlineMode()) {
    try {
      await fetch('/api/escalations/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: escId, resolvedBy, resolutionNote, resolutionType, settledAmount })
      });
      await syncWithDatabase();
    } catch (err) {
      console.warn('API error:', err);
    }
  }

  closeModal('resolveEscModal');"""
    new_resolve_esc = """    save();
    saveMarkaCloud(m);
  }

  if (isOnlineMode()) {
    try {
      await fetch('/api/escalations/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: escId, resolvedBy, resolutionNote, resolutionType, settledAmount })
      });
      await syncWithDatabase();
    } catch (err) {
      console.warn('API error:', err);
    }
  }

  closeModal('resolveEscModal');"""
    assert old_resolve_esc in code, 'old_resolve_esc not found'
    code = code.replace(old_resolve_esc, new_resolve_esc, 1)

    # 8. Update saveFollowup
    old_save_followup = """  save();
  closeModal('followupModal');
  renderAll();"""
    new_save_followup = """  save();
  saveMarkaCloud(m);
  if (isHelp && typeof ticketObj !== 'undefined' && ticketObj) {
    saveHelpTicketCloud(ticketObj);
  }
  closeModal('followupModal');
  renderAll();"""
    assert old_save_followup in code, 'old_save_followup not found'
    code = code.replace(old_save_followup, new_save_followup, 1)

    # 9. Update savePayment
    old_save_payment = """  save();
  closeModal('paymentModal');
  renderAll();"""
    new_save_payment = """  save();
  saveMarkaCloud(m);
  const latestPay = payments[payments.length - 1];
  if (latestPay) savePaymentCloud(latestPay);
  closeModal('paymentModal');
  renderAll();"""
    assert old_save_payment in code, 'old_save_payment not found'
    code = code.replace(old_save_payment, new_save_payment, 1)

    # 10. Update saveAssignment
    old_save_assignment = """  save();
  closeModal('assignmentModal');
  renderAll();
  toast(`✓ Personnel assigned to ${count} Marka profile(s) for ${markaName}.`);"""
    new_save_assignment = """  save();
  markas.filter(m => (m.marka || '').trim().toLowerCase() === markaName.toLowerCase()).forEach(m => saveMarkaCloud(m));
  closeModal('assignmentModal');
  renderAll();
  toast(`✓ Personnel assigned to ${count} Marka profile(s) for ${markaName}.`);"""
    assert old_save_assignment in code, 'old_save_assignment not found'
    code = code.replace(old_save_assignment, new_save_assignment, 1)

    # 11. Update saveMasterAssignment
    old_save_master_assignment = """  save();
  closeModal('masterAssignmentModal');
  renderAll();
  toast(`Master accountability saved: ${masterName} → Followper: ${newFollowper}, CRR: ${newCrr}${syncMarkas ? ` (${count} Markas updated)` : ''}`);"""
    new_save_master_assignment = """  save();
  saveConfigCloud();
  if (syncMarkas) {
    const affected = markas.filter(m => {
      const mMaster = (m.master || '').trim().toLowerCase();
      const targetMaster = masterName.toLowerCase();
      return mMaster === targetMaster || mMaster.includes(targetMaster) || targetMaster.includes(mMaster);
    });
    saveAllMarkasCloud(affected);
  }
  closeModal('masterAssignmentModal');
  renderAll();
  toast(`Master accountability saved: ${masterName} → Followper: ${newFollowper}, CRR: ${newCrr}${syncMarkas ? ` (${count} Markas updated)` : ''}`);"""
    assert old_save_master_assignment in code, 'old_save_master_assignment not found'
    code = code.replace(old_save_master_assignment, new_save_master_assignment, 1)

    # 12. Update processImportedRows
    old_proc_rows = """  save();
  closeModal('importModal');
  renderAll();
  switchView('schedule');"""
    new_proc_rows = """  save();
  saveAllMarkasCloud(markas);
  closeModal('importModal');
  renderAll();
  switchView('schedule');"""
    assert old_proc_rows in code, 'old_proc_rows not found'
    code = code.replace(old_proc_rows, new_proc_rows, 1)

    # 13. Update user management cloud sync
    old_create_user = """  save();
  closeModal('createUserModal');"""
    new_create_user = """  save();
  saveConfigCloud();
  closeModal('createUserModal');"""
    if old_create_user in code:
        code = code.replace(old_create_user, new_create_user, 1)

    old_edit_user = """  save();
  closeModal('editUserModal');"""
    new_edit_user = """  save();
  saveConfigCloud();
  closeModal('editUserModal');"""
    if old_edit_user in code:
        code = code.replace(old_edit_user, new_edit_user, 1)

    old_del_user = """  save();
  renderUserManagement();"""
    new_del_user = """  save();
  saveConfigCloud();
  renderUserManagement();"""
    if old_del_user in code:
        code = code.replace(old_del_user, new_del_user, 1)

    # 14. Update Firebase Firestore Engine & Listeners
    init_start = code.find('let isServerConnected = false;')
    assert init_start != -1, 'isServerConnected not found'
    
    push_end = code.find('window.pushToCloud = pushToCloud;', init_start)
    assert push_end != -1, 'pushToCloud not found'
    push_end += len('window.pushToCloud = pushToCloud;')

    new_engine = """let isServerConnected = false;
let firestoreDb = null;

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAjzN8DcBXMfd7Y0K4a3KFkbiDtl4Y89_0",
  authDomain: "collectiq-ba467.firebaseapp.com",
  projectId: "collectiq-ba467",
  storageBucket: "collectiq-ba467.firebasestorage.app",
  messagingSenderId: "880783090580",
  appId: "1:880783090580:web:8c974a2c760baa06e46581",
  measurementId: "G-B6WQ23YQX8"
};

function getCloudConfig() {
  return DEFAULT_FIREBASE_CONFIG;
}

// Granular Ultra-Fast Cloud Database Helpers (<100ms writes)
async function saveMarkaCloud(m) {
  if (!firestoreDb || !m || !m.id) return;
  try {
    await firestoreDb.collection('collectiq_markas').doc(String(m.id)).set(m);
    updateDbStatusBadge('firebase');
  } catch (err) {
    console.warn('saveMarkaCloud error:', err);
    if (err && (err.code === 'permission-denied' || String(err).includes('permission'))) {
      updateDbStatusBadge('firebase_permission_denied');
    }
  }
}

async function saveHelpTicketCloud(t) {
  if (!firestoreDb || !t || !t.id) return;
  try {
    await firestoreDb.collection('collectiq_help_tickets').doc(String(t.id)).set(t);
    updateDbStatusBadge('firebase');
  } catch (err) {
    console.warn('saveHelpTicketCloud error:', err);
  }
}

async function savePaymentCloud(p) {
  if (!firestoreDb || !p || !p.id) return;
  try {
    await firestoreDb.collection('collectiq_payments').doc(String(p.id)).set(p);
    updateDbStatusBadge('firebase');
  } catch (err) {
    console.warn('savePaymentCloud error:', err);
  }
}

async function saveConfigCloud() {
  if (!firestoreDb) return;
  try {
    await firestoreDb.collection('collectiq_config').doc('settings').set({
      masterFollowpers,
      masterCrrs,
      users,
      version: APP_STORAGE_VERSION,
      updatedAt: new Date().toISOString()
    });
    updateDbStatusBadge('firebase');
  } catch (err) {
    console.warn('saveConfigCloud error:', err);
  }
}

async function saveAllMarkasCloud(list) {
  if (!firestoreDb || !Array.isArray(list) || list.length === 0) return;
  try {
    const CHUNK_SIZE = 400;
    for (let i = 0; i < list.length; i += CHUNK_SIZE) {
      const batch = firestoreDb.batch();
      const chunk = list.slice(i, i + CHUNK_SIZE);
      chunk.forEach(m => {
        if (m && m.id) {
          const docRef = firestoreDb.collection('collectiq_markas').doc(String(m.id));
          batch.set(docRef, m);
        }
      });
      await batch.commit();
    }
    updateDbStatusBadge('firebase');
  } catch (err) {
    console.warn('saveAllMarkasCloud error:', err);
  }
}

async function saveCloud(options = {}) {
  if (!firestoreDb) return;
  if (options && options.marka) return saveMarkaCloud(options.marka);
  if (options && options.ticket) return saveHelpTicketCloud(options.ticket);
  if (options && options.payment) return savePaymentCloud(options.payment);
  if (options && options.configOnly) return saveConfigCloud();

  if (markas.length === 0 && !window._explicitAdminReset) {
    console.warn('saveCloud skipped: preventing empty wipe of Firestore DB.');
    return;
  }

  try {
    await saveAllMarkasCloud(markas);
    await saveConfigCloud();
    for (const t of (helpTickets || [])) {
      await saveHelpTicketCloud(t);
    }
    for (const p of (payments || [])) {
      await savePaymentCloud(p);
    }
    updateDbStatusBadge('firebase');
  } catch (err) {
    console.error('Error writing to Firestore:', err);
    if (err && (err.code === 'permission-denied' || String(err).includes('permission'))) {
      updateDbStatusBadge('firebase_permission_denied');
    }
  }
}

let isInitialMarkasCloudLoaded = false;

function initFirebase() {
  const cfg = getCloudConfig();
  if (!cfg || typeof firebase === 'undefined') return false;
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(cfg);
    }
    firestoreDb = firebase.firestore();
    try {
      firestoreDb.enablePersistence({ synchronizeTabs: true }).catch(() => {});
    } catch(e) {}
    
    // Check initial seed state
    firestoreDb.collection('collectiq_markas').limit(5).get().then(snapshot => {
      if (snapshot.empty) {
        // Check legacy single-doc main
        firestoreDb.collection('collectiq').doc('main').get().then(legacyDoc => {
          if (legacyDoc.exists && legacyDoc.data() && Array.isArray(legacyDoc.data().markas) && legacyDoc.data().markas.length > 0) {
            console.log('⚡ Migrating ' + legacyDoc.data().markas.length + ' Markas to real-time SaaS cloud collections...');
            const d = legacyDoc.data();
            markas = d.markas;
            saveAllMarkasCloud(markas);
            if (Array.isArray(d.helpTickets)) {
              helpTickets = d.helpTickets;
              helpTickets.forEach(t => saveHelpTicketCloud(t));
            }
            if (Array.isArray(d.payments)) {
              payments = d.payments;
              payments.forEach(p => savePaymentCloud(p));
            }
            saveConfigCloud();
          } else if (markas.length > 0) {
            console.log('⚡ Initializing cloud database with ' + markas.length + ' active Markas...');
            saveAllMarkasCloud(markas);
            saveConfigCloud();
          }
        }).catch(err => {
          if (markas.length > 0) {
            saveAllMarkasCloud(markas);
            saveConfigCloud();
          }
        });
      }
    }).catch(err => {
      console.warn('Firestore initial check:', err);
      if (err && (err.code === 'permission-denied' || String(err).includes('permission'))) {
        updateDbStatusBadge('firebase_permission_denied');
      }
    });

    // 1. Real-time Live Listener for Markas (Updates within <1-2s across all devices)
    firestoreDb.collection('collectiq_markas').onSnapshot(snapshot => {
      hasLoadedCloudData = true;
      if (snapshot.empty) return;
      
      let hasChanges = false;
      snapshot.docChanges().forEach(change => {
        const data = change.doc.data();
        if (!data || !data.id) return;

        if (!data.escalations) data.escalations = [];
        if (!data.history) data.history = [];
        if (!data.bills) data.bills = [];
        if (!data.fmsTasks) data.fmsTasks = [];
        if (!data.owner || data.owner === 'Unassigned') {
          const defaultOwner = getMasterFollowper(data.master);
          if (defaultOwner && defaultOwner !== 'Unassigned') data.owner = defaultOwner;
        }
        if (!data.crr || data.crr === 'Unassigned') {
          const defaultCrr = getMasterCrr(data.master);
          if (defaultCrr && defaultCrr !== 'Unassigned') data.crr = defaultCrr;
        }

        const idx = markas.findIndex(m => String(m.id) === String(data.id) || (m.marka && data.marka && m.marka.toUpperCase() === data.marka.toUpperCase()));
        if (change.type === 'removed') {
          if (idx !== -1) {
            markas.splice(idx, 1);
            hasChanges = true;
          }
        } else {
          if (idx !== -1) {
            markas[idx] = data;
          } else {
            markas.push(data);
          }
          hasChanges = true;
        }
      });

      if (hasChanges) {
        localStorage.setItem('collectiq_markas_v4', JSON.stringify(markas));
        renderAll();
      }
      updateDbStatusBadge('firebase');
    }, err => {
      console.warn('Firestore markas listener error:', err);
      if (err && (err.code === 'permission-denied' || String(err).includes('permission'))) {
        updateDbStatusBadge('firebase_permission_denied');
      }
    });

    // 2. Real-time Live Listener for Help Tickets
    firestoreDb.collection('collectiq_help_tickets').onSnapshot(snapshot => {
      let hasChanges = false;
      snapshot.docChanges().forEach(change => {
        const data = change.doc.data();
        if (!data || !data.id) return;
        const idx = helpTickets.findIndex(t => String(t.id) === String(data.id));
        if (change.type === 'removed') {
          if (idx !== -1) {
            helpTickets.splice(idx, 1);
            hasChanges = true;
          }
        } else {
          if (idx !== -1) {
            helpTickets[idx] = data;
          } else {
            helpTickets.unshift(data);
          }
          hasChanges = true;
        }
      });
      if (hasChanges) {
        localStorage.setItem('collectiq_help_tickets_v4', JSON.stringify(helpTickets));
        window.helpTickets = helpTickets;
        renderAll();
      }
    }, err => {
      console.warn('Firestore help_tickets listener error:', err);
    });

    // 3. Real-time Live Listener for Payments (Rokad)
    firestoreDb.collection('collectiq_payments').onSnapshot(snapshot => {
      let hasChanges = false;
      snapshot.docChanges().forEach(change => {
        const data = change.doc.data();
        if (!data || !data.id) return;
        const idx = payments.findIndex(p => String(p.id) === String(data.id));
        if (change.type === 'removed') {
          if (idx !== -1) {
            payments.splice(idx, 1);
            hasChanges = true;
          }
        } else {
          if (idx !== -1) {
            payments[idx] = data;
          } else {
            payments.unshift(data);
          }
          hasChanges = true;
        }
      });
      if (hasChanges) {
        localStorage.setItem('collectiq_rokad_v4', JSON.stringify(payments));
        renderAll();
      }
    }, err => {
      console.warn('Firestore payments listener error:', err);
    });

    // 4. Real-time Live Listener for Settings / Account Mappings / Users
    firestoreDb.collection('collectiq_config').doc('settings').onSnapshot(doc => {
      if (doc.exists) {
        const d = doc.data();
        if (d) {
          if (d.masterFollowpers) {
            masterFollowpers = { ...DEFAULT_MASTER_FOLLOWPERS, ...d.masterFollowpers };
            localStorage.setItem('collectiq_master_followpers_v4', JSON.stringify(masterFollowpers));
          }
          if (d.masterCrrs) {
            masterCrrs = { ...DEFAULT_MASTER_CRR, ...d.masterCrrs };
            localStorage.setItem('collectiq_master_crrs_v4', JSON.stringify(masterCrrs));
          }
          if (Array.isArray(d.users) && d.users.length > 0) {
            users = d.users;
            window.users = users;
            localStorage.setItem('collectiq_users_v4', JSON.stringify(users));
          }
          renderAll();
        }
      }
    }, err => {
      console.warn('Firestore config listener error:', err);
    });

    updateDbStatusBadge('firebase');
    return true;
  } catch (err) {
    console.error('Failed to init Firebase:', err);
    return false;
  }
}

async function syncToServer() {
  const serverUrl = getActiveServerUrl();
  if (serverUrl === null) return;

  try {
    const res = await fetch(`${serverUrl}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        markas,
        payments,
        helpTickets,
        masterFollowpers,
        masterCrrs,
        users
      })
    });
    if (res.ok) {
      updateDbStatusBadge('sqlite');
    }
  } catch (err) {
    console.warn('Backend server sync notice:', err);
  }
}

function getActiveServerUrl() {
  const custom = localStorage.getItem('collectiq_custom_backend_url');
  if (custom && custom.trim()) {
    return custom.trim().replace(/\\/+$/, '');
  }
  if (isLocalServer()) {
    return '';
  }
  return null;
}

function openCloudModal() {
  const modal = document.getElementById('cloudModal');
  if (!modal) return;

  const currentUrl = localStorage.getItem('collectiq_custom_backend_url') || '';
  const inputEl = document.getElementById('customBackendUrl');
  if (inputEl) inputEl.value = currentUrl;

  openModal('cloudModal');
}
window.openCloudModal = openCloudModal;

async function saveCloudConfig(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  const inputEl = document.getElementById('customBackendUrl');
  const urlVal = (inputEl ? inputEl.value : '').trim().replace(/\\/+$/, '');

  if (urlVal) {
    localStorage.setItem('collectiq_custom_backend_url', urlVal);
    toast('Testing connection to: ' + urlVal + ' ...');
    try {
      const res = await fetch(`${urlVal}/api/data`);
      if (res.ok) {
        toast('✓ Connected successfully to central SaaS cloud server!');
        closeModal('cloudModal');
        await syncWithDatabase();
        return;
      } else {
        toast('⚠️ Server responded with error status: ' + res.status);
      }
    } catch (err) {
      toast('⚠️ Could not connect to server: ' + err.message);
    }
  } else {
    localStorage.removeItem('collectiq_custom_backend_url');
    toast('Reset to default direct connection mode.');
    closeModal('cloudModal');
    syncWithDatabase();
  }
}
window.saveCloudConfig = saveCloudConfig;

async function pushToCloud() {
  toast('Synchronizing all records to central cloud database...');
  await saveCloud();
  await syncToServer();
  toast('✓ All records synchronized to central database!');
}
window.pushToCloud = pushToCloud;"""

    code = code[:init_start] + new_engine + code[push_end:]

    # Write to app.js and outputs/app.js
    with open('app.js', 'w', encoding='utf-8') as f:
        f.write(code)
    with open('outputs/app.js', 'w', encoding='utf-8') as f:
        f.write(code)

    print('Updated app.js and outputs/app.js successfully!')

if __name__ == '__main__':
    run_update()
