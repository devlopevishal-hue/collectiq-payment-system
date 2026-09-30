import os
import sys

def apply_premium_ui():
    # 1. Update app.js modal open/close to add modal-open class
    with open('app.js', 'r', encoding='utf-8') as f:
        app_code = f.read()

    old_open_modal = """function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('open');
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('open');
}"""

    new_open_modal = """function openModal(id) {
  const m = document.getElementById(id);
  if (m) {
    m.classList.add('open');
    document.body.classList.add('modal-open');
    const fab = document.getElementById('mobileQuickFab');
    if (fab) fab.style.display = 'none';
  }
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) {
    m.classList.remove('open');
    const hasOtherOpen = document.querySelectorAll('.modal-backdrop.open').length > 0;
    if (!hasOtherOpen) {
      document.body.classList.remove('modal-open');
      const fab = document.getElementById('mobileQuickFab');
      if (fab) fab.style.display = '';
    }
  }
}"""

    assert old_open_modal in app_code, 'old_open_modal not found in app.js'
    app_code = app_code.replace(old_open_modal, new_open_modal, 1)

    with open('app.js', 'w', encoding='utf-8') as f:
        f.write(app_code)
    with open('outputs/app.js', 'w', encoding='utf-8') as f:
        f.write(app_code)
    print('Updated app.js modal handling!')

    # 2. Update index.html header layout and FAB ID
    for path in ['index.html', 'outputs/index.html']:
        with open(path, 'r', encoding='utf-8') as f:
            html_code = f.read()

        old_header = """      <div class="header-actions">
        <button class="btn secondary" onclick="exportExcel()">Export to Excel</button>
        <button class="btn secondary" onclick="window.print()">Print PDF</button>
        <button id="resetBillsBtn" class="btn secondary" style="background:#faeceb;color:#c44d48;border-color:#f2c0be;display:none;" onclick="clearAllData()">Reset / Clear Bills</button>
        <button class="btn primary" onclick="openPayment()">+ Record Payment</button>
        <button class="btn primary" onclick="openFollowup()">+ Update follow-up</button>
      </div>"""

        new_header = """      <div class="header-actions">
        <div class="header-primary-btns">
          <button class="btn primary" onclick="openPayment()">+ Record Payment</button>
          <button class="btn primary" onclick="openFollowup()">+ Update follow-up</button>
        </div>
        <div class="header-secondary-btns">
          <button class="btn secondary" onclick="exportExcel()">Export to Excel</button>
          <button class="btn secondary" onclick="window.print()">Print PDF</button>
          <button id="resetBillsBtn" class="btn secondary btn-danger" style="display:none;" onclick="clearAllData()">Reset / Clear Bills</button>
        </div>
      </div>"""

        if old_header in html_code:
            html_code = html_code.replace(old_header, new_header, 1)

        old_fab = """  <div class="mobile-quick-fab">"""
        new_fab = """  <div class="mobile-quick-fab" id="mobileQuickFab">"""
        if old_fab in html_code:
            html_code = html_code.replace(old_fab, new_fab, 1)

        with open(path, 'w', encoding='utf-8') as f:
            f.write(html_code)

    print('Updated index.html header and FAB ID!')

    # 3. Create clean, high-performance styles.css
    with open('styles.css', 'r', encoding='utf-8') as f:
        css_code = f.read()

    # Fix sidebar overflow and modern UI enhancements
    old_sidebar = """.sidebar { position: fixed; width: 250px; height: 100vh; background: #12322b; color: #e8f1ed; padding: 27px 16px; display: flex; flex-direction: column; }"""
    new_sidebar = """.sidebar {
  position: fixed;
  width: 255px;
  height: 100vh;
  background: #0d2620;
  color: #e8f1ed;
  padding: 24px 14px 40px;
  display: flex;
  flex-direction: column;
  overflow-y: auto !important;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  box-sizing: border-box;
  z-index: 100;
  border-right: 1px solid #163d33;
}
.sidebar::-webkit-scrollbar {
  width: 5px;
}
.sidebar::-webkit-scrollbar-thumb {
  background: #1e4e42;
  border-radius: 4px;
}"""
    if old_sidebar in css_code:
        css_code = css_code.replace(old_sidebar, new_sidebar, 1)

    # Add modal-open and header actions styling
    extra_styles = """
/* ==========================================
   PREMIUM MODERN UI & RESPONSIVE POLISH
   ========================================== */
body.modal-open {
  overflow: hidden !important;
}
body.modal-open #mobileQuickFab {
  display: none !important;
}

.header-primary-btns {
  display: flex;
  gap: 8px;
  align-items: center;
}

.header-secondary-btns {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-danger {
  background: #faeceb !important;
  color: #c44d48 !important;
  border-color: #f2c0be !important;
}
.btn-danger:hover {
  background: #f7dcdb !important;
}

/* Modal z-index above everything */
.modal-backdrop {
  z-index: 2000 !important;
}

@media (max-width: 768px) {
  .header-actions {
    width: 100% !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
  }

  .header-primary-btns {
    width: 100% !important;
    display: grid !important;
    grid-template-columns: 1fr 1fr !important;
    gap: 8px !important;
  }

  .header-primary-btns .btn {
    width: 100% !important;
    min-height: 44px !important;
    font-size: 12.5px !important;
    font-weight: 800 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 8px 6px !important;
    border-radius: 8px !important;
  }

  .header-secondary-btns {
    display: none !important; /* Hide clutter on mobile header - clean modern UX */
  }

  #todayLabel {
    font-size: 11px !important;
    margin-bottom: 2px !important;
  }

  #pageTitle {
    font-size: 18px !important;
    font-weight: 800 !important;
    line-height: 1.25 !important;
  }

  /* Card and Panel polish */
  .panel {
    border-radius: 12px !important;
    padding: 14px !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.04) !important;
  }

  /* Modals polish */
  .modal {
    max-height: 85vh !important;
    border-radius: 20px 20px 0 0 !important;
    padding: 20px 16px 28px 16px !important;
  }
}
"""

    css_code += extra_styles

    with open('styles.css', 'w', encoding='utf-8') as f:
        f.write(css_code)
    with open('outputs/styles.css', 'w', encoding='utf-8') as f:
        f.write(css_code)
    print('Updated styles.css with premium UI polish!')

if __name__ == '__main__':
    apply_premium_ui()
