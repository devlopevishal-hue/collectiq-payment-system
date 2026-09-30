def update_seed_logic(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        code = f.read()

    # Update ensureSeedDataLoaded so it doesn't auto-restore old dummy data if user is uploading fresh data
    old_ensure = '''function ensureSeedDataLoaded() {
  if (window._explicitAdminReset || localStorage.getItem('collectiq_admin_cleared')) return;
  if ((!markas || markas.length === 0) && window.latestReportCases && Array.isArray(window.latestReportCases) && window.latestReportCases.length > 0) {
    markas = JSON.parse(JSON.stringify(window.latestReportCases));'''

    new_ensure = '''function ensureSeedDataLoaded() {
  if (window._explicitAdminReset || localStorage.getItem('collectiq_admin_cleared') || localStorage.getItem('collectiq_live_mode')) return;
  if ((!markas || markas.length === 0) && window.latestReportCases && Array.isArray(window.latestReportCases) && window.latestReportCases.length > 0) {
    markas = JSON.parse(JSON.stringify(window.latestReportCases));'''

    if old_ensure in code:
        code = code.replace(old_ensure, new_ensure)

    # In processImportedRows, mark live mode so dummy data is never restored
    old_import_start = '''function processImportedRows(rawInput, fileName = 'Imported File') {
  if (!rawInput || !rawInput.length) {
    return toast('The uploaded file is empty.');
  }
  window._explicitAdminReset = false;
  localStorage.removeItem('collectiq_admin_cleared');'''

    new_import_start = '''function processImportedRows(rawInput, fileName = 'Imported File') {
  if (!rawInput || !rawInput.length) {
    return toast('The uploaded file is empty.');
  }
  window._explicitAdminReset = false;
  localStorage.removeItem('collectiq_admin_cleared');
  localStorage.setItem('collectiq_live_mode', 'true');'''

    if old_import_start in code:
        code = code.replace(old_import_start, new_import_start)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(code)
    print(f"Updated {filepath}")

update_seed_logic('app.js')
update_seed_logic('outputs/app.js')
