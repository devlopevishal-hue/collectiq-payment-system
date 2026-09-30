import os
import sys

def apply_fix():
    with open('app.js', 'r', encoding='utf-8') as f:
        code = f.read()

    # 1. Update clearAllData to set lastClearedAt in config
    old_clear_config = """      // 4. Update legacy main doc
      await firestoreDb.collection('collectiq').doc('main').set({
        markas: [],
        payments: [],
        helpTickets: [],
        users: users,
        masterFollowpers: masterFollowpers,
        updatedAt: new Date().toISOString()
      });"""

    new_clear_config = """      // 4. Update config settings with broadcast clear timestamp
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
      });"""

    assert old_clear_config in code, 'old_clear_config not found'
    code = code.replace(old_clear_config, new_clear_config, 1)

    # 2. Update initFirebase listeners to handle empty snapshots & lastClearedAt broadcast
    old_markas_listener = """    // 1. Real-time Live Listener for Markas (Updates within <1-2s across all devices)
    firestoreDb.collection('collectiq_markas').onSnapshot(snapshot => {
      hasLoadedCloudData = true;
      if (snapshot.empty) return;"""

    new_markas_listener = """    // 1. Real-time Live Listener for Markas (Updates within <1-2s across all devices)
    firestoreDb.collection('collectiq_markas').onSnapshot(snapshot => {
      hasLoadedCloudData = true;
      if (snapshot.empty) {
        if (markas.length > 0) {
          markas = [];
          localStorage.removeItem('collectiq_markas_v4');
          renderAll();
        }
        updateDbStatusBadge('firebase');
        return;
      }"""

    assert old_markas_listener in code, 'old_markas_listener not found'
    code = code.replace(old_markas_listener, new_markas_listener, 1)

    # 3. Update help_tickets listener for empty snapshot
    old_ht_listener = """    // 2. Real-time Live Listener for Help Tickets
    firestoreDb.collection('collectiq_help_tickets').onSnapshot(snapshot => {
      let hasChanges = false;"""

    new_ht_listener = """    // 2. Real-time Live Listener for Help Tickets
    firestoreDb.collection('collectiq_help_tickets').onSnapshot(snapshot => {
      if (snapshot.empty) {
        if (helpTickets.length > 0) {
          helpTickets = [];
          localStorage.removeItem('collectiq_help_tickets_v4');
          window.helpTickets = [];
          renderAll();
        }
        return;
      }
      let hasChanges = false;"""

    assert old_ht_listener in code, 'old_ht_listener not found'
    code = code.replace(old_ht_listener, new_ht_listener, 1)

    # 4. Update payments listener for empty snapshot
    old_pay_listener = """    // 3. Real-time Live Listener for Payments (Rokad)
    firestoreDb.collection('collectiq_payments').onSnapshot(snapshot => {
      let hasChanges = false;"""

    new_pay_listener = """    // 3. Real-time Live Listener for Payments (Rokad)
    firestoreDb.collection('collectiq_payments').onSnapshot(snapshot => {
      if (snapshot.empty) {
        if (payments.length > 0) {
          payments = [];
          localStorage.removeItem('collectiq_rokad_v4');
          renderAll();
        }
        return;
      }
      let hasChanges = false;"""

    assert old_pay_listener in code, 'old_pay_listener not found'
    code = code.replace(old_pay_listener, new_pay_listener, 1)

    # 5. Update config settings listener to react to lastClearedAt broadcast
    old_cfg_listener = """    // 4. Real-time Live Listener for Settings / Account Mappings / Users
    firestoreDb.collection('collectiq_config').doc('settings').onSnapshot(doc => {
      if (doc.exists) {
        const d = doc.data();
        if (d) {
          if (d.masterFollowpers) {
            masterFollowpers = { ...DEFAULT_MASTER_FOLLOWPERS, ...d.masterFollowpers };
            localStorage.setItem('collectiq_master_followpers_v4', JSON.stringify(masterFollowpers));
          }"""

    new_cfg_listener = """    // 4. Real-time Live Listener for Settings / Account Mappings / Users
    firestoreDb.collection('collectiq_config').doc('settings').onSnapshot(doc => {
      if (doc.exists) {
        const d = doc.data();
        if (d) {
          // React immediately to global clear broadcasts across all user sessions
          if (d.lastClearedAt) {
            const localClearedAt = localStorage.getItem('collectiq_last_cleared_at');
            if (!localClearedAt || new Date(d.lastClearedAt) > new Date(localClearedAt)) {
              localStorage.setItem('collectiq_last_cleared_at', d.lastClearedAt);
              if (markas.length > 0) {
                markas = [];
                payments = [];
                helpTickets = [];
                localStorage.removeItem('collectiq_markas_v4');
                localStorage.removeItem('collectiq_rokad_v4');
                localStorage.removeItem('collectiq_help_tickets_v4');
                renderAll();
              }
            }
          }
          if (d.masterFollowpers) {
            masterFollowpers = { ...DEFAULT_MASTER_FOLLOWPERS, ...d.masterFollowpers };
            localStorage.setItem('collectiq_master_followpers_v4', JSON.stringify(masterFollowpers));
          }"""

    assert old_cfg_listener in code, 'old_cfg_listener not found'
    code = code.replace(old_cfg_listener, new_cfg_listener, 1)

    with open('app.js', 'w', encoding='utf-8') as f:
        f.write(code)
    with open('outputs/app.js', 'w', encoding='utf-8') as f:
        f.write(code)

    print('Successfully applied real-time cloud clear broadcast!')

if __name__ == '__main__':
    apply_fix()
