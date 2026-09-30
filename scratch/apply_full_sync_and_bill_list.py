import re

def update_files():
    # 1. Update index.html and outputs/index.html
    for html_path in ['index.html', 'outputs/index.html']:
        with open(html_path, 'r', encoding='utf-8') as f:
            html = f.read()

        # Add Invoices Overview box into followupModal before Conversation/remark
        old_target = '<label>Conversation / remark<textarea id="remark" required></textarea></label>'
        new_block = '''      <!-- All Active Invoices & Policy Due Dates Overview -->
      <div id="followupBillsOverview" style="margin-bottom:12px; background:#f8faf9; border:1px solid #dce8e2; border-radius:8px; padding:10px 12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <p class="eyebrow" style="margin:0; color:#087454; font-weight:800;">📄 ALL INVOICES &amp; POLICY DUE DATES IN FOLLOW-UP</p>
          <span id="followupBillsCountBadge" style="font:700 11px 'DM Mono', monospace; color:#184233;"></span>
        </div>
        <div id="followupBillsTableWrap" style="max-height:160px; overflow-y:auto; font-size:12px;"></div>
      </div>
      <label>Conversation / remark<textarea id="remark" required></textarea></label>'''

        if old_target in html and 'followupBillsOverview' not in html:
            html = html.replace(old_target, new_block)
            print(f"Added followupBillsOverview to {html_path}")

        # Bump versions to 6.8.4
        html = re.sub(r'styles\.css\?v=[0-9\.]+', 'styles.css?v=6.8.4', html)
        html = re.sub(r'latest-report-data\.js\?v=[0-9\.]+', 'latest-report-data.js?v=6.8.4', html)
        html = re.sub(r'app\.js\?v=[0-9\.]+', 'app.js?v=6.8.4', html)

        with open(html_path, 'w', encoding='utf-8') as f:
            f.write(html)
        print(f"Updated {html_path}")

    # 2. Update app.js and outputs/app.js
    for js_path in ['app.js', 'outputs/app.js']:
        with open(js_path, 'r', encoding='utf-8') as f:
            js = f.read()

        # Update APP_STORAGE_VERSION
        js = re.sub(r"const APP_STORAGE_VERSION = '[^']+';", "const APP_STORAGE_VERSION = 'v7_fresh_excel_2026_09_30';", js)

        # Update load() to auto-migrate to fresh excel dataset
        old_load_start = '''function load() {
  try {'''
        new_load_start = '''function load() {
  try {
    const currentStoredVer = localStorage.getItem('collectiq_storage_version');
    if (currentStoredVer !== APP_STORAGE_VERSION) {
      localStorage.removeItem('collectiq_markas_v4');
      localStorage.removeItem('collectiq_admin_cleared');
      localStorage.setItem('collectiq_storage_version', APP_STORAGE_VERSION);
      if (window.latestReportCases && Array.isArray(window.latestReportCases) && window.latestReportCases.length > 0) {
        markas = JSON.parse(JSON.stringify(window.latestReportCases));
        save(true);
      }
    }'''

        if old_load_start in js and 'currentStoredVer !== APP_STORAGE_VERSION' not in js:
            js = js.replace(old_load_start, new_load_start)
            print(f"Updated load() migration in {js_path}")

        # In openFollowup, populate the followupBillsTableWrap
        old_populate_followup = '''  // Payment fields reset
  const payRefInput = document.getElementById('followPayRef');'''
        new_populate_followup = '''  // Populate All Invoices & Policy Due Dates table inside Follow-up Modal
  const fBillsWrap = document.getElementById('followupBillsTableWrap');
  const fBadge = document.getElementById('followupBillsCountBadge');
  if (fBillsWrap) {
    const bList = (m.bills || []).slice();
    if (fBadge) fBadge.textContent = `${bList.length} Invoices · Total: ${money(totalOutstanding(m))}`;
    if (!bList.length) {
      fBillsWrap.innerHTML = '<p style="color:#788882;margin:4px 0;">No invoices found for this Marka.</p>';
    } else {
      fBillsWrap.innerHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:11.5px;">
          <thead>
            <tr style="border-bottom:1px solid #cbe7da;color:#355347;text-align:left;">
              <th style="padding:4px 6px;">BILL NO</th>
              <th style="padding:4px 6px;">BILL DATE</th>
              <th style="padding:4px 6px;">POLICY DUE</th>
              <th style="padding:4px 6px;">POLICY</th>
              <th style="padding:4px 6px;text-align:right;">BALANCE</th>
              <th style="padding:4px 6px;text-align:center;">STATUS</th>
            </tr>
          </thead>
          <tbody>
            ${bList.map(b => {
              const d = days(b.policyDate || b.firstDate);
              const statusStr = b.balance <= 0 ? '<span style="color:#087454;font-weight:700;">CLEARED</span>' :
                d > 0 ? `<span style="color:#c44d48;font-weight:700;">OVERDUE (${d}d)</span>` :
                d === 0 ? `<span style="color:#d97706;font-weight:700;">DUE TODAY</span>` :
                `<span style="color:#186149;font-weight:700;">UPCOMING (${Math.abs(d)}d)</span>`;
              return `
                <tr style="border-bottom:1px solid #eef5f1;">
                  <td style="padding:4px 6px;font-weight:700;">${(b.billNos || []).join(', ') || '—'}</td>
                  <td style="padding:4px 6px;">${fmt(b.firstDate)}</td>
                  <td style="padding:4px 6px;"><b>${fmt(b.policyDate || b.firstDate)}</b></td>
                  <td style="padding:4px 6px;">${escapeHtml(b.policyName || 'NET')}</td>
                  <td style="padding:4px 6px;text-align:right;font-weight:700;">${money(b.balance)}</td>
                  <td style="padding:4px 6px;text-align:center;">${statusStr}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    }
  }

  // Payment fields reset
  const payRefInput = document.getElementById('followPayRef');'''

        if old_populate_followup in js:
            js = js.replace(old_populate_followup, new_populate_followup)
            print(f"Added bill overview to openFollowup in {js_path}")

        # In scheduleTable rendering, add bill badge next to Marka name
        old_marka_cell = "<td><span class=\"case-name\">${escapeHtml(m.marka)}</span></td>"
        new_marka_cell = """<td>
          <span class="case-name">${escapeHtml(m.marka)}</span>
          <span onclick="openBillDetails('${m.id}')" style="display:inline-block;margin-left:6px;cursor:pointer;background:#e8f4f0;color:#087454;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:700;border:1px solid #bfe7d4;" title="Click to view all ${(m.bills||[]).length} bills">📄 ${(m.bills||[]).length} Bills ▾</span>
        </td>"""

        if old_marka_cell in js:
            js = js.replace(old_marka_cell, new_marka_cell)
            print(f"Added bill badge to schedule table in {js_path}")

        with open(js_path, 'w', encoding='utf-8') as f:
            f.write(js)
        print(f"Saved {js_path}")

update_files()
