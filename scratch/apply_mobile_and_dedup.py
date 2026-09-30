import os
import sys

def update_all():
    # 1. Update deduplication in app.js
    with open('app.js', 'r', encoding='utf-8') as f:
        app_code = f.read()

    old_dedup_block = """    if (!markaMap.has(markaName)) {
      markaMap.set(markaName, { master, own, bills: [] });
    }
    const mg = markaMap.get(markaName);

    mg.bills.push({
      firstDate: billDate,
      balance: balance,
      sourceAmount: balance,
      billCount: 1,
      billNos: billNo ? [billNo] : [],
      policyDate: policyDate,
      policyName: policyName
    });
  });

  let updated = 0;
  let addedBills = 0;

  markaMap.forEach((data, markaName) => {
    let m = markas.find(x => x.marka === markaName);
    if (m) {
      data.bills.forEach((newBill) => {
        const existingBill = (m.bills || []).find(b => 
          (newBill.billNos.length > 0 && (b.billNos || []).some(no => newBill.billNos.includes(no))) ||
          (b.firstDate === newBill.firstDate)
        );
        if (existingBill) {
          existingBill.balance = newBill.balance;
          existingBill.sourceAmount = newBill.sourceAmount || existingBill.sourceAmount;
          if (newBill.policyDate) existingBill.policyDate = newBill.policyDate;
        } else {
          m.bills.push({
            id: Date.now() + updated + addedBills++,
            firstDate: newBill.firstDate,
            balance: newBill.balance,
            sourceAmount: newBill.sourceAmount,
            billCount: newBill.billCount,
            billNos: newBill.billNos,
            policyDate: newBill.policyDate,
            policyName: newBill.policyName
          });
        }
      });"""

    new_dedup_block = """    const cleanMarkaKey = markaName.trim().toUpperCase();
    if (!markaMap.has(cleanMarkaKey)) {
      markaMap.set(cleanMarkaKey, { marka: markaName.trim(), master, own, bills: [] });
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
      });"""

    assert old_dedup_block in app_code, 'old_dedup_block not found in app.js'
    app_code = app_code.replace(old_dedup_block, new_dedup_block, 1)

    with open('app.js', 'w', encoding='utf-8') as f:
        f.write(app_code)
    with open('outputs/app.js', 'w', encoding='utf-8') as f:
        f.write(app_code)
    print('Updated app.js deduplication!')

    # 2. Update styles.css
    with open('styles.css', 'r', encoding='utf-8') as f:
        css_code = f.read()

    # Append refined mobile and responsive CSS
    mobile_css_enhancements = """
/* ==========================================
   MOBILE FAB & BOTTOM BAR ENHANCEMENTS
   ========================================== */
.mobile-quick-fab {
  display: none;
}

@media (max-width: 768px) {
  html, body {
    max-width: 100vw;
    overflow-x: hidden;
    width: 100%;
    position: relative;
    -webkit-tap-highlight-color: transparent;
  }

  main {
    margin-left: 0 !important;
    padding: 12px 10px 110px 10px !important;
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
    overflow-x: hidden !important;
  }

  /* Sticky Top Bar for Phone */
  header {
    flex-direction: column !important;
    align-items: flex-start !important;
    gap: 12px !important;
    margin-bottom: 14px !important;
    padding-bottom: 12px !important;
    border-bottom: 1px solid #e4ece8;
  }

  header > div:first-child {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .menu-toggle-btn {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 42px !important;
    height: 42px !important;
    background: #ffffff !important;
    border: 1.5px solid #d0ded8 !important;
    border-radius: 10px !important;
    font-size: 20px !important;
    color: #12322b !important;
    cursor: pointer !important;
    flex-shrink: 0 !important;
    box-shadow: 0 2px 6px rgba(0,0,0,0.05);
  }

  .menu-toggle-btn:active {
    background: #e8f3ee !important;
  }

  /* Header action buttons on mobile */
  .header-actions {
    width: 100% !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
  }

  .header-actions .btn.primary {
    width: 100% !important;
    min-height: 44px !important;
    font-size: 13.5px !important;
    font-weight: 800 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 9px !important;
  }

  .header-actions .btn.secondary {
    min-height: 38px !important;
    font-size: 11.5px !important;
    padding: 6px 12px !important;
    border-radius: 8px !important;
  }

  /* Grid Fixes on Mobile */
  .main-grid, .bottom-grid, .report-grid, .rules {
    grid-template-columns: 1fr !important;
    gap: 14px !important;
  }

  .form-grid {
    grid-template-columns: 1fr !important;
    gap: 12px !important;
  }

  .mini {
    grid-template-columns: 1fr !important;
  }

  .owner-row {
    grid-template-columns: 1fr auto !important;
    gap: 6px !important;
  }

  .queue-item {
    grid-template-columns: 20px 1fr auto !important;
    gap: 8px !important;
  }

  .import-hero {
    padding: 20px 16px !important;
    border-radius: 10px !important;
  }

  .modal.wide {
    width: 100% !important;
  }

  /* Mobile FAB Quick Button */
  .mobile-quick-fab {
    display: flex !important;
    flex-direction: column !important;
    align-items: flex-end !important;
    position: fixed !important;
    bottom: 74px !important;
    right: 16px !important;
    z-index: 950 !important;
  }

  .mobile-fab-main {
    width: 52px !important;
    height: 52px !important;
    border-radius: 50% !important;
    background: #087454 !important;
    color: #ffffff !important;
    border: 0 !important;
    font-size: 26px !important;
    display: grid !important;
    place-items: center !important;
    cursor: pointer !important;
    box-shadow: 0 6px 20px rgba(8, 116, 84, 0.4) !important;
    transition: transform 0.2s, background 0.2s !important;
  }

  .mobile-fab-main:active {
    transform: scale(0.92) !important;
  }

  /* Mobile Bottom Navigation Bar */
  .mobile-bottom-nav {
    display: flex !important;
    position: fixed !important;
    bottom: 0 !important;
    left: 0 !important;
    right: 0 !important;
    height: 62px !important;
    background: #0e2a24 !important;
    border-top: 1px solid #1c4a3e !important;
    z-index: 900 !important;
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.25) !important;
    padding-bottom: env(safe-area-inset-bottom, 0px) !important;
    align-items: center !important;
    justify-content: space-around !important;
  }

  .b-nav {
    flex: 1 !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 3px !important;
    height: 100% !important;
    background: transparent !important;
    border: none !important;
    color: #92b1a6 !important;
    font-size: 10.5px !important;
    font-weight: 700 !important;
    font-family: inherit !important;
    cursor: pointer !important;
    position: relative !important;
    padding: 4px 0 !important;
    transition: color 0.15s !important;
  }

  .b-nav i svg {
    stroke: #92b1a6 !important;
    transition: stroke 0.15s !important;
  }

  .b-nav.active {
    color: #c9f36a !important;
  }

  .b-nav.active i svg {
    stroke: #c9f36a !important;
  }

  .mob-badge {
    position: absolute !important;
    top: 4px !important;
    right: calc(50% - 18px) !important;
    background: #e97954 !important;
    color: #ffffff !important;
    border-radius: 10px !important;
    padding: 1px 5px !important;
    font-size: 9px !important;
    font-weight: 800 !important;
  }

  /* Slide-up Bottom Sheet Modal */
  .modal-backdrop {
    padding: 0 !important;
    align-items: flex-end !important;
  }

  .modal {
    position: fixed !important;
    bottom: 0 !important;
    left: 0 !important;
    right: 0 !important;
    top: auto !important;
    max-height: 88vh !important;
    width: 100% !important;
    max-width: 100% !important;
    border-radius: 22px 22px 0 0 !important;
    padding: 20px 16px 32px 16px !important;
    margin: 0 !important;
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch !important;
    overscroll-behavior: contain !important;
    box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.35) !important;
    box-sizing: border-box !important;
  }

  .modal input, .modal select, .modal textarea {
    min-height: 46px !important;
    font-size: 16px !important;
    padding: 10px 12px !important;
    border-radius: 8px !important;
    border: 1.5px solid #d4e0db !important;
    width: 100% !important;
    box-sizing: border-box !important;
  }

  .modal-footer {
    position: sticky !important;
    bottom: -32px !important;
    background: #ffffff !important;
    padding: 12px 0 10px 0 !important;
    border-top: 1px solid #edf2f0 !important;
    margin-top: 18px !important;
    z-index: 10 !important;
    width: 100% !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
  }

  .modal-footer .btn, .modal-footer button {
    width: 100% !important;
    min-height: 48px !important;
    font-size: 15px !important;
    font-weight: 800 !important;
    border-radius: 9px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }

  /* Action Buttons 2x2 grid on cards */
  .table-panel tbody tr td:last-child {
    display: grid !important;
    grid-template-columns: 1fr 1fr !important;
    gap: 8px !important;
    margin-top: 6px !important;
    padding-top: 10px !important;
    border-top: 1px dashed #e2ebe8 !important;
    width: 100% !important;
  }

  .row-action {
    min-height: 42px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-size: 12.5px !important;
    font-weight: 700 !important;
    padding: 8px 10px !important;
    border-radius: 8px !important;
    text-align: center !important;
    margin: 0 !important;
    width: 100% !important;
    box-sizing: border-box !important;
  }

  /* Clean horizontal scrolling for sub-tables */
  #billTable, #rokadTable, #escTable, #helpTicketsTable {
    display: block !important;
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch !important;
    width: 100% !important;
  }
}
"""

    css_code += mobile_css_enhancements

    with open('styles.css', 'w', encoding='utf-8') as f:
        f.write(css_code)
    with open('outputs/styles.css', 'w', encoding='utf-8') as f:
        f.write(css_code)
    print('Updated styles.css with mobile responsive improvements!')

if __name__ == '__main__':
    update_all()
