import re

def update_app_js(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        code = f.read()

    # 1. Update processImportedRows to handle sync mode and clearing paid bills
    old_merge_block = '''  let updated = 0;
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
      });
      m.master = data.master || m.master;
      if (ownerOf(m) === 'Unassigned' && data.own) m.owner = data.own;
      if (totalOutstanding(m) > 0 && !m.nextDate) {
        m.nextDate = iso(new Date(today.getTime() + 86400000));
      } else if (totalOutstanding(m) === 0) {
        m.nextDate = '';
      }
    } else {
      const existingOwner = markas.find(x => x.marka && x.marka.trim().toUpperCase() === cleanMarkaKey);
      const bills = [];
      data.bills.forEach((b) => {
        bills.push({
          id: Date.now() + updated + bills.length,
          firstDate: b.firstDate,
          balance: b.balance,
          sourceAmount: b.sourceAmount,
          billCount: b.billCount || 1,
          billNos: b.billNos || [],
          policyDate: b.policyDate,
          policyName: b.policyName
        });
      });
      markas.push({
        id: uid(),
        marka: targetMarkaName,
        master: data.master,
        owner: data.own || (existingOwner && ownerOf(existingOwner)) || getMasterFollowper(data.master) || 'Unassigned',
        nextDate: iso(new Date(today.getTime() + 86400000)),
        lastDate: '',
        lastStatus: '',
        remark: 'New outstanding sync.',
        ptp: '',
        expected: 0,
        history: [],
        bills: bills,
        escalations: []
      });
    }
    updated++;
  });'''

    new_merge_block = '''  const syncModeEl = document.querySelector('input[name="importSyncMode"]:checked');
  const syncMode = syncModeEl ? syncModeEl.value : 'sync';

  let updated = 0;
  let addedBills = 0;
  let updatedBills = 0;
  let clearedBills = 0;

  markaMap.forEach((data, cleanMarkaKey) => {
    const targetMarkaName = data.marka;
    let m = markas.find(x => x.marka && x.marka.trim().toUpperCase() === cleanMarkaKey);
    if (m) {
      const matchedBillIds = new Set();
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
          matchedBillIds.add(existingBill.id);
          updatedBills++;
        } else {
          const newId = Date.now() + updated + addedBills++;
          m.bills.push({
            id: newId,
            firstDate: newBill.firstDate,
            balance: newBill.balance,
            sourceAmount: newBill.sourceAmount,
            billCount: newBill.billCount || 1,
            billNos: newBill.billNos || [],
            policyDate: newBill.policyDate,
            policyName: newBill.policyName
          });
          matchedBillIds.add(newId);
        }
      });

      // If in Sync mode: any bill in m.bills that was previously unpaid but not in the new report was settled in ERP
      if (syncMode === 'sync') {
        (m.bills || []).forEach(b => {
          if (!matchedBillIds.has(b.id) && b.balance > 0) {
            b.balance = 0; // Mark settled/cleared
            clearedBills++;
          }
        });
      }

      m.master = data.master || m.master;
      if (ownerOf(m) === 'Unassigned' && data.own) m.owner = data.own;
      if (totalOutstanding(m) > 0 && !m.nextDate) {
        m.nextDate = iso(new Date(today.getTime() + 86400000));
      } else if (totalOutstanding(m) === 0) {
        m.nextDate = '';
      }
    } else {
      const existingOwner = markas.find(x => x.marka && x.marka.trim().toUpperCase() === cleanMarkaKey);
      const bills = [];
      data.bills.forEach((b) => {
        bills.push({
          id: Date.now() + updated + bills.length,
          firstDate: b.firstDate,
          balance: b.balance,
          sourceAmount: b.sourceAmount,
          billCount: b.billCount || 1,
          billNos: b.billNos || [],
          policyDate: b.policyDate,
          policyName: b.policyName
        });
      });
      markas.push({
        id: uid(),
        marka: targetMarkaName,
        master: data.master,
        owner: data.own || (existingOwner && ownerOf(existingOwner)) || getMasterFollowper(data.master) || 'Unassigned',
        nextDate: iso(new Date(today.getTime() + 86400000)),
        lastDate: '',
        lastStatus: '',
        remark: 'New outstanding sync.',
        ptp: '',
        expected: 0,
        history: [],
        bills: bills,
        escalations: []
      });
    }
    updated++;
  });'''

    if old_merge_block in code:
        code = code.replace(old_merge_block, new_merge_block)
        print("Updated merge block in", filepath)
    else:
        print("WARNING: merge block not found in", filepath)

    # 2. Update openBillDetails to include quick pay button on each row and clear display
    old_bill_row = '''    return `
      <tr>
        <td>${fmt(b.firstDate)}</td>
        <td><b>${fmt(b.policyDate || b.firstDate)}</b></td>
        <td>${escapeHtml(b.policyName || 'NET')}</td>
        <td>${(b.billNos || []).map(escapeHtml).join(', ') || '—'}</td>
        <td class="money">${money(b.sourceAmount)}</td>
        <td class="money" style="${b.balance < 0 ? 'color:#512da8;font-weight:700;' : ''}">${money(b.balance)}</td>
        <td>${statusBadge}</td>
      </tr>
    `;'''

    new_bill_row = '''    const payBtn = b.balance > 0 ? 
      `<button onclick="event.stopPropagation(); paySpecificBill('${m.id}', ${b.id}, ${b.balance})" class="btn-xs primary" style="margin-left:6px;padding:2px 7px;font-size:11px;border-radius:4px;cursor:pointer;">Pay</button>` : '';

    return `
      <tr style="${b.balance === 0 ? 'opacity:0.65;background:#fafafa;' : ''}">
        <td>${fmt(b.firstDate)}</td>
        <td><b>${fmt(b.policyDate || b.firstDate)}</b></td>
        <td>${escapeHtml(b.policyName || 'NET')}</td>
        <td>${(b.billNos || []).map(escapeHtml).join(', ') || '—'}</td>
        <td class="money">${money(b.sourceAmount)}</td>
        <td class="money" style="${b.balance < 0 ? 'color:#512da8;font-weight:700;' : ''}">${money(b.balance)}</td>
        <td>${statusBadge} ${payBtn}</td>
      </tr>
    `;'''

    if old_bill_row in code:
        code = code.replace(old_bill_row, new_bill_row)
        print("Updated bill row in", filepath)
    else:
        print("WARNING: bill row not found in", filepath)

    # Add paySpecificBill function if not present
    if 'function paySpecificBill' not in code:
        code += '''

function paySpecificBill(markaId, billId, billBalance) {
  closeModal('billModal');
  openPayment(markaId);
  const amtInput = document.getElementById('payAmount');
  if (amtInput) {
    amtInput.value = billBalance > 0 ? billBalance : '';
    if (typeof updatePayAllocations === 'function') updatePayAllocations('amount');
  }
}
window.paySpecificBill = paySpecificBill;
'''

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(code)
    print("Saved", filepath)

update_app_js('app.js')
update_app_js('outputs/app.js')
