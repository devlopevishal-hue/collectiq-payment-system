// CollectIQ follow-up and FMS actions.
// Pure functions shared by the Update Follow-up / FMS forms and the AI
// Assistant: they validate, then mutate the passed Marka the same way the
// forms always have. No DOM, no network, no saving - callers persist with
// persistFollowupChange().
(function (root) {
  const CONTACT_MODES = ['Phone call', 'WhatsApp', 'Email', 'In person (Field Visit)'];

  const FMS_DEFINITIONS = [
    {
      code: 'FMS-1',
      offset: 2,
      role: 'Account Team',
      name: 'Update Payment in System / Rokad',
      desc: 'If still payment not received, account person will verify bank/cash & update payment'
    },
    {
      code: 'FMS-2',
      offset: 5,
      role: 'Process Coordinator (PC)',
      name: 'Intimate to Master about Pending Payment',
      desc: 'If still payment not received, Process Coordinator (PC) must intimate master'
    },
    {
      code: 'FMS-3',
      offset: 14,
      role: 'Master',
      name: 'Get Sign of Master on Outstanding Statement',
      desc: 'Get physical or digital sign of master on current outstanding statement'
    },
    {
      code: 'FMS-4',
      offset: 15,
      role: 'Process Coordinator (PC)',
      name: 'Update to Sales HOD about Critical Outstanding',
      desc: 'If still payment not received, Process Coordinator (PC) must update and escalate to Sales HOD'
    }
  ];

  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  function text(v) {
    return String(v == null ? '' : v).trim();
  }

  function addDays(isoDate, n) {
    return new Date(Date.parse(isoDate + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  }

  function isFieldVisit(mode) {
    const m = text(mode).toLowerCase();
    return m.includes('person') || m.includes('visit');
  }

  // Status "Promise to Pay" of the Update Follow-up form.
  function applyPtpFollowup(marka, input) {
    const promiseDate = text(input.promiseDate);
    const mode = text(input.contactMode);
    const expected = Number(input.expected || 0);
    if (!promiseDate) return { error: 'Promise date is required for PTP.' };
    if (!ISO_DATE.test(promiseDate)) return { error: 'Promise date must be in YYYY-MM-DD format.' };
    if (input.nextDate && !ISO_DATE.test(text(input.nextDate))) return { error: 'Next date must be in YYYY-MM-DD format.' };
    if (!CONTACT_MODES.includes(mode)) return { error: `Contact mode must be one of: ${CONTACT_MODES.join(', ')}` };
    if (!Number.isFinite(expected) || expected < 0) return { error: 'Expected amount must be a valid amount.' };

    const followper = text(input.followper);
    const contact = text(input.contactPerson);
    const remark = String(input.remark == null ? '' : input.remark);
    const next = text(input.nextDate) || promiseDate;
    const visit = input.visit || {};
    const field = isFieldVisit(mode);
    const entry = {
      type: 'followup',
      date: input.date,
      followper,
      status: 'Promise to Pay',
      contact,
      mode,
      remark,
      expected,
      promise: promiseDate,
      next,
      claimNumber: '',
      waComplaintNo: '',
      escalatedTo: '',
      visitPurpose: field ? (visit.purpose || 'Payment Collection') : '',
      visitPersonMet: field ? (visit.personMet || contact || '') : '',
      visitNotes: field ? (visit.notes || '') : '',
      billIds: [],
      amount: 0,
      ref: '',
      receiptImage: '',
      allocations: []
    };

    marka.lastDate = entry.date;
    marka.lastStatus = entry.status;
    marka.remark = entry.remark;
    marka.expected = entry.expected;
    marka.ptp = entry.promise;
    marka.nextDate = entry.next;
    marka.owner = followper || text(input.ownerFallback) || 'Unassigned';
    if (!marka.history) marka.history = [];
    marka.history.push(entry);

    const payload = {
      markaId: marka.id,
      followDate: entry.date,
      followper,
      contactPerson: contact,
      contactMode: mode,
      actionStatus: 'Promise to Pay',
      expected,
      promiseDate,
      nextDate: next,
      remark,
      claimNumber: '',
      waComplaintNo: '',
      escalateTo: '',
      billIds: [],
      payRef: '',
      payMode: 'cheque',
      payType: 'Part Payment',
      payAmount: 0,
      allocations: []
    };
    return { entry, payload };
  }

  const PAY_MODES = ['cheque', 'RTGS', 'cash', 'NEFT', 'UPI'];
  const PAY_TYPES = ['Part Payment', 'Full Payment'];
  const COMPLAINT_STATUS = 'WhatsApp Complaint / Claim Matter';

  function visitFields(mode, contact, visit) {
    if (!isFieldVisit(mode)) return { visitPurpose: '', visitPersonMet: '', visitNotes: '' };
    const v = visit || {};
    return { visitPurpose: v.purpose || 'Payment Collection', visitPersonMet: v.personMet || contact || '', visitNotes: v.notes || '' };
  }

  function outstanding(marka) {
    return (marka.bills || []).reduce((sum, b) => sum + (b.balance || 0), 0);
  }

  // Oldest bill first, as the form fills the bill list when an amount is typed.
  function autoAllocations(marka, amount) {
    let rest = amount;
    return (marka.bills || []).filter(b => b.balance > 0)
      .sort((a, b) => String(a.firstDate).localeCompare(String(b.firstDate)))
      .map(b => {
        const amt = Math.min(rest, b.balance);
        rest -= amt;
        return { billId: b.id, amount: amt };
      }).filter(a => a.amount > 0);
  }

  function updateParty(marka, entry, owner) {
    marka.lastDate = entry.date;
    marka.lastStatus = entry.status;
    marka.remark = entry.remark;
    marka.expected = entry.expected;
    marka.ptp = entry.promise;
    marka.nextDate = entry.next;
    marka.owner = owner;
    if (!marka.history) marka.history = [];
    marka.history.push(entry);
  }

  // Status "Payment Received" of the Update Follow-up form.
  function applyPaymentFollowup(marka, payments, input) {
    const payAmount = Number(input.payAmount || 0);
    const payMode = text(input.payMode) || 'cheque';
    const payType = text(input.payType) || 'Part Payment';
    const payRef = text(input.payRef) || 'N/A';
    const mode = text(input.contactMode);
    if (!(payAmount > 0)) return { error: 'Please enter a valid received payment amount.' };
    if (!PAY_MODES.includes(payMode)) return { error: `Payment mode must be one of: ${PAY_MODES.join(', ')}` };
    if (!PAY_TYPES.includes(payType)) return { error: `Payment type must be one of: ${PAY_TYPES.join(', ')}` };
    if (!CONTACT_MODES.includes(mode)) return { error: `Contact mode must be one of: ${CONTACT_MODES.join(', ')}` };

    const bills = marka.bills || [];
    const wanted = Array.isArray(input.allocations) ? input.allocations : autoAllocations(marka, payAmount);
    const allocations = [];
    wanted.forEach(a => {
      const b = bills.find(x => String(x.id) === String(a.billId));
      const amt = b ? Math.min(Number(a.amount) || 0, b.balance) : 0;
      if (b && amt > 0) allocations.push({ billId: b.id, amount: amt, settled: (b.balance - amt) === 0 });
    });
    const totalAllocated = allocations.reduce((s, a) => s + a.amount, 0);
    const hasOpenBills = bills.some(b => b.balance > 0);
    if (hasOpenBills && !allocations.length && payAmount < outstanding(marka)) return { error: 'Please allocate payment against at least one invoice.' };
    if (totalAllocated > payAmount) return { error: 'Allocated amount cannot be more than the amount received.' };

    const advanceAmount = Math.max(0, payAmount - totalAllocated);
    if (advanceAmount > 0) {
      const advBillId = 'adv_' + input.newId();
      if (!marka.bills) marka.bills = [];
      marka.bills.push({
        id: advBillId,
        firstDate: input.date,
        balance: -advanceAmount,
        sourceAmount: -advanceAmount,
        billCount: 1,
        billNos: [payRef !== 'N/A' ? `ADV/${payRef}` : `ADV/${String(input.now).slice(-4)}`],
        policyDate: input.date,
        policyName: 'ADVANCE PAYMENT'
      });
      allocations.push({ billId: advBillId, amount: advanceAmount, settled: true, isAdvance: true });
    }
    allocations.forEach(a => {
      const b = marka.bills.find(x => String(x.id) === String(a.billId));
      if (b && !a.isAdvance) b.balance = Math.max(0, b.balance - a.amount);
    });

    const followper = text(input.followper);
    const receiptImage = input.receiptImage || '';
    const payment = {
      id: input.newId(),
      date: input.date,
      ref: payRef,
      mode: payMode,
      amount: payAmount,
      marka: marka.marka,
      receiptImage,
      followper: followper || text(input.paymentFollowperFallback),
      allocations: allocations.map(a => ({ billId: a.billId, amount: a.amount, settled: !!a.settled, isAdvance: !!a.isAdvance }))
    };
    payments.push(payment);

    const money = input.money;
    const stillDue = outstanding(marka);
    const remark = String(input.remark == null ? '' : input.remark);
    let status = 'Payment Received';
    let next;
    let finalRemark = remark;
    if (stillDue < 0) {
      status = 'Advance Payment';
      next = '';
      finalRemark = finalRemark || `Payment ${money(payAmount)} received (${payMode} ref: ${payRef}). Advance credit balance: ${money(Math.abs(stillDue))}. Follow-up closed.`;
    } else if (stillDue === 0 || payType === 'Full Payment') {
      next = '';
      finalRemark = finalRemark || `Full payment ${money(payAmount)} received (${payMode} ref: ${payRef}). All dues cleared.`;
    } else {
      next = text(input.nextDate) || input.defaultNext;
      finalRemark = finalRemark || `Payment ${money(payAmount)} received (${payMode} ref: ${payRef}); ${money(stillDue)} still due.`;
    }

    const contact = text(input.contactPerson);
    const expected = Number(input.expected || 0);
    const promiseDate = text(input.promiseDate);
    const entry = {
      type: 'payment',
      date: input.date,
      followper,
      status,
      contact,
      mode,
      remark: finalRemark,
      expected,
      promise: promiseDate,
      next,
      claimNumber: '',
      waComplaintNo: '',
      escalatedTo: '',
      ...visitFields(mode, contact, input.visit),
      billIds: [],
      amount: payAmount,
      ref: payRef,
      receiptImage,
      allocations
    };
    updateParty(marka, entry, followper || text(input.ownerFallback) || 'Unassigned');

    const payload = {
      markaId: marka.id, followDate: input.date, followper, contactPerson: contact, contactMode: mode,
      actionStatus: 'Payment Received', expected, promiseDate, nextDate: next, remark: finalRemark,
      claimNumber: '', waComplaintNo: '', escalateTo: '', billIds: [], payRef, payMode, payType, payAmount, allocations
    };
    return { entry, payment, payload };
  }

  // Status "WhatsApp Complaint / Claim Matter": opens an escalation and hands
  // the party to the escalation owner (CRM by default).
  function applyComplaintFollowup(marka, input) {
    const statusVal = text(input.status) || COMPLAINT_STATUS;
    const mode = text(input.contactMode);
    const remark = String(input.remark == null ? '' : input.remark);
    const claim = text(input.claimNumber);
    if (!CONTACT_MODES.includes(mode)) return { error: `Contact mode must be one of: ${CONTACT_MODES.join(', ')}` };
    if (input.nextDate && !ISO_DATE.test(text(input.nextDate))) return { error: 'Next date must be in YYYY-MM-DD format.' };
    if (input.requireDetail && !claim && !text(remark)) return { error: 'Tell me the complaint / claim details or number.' };

    const escalateTo = text(input.escalateTo) || 'CRM';
    const minNext = input.minNext;
    let next = text(input.nextDate) || minNext;
    if (next < minNext) next = minNext;
    const followper = text(input.followper);
    const contact = text(input.contactPerson);
    const claimNumber = claim || remark.slice(0, 50);
    const waComplaintNo = statusVal === 'WhatsApp Complaint' ? claim : '';
    const billIds = Array.isArray(input.billIds) ? input.billIds.slice() : [];
    const entry = {
      type: 'followup',
      date: input.date,
      followper,
      status: statusVal,
      contact,
      mode,
      remark,
      expected: Number(input.expected || 0),
      promise: text(input.promiseDate),
      next,
      claimNumber,
      waComplaintNo,
      escalatedTo: escalateTo,
      ...visitFields(mode, contact, input.visit),
      billIds,
      amount: 0,
      ref: '',
      receiptImage: '',
      allocations: []
    };
    updateParty(marka, entry, escalateTo);
    const escalation = {
      id: input.newEscId(),
      date: input.date,
      type: statusVal === 'WhatsApp Complaint' ? 'WhatsApp Complaint' : statusVal.includes('Escalat') ? 'Escalated' : 'Claim Matter',
      claimNumber,
      waComplaintNo,
      escalatedTo: escalateTo,
      followper,
      status: 'Open',
      remark,
      billIds
    };
    if (!marka.escalations) marka.escalations = [];
    marka.escalations.push(escalation);
    const payload = {
      markaId: marka.id, escId: escalation.id, followDate: input.date, followper, contactPerson: contact, contactMode: mode,
      actionStatus: statusVal, expected: entry.expected, promiseDate: entry.promise, nextDate: next, remark,
      claimNumber, waComplaintNo, escalateTo, billIds, payRef: '', payMode: 'cheque', payType: 'Part Payment', payAmount: 0, allocations: []
    };
    return { entry, escalation, payload };
  }

  // FMS milestone "Mark Done" (single and bulk forms).
  function completeFmsTask(marka, code, { baseDueDate, actualDate, completedBy, remark, now, isDone = false, allowRedo = false }) {
    const def = FMS_DEFINITIONS.find(d => d.code === code);
    if (!def) return { error: `Unknown FMS milestone: ${code}` };
    if (!baseDueDate) return { error: 'This party has no due bills, so it has no FMS milestones.' };
    if (!ISO_DATE.test(text(actualDate))) return { error: 'Completion date must be in YYYY-MM-DD format.' };
    if (isDone && !allowRedo) return { error: `${code} is already done.` };

    const plannedDate = addDays(baseDueDate, def.offset);
    const isDelayed = actualDate > plannedDate;
    const by = text(completedBy) || 'Admin';
    const note = text(remark);
    const responsibleName = def.role === 'Master' ? marka.master
      : (def.role.includes('PC') || def.role.includes('Process Coordinator')) ? 'Process Coordinator (PC)' : 'Account Team';
    const task = {
      id: 'fms_' + marka.id + '_' + code,
      code,
      taskCode: code,
      taskName: def.name,
      responsibleRole: def.role,
      responsibleName,
      offsetDays: def.offset,
      dueDate: baseDueDate,
      plannedDate,
      actualDate,
      status: isDelayed ? 'Done (Delayed)' : 'Done (On-Time)',
      score: isDelayed ? 0.5 : 1.0,
      remark: note,
      completedBy: by,
      done: true,
      completedAt: new Date(now).toISOString()
    };
    const entry = {
      type: 'followup',
      date: actualDate,
      followper: by,
      status: 'FMS Task Completed',
      remark: `[${code} COMPLETED] ${def.name}. Planned: ${plannedDate}, Actual: ${actualDate} (${isDelayed ? 'Delayed: 0.5 pt' : 'On-Time: 1.0 pt'}). Responsible: ${def.role} (${by}). Note: ${note || 'Milestone achieved.'}`
    };

    if (!marka.fmsTasks) marka.fmsTasks = [];
    const idx = marka.fmsTasks.findIndex(t => t.taskCode === code || t.code === code);
    if (idx >= 0) marka.fmsTasks[idx] = task;
    else marka.fmsTasks.push(task);
    if (!marka.history) marka.history = [];
    marka.history.push(entry);
    return { task, entry };
  }

  const api = { applyPtpFollowup, applyPaymentFollowup, applyComplaintFollowup, completeFmsTask, FMS_DEFINITIONS, CONTACT_MODES, PAY_MODES, COMPLAINT_STATUS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FollowupActions = api;
})(typeof window !== 'undefined' ? window : globalThis);
