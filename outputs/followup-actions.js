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

  const api = { applyPtpFollowup, completeFmsTask, FMS_DEFINITIONS, CONTACT_MODES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FollowupActions = api;
})(typeof window !== 'undefined' ? window : globalThis);
