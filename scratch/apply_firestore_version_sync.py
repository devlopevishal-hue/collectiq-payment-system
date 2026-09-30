def update_firestore_version_check(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        code = f.read()

    old_block = '''    // Check initial seed state
    firestoreDb.collection('collectiq_markas').limit(5).get().then(snapshot => {
      if (snapshot.empty) {'''

    new_block = '''    // Check initial seed state & version sync
    firestoreDb.collection('collectiq_config').doc('settings').get().then(doc => {
      const d = doc.exists ? doc.data() : null;
      if (!d || d.version !== APP_STORAGE_VERSION) {
        if (window.latestReportCases && Array.isArray(window.latestReportCases) && window.latestReportCases.length > 0) {
          console.log('⚡ Cloud version out of date. Syncing fresh Excel report data to Firestore (' + window.latestReportCases.length + ' Markas)...');
          saveAllMarkasCloud(window.latestReportCases);
          saveConfigCloud();
        }
      }
    }).catch(e => console.warn('Config version check error:', e));

    firestoreDb.collection('collectiq_markas').limit(5).get().then(snapshot => {
      if (snapshot.empty) {'''

    if old_block in code and 'Cloud version out of date' not in code:
        code = code.replace(old_block, new_block)
        print("Updated Firestore version sync in", filepath)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(code)

update_firestore_version_check('app.js')
update_firestore_version_check('outputs/app.js')
