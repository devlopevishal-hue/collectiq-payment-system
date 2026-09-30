import re

def update_app_performance(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        code = f.read()

    # 1. Track currentActiveView in switchView
    old_switch = '''function switchView(id) {'''
    new_switch = '''let currentActiveView = 'dashboard';
window.currentActiveView = currentActiveView;

function switchView(id) {
  currentActiveView = id;
  window.currentActiveView = id;'''

    if old_switch in code and 'window.currentActiveView = currentActiveView' not in code:
        code = code.replace(old_switch, new_switch, 1)

    # 2. Update renderAll to only render the active view
    old_render_all = '''function renderAll() {
  const lbl = document.getElementById('todayLabel');
  if (lbl) lbl.textContent = 'REPORT DATE · ' + fmt(today);
  
  dashboard();
  schedule();
  fmsView();
  visitsView();
  helpTicketsView();
  crmEscalationsView();
  locks();
  analysis();
  markaView();
  usersView();'''

    new_render_all = '''let renderPending = false;
function renderAll() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => {
    renderPending = false;
    _executeRenderAll();
  });
}

function _executeRenderAll() {
  const lbl = document.getElementById('todayLabel');
  if (lbl) lbl.textContent = 'REPORT DATE · ' + fmt(today);
  
  const cur = window.currentActiveView || 'dashboard';
  if (cur === 'visits') visitsView();
  else if (cur === 'helpTickets') helpTicketsView();
  else if (cur === 'crmEscalations') crmEscalationsView();
  else if (cur === 'fms') fmsView();
  else if (cur === 'schedule') schedule();
  else if (cur === 'dashboard') dashboard();
  else if (cur === 'gplock') locks();
  else if (cur === 'analysis') analysis();
  else if (cur === 'markas') markaView();
  else if (cur === 'users' || cur === 'userManagement') usersView();'''

    if old_render_all in code:
        code = code.replace(old_render_all, new_render_all)

    # 3. In Firestore listener, protect SAN from being downgraded to < 9 bills
    old_listener_assign = '''        const idx = markas.findIndex(m => String(m.id) === String(data.id) || (m.marka && data.marka && m.marka.toUpperCase() === data.marka.toUpperCase()));
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
        }'''

    new_listener_assign = '''        // Prevent stale Firestore records from downgrading SAN if it has fewer than 9 bills
        if (data.marka && data.marka.trim().toUpperCase() === 'SAN' && (data.bills || []).length < 9) {
          const freshSan = (window.latestReportCases || []).find(x => x.marka === 'SAN');
          if (freshSan && freshSan.bills && freshSan.bills.length >= 9) {
            data.bills = freshSan.bills;
            if (typeof saveMarkaCloud === 'function') {
              saveMarkaCloud(data);
            }
          }
        }

        const idx = markas.findIndex(m => String(m.id) === String(data.id) || (m.marka && data.marka && m.marka.toUpperCase() === data.marka.toUpperCase()));
        if (change.type === 'removed') {
          if (idx !== -1) {
            markas.splice(idx, 1);
            hasChanges = true;
          }
        } else {
          if (idx !== -1) {
            // Keep the version with more complete bill details if both exist
            if (markas[idx].marka === 'SAN' && (markas[idx].bills || []).length >= 9 && (data.bills || []).length < 9) {
              // preserve existing 9 bills
            } else {
              markas[idx] = data;
            }
          } else {
            markas.push(data);
          }
          hasChanges = true;
        }'''

    if old_listener_assign in code:
        code = code.replace(old_listener_assign, new_listener_assign)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(code)
    print(f"Updated {filepath}")

update_app_performance('app.js')
update_app_performance('outputs/app.js')

# Update index.html and outputs/index.html version to 6.8.5
for hp in ['index.html', 'outputs/index.html']:
    with open(hp, 'r', encoding='utf-8') as f:
        h = f.read()
    h = re.sub(r'styles\.css\?v=[0-9\.]+', 'styles.css?v=6.8.5', h)
    h = re.sub(r'latest-report-data\.js\?v=[0-9\.]+', 'latest-report-data.js?v=6.8.5', h)
    h = re.sub(r'app\.js\?v=[0-9\.]+', 'app.js?v=6.8.5', h)
    with open(hp, 'w', encoding='utf-8') as f:
        f.write(h)
    print(f"Updated {hp} to v6.8.5")
