// CollectIQ "Party Current Status" page: a one-page health report for a party
// group (every firm under one marka / group code, across masters), with a
// combined view and a view per firm. Numbers come from party-health.js.
const PH = { group: '', firm: 'all', q: '' };

const PH_GRADE_COLORS = { healthy: '#087454', watch: '#b7791f', risk: '#e68938', critical: '#d84a4a' };
const PH_AGE_COLORS = { notDue: '#9cc9b5', d0_30: '#4ba779', d31_60: '#e0b341', d61_90: '#e68938', d91_180: '#d84a4a', d180p: '#8f1d1d' };
const PH_LEVELS = {
  3: { label: 'Act now', cls: 'ph-l3' },
  2: { label: 'This week', cls: 'ph-l2' },
  1: { label: 'Keep an eye', cls: 'ph-l1' },
  0: { label: 'Good', cls: 'ph-l0' }
};

// Parties this login may see (data visibility, see data-access.js).
function phVisibleParties() {
  const list = (markas || []).filter(m => m && m.marka);
  if (!currentUser) return list;
  return DataAccess.filterParties(DataAccess.ruleFor(currentUser), list, { ownerOf, crrOf });
}

function phDate(d) { return `<span class="ph-nw">${fmt(d)}</span>`; }
function phEsc(v) { return escapeHtml(String(v == null ? '' : v)); }
// A value for a quoted JS string inside an onclick attribute.
function phJs(v) { return phEsc(String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")); }

function openPartyHealth(markaId) {
  const m = (markas || []).find(x => String(x.id) === String(markaId));
  if (!m) return toast('Party not found.');
  PH.group = PartyHealth.groupKeyOf(m);
  PH.firm = String(m.id);
  PH.q = '';
  const btn = document.querySelector('.sidebar .nav[data-view="partyHealth"]');
  if (btn) btn.click();
  else switchView('partyHealth');
  if (typeof closeModal === 'function') ['billDetailsModal', 'historyModal'].forEach(id => { try { closeModal(id); } catch (e) { /* not open */ } });
}
window.openPartyHealth = openPartyHealth;

function phSelectGroup(key, firm) {
  PH.group = key || '';
  PH.firm = firm || 'all';
  PH.q = '';
  partyHealthView();
  const top = document.getElementById('partyHealth');
  if (top && top.scrollIntoView) top.scrollIntoView({ block: 'start' });
}

function phSetFirm(v) {
  PH.firm = v || 'all';
  partyHealthView();
}

function phSearch(v) {
  PH.q = v || '';
  phRenderResults();
}

// Quick flags for the party list (no payment matching, so it stays fast).
function phQuickFlags(parties) {
  const ids = new Set(parties.map(p => String(p.id)));
  const todayIso = iso(today);
  let complaints = 0;
  let late = 0;
  parties.forEach(p => {
    complaints += (p.escalations || []).filter(e => e && e.type !== 'Help Ticket' && e.type !== 'Help' && !/resolved|settled|closed/i.test(e.status || 'Open')).length;
    if (totalOutstanding(p) > 0 && (!p.nextDate || p.nextDate < todayIso)) late++;
  });
  const tickets = (helpTickets || []).filter(t => t && (t.status || 'Open').toLowerCase() !== 'resolved' &&
    (ids.has(String(t.markaId)) || parties.some(p => ticketIsFor(t, p)))).length;
  return { complaints, tickets, late };
}

function phGroupRow(g) {
  const f = phQuickFlags(g.parties);
  const flags = [
    f.late ? `<span class="ph-chip ph-chip-warn">${f.late} follow-up late</span>` : '',
    f.complaints ? `<span class="ph-chip ph-chip-bad">${f.complaints} complaint</span>` : '',
    f.tickets ? `<span class="ph-chip ph-chip-bad">${f.tickets} ticket</span>` : ''
  ].join('');
  return `<tr class="ph-click" onclick="phSelectGroup('${phJs(g.key)}')">
    <td data-label="Party"><b>${phEsc(g.code)}</b><div class="ph-sub">${phEsc(g.names.slice(0, 3).join(', '))}${g.names.length > 3 ? ` +${g.names.length - 3}` : ''}</div></td>
    <td data-label="Firms">${g.parties.length}</td>
    <td data-label="Masters"><span class="ph-sub">${phEsc(g.masters.join(', '))}</span></td>
    <td class="money" data-label="Outstanding">${money(g.outstanding)}</td>
    <td data-label="Flags">${flags || '<span class="ph-sub">—</span>'}</td>
  </tr>`;
}

function phMatches(g, q) {
  if (!q) return true;
  const hay = [g.code, ...g.names, ...g.masters, ...g.parties.map(p => ownerOf(p))].join(' ').toLowerCase();
  return q.split(/\s+/).every(w => hay.includes(w));
}

function phRenderResults() {
  const box = document.getElementById('phResults');
  if (!box) return;
  const q = PH.q.toLowerCase().trim();
  if (!q) { box.innerHTML = ''; return; }
  const groups = PartyHealth.groupParties(phVisibleParties()).filter(g => phMatches(g, q)).slice(0, 12);
  box.innerHTML = groups.length ? groups.map(g => `<button type="button" class="ph-result" onclick="phSelectGroup('${phJs(g.key)}')">
      <b>${phEsc(g.code)}</b> <span>${g.parties.length} firm${g.parties.length > 1 ? 's' : ''} · ${phEsc(g.masters.join(', '))}</span> <em>${money(g.outstanding)}</em>
    </button>`).join('') : '<div class="ph-sub" style="padding:8px;">No party matches.</div>';
}

function phPicker(groupObj) {
  const el = document.getElementById('phPicker');
  if (!el) return;
  const firmSel = groupObj && groupObj.parties.length > 1 ? `
    <label class="ph-field">Firm / master
      <select class="filter-input" onchange="phSetFirm(this.value)">
        <option value="all" ${PH.firm === 'all' ? 'selected' : ''}>All ${groupObj.parties.length} firms (combined)</option>
        ${groupObj.parties.map(p => `<option value="${phEsc(p.id)}" ${String(p.id) === PH.firm ? 'selected' : ''}>${phEsc(p.marka)} · ${phEsc(p.master || 'NO MASTER')}</option>`).join('')}
      </select>
    </label>` : '';
  redrawKeepingFocus(el, `
    <div class="ph-picker-row">
      <label class="ph-field ph-search">Party / marka code / master
        <input type="search" id="phSearchInput" class="filter-input" placeholder="Type e.g. JGG, party name or master…" value="${phEsc(PH.q)}" oninput="phSearch(this.value)" autocomplete="off">
      </label>
      ${firmSel}
      ${PH.group ? `<button type="button" class="btn secondary" onclick="phSelectGroup('')">← All parties</button>` : ''}
    </div>
    <div id="phResults" class="ph-results"></div>
  `);
  phRenderResults();
}

function partyHealthView() {
  const report = document.getElementById('phReport');
  if (!report || typeof PartyHealth === 'undefined') return;
  const visible = phVisibleParties();
  const groups = PartyHealth.groupParties(visible);
  const g = PH.group ? groups.find(x => x.key === PH.group) : null;
  if (PH.group && !g) PH.group = '';
  if (g && PH.firm !== 'all' && !g.parties.some(p => String(p.id) === PH.firm)) PH.firm = 'all';
  phPicker(g);

  if (!g) {
    const rows = groups.slice(0, 60);
    report.innerHTML = `
      <div class="panel table-panel">
        <div class="panel-head" style="padding:14px 18px;border-bottom:1px solid #e1ebe6;">
          <h2 style="margin:0;font-size:15px;">Choose a party · biggest outstanding first</h2>
          <span class="ph-sub">${groups.length} parties · firms under one marka code are shown together</span>
        </div>
        <table class="ph-table">
          <thead><tr><th>PARTY / MARKA CODE</th><th>FIRMS</th><th>MASTERS</th><th>OUTSTANDING</th><th>OPEN ISSUES</th></tr></thead>
          <tbody>${rows.map(phGroupRow).join('') || '<tr><td colspan="5" style="text-align:center;padding:24px;color:#788882;">No parties yet.</td></tr>'}</tbody>
        </table>
      </div>`;
    return;
  }

  const todayIso = iso(today);
  const inputs = g.parties.map(p => ({
    party: p,
    payments: (payments || []).filter(x => PartyCheck.paymentBelongs(x, p, markas)),
    tickets: (helpTickets || []).filter(t => ticketIsFor(t, p)),
    complaints: ListFilters.crmItems([p], ownerOf),
    fmsTasks: totalOutstanding(p) > 0 ? getFmsTasks(p) : [],
    owner: ownerOf(p),
    crr: crrOf(p)
  }));
  const r = PartyHealth.groupReport(inputs, { today: todayIso });
  const firm = PH.firm !== 'all' ? r.firms.find(f => String(f.id) === PH.firm) : null;
  report.innerHTML = phReportHtml(g, r, firm);
}
window.partyHealthView = partyHealthView;

// One shape for the combined view and a single firm.
function phViewData(r, firm) {
  const tag = f => ({ firm: f.marka, master: f.master, firmId: f.id });
  if (firm) {
    const t = tag(firm);
    return {
      ...firm, title: `${firm.marka} · ${firm.master}`, multi: false,
      notes: firm.notes, tickets: firm.tickets.map(x => ({ ...x, ...t })), complaints: firm.complaints.map(x => ({ ...x, ...t })),
      ptps: firm.ptps.map(x => ({ ...x, ...t })), payments: firm.payments.map(x => ({ ...x, ...t })),
      followers: firm.followerHistory.map(x => ({ ...x, firms: [firm.marka] })), fms: firm.fms.map(x => ({ ...x, ...t })),
      timeline: firm.timeline.map(x => ({ ...x, ...t })), bills: firm.bills.map(x => ({ ...x, ...t })),
      oldestMonthBills: firm.oldestMonthBills.map(x => ({ ...x, ...t })),
      owners: [firm.owner], crrs: [firm.crr], nextDates: firm.nextDate ? [firm.nextDate] : []
    };
  }
  const c = r.combined;
  const all = key => r.firms.flatMap(f => f[key].map(x => ({ ...x, ...tag(f) })));
  const people = new Map();
  r.firms.forEach(f => f.followerHistory.forEach(p => {
    if (!people.has(p.name)) people.set(p.name, { name: p.name, count: 0, first: p.first, last: p.last, lastRemark: p.lastRemark, firms: [] });
    const x = people.get(p.name);
    x.count += p.count;
    if (p.first < x.first) x.first = p.first;
    if (p.last >= x.last) { x.last = p.last; x.lastRemark = p.lastRemark; }
    x.firms.push(f.marka);
  }));
  const byDateDesc = (a, b) => String(b.date || '').localeCompare(String(a.date || ''));
  return {
    ...c, title: 'All firms combined', multi: r.firms.length > 1,
    tickets: all('tickets').sort((a, b) => (b.open - a.open) || byDateDesc(a, b)),
    complaints: all('complaints').sort((a, b) => (b.open - a.open) || byDateDesc(a, b)),
    ptps: all('ptps').sort(byDateDesc), payments: all('payments').sort(byDateDesc),
    followers: [...people.values()].sort((a, b) => a.first.localeCompare(b.first)),
    fms: all('fms'), timeline: all('timeline').sort(byDateDesc).slice(0, 30),
    bills: all('bills').sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')),
    oldestMonthBills: c.oldestMonthBills.map(x => ({ ...x, firm: x.marka })),
    owners: [...new Set(r.firms.map(f => f.owner))], crrs: [...new Set(r.firms.map(f => f.crr))],
    nextDates: r.firms.map(f => f.nextDate).filter(Boolean).sort(),
    lastStatus: '', remark: ''
  };
}

function phRing(score) {
  const color = PH_GRADE_COLORS[score.grade.key];
  const r = 52;
  const len = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(100, score.total)) / 100 * len;
  return `<svg class="ph-ring" viewBox="0 0 130 130" role="img" aria-label="Health score ${score.total} of 100, ${phEsc(score.grade.label)}">
    <circle cx="65" cy="65" r="${r}" fill="none" stroke="#e7ece9" stroke-width="12"/>
    <circle cx="65" cy="65" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"
      stroke-dasharray="${filled.toFixed(1)} ${len.toFixed(1)}" transform="rotate(-90 65 65)"/>
    <text x="65" y="66" text-anchor="middle" class="ph-ring-num">${Math.round(score.total)}</text>
    <text x="65" y="88" text-anchor="middle" class="ph-ring-lbl">of 100</text>
  </svg>`;
}

function phHBars(rows, fmtVal) {
  const max = Math.max(1, ...rows.map(x => x.value));
  return `<div class="ph-hbars">${rows.map(x => `
    <div class="ph-hbar">
      <span class="ph-hbar-lbl">${phEsc(x.label)}</span>
      <span class="ph-hbar-track"><span class="ph-hbar-fill" style="width:${x.value > 0 ? Math.max(2, x.value / max * 100) : 0}%;background:${x.color || '#087454'}"></span></span>
      <span class="ph-hbar-val">${fmtVal(x)}</span>
    </div>`).join('')}</div>`;
}

function phColumns(rows, fmtVal, color) {
  if (!rows.length) return '<div class="ph-empty">Nothing to show.</div>';
  const max = Math.max(1, ...rows.map(x => x.value));
  const crowded = rows.length > 7;
  return `<div class="ph-cols ${crowded ? 'ph-cols-crowded' : ''}">${rows.map(x => `
    <div class="ph-col" title="${phEsc(x.label)}: ${phEsc(fmtVal(x))}">
      <span class="ph-col-val">${x.value ? phEsc(fmtVal(x)) : ''}</span>
      <span class="ph-col-bar" style="height:${x.value > 0 ? Math.max(3, x.value / max * 100) : 0}%;background:${x.color || color}"></span>
      <span class="ph-col-lbl">${phEsc(x.label)}</span>
    </div>`).join('')}</div>`;
}

function phShortMoney(n) {
  const v = Math.abs(n);
  if (v >= 1e7) return '₹' + (n / 1e7).toFixed(1) + 'Cr';
  if (v >= 1e5) return '₹' + (n / 1e5).toFixed(1) + 'L';
  if (v >= 1e3) return '₹' + (n / 1e3).toFixed(0) + 'k';
  return '₹' + Math.round(n);
}

function phGradeBadge(score) {
  return `<span class="ph-grade" style="background:${PH_GRADE_COLORS[score.grade.key]}">${Math.round(score.total)} · ${phEsc(score.grade.label)}</span>`;
}

function phTile(label, value, sub, tone) {
  return `<div class="metric ph-tile ${tone ? 'ph-tone-' + tone : ''}"><div class="metric-top"><span>${label}</span></div><strong>${value}</strong><small>${sub || '&nbsp;'}</small></div>`;
}

function phPanel(title, body, extra) {
  return `<div class="panel ph-panel"><div class="panel-head"><h2>${title}</h2>${extra || ''}</div>${body}</div>`;
}

function phTable(headers, rows, emptyText) {
  return `<div class="ph-table-wrap"><table class="ph-table">
    <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.join('') : `<tr><td colspan="${headers.length}" class="ph-empty">${emptyText || 'Nothing here.'}</td></tr>`}</tbody>
  </table></div>`;
}

function phReportHtml(g, r, firm) {
  const v = phViewData(r, firm);
  const multi = !firm && r.firms.length > 1;
  const firmCol = multi ? '<th>FIRM</th>' : '';
  const firmCell = x => (multi ? `<td data-label="Firm"><b>${phEsc(x.firm)}</b><div class="ph-sub">${phEsc(x.master)}</div></td>` : '');
  const fh = h => (multi ? ['FIRM', ...h] : h);
  const lateNext = v.nextDates.filter(d => d < r.today).length;

  // 1. Header with score
  const parts = v.score.parts.map(p => ({
    label: p.label, value: p.points, max: p.max,
    color: p.points / p.max >= 0.8 ? '#087454' : p.points / p.max >= 0.5 ? '#e0b341' : '#d84a4a'
  }));
  const head = `
    <div class="panel ph-hero">
      <div class="ph-hero-main">
        <p class="eyebrow">${multi ? 'PARTY GROUP · COMBINED VIEW' : firm ? 'FIRM VIEW' : 'PARTY'}</p>
        <h2 class="ph-hero-title">${phEsc(g.code)} <span class="ph-sub" style="font-size:14px;">${phEsc(v.title)}</span></h2>
        <div class="ph-hero-meta">
          <span><b>${g.parties.length}</b> firm${g.parties.length > 1 ? 's' : ''}</span>
          <span>Masters: <b>${phEsc((firm ? [firm.master] : g.masters).join(', '))}</b></span>
          <span>Followper: <b>${phEsc(v.owners.join(', '))}</b></span>
          <span>CRR: <b>${phEsc(v.crrs.join(', '))}</b></span>
          <span>Report date: <b>${phDate(r.today)}</b></span>
        </div>
        ${firm ? `<div class="ph-hero-actions">
          <button class="row-action btn-update-primary" style="background:#087454;color:#fff;font-weight:700;" onclick="openFollowup('${phJs(firm.id)}')">Update follow-up</button>
          <button class="row-action" onclick="openBillDetails('${phJs(firm.id)}')">📄 Bills</button>
          <button class="row-action" onclick="openPaymentHistory('${phJs(firm.id)}')">₹ Payments</button>
          <button class="row-action" onclick="openHistory('${phJs(firm.id)}')">History</button>
        </div>` : ''}
      </div>
      <div class="ph-hero-score">
        ${phRing(v.score)}
        <div class="ph-grade-lbl" style="color:${PH_GRADE_COLORS[v.score.grade.key]}">${phEsc(v.score.grade.label)}</div>
        ${multi ? '<div class="ph-sub" style="text-align:center;">Half by money due, half by firm count</div>' : ''}
      </div>
      <div class="ph-hero-parts">
        <div class="ph-mini-h">Score breakdown</div>
        ${phHBars(parts, x => `${x.value}/${x.max}`)}
      </div>
    </div>`;

  // 2. KPI tiles
  const om = v.oldestMonth;
  const tiles = `<div class="metrics ph-tiles">
    ${phTile('OUTSTANDING', money(v.outstanding), `${v.billCount} bills · due now ${money(v.dueNow)}`)}
    ${phTile('OLDEST PENDING MONTH', om ? phEsc(om.label) : '—', om ? `${money(om.amount)} · ${om.bills} bill(s) · ${Math.max(0, v.oldestDueDays)} days past due` : 'No pending bill', om && v.oldestDueDays > 60 ? 'bad' : om && v.oldestDueDays > 19 ? 'warn' : '')}
    ${phTile('LAST PAYMENT', v.lastPayment ? money(v.lastPayment.amount) : '—', v.lastPayment ? `${phDate(v.lastPayment.date)}${multi ? ' · ' + phEsc(v.lastPayment.marka) : ''} · ₹ in 90 days ${phShortMoney(v.paid90)}` : 'No payment on record', v.dueNow > 0 && !v.lastPayment ? 'bad' : '')}
    ${phTile('FOLLOW-UPS', `${v.followupCount}`, `${v.followups30} in last 30 days · ${v.onTimePct == null ? 'on-time —' : v.onTimePct + '% on time'}`, v.onTimePct != null && v.onTimePct < 70 ? 'warn' : '')}
    ${phTile('NEXT FOLLOW-UP', v.nextDates.length ? fmt(v.nextDates[0]) : '—', lateNext ? `${lateNext} firm(s) late` : (v.outstanding > 0 && !v.nextDates.length ? 'Not set' : 'On track'), lateNext || (v.outstanding > 0 && !v.nextDates.length) ? 'bad' : '')}
    ${phTile('COMPLAINTS', `${v.openComplaints} open`, `${v.complaints.length} total`, v.openComplaints ? 'bad' : '')}
    ${phTile('HELP TICKETS', `${v.openTickets} open`, `${v.tickets.length} total`, v.openTickets ? 'warn' : '')}
    ${phTile('PROMISES & FMS', `${v.brokenPtps90} broken`, `${v.fmsOverdue} FMS step(s) overdue${(firm ? firm.locked : r.combined.lockedFirms) ? ' · GP locked' : ''}`, v.brokenPtps90 || v.fmsOverdue ? 'warn' : '')}
  </div>`;

  // 3. Analysis notes
  let notes = v.notes;
  if (multi) {
    const perFirm = new Map();
    notes = notes.filter(n => {
      if (n.area === 'Group') return true;
      const k = n.firmId;
      perFirm.set(k, (perFirm.get(k) || 0) + 1);
      return perFirm.get(k) <= 2;
    });
  }
  notes = notes.slice(0, multi ? 16 : 12);
  const notesHtml = phPanel('🩺 Analysis &amp; what to do next', `<ul class="ph-notes">${notes.map(n => {
    const L = PH_LEVELS[n.level] || PH_LEVELS[1];
    return `<li class="${L.cls}">
      <span class="ph-note-lvl">${L.label}</span>
      <div><div class="ph-note-text"><b>${phEsc(n.area)}</b>${n.firm && multi ? ` · <span class="ph-sub">${phEsc(n.firm)}</span>` : ''} — ${phEsc(n.text)}</div>
      <div class="ph-note-act">➜ ${phEsc(n.action)}</div></div>
    </li>`;
  }).join('')}</ul>${v.notes.length > notes.length ? `<div class="ph-sub">+${v.notes.length - notes.length} more — pick a firm above (or click it in the firm-wise table) to see all of its notes.</div>` : ''}`);

  // 4. Charts
  const aging = v.aging.map(a => ({ label: a.label, value: a.amount, bills: a.bills, color: PH_AGE_COLORS[a.key] }));
  const months = v.months.slice(-12).map(mo => ({ label: mo.label.replace(/ 20(\d\d)$/, " '$1"), value: mo.amount, bills: mo.bills }));
  const monthsNote = v.months.length > 12 ? `<div class="ph-sub">Last 12 of ${v.months.length} months shown; older months are in the oldest-month table.</div>` : '';
  const fu = v.fuMonths.map(mo => ({ label: mo.label.replace(/ 20(\d\d)$/, ''), value: mo.count }));
  const charts = `<div class="ph-grid3">
    ${phPanel('Dues by age (past due date)', phHBars(aging, x => `${phShortMoney(x.value)} · ${x.bills}`))}
    ${phPanel('Pending by bill month', phColumns(months, x => phShortMoney(x.value), '#d84a4a') + monthsNote)}
    ${phPanel('Follow-ups per month', phColumns(fu, x => String(x.value), '#087454'))}
  </div>`;

  // 5. Firm-wise / master-wise
  let breakdown = '';
  if (r.firms.length > 1) {
    const firmRows = r.firms.map(f => `<tr class="ph-click ${String(f.id) === PH.firm ? 'ph-selected' : ''}" onclick="phSetFirm('${phJs(f.id)}')">
      <td data-label="Firm"><b>${phEsc(f.marka)}</b></td>
      <td data-label="Master">${phEsc(f.master)}</td>
      <td data-label="Followper">${phEsc(f.owner)}</td>
      <td class="money" data-label="Outstanding">${money(f.outstanding)}</td>
      <td class="money" data-label="Due now">${money(f.dueNow)}</td>
      <td data-label="Oldest month">${f.oldestMonth ? `${phEsc(f.oldestMonth.label)} <span class="ph-sub">(${Math.max(0, f.oldestDueDays)}d)</span>` : '—'}</td>
      <td data-label="Next follow-up" class="${f.nextDate && f.nextLateDays > 0 ? 'ph-bad' : ''}">${phDate(f.nextDate)}</td>
      <td data-label="Follow-ups">${f.followupCount} <span class="ph-sub">${f.onTimePct == null ? '' : f.onTimePct + '% on time'}</span></td>
      <td data-label="Complaints" class="${f.openComplaints ? 'ph-bad' : ''}">${f.openComplaints}</td>
      <td data-label="Tickets" class="${f.openTickets ? 'ph-bad' : ''}">${f.openTickets}</td>
      <td data-label="Score">${phGradeBadge(f.score)}</td>
    </tr>`);
    const masterRows = r.masters.map(ms => `<tr>
      <td data-label="Master"><b>${phEsc(ms.master)}</b></td><td data-label="Firms">${ms.firms}</td>
      <td class="money" data-label="Outstanding">${money(ms.outstanding)}</td><td class="money" data-label="Due now">${money(ms.dueNow)}</td>
      <td data-label="Complaints">${ms.openComplaints}</td><td data-label="Tickets">${ms.openTickets}</td>
      <td data-label="Avg score">${phGradeBadge({ total: ms.score, grade: PartyHealth.gradeOf(ms.score) })}</td>
    </tr>`);
    breakdown = phPanel(`Firm-wise status <span class="ph-sub">(${r.firms.length} firms · weakest first · click a row for its own report)</span>`,
      phTable(['FIRM', 'MASTER', 'FOLLOWPER', 'OUTSTANDING', 'DUE NOW', 'OLDEST MONTH', 'NEXT F/U', 'FOLLOW-UPS', 'COMPLAINTS', 'TICKETS', 'SCORE'], firmRows)) +
      phPanel('Master-wise summary', phTable(['MASTER', 'FIRMS', 'OUTSTANDING', 'DUE NOW', 'OPEN COMPLAINTS', 'OPEN TICKETS', 'AVG SCORE'], masterRows));
  }

  // 6. Oldest pending month details
  const omRows = v.oldestMonthBills.map(b => `<tr>${firmCell(b)}
    <td data-label="Bill no">${phEsc(b.billNos.join(', ') || '—')}</td>
    <td data-label="Bill date">${phDate(b.billDate)}</td><td data-label="Due date">${phDate(b.dueDate)}</td>
    <td data-label="Policy">${phEsc(b.policyName || '—')}</td>
    <td class="money" data-label="Bill amount">${money(b.amount)}</td><td class="money" data-label="Balance"><b>${money(b.balance)}</b></td>
    <td data-label="Days past due" class="${b.overdueDays > 19 ? 'ph-bad' : ''}">${b.overdueDays >= 0 ? b.overdueDays + ' days' : 'not due'}</td>
  </tr>`);
  const oldestPanel = phPanel(`Oldest pending month${om ? ` · ${phEsc(om.label)} · ${money(om.amount)}` : ''}`,
    phTable(fh(['BILL NO', 'BILL DATE', 'DUE DATE', 'POLICY', 'BILL AMOUNT', 'BALANCE', 'PAST DUE']), omRows, 'No pending bill.'));

  // 7. Tickets & complaints
  const tRows = v.tickets.map(t => `<tr>${firmCell(t)}
    <td data-label="Date">${phDate(t.date)}<div class="ph-sub">${t.ageDays} days</div></td>
    <td data-label="Subject"><b>${phEsc(t.subject)}</b><div class="ph-sub">${phEsc(t.remark).slice(0, 140)}</div></td>
    <td data-label="Priority">${phEsc(t.priority)}</td>
    <td data-label="Raised by → helper">${phEsc(t.requestedBy)} → <b>${phEsc(t.assignedHelper)}</b></td>
    <td data-label="Next date" class="${t.nextLate ? 'ph-bad' : ''}">${t.open ? fmt(t.nextDate) : '—'}</td>
    <td data-label="Updates">${t.updates}</td>
    <td data-label="Status"><span class="ph-chip ${t.open ? 'ph-chip-bad' : 'ph-chip-ok'}">${phEsc(t.status)}</span></td>
  </tr>`);
  const cRows = v.complaints.map(c => `<tr>${firmCell(c)}
    <td data-label="Date">${phDate(c.date)}<div class="ph-sub">${c.ageDays} days</div></td>
    <td data-label="Type">${phEsc(c.type)}</td>
    <td data-label="Ref"><b>${phEsc(c.ref || '—')}</b><div class="ph-sub">${phEsc(c.remark).slice(0, 140)}</div></td>
    <td data-label="By → to">${phEsc(c.followper)} → <b>${phEsc(c.escalatedTo || 'CRM')}</b></td>
    <td data-label="Status"><span class="ph-chip ${c.open ? 'ph-chip-bad' : 'ph-chip-ok'}">${phEsc(c.status)}</span></td>
    <td data-label="Resolution">${c.open ? '—' : `${phDate(c.resolvedDate)} ${phEsc(c.resolvedBy)}<div class="ph-sub">${phEsc(c.resolution).slice(0, 120)}</div>`}</td>
  </tr>`);
  const issues = `<div class="ph-grid2">
    ${phPanel(`Help tickets <span class="ph-sub">(${v.openTickets} open of ${v.tickets.length})</span>`, phTable(fh(['DATE', 'SUBJECT', 'PRIORITY', 'RAISED → HELPER', 'NEXT DATE', 'UPDATES', 'STATUS']), tRows, 'No help ticket for this party.'))}
    ${phPanel(`Complaints, claims &amp; escalations <span class="ph-sub">(${v.openComplaints} open of ${v.complaints.length})</span>`, phTable(fh(['DATE', 'TYPE', 'REF / REMARK', 'BY → TO', 'STATUS', 'RESOLUTION']), cRows, 'No complaint for this party.'))}
  </div>`;

  // 8. Follow-up summary, followper history, promises
  const fuSummary = `<div class="ph-fu-stats">
      <div><b>${v.followupCount}</b><span>total follow-ups</span></div>
      <div><b>${v.followups30}</b><span>last 30 days</span></div>
      <div><b>${v.onTime}</b><span>on planned date</span></div>
      <div><b>${v.late}</b><span>late</span></div>
      <div><b>${v.onTimePct == null ? '—' : v.onTimePct + '%'}</b><span>on-time rate</span></div>
      ${firm ? `<div><b>${firm.avgGap == null ? '—' : firm.avgGap + 'd'}</b><span>avg gap</span></div><div><b>${firm.handovers}</b><span>hand-overs</span></div>` : ''}
    </div>
    ${firm && firm.lastFollowup ? `<div class="ph-last-fu"><b>Last follow-up ${phDate(firm.lastFollowup.date)}</b> by ${phEsc(firm.lastFollowup.followper)} · ${phEsc(firm.lastFollowup.status)}${firm.lastFollowup.mode ? ' · ' + phEsc(firm.lastFollowup.mode) : ''}<div>${phEsc(firm.lastFollowup.remark) || '<span class="ph-sub">No remark</span>'}</div></div>` : ''}`;
  const pRows = v.followers.map(p => `<tr>
    <td data-label="Followper"><b>${phEsc(p.name)}</b>${multi ? `<div class="ph-sub">${phEsc([...new Set(p.firms)].join(', '))}</div>` : ''}</td>
    <td data-label="Follow-ups">${p.count}</td><td data-label="First">${phDate(p.first)}</td><td data-label="Last">${phDate(p.last)}</td>
    <td data-label="Last remark"><span class="ph-sub">${phEsc(p.lastRemark).slice(0, 140) || '—'}</span></td>
  </tr>`);
  const ptpRows = v.ptps.slice(0, 8).map(p => `<tr>${firmCell(p)}
    <td data-label="Given on">${phDate(p.date)}</td><td data-label="Promise date">${phDate(p.promise)}</td>
    <td class="money" data-label="Amount">${money(p.expected)}</td><td data-label="By">${phEsc(p.followper)}</td>
    <td data-label="Result"><span class="ph-chip ${p.state === 'Broken' ? 'ph-chip-bad' : p.state === 'Kept' ? 'ph-chip-ok' : 'ph-chip-warn'}">${p.state}</span></td>
  </tr>`);
  const followSection = `<div class="ph-grid2">
    ${phPanel('Follow-up regularity', fuSummary + phTable(['FOLLOWPER', 'FOLLOW-UPS', 'FIRST', 'LAST', 'LAST REMARK'], pRows, 'No follow-up yet.'), `<span class="ph-sub">Assigned followper history</span>`)}
    ${phPanel('Promises to pay', phTable(fh(['GIVEN ON', 'PROMISE DATE', 'AMOUNT', 'BY', 'RESULT']), ptpRows, 'No promise to pay recorded.'))}
  </div>`;

  // 9. Payments, FMS
  const payRows = v.payments.slice(0, 12).map(p => `<tr>${firmCell(p)}
    <td data-label="Date">${phDate(p.date)}</td><td class="money" data-label="Amount"><b>${money(p.amount)}</b></td>
    <td data-label="Mode">${phEsc(p.mode || '—')}</td><td data-label="Ref">${phEsc(p.ref || '—')}</td><td data-label="By">${phEsc(p.followper || '—')}</td>
  </tr>`);
  const fmsOpen = v.fms.filter(t => !t.done || t.status.includes('Delayed'));
  const fmsRows = fmsOpen.slice(0, 12).map(t => `<tr>${firmCell(t)}
    <td data-label="Step"><b>${phEsc(t.code)}</b> ${phEsc(t.name)}</td><td data-label="Responsible">${phEsc(t.responsible || t.role)}</td>
    <td data-label="Planned">${phDate(t.plannedDate)}</td>
    <td data-label="Status"><span class="ph-chip ${t.status === 'Overdue' ? 'ph-chip-bad' : t.done ? 'ph-chip-warn' : ''}">${phEsc(t.status)}${t.delay ? ` · ${t.delay}d` : ''}</span></td>
  </tr>`);
  const payFms = `<div class="ph-grid2">
    ${phPanel(`Recent payments <span class="ph-sub">(₹ in 90 days: ${money(v.paid90)})</span>`, phTable(fh(['DATE', 'AMOUNT', 'MODE', 'REF', 'BY']), payRows, 'No payment on record.'))}
    ${phPanel(`FMS steps open or late <span class="ph-sub">(${fmsOpen.length}${fmsOpen.length > 12 ? ', first 12' : ''})</span>`, phTable(fh(['STEP', 'RESPONSIBLE', 'PLANNED', 'STATUS']), fmsRows, 'All FMS steps are on time.'))}
  </div>`;

  // 10. Timeline and all pending bills
  const tlRows = v.timeline.map(h => `<tr>${firmCell(h)}
    <td data-label="Date">${phDate(h.date)}</td><td data-label="Action"><b>${phEsc(h.type)}</b>${h.amount ? ` · ${money(h.amount)}` : ''}</td>
    <td data-label="By">${phEsc(h.followper || '—')}${h.mode ? `<div class="ph-sub">${phEsc(h.mode)}</div>` : ''}</td>
    <td data-label="Remark">${phEsc(h.remark).slice(0, 220) || '<span class="ph-sub">—</span>'}</td>
    <td data-label="Next">${phDate(h.next)}</td>
  </tr>`);
  const billRows = v.bills.map(b => `<tr>${firmCell(b)}
    <td data-label="Bill no">${phEsc(b.billNos.join(', ') || '—')}</td><td data-label="Bill date">${phDate(b.billDate)}</td><td data-label="Due date">${phDate(b.dueDate)}</td>
    <td class="money" data-label="Balance">${money(b.balance)}</td>
    <td data-label="Past due" class="${b.overdueDays > 19 ? 'ph-bad' : ''}">${b.overdueDays >= 0 ? b.overdueDays + ' days' : 'in ' + (-b.overdueDays) + ' days'}</td>
  </tr>`);
  const tail = `<details class="panel ph-panel ph-details"><summary><h2>Recent activity &amp; remarks <span class="ph-sub">(last ${v.timeline.length})</span></h2></summary>${phTable(fh(['DATE', 'ACTION', 'BY', 'REMARK', 'NEXT']), tlRows, 'No activity yet.')}</details>
    <details class="panel ph-panel ph-details"><summary><h2>All pending bills <span class="ph-sub">(${v.bills.length} · ${money(v.outstanding)})</span></h2></summary>${phTable(fh(['BILL NO', 'BILL DATE', 'DUE DATE', 'BALANCE', 'PAST DUE']), billRows, 'No pending bill.')}</details>`;

  return head + tiles + notesHtml + charts + breakdown + oldestPanel + issues + followSection + payFms + tail;
}

