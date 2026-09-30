import re

def update_index_html(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Add sync mode selector to importModal if not present
    old_modal = '''    <div class="modal">
      <button type="button" class="close" onclick="closeModal('importModal')">×</button>
      <p class="eyebrow">SYNC OUTSTANDING REPORT</p>
      <h2>Update Marka balances</h2>
      <p class="modal-copy">Upload your Excel file (.xlsx, .xls) or CSV with Marka/Group, Bill Date, Balance, Master, and Policy Date. Existing Marka cases retain history.</p>
      <label class="dropzone">⇧<strong>Choose Excel (.xlsx / .xls) or CSV file</strong><small>or drop it here</small>
        <input type="file" accept=".xlsx,.xls,.csv" onchange="importFile(event)">
      </label>
    </div>'''

    new_modal = '''    <div class="modal" style="max-width:560px;">
      <button type="button" class="close" onclick="closeModal('importModal')">×</button>
      <p class="eyebrow">SYNC OUTSTANDING REPORT</p>
      <h2>Update Marka balances</h2>
      <p class="modal-copy">Upload your Excel (.xlsx, .xls) or CSV report. Marka cases retain all follow-up notes, PTPs, and history.</p>
      
      <div style="margin: 12px 0; text-align: left; background: #f0faf5; padding: 12px 14px; border-radius: 8px; border: 1px solid #bfe7d4;">
        <label style="font-size: 12px; font-weight: 700; color: #18332b; display: block; margin-bottom: 6px;">Sync Mode:</label>
        <div style="display: flex; flex-direction: column; gap: 8px; font-size: 12px; color: #2c4b3f;">
          <label style="display: flex; align-items: flex-start; gap: 8px; cursor: pointer;">
            <input type="radio" name="importSyncMode" value="sync" checked id="importModeSync" style="margin-top:2px;">
            <span><strong>Live Outstanding Sync (Recommended)</strong><br><small style="color:#5a7066;">Matches active bills with this report. Bills paid in ERP are cleared while keeping all follow-up history & notes.</small></span>
          </label>
          <label style="display: flex; align-items: flex-start; gap: 8px; cursor: pointer;">
            <input type="radio" name="importSyncMode" value="append" id="importModeAppend" style="margin-top:2px;">
            <span><strong>Append / Incremental Merge</strong><br><small style="color:#5a7066;">Adds new bills and updates existing bills without clearing unlisted bills.</small></span>
          </label>
        </div>
      </div>

      <label class="dropzone">⇧<strong>Choose Excel (.xlsx / .xls) or CSV file</strong><small>or drop it here</small>
        <input type="file" accept=".xlsx,.xls,.csv" onchange="importFile(event)">
      </label>
    </div>'''

    if old_modal in content:
        content = content.replace(old_modal, new_modal)

    # Bump version tag to 6.8.1
    content = re.sub(r'styles\.css\?v=[0-9\.]+', 'styles.css?v=6.8.1', content)
    content = re.sub(r'latest-report-data\.js\?v=[0-9\.]+', 'latest-report-data.js?v=6.8.1', content)
    content = re.sub(r'app\.js\?v=[0-9\.]+', 'app.js?v=6.8.1', content)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Updated {filepath}")

update_index_html('index.html')
update_index_html('outputs/index.html')
