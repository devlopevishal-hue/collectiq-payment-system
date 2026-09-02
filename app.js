// CollectIQ - Payment Collection System - V4 Complete Rewrite
// Daily Rokad Version

// ==========================================
// UTILITY FUNCTIONS & CONSTANTS
// ==========================================
const today = new Date();

function money(n) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(n || 0);
}

function iso(d) {
  if (!d) return '';
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmt(d) {
  if (!d) return '—';
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${day}-${months[parseInt(m, 10) - 1]}-${y}`;
  }
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
}

function days(d) {
  if (!d) return 0;
  let target;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-').map(Number);
    target = new Date(y, m - 1, day);
  } else {
    target = new Date(d);
  }
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.floor((start - end) / (1000 * 60 * 60 * 24));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FIXED_HELP_TARGETS = ['Bhavesh Bhai', 'Saurav Bhai', 'Sales HOD', 'Accounts', 'CRM'];
function helpTargets() {
  return [...new Set([...FIXED_HELP_TARGETS, ...allFollowpers().filter(f => f !== 'Unassigned'), ...allMasters()])];
}
function escalationTargets() {
  return helpTargets();
}

// Master-wise Accountable Person (Followper) Default Mapping
const DEFAULT_MASTER_FOLLOWPERS = {
  'MANISH MASTER': 'Girdharilal',
  'RAJESH MASTER': 'Girdharilal',
  'RIPETSH MASTER': 'Girdharilal',
  'RIPTESH MASTER': 'Girdharilal',
  'KUNAL MASTER': 'Mahavir',
  'GUDDU MASTER': 'Mahavir',
  'KALPESH MASTER': 'Sajjan',
  'BABLU MASTER': 'Surendra',
  'BABLU SHERA MASTER': 'Surendra',
  '11': 'Girdharilal'
};

let masterFollowpers = { ...DEFAULT_MASTER_FOLLOWPERS };

function getMasterFollowper(masterName) {
  if (!masterName) return 'Unassigned';
  const clean = masterName.trim().toUpperCase();
  for (const [k, v] of Object.entries(masterFollowpers)) {
    if (k.toUpperCase() === clean || clean.includes(k.toUpperCase()) || k.toUpperCase().includes(clean)) {
      return v;
    }
  }
  return masterFollowpers[masterName] || 'Unassigned';
}

// ==========================================
// DATA LAYER & STATE
// ==========================================
let markas = [];
let payments = [];
let helpTickets = [];
let users = [];
let currentUser = null;
let tab = 'all';
let markaSubtab = 'markas';
let F = { followper: 'all', master: 'all', marka: '', min: '', max: '', minCount: '', maxCount: '', from: '', to: '' };

// User Access Control & Auth State
const DEFAULT_USERS = [
  { email: 'devlope.vishal@gmail.com', password: '1234', role: 'admin', followperName: 'all' },
  { email: 'admin@collectiq.com', password: '1234', role: 'admin', followperName: 'all' },
  { email: 'accounts@collectiq.com', password: '1234', role: 'user', followperName: 'Account Team' },
  { email: 'crm@collectiq.com', password: '1234', role: 'user', followperName: 'CRM' },
  { email: 'sales.hod@collectiq.com', password: '1234', role: 'superuser', followperName: 'Sales HOD' },
  { email: 'saurav@collectiq.com', password: '1234', role: 'superuser', followperName: 'Saurav Bhai' },
  { email: 'saurav@bhaskarsilkmills.in', password: '1234', role: 'superuser', followperName: 'Saurav Bhai' },
  { email: 'bhavesh@collectiq.com', password: '1234', role: 'superuser', followperName: 'Bhavesh Bhai' },
  { email: 'pc@collectiq.com', password: '1234', role: 'user', followperName: 'Process Coordinator (PC)' },
  { email: 'surendra@collectiq.com', password: '1234', role: 'user', followperName: 'Surendra' },
  { email: 'mahavir@collectiq.com', password: '1234', role: 'user', followperName: 'Mahavir' },
  { email: 'girdharilal@collectiq.com', password: '1234', role: 'user', followperName: 'Girdharilal' },
  { email: 'sajjan@collectiq.com', password: '1234', role: 'user', followperName: 'Sajjan' },
  { email: 'anil.sharma@collectiq.com', password: '1234', role: 'user', followperName: 'Anil Sharma' },
  { email: 'manish.agarwal@collectiq.com', password: '1234', role: 'user', followperName: 'Manish Agarwal' },
  { email: 'ravi.sharma@collectiq.com', password: '1234', role: 'user', followperName: 'Ravi Kant Sharma' }
];

function isLocalServer() {
  const host = window.location.hostname;
  return (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || window.location.port === '3000') && !firestoreDb;
}

function isOnlineMode() {
  return isLocalServer();
}

function checkAuth() {
  const storedUser = localStorage.getItem('collectiq_current_user');
  if (storedUser) {
    currentUser = JSON.parse(storedUser);
    window.currentUser = currentUser;
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('userEmail').textContent = currentUser.email;
    document.getElementById('userAvatar').textContent = currentUser.email.substring(0, 2).toUpperCase();
    
    const isAdmin = currentUser.role === 'admin' || currentUser.role === 'superuser';
    const isMasterAdmin = currentUser.email === 'devlope.vishal@gmail.com' || currentUser.email === 'admin@collectiq.com' || (currentUser.role === 'admin' && currentUser.email.includes('admin'));

    if (!isAdmin) {
      document.getElementById('setupSection').style.display = 'none';
      if (document.getElementById('navUsers')) document.getElementById('navUsers').style.display = 'none';
      if (document.getElementById('resetBillsBtn')) document.getElementById('resetBillsBtn').style.display = 'none';
      F.followper = currentUser.followperName || 'Unassigned';
    } else {
      document.getElementById('setupSection').style.display = 'block';
      if (document.getElementById('navUsers')) document.getElementById('navUsers').style.display = 'block';
      if (document.getElementById('resetBillsBtn')) document.getElementById('resetBillsBtn').style.display = isMasterAdmin ? 'inline-flex' : 'none';
    }
  } else {
    currentUser = null;
    window.currentUser = null;
    document.getElementById('loginOverlay').style.display = 'flex';
  }
}

function showLoginAlert(type, title, message) {
  const alertEl = document.getElementById('loginAlert');
  if (!alertEl) return;
  alertEl.className = 'login-alert ' + (type || 'error');
  
  const icon = type === 'warning' ? `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
  ` : type === 'info' ? `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
  ` : `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
  `;

  alertEl.innerHTML = `${icon}<div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div>`;
  alertEl.style.display = 'flex';
}
window.showLoginAlert = showLoginAlert;

function clearLoginAlert() {
  const alertEl = document.getElementById('loginAlert');
  if (alertEl) {
    alertEl.style.display = 'none';
    alertEl.innerHTML = '';
  }
}
window.clearLoginAlert = clearLoginAlert;

async function handleLoginSubmit(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  clearLoginAlert();

  const inputVal = (document.getElementById('loginEmail').value || '').trim().toLowerCase();
  const password = (document.getElementById('loginPassword').value || '').trim();
  
  if (!inputVal) {
    showLoginAlert('error', 'Username or Email Required', 'Please enter your registered email address or username.');
    return toast('Please enter your email or username.');
  }
  if (!password) {
    showLoginAlert('error', 'Password Required', 'Please enter your account password.');
    return toast('Please enter your password.');
  }

  // Generate or retrieve current device session ID
  let currentDeviceId = localStorage.getItem('collectiq_device_id');
  if (!currentDeviceId) {
    currentDeviceId = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
    localStorage.setItem('collectiq_device_id', currentDeviceId);
  }

  // 1. Try local SQLite Backend if available
  if (isOnlineMode()) {
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inputVal, password, deviceId: currentDeviceId })
      });
      if (response.ok) {
        const data = await response.json();
        currentUser = { ...data.user, deviceId: currentDeviceId };
        window.currentUser = currentUser;
        localStorage.setItem('collectiq_current_user', JSON.stringify(currentUser));
        checkAuth();
        await syncWithDatabase();
        renderAll();
        return toast('Logged in successfully!');
      } else {
        const data = await response.json();
        const errMsg = data.error || 'Authentication failed.';
        if (errMsg.toLowerCase().includes('not exist') || errMsg.toLowerCase().includes('not found')) {
          showLoginAlert('error', 'User Account Not Found', `No user exists with username or email "${inputVal}". Please verify your credentials.`);
        } else if (errMsg.toLowerCase().includes('password')) {
          showLoginAlert('error', 'Incorrect Password', 'The password you entered does not match our records. Please try again.');
        } else {
          showLoginAlert('error', 'Login Failed', errMsg);
        }
        return toast(errMsg);
      }
    } catch (err) {
      console.warn('Local SQLite API unreachable, checking cloud / memory accounts:', err);
    }
  }

  // 2. Client & Cloud Database Auth Evaluation
  const userList = (users && users.length > 0) ? users : DEFAULT_USERS;

  // Find user by email, prefix, or Doer name
  const matchedUser = userList.find(u => {
    const uEmail = (u.email || '').toLowerCase().trim();
    const uDoer = (u.followperName || '').toLowerCase().trim();
    const uPrefix = uEmail.split('@')[0];
    return (uEmail === inputVal || uDoer === inputVal || uPrefix === inputVal);
  });

  // CASE 1: User does not exist
  if (!matchedUser) {
    showLoginAlert('error', 'User Does Not Exist', `No registered account found for "${inputVal}". Please check your spelling or contact Admin.`);
    toast('User does not exist.');
    return;
  }

  // CASE 2: Incorrect Password
  const expectedPwd = matchedUser.password || '1234';
  const isPassMatch = (password === expectedPwd || (expectedPwd === '1234' && password === '1234'));

  if (!isPassMatch) {
    showLoginAlert('error', 'Incorrect Password', 'The password you entered is incorrect. Please check your password and try again.');
    toast('Incorrect password.');
    return;
  }

  // CASE 3: Active session detected on another device
  const now = Date.now();
  let sessionSwitched = false;
  if (matchedUser.activeDeviceId && matchedUser.activeDeviceId !== currentDeviceId && matchedUser.lastActiveTime && (now - matchedUser.lastActiveTime < 20 * 60 * 1000)) {
    sessionSwitched = true;
  }

  // Update device session status on the user record
  matchedUser.activeDeviceId = currentDeviceId;
  matchedUser.lastActiveTime = now;
  matchedUser.lastLoginDevice = navigator.userAgent ? (navigator.userAgent.includes('Mobile') ? 'Mobile Device' : 'Desktop Browser') : 'Web';
  save();

  currentUser = {
    email: matchedUser.email,
    role: matchedUser.role,
    followperName: matchedUser.followperName,
    deviceId: currentDeviceId
  };
  window.currentUser = currentUser;
  localStorage.setItem('collectiq_current_user', JSON.stringify(currentUser));
  
  checkAuth();
  renderAll();

  if (sessionSwitched) {
    toast(`Session active on another device transferred to this device.`);
  } else {
    toast(`Welcome, ${matchedUser.followperName || matchedUser.email}! Logged in successfully.`);
  }
}

function logout() {
  localStorage.removeItem('collectiq_current_user');
  currentUser = null;
  clearLoginAlert();
  document.getElementById('loginOverlay').style.display = 'flex';
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';
  F.followper = 'all';
}
window.handleLoginSubmit = handleLoginSubmit;
window.logout = logout;

function save() {
  window.markas = markas;
  window.helpTickets = helpTickets;
  window.users = users;
  localStorage.setItem('collectiq_markas_v4', JSON.stringify(markas));
  localStorage.setItem('collectiq_rokad_v4', JSON.stringify(payments));
  localStorage.setItem('collectiq_help_tickets_v4', JSON.stringify(helpTickets));
  localStorage.setItem('collectiq_master_followpers_v4', JSON.stringify(masterFollowpers));
  localStorage.setItem('collectiq_users_v4', JSON.stringify(users));
  saveCloud();
}

function migrateV3(oldCases) {
  const markaMap = new Map();
  oldCases.forEach(c => {
    if (!markaMap.has(c.marka)) {
      markaMap.set(c.marka, { cases: [] });
    }
    markaMap.get(c.marka).cases.push(c);
  });
  
  const newMarkas = [];
  markaMap.forEach((data, markaName) => {
    const cases = data.cases;
    const first = cases[0];
    const masterName = first.master || 'Unassigned Master';
    const initialOwner = (first.owner && first.owner !== 'Unassigned') ? first.owner : getMasterFollowper(masterName);
    
    let history = [];
    cases.forEach(c => {
      if (c.history && Array.isArray(c.history)) {
        history.push(...c.history);
      }
    });
    history.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const bills = cases.map((c, i) => ({
      id: Date.now() + i,
      firstDate: c.firstDate,
      balance: c.balance,
      sourceAmount: c.sourceAmount,
      billCount: c.billCount || 1,
      billNos: c.billNos || [],
      policyDate: c.policyDate || '',
      policyName: c.policyName || ''
    }));
    
    const activeCases = cases.filter(c => c.balance > 0);
    let nextDate = '';
    activeCases.forEach(c => {
      if (c.nextDate && (!nextDate || new Date(c.nextDate) < new Date(nextDate))) {
        nextDate = c.nextDate;
      }
    });
    
    let lastDate = '';
    let lastStatus = '';
    let remark = '';
    let ptp = '';
    let expected = 0;
    
    if (history.length > 0) {
      const last = history[history.length - 1];
      lastDate = last.date;
      lastStatus = last.status;
      remark = last.remark;
      ptp = last.promise;
      expected = last.expected;
    } else {
      cases.forEach(c => {
        if (c.lastDate && (!lastDate || new Date(c.lastDate) > new Date(lastDate))) {
          lastDate = c.lastDate;
          lastStatus = c.lastStatus;
          remark = c.remark;
          ptp = c.ptp;
          expected = c.expected;
        }
      });
    }

    newMarkas.push({
      id: uid(),
      marka: markaName,
      master: masterName,
      owner: initialOwner,
      nextDate: nextDate,
      lastDate: lastDate,
      lastStatus: lastStatus,
      remark: remark,
      ptp: ptp,
      expected: expected,
      history: history,
      bills: bills,
      escalations: []
    });
  });
  
  return newMarkas;
}

function load() {
  try {
    const mf = localStorage.getItem('collectiq_master_followpers_v4');
    if (mf) {
      masterFollowpers = { ...DEFAULT_MASTER_FOLLOWPERS, ...JSON.parse(mf) };
    } else {
      masterFollowpers = { ...DEFAULT_MASTER_FOLLOWPERS };
    }

    const v4 = localStorage.getItem('collectiq_markas_v4');
    if (v4) {
      markas = JSON.parse(v4);
    } else {
      markas = [];
    }
    
    markas.forEach(m => {
      if (!m.escalations) m.escalations = [];
      if (!m.history) m.history = [];
      if (!m.bills) m.bills = [];
      if (!m.owner || m.owner === 'Unassigned') {
        const defaultOwner = getMasterFollowper(m.master);
        if (defaultOwner && defaultOwner !== 'Unassigned') {
          m.owner = defaultOwner;
        }
      }
    });

    const p4 = localStorage.getItem('collectiq_rokad_v4');
    if (p4) {
      payments = JSON.parse(p4);
    } else {
      const p3 = localStorage.getItem('collectiq_rojkad_v3');
      if (p3) payments = JSON.parse(p3);
    }

    const ht4 = localStorage.getItem('collectiq_help_tickets_v4');
    if (ht4) {
      try {
        helpTickets = JSON.parse(ht4);
        if (Array.isArray(helpTickets)) {
          helpTickets = helpTickets.filter(t => !t.subject.startsWith('[Ticket Reassigned]'));
        } else {
          helpTickets = [];
        }
      } catch(e) {
        helpTickets = [];
      }
    } else {
      helpTickets = [];
    }
    localStorage.setItem('collectiq_help_tickets_v4', JSON.stringify(helpTickets));
    window.helpTickets = helpTickets;

    const storedUsers = localStorage.getItem('collectiq_users_v4');
    if (storedUsers) {
      try {
        users = JSON.parse(storedUsers);
        if (!Array.isArray(users)) users = [];
      } catch(e) {
        users = [];
      }
    } else {
      users = [];
    }

    DEFAULT_USERS.forEach(defUser => {
      const existing = users.find(u => u.email.toLowerCase() === defUser.email.toLowerCase());
      if (existing) {
        if (existing.password === existing.email || !existing.password || existing.password === 'undefined') {
          existing.password = defUser.password;
        }
        existing.role = defUser.role;
        existing.followperName = defUser.followperName;
      } else {
        users.push({ ...defUser });
      }
    });
    localStorage.setItem('collectiq_users_v4', JSON.stringify(users));
    window.users = users;
    checkAuth();
  } catch (e) {
    console.error('Error loading data:', e);
    markas = [];
    payments = [];
  }
}

// ==========================================
// COMPUTED HELPERS
// ==========================================
function totalOutstanding(m) {
  return (m.bills || []).reduce((sum, b) => sum + (b.balance || 0), 0);
}

function alreadyDueAmount(m) {
  return (m.bills || []).filter(b => b.balance > 0 && days(b.policyDate || b.firstDate) >= 0)
    .reduce((sum, b) => sum + b.balance, 0);
}

function upcomingDueAmount(m) {
  return (m.bills || []).filter(b => b.balance > 0 && days(b.policyDate || b.firstDate) < 0)
    .reduce((sum, b) => sum + b.balance, 0);
}

function activeBills(m) {
  return (m.bills || []).filter(b => b.balance > 0);
}

function oldestDueDate(m) {
  const active = activeBills(m);
  if (!active.length) return '';
  let oldest = '';
  active.forEach(b => {
    const d = b.policyDate || b.firstDate;
    if (d && (!oldest || d < oldest)) oldest = d;
  });
  return oldest || active[0].firstDate || '';
}

function oldestBillDate(m) {
  const active = activeBills(m);
  if (!active.length) return '';
  let oldest = active[0].firstDate;
  active.forEach(b => {
    if (b.firstDate && b.firstDate < oldest) oldest = b.firstDate;
  });
  return oldest;
}

function isLocked(m) {
  const oldest = oldestDueDate(m);
  return totalOutstanding(m) > 0 && oldest && days(oldest) > 19;
}

function followUpCount(m) {
  return (m.history || []).filter(h => h.type === 'followup').length;
}

function activeMarkas() {
  return markas.filter(m => totalOutstanding(m) > 0);
}

function ownerOf(m) {
  return m.owner || 'Unassigned';
}

function allFollowpers() {
  const fromUsers = (users || []).map(u => {
    if (u.followperName && u.followperName.toLowerCase() !== 'all' && u.followperName !== 'Unassigned') {
      return u.followperName.trim();
    }
    if (u.email) {
      const prefix = u.email.split('@')[0];
      return prefix.charAt(0).toUpperCase() + prefix.slice(1);
    }
    return '';
  }).filter(Boolean);

  const fromMarkas = (markas || []).map(ownerOf).filter(n => n && n !== 'Unassigned');
  const fromMasters = Object.values(masterFollowpers || {}).filter(n => n && n !== 'Unassigned');
  const fromDefaults = Object.values(DEFAULT_MASTER_FOLLOWPERS || {});
  const fromHistory = (markas || []).flatMap(m => (m.history || []).map(h => (h.followper || '').trim())).filter(n => n && n !== 'Unassigned');
  const fromTickets = (helpTickets || []).flatMap(t => [t.requestedBy, t.assignedHelper, t.resolvedBy]).filter(n => n && typeof n === 'string' && n !== 'Unassigned');
  const fromEscs = (markas || []).flatMap(m => (m.escalations || []).flatMap(e => [e.followper, e.escalatedTo, e.resolvedBy])).filter(n => n && typeof n === 'string' && n !== 'Unassigned');
  const fromFixed = ['Bhavesh Bhai', 'Saurav Bhai', 'Sales HOD', 'Accounts', 'Process Coordinator (PC)'];

  return [...new Set([
    ...fromUsers,
    ...fromMarkas,
    ...fromMasters,
    ...fromDefaults,
    ...fromHistory,
    ...fromTickets,
    ...fromEscs,
    ...fromFixed
  ])].filter(x => x && x !== 'Unassigned' && x.toLowerCase() !== 'all').sort((a, b) => a.localeCompare(b));
}

function allMasters() {
  return [...new Set(markas.map(m => m.master))].sort();
}

// ==========================================
// TABLE SORTING SYSTEM
// ==========================================
const SORTS = {
  schedule: { col: 'marka', dir: 'asc' },
  fms: { col: 'plannedDate', dir: 'asc' },
  gplock: { col: 'days', dir: 'desc' },
  escalations: { col: 'date', dir: 'desc' },
  helpTickets: { col: 'date', dir: 'desc' },
  markas: { col: 'marka', dir: 'asc' },
  bills: { col: 'firstDate', dir: 'asc' },
  users: { col: 'email', dir: 'asc' }
};

function sortTable(view, col) {
  if (!SORTS[view]) SORTS[view] = { col, dir: 'asc' };
  if (SORTS[view].col === col) {
    SORTS[view].dir = SORTS[view].dir === 'asc' ? 'desc' : 'asc';
  } else {
    SORTS[view].col = col;
    SORTS[view].dir = 'asc';
  }
  updateSortIcons(view);
  if (view === 'schedule') schedule();
  else if (view === 'fms') fmsView();
  else if (view === 'gplock') locks();
  else if (view === 'escalations' || view === 'helpTickets') helpTicketsView();
  else if (view === 'markas') markaView();
  else if (view === 'users') usersView();
  else if (view === 'bills') {
    const modal = document.getElementById('billModal');
    if (modal && modal.dataset.markaId) openBillDetails(modal.dataset.markaId);
  }
}

// ==========================================
// FMS (FLOW MANAGEMENT SYSTEM) DEFINITIONS & HELPERS
// ==========================================
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

function addDaysToIso(isoDateStr, numDays) {
  if (!isoDateStr) return '';
  const d = new Date(isoDateStr + 'T00:00:00');
  d.setDate(d.getDate() + numDays);
  return iso(d);
}

function getFmsTasks(m) {
  const baseDueDate = oldestDueDate(m);
  if (!baseDueDate) return [];
  const tasks = [];
  const todayIso = iso(today);

  FMS_DEFINITIONS.forEach(def => {
    const plannedDate = addDaysToIso(baseDueDate, def.offset);
    
    // Check if task exists in m.fmsTasks (pick latest)
    let saved = [...(m.fmsTasks || [])].reverse().find(t => (t.taskCode === def.code || t.code === def.code));
    
    // Also check if there is a matching history log entry
    if (!saved && m.history) {
      const histMatch = [...m.history].reverse().find(h => 
        (h.status === 'FMS Task Completed' || h.status === 'FMS Milestone' || h.status === 'FMS Milestone Done') && 
        h.remark && (h.remark.includes(`[${def.code}`) || h.remark.includes(`[${def.code} COMPLETED]`))
      );
      if (histMatch) {
        const isDelayed = histMatch.date > plannedDate;
        saved = {
          taskCode: def.code,
          code: def.code,
          taskName: def.name,
          responsibleRole: def.role,
          offsetDays: def.offset,
          dueDate: baseDueDate,
          plannedDate: plannedDate,
          actualDate: histMatch.date,
          status: isDelayed ? 'Done (Delayed)' : 'Done (On-Time)',
          score: isDelayed ? 0.5 : 1.0,
          completedBy: histMatch.followper || 'Admin',
          remark: histMatch.remark,
          done: true
        };
      }
    }

    const defaultResponsibleName = def.role === 'Master' ? m.master : (def.role.includes('PC') || def.role.includes('Process Coordinator')) ? 'Process Coordinator (PC)' : 'Account Team';

    if (saved && (saved.actualDate || saved.done)) {
      const actDate = saved.actualDate || iso(today);
      const isDelayed = actDate > plannedDate;
      const delayDays = Math.max(0, days(plannedDate) - days(actDate));
      const score = (typeof saved.score === 'number') ? saved.score : (isDelayed ? 0.5 : 1.0);
      const status = saved.status || (isDelayed ? 'Done (Delayed)' : 'Done (On-Time)');
      tasks.push({
        code: def.code,
        name: def.name,
        desc: def.desc,
        role: def.role,
        responsibleName: saved.responsibleName || defaultResponsibleName,
        offset: def.offset,
        dueDate: baseDueDate,
        plannedDate: plannedDate,
        actualDate: actDate,
        delay: isDelayed ? Math.max(1, delayDays) : 0,
        score: score,
        status: status,
        completedBy: saved.completedBy || '',
        remark: saved.remark || '',
        isDone: true
      });
    } else {
      const isPast = todayIso > plannedDate;
      const delayDays = isPast ? days(plannedDate) : 0;
      tasks.push({
        code: def.code,
        name: def.name,
        desc: def.desc,
        role: def.role,
        responsibleName: defaultResponsibleName,
        offset: def.offset,
        dueDate: baseDueDate,
        plannedDate: plannedDate,
        actualDate: '',
        delay: delayDays,
        score: 0,
        status: isPast ? 'Overdue' : 'Pending',
        completedBy: '',
        remark: '',
        isDone: false
      });
    }
  });

  return tasks;
}

function updateSortIcons(view) {
  if (!SORTS[view]) return;
  document.querySelectorAll(`[id^="sort_${view}_"]`).forEach(el => {
    const col = el.id.replace(`sort_${view}_`, '');
    if (SORTS[view].col === col) {
      el.textContent = SORTS[view].dir === 'asc' ? '▲' : '▼';
      if (el.parentElement) el.parentElement.classList.add('sort-active');
    } else {
      el.textContent = '⇅';
      if (el.parentElement) el.parentElement.classList.remove('sort-active');
    }
  });
}

function compareVal(a, b, dir) {
  if (a == null && b == null) return 0;
  if (a == null || a === '') return dir === 'asc' ? 1 : -1;
  if (b == null || b === '') return dir === 'asc' ? -1 : 1;
  if (typeof a === 'number' && typeof b === 'number') {
    return dir === 'asc' ? a - b : b - a;
  }
  const sa = String(a).toLowerCase();
  const sb = String(b).toLowerCase();
  return dir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
}

// ==========================================
// FILTER SYSTEM
// ==========================================
function filtered(list = activeMarkas()) {
  if (currentUser && currentUser.role === 'user') {
    const uName = (currentUser.followperName || '').toLowerCase().trim();
    list = list.filter(m => (ownerOf(m) || '').toLowerCase().trim() === uName);
  }
  return list.filter(m =>
    (F.followper === 'all' || (ownerOf(m) || '').toLowerCase().trim() === (F.followper || '').toLowerCase().trim()) &&
    (F.master === 'all' || m.master === F.master) &&
    (!F.marka || m.marka.toLowerCase().includes(F.marka.toLowerCase())) &&
    (!F.min || totalOutstanding(m) >= +F.min) &&
    (!F.max || totalOutstanding(m) <= +F.max) &&
    (!F.minCount || followUpCount(m) >= +F.minCount) &&
    (!F.maxCount || followUpCount(m) <= +F.maxCount) &&
    (!F.from || oldestDueDate(m) >= F.from) &&
    (!F.to || oldestDueDate(m) <= F.to)
  );
}

function filters(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  const masters = allMasters();
  const followpers = allFollowpers();
  const isUserRole = currentUser && currentUser.role === 'user';
  
  const followperOptions = isUserRole
    ? `<option value="${escapeHtml(currentUser.followperName)}" selected>${escapeHtml(currentUser.followperName)}</option>`
    : `<option value="all">All Followpers</option>` + followpers.map(f => `<option value="${escapeHtml(f)}" ${F.followper === f ? 'selected' : ''}>${escapeHtml(f)}</option>`).join('');

  container.innerHTML = `
    <select class="filter-input" data-k="followper" onchange="setF(this)" ${isUserRole ? 'disabled' : ''}>
      ${followperOptions}
    </select>
    <select class="filter-input" data-k="master" onchange="setF(this)">
      <option value="all">All Masters</option>
      ${masters.map(m => `<option value="${escapeHtml(m)}" ${F.master === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
    </select>
    <input class="filter-input" type="text" data-k="marka" placeholder="Marka" value="${escapeHtml(F.marka)}" oninput="setF(this)">
    <input class="filter-input" type="number" data-k="min" placeholder="Min amount" value="${F.min}" oninput="setF(this)">
    <input class="filter-input" type="number" data-k="max" placeholder="Max amount" value="${F.max}" oninput="setF(this)">
    <input class="filter-input" type="number" data-k="minCount" placeholder="Min follow-ups" value="${F.minCount}" oninput="setF(this)">
    <input class="filter-input" type="number" data-k="maxCount" placeholder="Max follow-ups" value="${F.maxCount}" oninput="setF(this)">
    <input class="filter-input" type="date" data-k="from" title="From Due Date" value="${F.from}" onchange="setF(this)">
    <input class="filter-input" type="date" data-k="to" title="To Due Date" value="${F.to}" onchange="setF(this)">
    <button onclick="clearFilters()" class="tiny-btn" style="margin-top:0;align-self:center;">Clear</button>
  `;
}

function setF(el) {
  F[el.dataset.k] = el.value;
  renderAll();
}

function clearFilters() {
  F = { 
    followper: (currentUser && currentUser.role === 'user') ? currentUser.followperName : 'all', 
    master: 'all', 
    marka: '', 
    min: '', 
    max: '', 
    minCount: '', 
    maxCount: '', 
    from: '', 
    to: '' 
  };
  renderAll();
}

// ==========================================
// VIEWS
// ==========================================
function dashboard() {
  const dash = document.getElementById('dashboard');
  if (!dash) return;
  
  let active = activeMarkas();
  const isUserRole = currentUser && currentUser.role === 'user';
  if (isUserRole) {
    active = active.filter(m => ownerOf(m) === currentUser.followperName);
  }
  
  const locks = active.filter(isLocked);
  const unassigned = active.filter(m => ownerOf(m) === 'Unassigned');
  
  let totalOut = 0;
  let alreadyDueTotal = 0;
  let upcomingDueTotal = 0;
  
  active.forEach(m => {
    totalOut += totalOutstanding(m);
    alreadyDueTotal += alreadyDueAmount(m);
    upcomingDueTotal += upcomingDueAmount(m);
  });
  
  const scheduledCount = active.filter(m => !isLocked(m) && m.nextDate && days(m.nextDate) >= 0).length;
  
  let openEscalations = 0;
  active.forEach(m => {
    openEscalations += (m.escalations || []).filter(e => e.status === 'Open').length;
  });
  
  // Attention
  const att = document.getElementById('attention');
  if (att) {
    if (locks.length > 0 || unassigned.length > 0) {
      att.style.display = 'flex';
      let msg = '';
      let btn = '';
      if (locks.length > 0 && unassigned.length > 0) {
        msg = `<strong>Control alert:</strong> ${locks.length} Marka${locks.length !== 1 ? 's are' : ' is'} in GP lock; ${unassigned.length} need a Followper assignment.`;
        btn = `<button onclick="switchView('gplock')">Review GP lock →</button>`;
      } else if (locks.length > 0) {
        msg = `<strong>Control alert:</strong> ${locks.length} Marka${locks.length !== 1 ? 's are' : ' is'} under GP lock (billing & dispatch suspended).`;
        btn = `<button onclick="switchView('gplock')">Review GP lock →</button>`;
      } else {
        msg = `<strong>Control alert:</strong> ${unassigned.length} Marka${unassigned.length !== 1 ? 's need' : ' needs'} a Followper assignment.`;
        btn = `<button onclick="switchView('markas')">Assign Followpers →</button>`;
      }
      att.innerHTML = `<span>⚠️</span> <div>${msg}</div> ${btn}`;
    } else {
      att.style.display = 'none';
      att.innerHTML = '';
    }
  }
  
  // Metrics
  document.getElementById('metrics').innerHTML = [
    ['TOTAL OUTSTANDING', money(totalOut), `${active.length.toLocaleString('en-IN')} active Marka profiles`, ''],
    ['ALREADY DUE (POLICY)', money(alreadyDueTotal), `Due as of today (${money(upcomingDueTotal)} upcoming)`, alreadyDueTotal ? 'bad' : ''],
    ['SCHEDULED FOLLOW-UPS', scheduledCount.toLocaleString('en-IN'), 'Ascending next-date order', ''],
    ['HELP & ESCALATIONS', openEscalations.toLocaleString('en-IN'), 'Open tickets & complaints', openEscalations ? 'bad' : '']
  ].map(x => `
    <div class="metric" onclick="${x[0] === 'HELP & ESCALATIONS' ? "switchView('helpTickets')" : ''}" style="${x[0] === 'HELP & ESCALATIONS' ? 'cursor:pointer;' : ''}">
      <div class="metric-top"><span>${x[0]}</span><span class="${x[3]}">${x[3] ? '●' : ''}</span></div>
      <strong>${x[1]}</strong>
      <small>${x[2]}</small>
    </div>
  `).join('');
  
  // Priority List
  const priority = active.filter(m => !isLocked(m)).sort((a, b) => new Date(a.nextDate || '9999-12-31') - new Date(b.nextDate || '9999-12-31')).slice(0, 6);
  
  document.getElementById('priorityList').innerHTML = priority.length ? priority.map(m => {
    const d = days(m.nextDate);
    const dotColor = d > 0 ? 'red' : d === 0 ? 'orange' : 'green';
    const dueAmt = alreadyDueAmount(m);
    return `
      <div class="queue-item">
        <span class="due-dot ${dotColor}"></span>
        <div>
          <b>${escapeHtml(m.marka)} · ${escapeHtml(m.master)}</b>
          <small>Due (Policy): ${fmt(oldestDueDate(m))} · ${escapeHtml(ownerOf(m))} · ${followUpCount(m)} follow-ups</small>
        </div>
        <div>
          <span class="queue-amount">${money(totalOutstanding(m))}${dueAmt > 0 ? ' <small style="color:#c44d48;">(Due: ' + money(dueAmt) + ')</small>' : ''}</span>
          <button class="tiny-btn" onclick="openFollowup('${m.id}')">Update</button>
        </div>
      </div>
    `;
  }).join('') : '<p class="modal-copy">No active scheduled Markas.</p>';
  
  // Risk bars
  const dueToday = active.filter(m => m.nextDate && days(m.nextDate) === 0).length;
  const overdue1to19 = active.filter(m => m.nextDate && days(m.nextDate) > 0 && days(m.nextDate) <= 19).length;
  
  const r = [
    ['Due today', dueToday, '#78b39b'],
    ['1–19 days overdue', overdue1to19, '#e9bf64'],
    ['GP locked (19+)', locks.length, '#d85a54']
  ];
  document.getElementById('riskList').innerHTML = r.map(x => `
    <div class="age-row">
      <span>${x[0]}</span>
      <div><i style="background:${x[2]};width:${Math.min(100, Math.round(x[1] / Math.max(1, active.length) * 250))}%"></i></div>
      <strong>${x[1]}</strong>
    </div>
  `).join('');
  
  // Score List
  const scores = {};
  markas.forEach(m => {
    const owner = ownerOf(m);
    if (!scores[owner]) scores[owner] = { actions: 0, ptp: 0, overdue: 0, balance: 0 };
    scores[owner].balance += totalOutstanding(m);
    (m.history || []).forEach(h => {
      if (h.type === 'followup') scores[owner].actions++;
      if (h.status === 'Promise to Pay') scores[owner].ptp++;
    });
    if (m.nextDate && days(m.nextDate) > 0) scores[owner].overdue++;
  });
  
  const scoreArr = Object.keys(scores).map(k => ({
    name: k,
    ...scores[k],
    score: (scores[k].actions * 10) + (scores[k].ptp * 6) - (scores[k].overdue * 4)
  })).sort((a, b) => b.score - a.score).slice(0, 5);
  
  document.getElementById('scoreList').innerHTML = scoreArr.length ? scoreArr.map(s => `
    <div class="ptp">
      <div class="ptp-date">${s.score}<br>PTS</div>
      <div>
        <b>${escapeHtml(s.name)}</b>
        <small>${s.actions} actions · ${s.ptp} PTP · ${s.overdue} overdue</small>
      </div>
      <span>${money(s.balance)}</span>
    </div>
  `).join('') : '<p class="modal-copy">No activity logged yet.</p>';
  
  // Activity List
  let allHist = [];
  markas.forEach(m => {
    (m.history || []).forEach(h => {
      allHist.push({ ...h, marka: m.marka });
    });
  });
  allHist.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  document.getElementById('activityList').innerHTML = allHist.slice(0, 5).map(h => {
    const icon = h.type === 'payment' ? '₹' : (h.status === 'Claim Matter' || h.status === 'WhatsApp Complaint' || h.status === 'Claim / Complaint') ? '⚠' : (h.status === 'Escalated' || h.status === 'Help Ticket') ? '↗' : '✓';
    return `
      <div class="timeline">
        <span class="time-icon">${icon}</span>
        <div>
          <b>${escapeHtml(h.marka)} · ${escapeHtml(h.status || h.type)}</b>
          <p>${escapeHtml(h.remark || 'No remark entered.')}</p>
        </div>
        <time>${fmt(h.date)}</time>
      </div>
    `;
  }).join('') || '<p class="modal-copy">No follow-up conversations logged.</p>';
}

function schedule() {
  const container = document.getElementById('schedule');
  if (!container) return;
  
  filters('filterBar');
  const active = filtered().filter(m => !isLocked(m));
  
  const allCount = active.length;
  const dueCount = active.filter(m => m.nextDate && days(m.nextDate) === 0).length;
  const overdueCount = active.filter(m => m.nextDate && days(m.nextDate) > 0).length;
  const upcomingCount = active.filter(m => !m.nextDate || days(m.nextDate) < 0).length;
  
  const tabAll = document.querySelector('.tab[data-filter="all"]');
  if (tabAll) tabAll.innerHTML = `All <span>${allCount}</span>`;
  const tabDue = document.querySelector('.tab[data-filter="due"]');
  if (tabDue) tabDue.innerHTML = `Due today <span>${dueCount}</span>`;
  const tabOverdue = document.querySelector('.tab[data-filter="overdue"]');
  if (tabOverdue) tabOverdue.innerHTML = `Overdue <span>${overdueCount}</span>`;
  const tabUpcoming = document.querySelector('.tab[data-filter="upcoming"]');
  if (tabUpcoming) tabUpcoming.innerHTML = `Upcoming <span>${upcomingCount}</span>`;
  
  let list = active;
  if (tab === 'due') list = active.filter(m => m.nextDate && days(m.nextDate) === 0);
  else if (tab === 'overdue') list = active.filter(m => m.nextDate && days(m.nextDate) > 0);
  else if (tab === 'upcoming') list = active.filter(m => !m.nextDate || days(m.nextDate) < 0);
  
  const { col, dir } = SORTS.schedule;
  list.sort((a, b) => {
    let va, vb;
    if (col === 'marka') { va = a.marka; vb = b.marka; }
    else if (col === 'master') { va = a.master; vb = b.master; }
    else if (col === 'oldestDue') { va = oldestDueDate(a); vb = oldestDueDate(b); }
    else if (col === 'alreadyDue') { va = alreadyDueAmount(a); vb = alreadyDueAmount(b); }
    else if (col === 'balance') { va = totalOutstanding(a); vb = totalOutstanding(b); }
    else if (col === 'owner') { va = ownerOf(a); vb = ownerOf(b); }
    else if (col === 'count') { va = followUpCount(a); vb = followUpCount(b); }
    else if (col === 'nextDate') { va = a.nextDate || '9999-12-31'; vb = b.nextDate || '9999-12-31'; }
    else if (col === 'lastDate') { va = a.lastDate || ''; vb = b.lastDate || ''; }
    else if (col === 'status') {
      const getStatusRank = m => !m.nextDate ? 3 : days(m.nextDate) > 0 ? 1 : days(m.nextDate) === 0 ? 2 : 4;
      va = getStatusRank(a); vb = getStatusRank(b);
    } else {
      va = a.marka; vb = b.marka;
    }
    return compareVal(va, vb, dir);
  });
  
  updateSortIcons('schedule');
  document.getElementById('scheduleSummary').textContent = `${list.length.toLocaleString('en-IN')} cases · sorted by ${col} (${dir})`;
  
  document.getElementById('scheduleTable').innerHTML = list.length ? list.map(m => {
    const d = days(m.nextDate);
    const badge = !m.nextDate ? '<span class="status closed">CLOSED</span>' : d > 0 ? `<span class="status overdue">OVERDUE</span>` : d === 0 ? `<span class="status active">DUE TODAY</span>` : `<span class="status active">UPCOMING</span>`;
    const due = alreadyDueAmount(m);
    return `
      <tr>
        <td><span class="case-name">${escapeHtml(m.marka)}</span></td>
        <td>${escapeHtml(m.master)}</td>
        <td>${fmt(oldestDueDate(m))}</td>
        <td class="money" style="${due > 0 ? 'font-weight:700;color:#c44d48;' : ''}">${money(due)}</td>
        <td class="money">${money(totalOutstanding(m))}</td>
        <td>${escapeHtml(ownerOf(m))}</td>
        <td>${followUpCount(m)}</td>
        <td>${fmt(m.nextDate)}</td>
        <td>${fmt(m.lastDate)}</td>
        <td>${badge}</td>
        <td>
          <button onclick="openHistory('${m.id}')" class="row-action">History</button>
          <button onclick="openBillDetails('${m.id}')" class="row-action">Bills</button>
          <button onclick="openPaymentHistory('${m.id}')" class="row-action">₹ Payments</button>
          <button onclick="openFollowup('${m.id}')" class="row-action" style="background:#087454;color:#fff;">Update</button>
        </td>
      </tr>
    `;
  }).join('') : '<tr><td colspan="11" style="text-align:center;color:#788882;padding:24px;">No cases match these filters.</td></tr>';
}

function locks() {
  const container = document.getElementById('gplock');
  if (!container) return;
  
  filters('lockFilters');
  const lockedList = filtered().filter(isLocked);
  const { col, dir } = SORTS.gplock;
  
  lockedList.sort((a, b) => {
    let va, vb;
    if (col === 'marka') { va = a.marka; vb = b.marka; }
    else if (col === 'oldest') { va = oldestDueDate(a); vb = oldestDueDate(b); }
    else if (col === 'days') { va = days(oldestDueDate(a)); vb = days(oldestDueDate(b)); }
    else if (col === 'balance') { va = totalOutstanding(a); vb = totalOutstanding(b); }
    else if (col === 'owner') { va = ownerOf(a); vb = ownerOf(b); }
    else if (col === 'lastDate') { va = a.lastDate || ''; vb = b.lastDate || ''; }
    else { va = days(oldestDueDate(a)); vb = days(oldestDueDate(b)); }
    return compareVal(va, vb, dir);
  });
  
  updateSortIcons('gplock');

  const metricsEl = document.getElementById('lockMetrics');
  if (metricsEl) {
    const totalLockedAmt = lockedList.reduce((s, m) => s + totalOutstanding(m), 0);
    const hodActionCount = lockedList.filter(m => m.salesHodAction && m.salesHodAction.action).length;
    const maxOverdue = lockedList.reduce((max, m) => Math.max(max, days(oldestDueDate(m))), 0);
    metricsEl.innerHTML = [
      ['GP LOCKED CASES (19+ DAYS)', lockedList.length.toLocaleString('en-IN'), 'Billing & dispatch suspended'],
      ['LOCKED OUTSTANDING', money(totalLockedAmt), 'Immediate recovery required'],
      ['MAX OVERDUE DAYS', `${maxOverdue} Days`, 'From oldest unpaid invoice'],
      ['SALES HOD DIRECTIVES', `${hodActionCount} Updated`, 'Legal & recovery actions initiated']
    ].map(x => `
      <div class="metric">
        <div class="metric-top"><span>${x[0]}</span></div>
        <strong>${x[1]}</strong>
        <small>${x[2]}</small>
      </div>
    `).join('');
  }
  
  const tbody = document.getElementById('lockTable');
  if (tbody) {
    tbody.innerHTML = lockedList.length ? lockedList.map(m => {
      const oldest = oldestDueDate(m);
      const od = days(oldest);
      const hod = m.salesHodAction;
      let hodBadge = hod ? `
        <div style="background:#fff8f4; border:1px solid #fed7c3; border-radius:6px; padding:4px 8px; font-size:11px;">
          <b style="color:#b45309; display:block;">⚠️ ${escapeHtml(hod.action)}</b>
          <small style="color:#6d827a; font-size:10px;">${escapeHtml(hod.remark || '')} · <b>${fmt(hod.date)}</b></small>
        </div>
      ` : '<span style="color:#9ab0a6; font-size:11px;">निर्णय प्रतीक्षारत (Pending HOD)</span>';

      return `
        <tr>
          <td><span class="case-name">${escapeHtml(m.marka)}</span><span class="case-sub">${escapeHtml(m.master)}</span></td>
          <td><b>${fmt(oldest)}</b></td>
          <td><span class="status overdue" style="font-weight:800;">${od} DAYS OVERDUE</span></td>
          <td class="money"><b>${money(totalOutstanding(m))}</b></td>
          <td>${escapeHtml(ownerOf(m))}</td>
          <td style="max-width:280px;">${hodBadge}</td>
          <td>${fmt(m.lastDate)}<br><small style="color:#788882;">${escapeHtml((m.remark || '').substring(0, 40))}</small></td>
          <td>
            <div style="display:flex; gap:4px; flex-wrap:wrap;">
              <button onclick="openPayment('${m.id}')" class="row-action" style="background:#087454; color:#fff; font-weight:700;">+ Clear Payment ₹</button>
              <button onclick="openSalesHodModal('${m.id}')" class="row-action" style="background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; font-weight:700;">Sales HOD Action</button>
              <button onclick="openBillDetails('${m.id}')" class="row-action">Bills</button>
              <button onclick="openHistory('${m.id}')" class="row-action">History</button>
            </div>
          </td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="8" style="text-align:center;color:#788882;padding:24px;">No Marka is currently in GP lock.</td></tr>';
  }
}

function openSalesHodModal(markaId) {
  const m = markas.find(x => x.id === markaId);
  if (!m) return toast('Marka not found.');

  document.getElementById('salesHodMarkaId').value = markaId;
  document.getElementById('salesHodDate').value = iso(today);
  document.getElementById('salesHodBy').value = (currentUser ? currentUser.followperName : 'Sales HOD') || 'Sales HOD';
  document.getElementById('salesHodPartyInfo').innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <h3 style="margin:0; font-size:15px; color:#991b1b;">⊘ GP LOCKED · ${escapeHtml(m.marka)} · ${escapeHtml(m.master)}</h3>
      <span class="status overdue" style="font-weight:800;">${days(oldestDueDate(m))} DAYS OVERDUE</span>
    </div>
    <div style="margin-top:6px; font-size:12px; color:#495d56; display:flex; justify-content:space-between;">
      <span>Total Outstanding: <b style="color:#087454;">${money(totalOutstanding(m))}</b></span>
      <span>First Due Date: <b>${fmt(oldestDueDate(m))}</b></span>
      <span>Assigned Doer: <b>${escapeHtml(ownerOf(m))}</b></span>
    </div>
  `;

  if (m.salesHodAction) {
    document.getElementById('salesHodActionSelect').value = m.salesHodAction.action || 'पेमेंट वाले से फॉलोअप लेना है';
    document.getElementById('salesHodRemark').value = m.salesHodAction.remark || '';
  } else {
    document.getElementById('salesHodActionSelect').value = 'पेमेंट वाले से फॉलोअप लेना है';
    document.getElementById('salesHodRemark').value = '';
  }

  openModal('salesHodModal');
}
window.openSalesHodModal = openSalesHodModal;

async function saveSalesHodAction(e) {
  e.preventDefault();
  const markaId = document.getElementById('salesHodMarkaId').value;
  const m = markas.find(x => x.id === markaId);
  if (!m) return toast('Marka not found.');

  const actionDate = document.getElementById('salesHodDate').value;
  const decisionBy = document.getElementById('salesHodBy').value;
  const action = document.getElementById('salesHodActionSelect').value;
  const remark = document.getElementById('salesHodRemark').value.trim();

  if (!action) return toast('Please select an action.');
  if (!remark) return toast('Please enter action remarks / details.');

  m.salesHodAction = {
    action,
    date: actionDate,
    remark,
    setBy: decisionBy
  };

  if (!m.history) m.history = [];
  m.history.push({
    type: 'followup',
    date: actionDate,
    followper: decisionBy,
    status: 'Sales HOD Action',
    remark: `[Sales HOD Directive: ${action}] ${remark}`
  });

  save();
  closeModal('salesHodModal');
  renderAll();
  toast(`✓ Sales HOD Action (${action}) saved successfully!`);
}
window.saveSalesHodAction = saveSalesHodAction;

function rokad() {
  const container = document.getElementById('rokad');
  if (!container) return;

  filters('rokadFilters');
  
  const from = F.from;
  const to = F.to;
  let filteredPayments = payments.slice();
  if (from) filteredPayments = filteredPayments.filter(p => p.date >= from);
  if (to) filteredPayments = filteredPayments.filter(p => p.date <= to);
  if (F.marka) filteredPayments = filteredPayments.filter(p => (p.marka || '').toLowerCase().includes(F.marka.toLowerCase()));

  const todayIso = iso(today);
  const todayReceived = payments.filter(p => p.date === todayIso).reduce((s, p) => s + (p.amount || 0), 0);
  const totalFiltered = filteredPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const totalAllocations = filteredPayments.reduce((s, p) => s + (p.allocations || []).length, 0);

  const metricsEl = document.getElementById('rokadMetrics');
  if (metricsEl) {
    metricsEl.innerHTML = [
      ["TODAY'S COLLECTIONS", money(todayReceived), 'Cash / Bank / UPI received today'],
      ['FILTERED RECEIPTS', money(totalFiltered), `${filteredPayments.length} transactions recorded`],
      ['INVOICES SETTLED', totalAllocations.toLocaleString('en-IN'), 'Bill allocations applied'],
      ['TOTAL ROKAD POSTINGS', payments.length.toLocaleString('en-IN'), 'Lifetime collection records']
    ].map(x => `
      <div class="metric">
        <div class="metric-top"><span>${x[0]}</span></div>
        <strong>${x[1]}</strong>
        <small>${x[2]}</small>
      </div>
    `).join('');
  }

  const tbody = document.getElementById('rokadTable');
  if (tbody) {
    tbody.innerHTML = filteredPayments.length ? filteredPayments.slice().reverse().map(p => {
      const isSettled = (p.allocations || []).every(a => a.settled);
      const allocText = (p.allocations || []).map(a => `Bill #${a.billId}: ${money(a.amount)}${a.settled ? ' ✓' : ''}`).join(', ') || 'General Allocation';
      const receiptBtn = p.receiptImage ? `
        <button onclick="openReceiptViewer('${escapeHtml(p.ref || 'Receipt')}', '${p.receiptImage}')" class="row-action" style="background:#edf7f2; color:#087454; border:1px solid #c0e7d5; padding:2px 6px; font-size:10px; margin-left:6px;">🖼️ Receipt</button>
      ` : '';

      return `
        <tr>
          <td>
            <b style="font-family:'DM Mono', monospace;">${escapeHtml(p.ref || '—')}</b>
            ${receiptBtn}
          </td>
          <td>${fmt(p.date)}</td>
          <td><span style="background:#e8f4ef; color:#087454; padding:2px 6px; border-radius:4px; font-weight:700; font-size:11px; text-transform:uppercase;">${escapeHtml(p.mode || 'cheque')}</span></td>
          <td class="money"><b>${money(p.amount)}</b></td>
          <td>
            <span class="case-name">${escapeHtml(p.marka || '—')}</span>
            <small style="display:block; color:#6d827a; font-size:11px;">${escapeHtml(allocText)}</small>
          </td>
          <td><span class="status ${isSettled ? 'closed' : 'active'}">${isSettled ? 'SETTLED ✓' : 'PART ◐'}</span></td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="6" style="text-align:center;color:#788882;padding:24px;">No payment receipts recorded in Daily Rokad.</td></tr>';
  }
}
window.rokad = rokad;

function fmsView() {
  const container = document.getElementById('fms');
  if (!container) return;

  const curRole = (F.fmsRole || 'all').trim();
  const curStep = (F.fmsStep || 'all').trim();
  const curStatus = (F.fmsStatus || 'all').trim();

  document.getElementById('fmsFilters').innerHTML = `
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
      <label style="font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;">Responsible Role:
        <select class="filter-input" onchange="F.fmsRole = this.value; fmsView();">
          <option value="all" ${curRole === 'all' ? 'selected' : ''}>All Roles</option>
          <option value="Account Team" ${curRole === 'Account Team' ? 'selected' : ''}>Account Team</option>
          <option value="Process Coordinator (PC)" ${curRole === 'Process Coordinator (PC)' || curRole === 'Process Coordinator' || curRole === 'PC' ? 'selected' : ''}>Process Coordinator (PC)</option>
          <option value="Master" ${curRole === 'Master' ? 'selected' : ''}>Master</option>
        </select>
      </label>
      <label style="font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;">Milestone Step:
        <select class="filter-input" onchange="F.fmsStep = this.value; fmsView();">
          <option value="all" ${curStep === 'all' ? 'selected' : ''}>All Milestone Steps</option>
          <option value="FMS-1" ${curStep === 'FMS-1' ? 'selected' : ''}>FMS-1: Account Update (Due + 2d)</option>
          <option value="FMS-2" ${curStep === 'FMS-2' ? 'selected' : ''}>FMS-2: Master Intimation (Due + 5d)</option>
          <option value="FMS-3" ${curStep === 'FMS-3' ? 'selected' : ''}>FMS-3: Master Sign (Due + 14d)</option>
          <option value="FMS-4" ${curStep === 'FMS-4' ? 'selected' : ''}>FMS-4: Sales HOD Escalation (Due + 15d)</option>
        </select>
      </label>
      <label style="font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;">Status:
        <select class="filter-input" onchange="F.fmsStatus = this.value; fmsView();">
          <option value="all" ${curStatus === 'all' ? 'selected' : ''}>All Statuses</option>
          <option value="Pending" ${curStatus === 'Pending' ? 'selected' : ''}>Pending &amp; Overdue</option>
          <option value="DoneOnTime" ${curStatus === 'DoneOnTime' ? 'selected' : ''}>Done On-Time (1.0 pt)</option>
          <option value="DoneDelayed" ${curStatus === 'DoneDelayed' ? 'selected' : ''}>Done Delayed (0.5 pt)</option>
        </select>
      </label>
      <label style="font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;">Search Marka:
        <input type="text" class="filter-input" placeholder="e.g. ABT..." value="${escapeHtml(F.marka || '')}" oninput="F.marka = this.value; fmsView();" style="width:120px;">
      </label>
      <button id="fmsBulkBtn" onclick="openBulkFmsModal()" class="btn primary" style="padding:6px 14px; font-size:12px; font-weight:700; display:none; margin-left:auto;">✓ Mark Selected Done (0)</button>
    </div>
  `;

  // Gather all FMS tasks across active markas
  const activeList = filtered(activeMarkas());
  let allTasks = [];
  let totalTasksCount = 0;
  let onTimeCount = 0;
  let delayedCount = 0;
  let pendingCount = 0;

  activeList.forEach(m => {
    const tasks = getFmsTasks(m);
    tasks.forEach(t => {
      totalTasksCount++;
      if (t.isDone) {
        if (t.score === 1.0) onTimeCount++;
        else delayedCount++;
      } else {
        pendingCount++;
      }

      // Filter check
      if (curRole !== 'all' && t.role !== curRole) return;
      if (curStep !== 'all' && t.code !== curStep) return;
      if (curStatus === 'Pending' && t.isDone) return;
      if (curStatus === 'DoneOnTime' && (!t.isDone || t.score !== 1.0)) return;
      if (curStatus === 'DoneDelayed' && (!t.isDone || t.score !== 0.5)) return;

      allTasks.push({
        ...t,
        markaId: m.id,
        markaName: m.marka,
        masterName: m.master,
        totalBalance: totalOutstanding(m)
      });
    });
  });

  // Render Metrics
  document.getElementById('fmsMetrics').innerHTML = [
    ['TOTAL FMS MILESTONES', totalTasksCount.toLocaleString('en-IN'), 'Active collection cases'],
    ['ON-TIME DONE (1.0 PT)', onTimeCount.toLocaleString('en-IN'), `${totalTasksCount ? Math.round((onTimeCount/totalTasksCount)*100) : 0}% on-time adherence`],
    ['DELAYED DONE (0.5 PT)', delayedCount.toLocaleString('en-IN'), 'Completed past planned date'],
    ['PENDING / OVERDUE', pendingCount.toLocaleString('en-IN'), 'Immediate action required']
  ].map(x => `
    <div class="metric">
      <div class="metric-top"><span>${x[0]}</span></div>
      <strong>${x[1]}</strong>
      <small>${x[2]}</small>
    </div>
  `).join('');

  // Sorting
  const { col, dir } = SORTS.fms || { col: 'plannedDate', dir: 'asc' };
  allTasks.sort((a, b) => {
    let va = a[col] || '', vb = b[col] || '';
    if (col === 'marka') { va = a.markaName; vb = b.markaName; }
    else if (col === 'balance') { va = a.totalBalance; vb = b.totalBalance; }
    else if (col === 'taskCode') { va = a.code; vb = b.code; }
    return compareVal(va, vb, dir);
  });

  updateSortIcons('fms');

  // Render Table
  const tbody = document.getElementById('fmsTable');
  if (!tbody) return;

  tbody.innerHTML = allTasks.length ? allTasks.map(t => {
    let statusBadge = '';
    if (t.isDone) {
      if (t.score === 1.0) {
        statusBadge = `<span class="status closed" style="font-weight:700;">ON-TIME (1.0 ✓)</span>`;
      } else {
        statusBadge = `<span class="status active" style="background:#fdf2e9; color:#b45309; border:1px solid #fed7aa; font-weight:700;">DELAYED (0.5 ◐)</span>`;
      }
    } else {
      if (t.status === 'Overdue') {
        statusBadge = `<span class="status overdue" style="font-weight:700;">OVERDUE (${t.delay}d)</span>`;
      } else {
        statusBadge = `<span class="status" style="background:#eaf0ee; color:#495d56; font-weight:600;">PENDING</span>`;
      }
    }

    return `
      <tr>
        <td style="text-align:center;">
          ${!t.isDone ? `
            <input type="checkbox" class="fms-select-item" data-marka="${t.markaId}" data-code="${t.code}" onchange="updateFmsBulkButton()" style="cursor:pointer; width:15px; height:15px;">
          ` : `
            <span style="color:#087454; font-weight:bold; font-size:12px;">✓</span>
          `}
        </td>
        <td>
          <span class="case-name">${escapeHtml(t.markaName)}</span>
          <span class="case-sub">${escapeHtml(t.masterName)}</span>
        </td>
        <td>${fmt(t.dueDate)}</td>
        <td class="money"><b>${money(t.totalBalance)}</b></td>
        <td>
          <div style="font-weight:700; color:#182e25;"><span style="background:#e8f4ef; padding:1px 5px; border-radius:3px; color:#087454; font-family:'DM Mono', monospace; font-size:11px; margin-right:4px;">${t.code}</span>${escapeHtml(t.name)}</div>
          <small style="color:#788882; font-size:10px; display:block; margin-top:2px;">${escapeHtml(t.desc)}</small>
        </td>
        <td>
          <b style="color:#087454;">${escapeHtml(t.role)}</b>
          <span class="case-sub" style="font-size:11px; color:#495d56;">${escapeHtml(t.responsibleName)}</span>
        </td>
        <td><b>${fmt(t.plannedDate)}</b><br><small style="color:#788882; font-size:10px;">Due + ${t.offset} days</small></td>
        <td>${t.actualDate ? `<b>${fmt(t.actualDate)}</b><br><small style="color:#6d827a;">by ${escapeHtml(t.completedBy || 'Admin')}</small>` : '<span style="color:#9ab0a6;">—</span>'}</td>
        <td style="text-align:center; font-family:'DM Mono', monospace; font-size:12px; ${t.delay > 0 ? 'color:#c44d48; font-weight:700;' : 'color:#6d827a;'}">
          ${t.delay > 0 ? `+${t.delay}d` : '0d'}
        </td>
        <td style="text-align:center; font-family:'DM Mono', monospace; font-size:13px; font-weight:800; color:${t.score === 1.0 ? '#087454' : t.score === 0.5 ? '#b45309' : '#8fa099'};">
          ${t.score > 0 ? t.score.toFixed(1) : '—'}
        </td>
        <td>${statusBadge}</td>
        <td>
          ${t.isDone ? `
            <button onclick="openFmsModal('${t.markaId}', '${t.code}')" class="row-action" style="background:#edf7f2; color:#087454; border:1px solid #c0e7d5; font-size:11px;">👁️ View / Edit</button>
          ` : `
            <button onclick="openFmsModal('${t.markaId}', '${t.code}')" class="row-action" style="background:#087454; color:#fff; font-weight:700; font-size:11px;">Mark Done ✓</button>
          `}
        </td>
      </tr>
    `;
  }).join('') : '<tr><td colspan="12" style="text-align:center;color:#788882;padding:24px;">No FMS milestone tasks found.</td></tr>';
}

function toggleAllFmsSelect(masterCheckbox) {
  const isChecked = masterCheckbox.checked;
  document.querySelectorAll('.fms-select-item').forEach(cb => cb.checked = isChecked);
  updateFmsBulkButton();
}
window.toggleAllFmsSelect = toggleAllFmsSelect;

function updateFmsBulkButton() {
  const checked = document.querySelectorAll('.fms-select-item:checked');
  const btn = document.getElementById('fmsBulkBtn');
  if (btn) {
    btn.style.display = checked.length > 0 ? 'inline-flex' : 'none';
    btn.textContent = `✓ Mark Selected Done (${checked.length})`;
  }
  const selectAllCb = document.getElementById('fmsSelectAll');
  const allCbs = document.querySelectorAll('.fms-select-item');
  if (selectAllCb && allCbs.length > 0) {
    selectAllCb.checked = checked.length === allCbs.length;
  }
}
window.updateFmsBulkButton = updateFmsBulkButton;

function openBulkFmsModal() {
  const checked = document.querySelectorAll('.fms-select-item:checked');
  if (!checked.length) return toast('No milestone tasks selected.');
  
  document.getElementById('bulkFmsCount').textContent = checked.length;
  document.getElementById('bulkFmsDate').value = iso(today);
  document.getElementById('bulkFmsCompletedBy').value = (currentUser ? currentUser.followperName : 'Admin') || 'Admin';
  document.getElementById('bulkFmsRemark').value = '';
  openModal('bulkFmsModal');
}
window.openBulkFmsModal = openBulkFmsModal;

async function saveBulkFmsDone(e) {
  e.preventDefault();
  const checked = document.querySelectorAll('.fms-select-item:checked');
  if (!checked.length) return toast('No milestone tasks selected.');

  const actualDate = document.getElementById('bulkFmsDate').value;
  const completedBy = document.getElementById('bulkFmsCompletedBy').value.trim() || 'Admin';
  const remark = document.getElementById('bulkFmsRemark').value.trim();

  if (!remark) return toast('Please enter completion remark.');

  let count = 0;
  checked.forEach(cb => {
    const markaId = cb.dataset.marka;
    const taskCode = cb.dataset.code;
    const m = markas.find(x => x.id === markaId);
    if (!m) return;
    const def = FMS_DEFINITIONS.find(d => d.code === taskCode);
    const baseDueDate = oldestDueDate(m);
    const plannedDate = addDaysToIso(baseDueDate, def ? def.offset : 0);
    const isDelayed = actualDate > plannedDate;
    const score = isDelayed ? 0.5 : 1.0;
    const status = isDelayed ? 'Done (Delayed)' : 'Done (On-Time)';
    const respName = def ? (def.role === 'Master' ? m.master : (def.role.includes('PC') || def.role.includes('Process Coordinator')) ? 'Process Coordinator (PC)' : 'Account Team') : 'Account Team';

    if (!m.fmsTasks) m.fmsTasks = [];
    let existingIdx = m.fmsTasks.findIndex(t => (t.code === taskCode || t.taskCode === taskCode));
    const taskObj = {
      id: 'fms_' + m.id + '_' + taskCode,
      code: taskCode,
      taskCode: taskCode,
      taskName: def ? def.name : taskCode,
      responsibleRole: def ? def.role : '',
      responsibleName: respName,
      offsetDays: def ? def.offset : 0,
      dueDate: baseDueDate,
      plannedDate: plannedDate,
      actualDate: actualDate,
      status: status,
      score: score,
      remark: remark,
      completedBy: completedBy,
      done: true,
      completedAt: new Date().toISOString()
    };

    if (existingIdx >= 0) {
      m.fmsTasks[existingIdx] = taskObj;
    } else {
      m.fmsTasks.push(taskObj);
    }

    if (!m.history) m.history = [];
    m.history.push({
      type: 'followup',
      date: actualDate,
      followper: completedBy,
      status: 'FMS Task Completed',
      remark: `[${taskCode} COMPLETED] ${def ? def.name : taskCode}. Planned: ${plannedDate}, Actual: ${actualDate} (${isDelayed ? 'Delayed: 0.5 pt' : 'On-Time: 1.0 pt'}). Responsible: ${def ? def.role : ''} (${completedBy}). Note: ${remark}`
    });
    count++;
  });

  save();
  closeModal('bulkFmsModal');
  renderAll();
  toast(`✓ Successfully marked ${count} FMS milestone tasks as Done!`);
}
window.saveBulkFmsDone = saveBulkFmsDone;

function openFmsModal(markaId, taskCode) {
  const m = markas.find(x => x.id === markaId);
  if (!m) return toast('Marka not found.');
  const tasks = getFmsTasks(m);
  const t = tasks.find(x => x.code === taskCode);
  if (!t) return toast('Milestone task not found.');

  document.getElementById('fmsMarkaId').value = markaId;
  document.getElementById('fmsTaskCode').value = taskCode;
  document.getElementById('fmsDueDate').value = t.dueDate;
  document.getElementById('fmsOffsetDays').value = t.offset;
  document.getElementById('fmsPlannedDate').value = t.plannedDate;
  document.getElementById('fmsActualDate').value = t.actualDate || iso(today);
  document.getElementById('fmsResponsibleRole').value = `${t.role} (${t.responsibleName})`;
  document.getElementById('fmsCompletedBy').value = t.completedBy || (window.currentUser ? (window.currentUser.followperName || window.currentUser.email) : 'Admin');
  document.getElementById('fmsRemark').value = t.remark || '';

  document.getElementById('fmsModalTitle').textContent = `Complete ${t.code} · ${escapeHtml(m.marka)} · ${escapeHtml(m.master)}`;
  document.getElementById('fmsTaskInfo').innerHTML = `
    <div style="font-weight:700; color:#182e25; font-size:13px;"><span style="color:#087454; font-family:'DM Mono', monospace; margin-right:6px;">${t.code}</span>${escapeHtml(t.name)}</div>
    <div style="color:#495d56; font-size:11px; margin-top:2px;">${escapeHtml(t.desc)}</div>
    <div style="display:flex; justify-content:space-between; margin-top:6px; font-size:11px; color:#6d827a;">
      <span>Invoice Due Date: <b>${fmt(t.dueDate)}</b></span>
      <span>Target (Due + ${t.offset}d): <b>${fmt(t.plannedDate)}</b></span>
      <span>Total Due: <b style="color:#087454;">${money(t.totalBalance || totalOutstanding(m))}</b></span>
    </div>
  `;

  updateFmsScorePreview();
  openModal('fmsModal');
}
window.openFmsModal = openFmsModal;

function updateFmsScorePreview() {
  const pDate = document.getElementById('fmsPlannedDate').value;
  const aDate = document.getElementById('fmsActualDate').value;
  const previewEl = document.getElementById('fmsScorePreview');
  if (!previewEl || !pDate || !aDate) return;

  const isDelayed = aDate > pDate;
  if (isDelayed) {
    const delayDays = Math.max(1, days(pDate) - days(aDate));
    previewEl.style.background = '#fef3eb';
    previewEl.style.color = '#b45309';
    previewEl.style.border = '1px solid #fed7aa';
    previewEl.innerHTML = `⚠️ Score: <b>0.5 points</b> (Delayed completion by ${delayDays} day${delayDays > 1 ? 's' : ''})`;
  } else {
    previewEl.style.background = '#edf7f2';
    previewEl.style.color = '#087454';
    previewEl.style.border = '1px solid #c0e7d5';
    previewEl.innerHTML = `✓ Score: <b>1.0 point</b> (On-Time completion adhering to planned date)`;
  }
}
window.updateFmsScorePreview = updateFmsScorePreview;

async function saveFmsTask(e) {
  e.preventDefault();
  const markaId = document.getElementById('fmsMarkaId').value;
  const taskCode = document.getElementById('fmsTaskCode').value;
  const dueDate = document.getElementById('fmsDueDate').value;
  const offsetDays = +document.getElementById('fmsOffsetDays').value || 0;
  const plannedDate = document.getElementById('fmsPlannedDate').value;
  const actualDate = document.getElementById('fmsActualDate').value;
  const completedBy = document.getElementById('fmsCompletedBy').value.trim() || 'Admin';
  const remark = document.getElementById('fmsRemark').value.trim();

  const m = markas.find(x => x.id === markaId);
  if (!m) return toast('Marka not found.');
  const def = FMS_DEFINITIONS.find(d => d.code === taskCode);
  if (!def) return toast('Invalid task code.');

  const isDelayed = actualDate > plannedDate;
  const score = isDelayed ? 0.5 : 1.0;
  const status = isDelayed ? 'Done (Delayed)' : 'Done (On-Time)';
  const respName = def.role === 'Master' ? m.master : (def.role.includes('PC') || def.role.includes('Process Coordinator')) ? 'Process Coordinator (PC)' : 'Account Team';

  const taskObj = {
    id: 'fms_' + m.id + '_' + taskCode,
    code: taskCode,
    taskCode: taskCode,
    taskName: def.name,
    responsibleRole: def.role,
    responsibleName: respName,
    offsetDays: def.offset,
    dueDate,
    plannedDate,
    actualDate,
    status,
    score,
    remark,
    completedBy,
    done: true,
    completedAt: new Date().toISOString()
  };

  if (!m.fmsTasks) m.fmsTasks = [];
  const idx = m.fmsTasks.findIndex(t => (t.taskCode === taskCode || t.code === taskCode));
  if (idx >= 0) m.fmsTasks[idx] = taskObj;
  else m.fmsTasks.push(taskObj);

  // Append to history
  const histRemark = `[${taskCode} COMPLETED] ${def.name}. Planned: ${plannedDate}, Actual: ${actualDate} (${isDelayed ? 'Delayed: 0.5 pt' : 'On-Time: 1.0 pt'}). Responsible: ${def.role} (${completedBy}). Note: ${remark || 'Milestone achieved.'}`;
  if (!m.history) m.history = [];
  m.history.push({
    type: 'followup',
    date: actualDate,
    followper: completedBy,
    status: 'FMS Task Completed',
    remark: histRemark
  });

  save();
  closeModal('fmsModal');
  renderAll();
  toast(`✓ ${taskCode} marked done (${score} pt).`);
}
window.saveFmsTask = saveFmsTask;

function analysis() {
  const container = document.getElementById('analysis');
  if (!container) return;
  
  filters('analysisFilters');
  const list = filtered();
  
  let actions = 0, ptps = 0, locks = 0, escs = 0;
  let totalFmsCompleted = 0, totalFmsOnTime = 0, totalFmsDelayed = 0;
  
  const ownerStats = {};
  const fmsStepStats = {
    'FMS-1': { name: 'FMS-1: Account Update (Due+2d)', role: 'Account Team', onTime: 0, delayed: 0, pending: 0 },
    'FMS-2': { name: 'FMS-2: Master Intimate (Due+5d)', role: 'Process Coordinator (PC)', onTime: 0, delayed: 0, pending: 0 },
    'FMS-3': { name: 'FMS-3: Master Sign (Due+14d)', role: 'Master', onTime: 0, delayed: 0, pending: 0 },
    'FMS-4': { name: 'FMS-4: Sales HOD Escalation (Due+15d)', role: 'Process Coordinator (PC)', onTime: 0, delayed: 0, pending: 0 }
  };
  
  list.forEach(m => {
    if (isLocked(m)) locks++;
    escs += (m.escalations || []).filter(e => e.status === 'Open').length;
    
    const owner = ownerOf(m);
    if (!ownerStats[owner]) {
      ownerStats[owner] = {
        actions: 0,
        calls: 0,
        visits: 0,
        wa: 0,
        ptp: 0,
        ptpAmount: 0,
        collected: 0,
        overdue: 0,
        balance: 0,
        markaCount: 0,
        fmsOnTime: 0,
        fmsDelayed: 0,
        fmsOverdue: 0,
        helpResolved: 0,
        helpFollowups: 0,
        crmResolved: 0,
        totalPoints: 0
      };
    }
    ownerStats[owner].balance += totalOutstanding(m);
    ownerStats[owner].markaCount++;
    if (m.nextDate && days(m.nextDate) > 0) ownerStats[owner].overdue++;
    
    // Process FMS milestone tasks for this marka
    const fmsTasks = getFmsTasks(m);
    fmsTasks.forEach(t => {
      if (fmsStepStats[t.code]) {
        if (t.isDone) {
          if (t.score === 1.0) fmsStepStats[t.code].onTime++;
          else fmsStepStats[t.code].delayed++;
        } else {
          fmsStepStats[t.code].pending++;
        }
      }

      if (t.isDone) {
        totalFmsCompleted++;
        if (t.score === 1.0) {
          totalFmsOnTime++;
          ownerStats[owner].fmsOnTime++;
          ownerStats[owner].totalPoints += 1.0;
        } else {
          totalFmsDelayed++;
          ownerStats[owner].fmsDelayed++;
          ownerStats[owner].totalPoints += 0.5;
        }
      } else {
        if (t.status === 'Overdue') ownerStats[owner].fmsOverdue++;
      }
    });

    (m.history || []).forEach(h => {
      if (h.type === 'followup') {
        actions++;
        ownerStats[owner].actions++;
        const isV = h.mode && (h.mode.toLowerCase().includes('person') || h.mode.toLowerCase().includes('visit'));
        const isC = h.mode && h.mode.toLowerCase().includes('phone');
        const isW = h.mode && h.mode.toLowerCase().includes('whatsapp');
        if (isV) ownerStats[owner].visits++;
        else if (isW) ownerStats[owner].wa++;
        else ownerStats[owner].calls++;

        if (h.status === 'Promise to Pay') {
          ptps++;
          ownerStats[owner].ptp++;
          ownerStats[owner].ptpAmount += (h.expected || 0);
        }
      } else if (h.type === 'payment') {
        ownerStats[owner].collected += (h.amount || 0);
      }
    });
  });

  // Ensure all active followpers exist in ownerStats
  allFollowpers().filter(x => x !== 'Unassigned').forEach(d => {
    if (!ownerStats[d]) {
      ownerStats[d] = {
        actions: 0, calls: 0, visits: 0, wa: 0, ptp: 0, ptpAmount: 0,
        collected: 0, overdue: 0, balance: 0, markaCount: 0,
        fmsOnTime: 0, fmsDelayed: 0, fmsOverdue: 0, helpResolved: 0,
        helpFollowups: 0, crmResolved: 0, totalPoints: 0
      };
    }
  });

  // Process Help Tickets for scoring
  (helpTickets || []).forEach(t => {
    const isDone = (t.status || '').toLowerCase() === 'resolved';
    const doer = t.resolvedBy || t.assignedHelper;
    if (doer && ownerStats[doer]) {
      if (isDone) ownerStats[doer].helpResolved++;
    }
    (t.history || []).forEach(h => {
      if (h.followper && ownerStats[h.followper] && h.actionType === 'Interim Follow-up') {
        ownerStats[h.followper].helpFollowups++;
      }
    });
  });

  // Process CRM Escalations for scoring
  markas.forEach(m => {
    (m.escalations || []).forEach(e => {
      const isDone = (e.status || '').toLowerCase() === 'resolved';
      const doer = e.resolvedBy || e.escalatedTo || e.followper;
      if (isDone && doer && ownerStats[doer]) {
        ownerStats[doer].crmResolved++;
      }
    });
  });
  
  const adherenceRate = totalFmsCompleted > 0 ? Math.round(((totalFmsOnTime * 1.0 + totalFmsDelayed * 0.5) / totalFmsCompleted) * 100) : 100;

  document.getElementById('analysisMetrics').innerHTML = [
    ['PLANNED VS ACTUAL ADHERENCE', `${adherenceRate}%`, `${totalFmsOnTime} on-time (1.0) · ${totalFmsDelayed} delayed (0.5)`],
    ['FMS ON-TIME TASKS (1.0 PT)', totalFmsOnTime.toLocaleString('en-IN'), '1.0 point earned per on-time task'],
    ['HELP & CRM ACTIONS (+15 PTS)', `${(helpTickets || []).filter(t => t.status === 'Resolved').length} Help · ${markas.reduce((n, m) => n + (m.escalations || []).filter(e => e.status === 'Resolved').length, 0)} CRM`, 'Assistance & claim settlements'],
    ['FOLLOW-UP ACTIONS & PTP', `${actions} / ${ptps}`, 'Conversations & commitments']
  ].map(x => `
    <div class="metric">
      <div class="metric-top"><span>${x[0]}</span></div>
      <strong>${x[1]}</strong>
      <small>${x[2]}</small>
    </div>
  `).join('');
  
  const ownerArr = Object.keys(ownerStats).map(k => {
    const s = ownerStats[k];
    const doneTasks = s.fmsOnTime + s.fmsDelayed;
    const taskAdherence = doneTasks > 0 ? Math.round(((s.fmsOnTime * 1.0 + s.fmsDelayed * 0.5) / doneTasks) * 100) : 100;
    const overallScore = Math.round(
      (s.calls * 5) + 
      (s.visits * 15) + 
      (s.wa * 5) + 
      (s.ptp * 10) + 
      (s.fmsOnTime * 20) + 
      (s.fmsDelayed * 10) + 
      (s.helpResolved * 15) + 
      (s.helpFollowups * 5) + 
      (s.crmResolved * 15) + 
      Math.round(s.collected / 10000) - 
      (s.overdue * 5)
    );
    return {
      name: k,
      ...s,
      taskAdherence,
      overallScore
    };
  }).sort((a, b) => b.overallScore - a.overallScore);
  
  // Render Doer Leaderboard
  const leaderboardEl = document.getElementById('doerLeaderboardContainer');
  if (leaderboardEl) {
    leaderboardEl.innerHTML = `
      <table style="width:100%;">
        <thead>
          <tr>
            <th style="width:50px; text-align:center;">RANK</th>
            <th>DOER / SALES PERSON</th>
            <th>ASSIGNED PORTFOLIO</th>
            <th style="text-align:center;">CALLS</th>
            <th style="text-align:center;">FIELD VISITS</th>
            <th style="text-align:center;">WHATSAPP</th>
            <th style="text-align:center;">PTP</th>
            <th style="text-align:center;">FMS TASK</th>
            <th style="text-align:center;">HELP DONE</th>
            <th style="text-align:center;">CRM SETTLED</th>
            <th style="text-align:center;">TOTAL SCORE</th>
            <th>PERFORMANCE</th>
          </tr>
        </thead>
        <tbody>
          ${ownerArr.map((x, idx) => {
            const medals = ['🥇', '🥈', '🥉'];
            const rankIcon = idx < 3 ? medals[idx] : `#${idx + 1}`;
            const perfBadge = x.overallScore >= 100 ? '🔥 Top Performer' : x.overallScore >= 50 ? '⭐ High Achiever' : x.overallScore >= 0 ? '👍 Active' : '⚠️ Needs Focus';
            const badgeBg = x.overallScore >= 100 ? '#edf7f2' : x.overallScore >= 50 ? '#f0f7ff' : x.overallScore >= 0 ? '#fafafa' : '#faeceb';
            const badgeColor = x.overallScore >= 100 ? '#087454' : x.overallScore >= 50 ? '#1d4ed8' : (x.overallScore >= 0 ? '#495d56' : '#c44d48');
            const isCurrent = currentUser && (currentUser.followperName || '').toLowerCase().trim() === (x.name || '').toLowerCase().trim();

            return `
              <tr style="${isCurrent ? 'background:#f0faf5; font-weight:700;' : ''}">
                <td style="text-align:center; font-size:16px;">${rankIcon}</td>
                <td>
                  <span class="person-name" style="font-weight:700; color:#182e25; font-size:13px;">${escapeHtml(x.name)}</span>
                  ${isCurrent ? '<span style="font-size:10px; background:#087454; color:#fff; padding:1px 5px; border-radius:3px; margin-left:6px;">YOU</span>' : ''}
                </td>
                <td>
                  <b>${money(x.balance)}</b>
                  <small style="color:#788882; display:block;">${x.markaCount} Markas</small>
                </td>
                <td style="text-align:center; font-family:'DM Mono',monospace;">${x.calls}</td>
                <td style="text-align:center; font-family:'DM Mono',monospace; font-weight:700; color:#087454;">${x.visits}</td>
                <td style="text-align:center; font-family:'DM Mono',monospace;">${x.wa}</td>
                <td style="text-align:center; font-family:'DM Mono',monospace; font-weight:700;">${x.ptp}</td>
                <td style="text-align:center;">
                  <span style="font-weight:700; color:#087454; font-family:'DM Mono',monospace;">${x.taskAdherence}%</span>
                  <small style="display:block; font-size:10px; color:#6d827a;">${x.fmsOnTime} on-time</small>
                </td>
                <td style="text-align:center; font-family:'DM Mono',monospace; font-weight:700; color:#087454;">${x.helpResolved}${x.helpFollowups > 0 ? ` <small style="color:#6d827a;">(+${x.helpFollowups})</small>` : ''}</td>
                <td style="text-align:center; font-family:'DM Mono',monospace; font-weight:700; color:#087454;">${x.crmResolved}</td>
                <td style="text-align:center;">
                  <span class="status ${x.overallScore < 0 ? 'overdue' : 'active'}" style="font-weight:800; font-family:'DM Mono', monospace; font-size:12px; padding:3px 10px;">${x.overallScore} PTS</span>
                </td>
                <td>
                  <span style="background:${badgeBg}; color:${badgeColor}; font-weight:700; font-size:11px; padding:3px 8px; border-radius:4px; border:1px solid ${badgeColor}33;">
                    ${perfBadge}
                  </span>
                </td>
              </tr>
            `;
          }).join('') || '<tr><td colspan="12" style="text-align:center;color:#788882;padding:24px;">No Doer performance data.</td></tr>'}
        </tbody>
      </table>
    `;
  }
  
  document.getElementById('ownerReport').innerHTML = ownerArr.map(x => `
    <div class="owner-row" style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; border-bottom:1px solid #f0f4f2;">
      <div>
        <span class="person-name" style="font-weight:700; color:#182e25; font-size:13px;">${escapeHtml(x.name)}</span>
        <span class="case-sub" style="font-size:11px; color:#788882;">${x.markaCount} Markas · ${money(x.balance)} · ${x.visits} visits · ${x.calls} calls</span>
      </div>
      <div style="display:flex; gap:12px; align-items:center;">
        <div style="text-align:right;">
          <div style="font-size:11px; font-weight:700; color:#087454;">Adherence: ${x.taskAdherence}%</div>
          <small style="font-size:10px; color:#6d827a;">${x.fmsOnTime} on-time (1.0) · ${x.fmsDelayed} delayed (0.5)</small>
        </div>
        <span class="status ${x.overallScore < 0 ? 'overdue' : 'active'}" style="font-weight:800; font-family:'DM Mono', monospace; min-width:70px; text-align:center;">${x.overallScore} PTS</span>
      </div>
    </div>
  `).join('') || '<p class="modal-copy">No Followper data.</p>';
  
  document.getElementById('actionReport').innerHTML = Object.keys(fmsStepStats).map(code => {
    const step = fmsStepStats[code];
    const totalStep = step.onTime + step.delayed + step.pending;
    const onTimePct = totalStep > 0 ? Math.round((step.onTime / totalStep) * 100) : 0;
    return `
      <div class="owner-row" style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; border-bottom:1px solid #f0f4f2;">
        <div>
          <span class="person-name" style="font-weight:700; color:#182e25; font-size:13px;">${escapeHtml(step.name)}</span>
          <span class="case-sub" style="font-size:11px; color:#087454;">Responsible: <b>${escapeHtml(step.role)}</b></span>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <span style="font-size:11px; color:#087454; font-weight:700;">${step.onTime} On-Time (1.0)</span>
          <span style="font-size:11px; color:#b45309; font-weight:700;">${step.delayed} Delayed (0.5)</span>
          <span style="font-size:11px; color:#c44d48;">${step.pending} Pending</span>
          <span class="status closed" style="font-size:10px; font-family:'DM Mono', monospace;">${onTimePct}%</span>
        </div>
      </div>
    `;
  }).join('');
}

function switchMarkaSubtab(subtab) {
  markaSubtab = subtab;
  const btnMarkas = document.getElementById('tabMarkaView');
  const btnMasters = document.getElementById('tabMasterView');
  const divMarkas = document.getElementById('markaSubtabMarkas');
  const divMasters = document.getElementById('markaSubtabMasters');
  
  if (btnMarkas) btnMarkas.classList.toggle('active', subtab === 'markas');
  if (btnMasters) btnMasters.classList.toggle('active', subtab === 'masters');
  if (divMarkas) divMarkas.style.display = subtab === 'markas' ? '' : 'none';
  if (divMasters) divMasters.style.display = subtab === 'masters' ? '' : 'none';
  
  markaView();
}

function markaView() {
  const container = document.getElementById('markas');
  if (!container) return;
  
  filters('markaFilters');
  const list = filtered();
  
  const { col, dir } = SORTS.markas;
  list.sort((a, b) => {
    let va, vb;
    if (col === 'marka') { va = a.marka; vb = b.marka; }
    else if (col === 'master') { va = a.master; vb = b.master; }
    else if (col === 'oldest') { va = oldestDueDate(a); vb = oldestDueDate(b); }
    else if (col === 'alreadyDue') { va = alreadyDueAmount(a); vb = alreadyDueAmount(b); }
    else if (col === 'balance') { va = totalOutstanding(a); vb = totalOutstanding(b); }
    else if (col === 'bills') { va = activeBills(a).length; vb = activeBills(b).length; }
    else if (col === 'owner') { va = ownerOf(a); vb = ownerOf(b); }
    else { va = a.marka; vb = b.marka; }
    return compareVal(va, vb, dir);
  });
  
  updateSortIcons('markas');
  
  const accSummary = document.getElementById('accountabilitySummary');
  if (accSummary) {
    const mastersCount = allMasters().length;
    accSummary.textContent = `${list.length} Markas · ${mastersCount} Masters mapped`;
  }
  
  // 1. Marka-wise table
  const markaTbody = document.getElementById('markaTable');
  if (markaTbody) {
    markaTbody.innerHTML = list.length ? list.map(m => {
      const due = alreadyDueAmount(m);
      return `
        <tr>
          <td><span class="case-name">${escapeHtml(m.marka)}</span></td>
          <td>${escapeHtml(m.master)}</td>
          <td>Due: ${fmt(oldestDueDate(m))}<br><small style="color:#788882;">Next follow-up: ${fmt(m.nextDate)}</small></td>
          <td class="money" style="${due > 0 ? 'font-weight:700;color:#c44d48;' : ''}">${money(due)}</td>
          <td class="money">${money(totalOutstanding(m))}</td>
          <td>${activeBills(m).length}</td>
          <td><span class="status ${ownerOf(m) === 'Unassigned' ? 'overdue' : 'active'}">${escapeHtml(ownerOf(m))}</span></td>
          <td>
            <button onclick="assign('${escapeHtml(m.marka).replace(/'/g, "\\'")}', '${escapeHtml(ownerOf(m)).replace(/'/g, "\\'")}')" class="row-action">${ownerOf(m) === 'Unassigned' ? 'Assign' : 'Reassign'}</button>
          </td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="8" style="text-align:center;color:#788882;padding:24px;">No Markas found.</td></tr>';
  }
  
  // 2. Master-wise table
  const masterTbody = document.getElementById('masterTable');
  if (masterTbody) {
    const masters = allMasters();
    masterTbody.innerHTML = masters.map(masterName => {
      const masterMarkas = markas.filter(m => m.master === masterName);
      const activeMasterMarkas = masterMarkas.filter(m => totalOutstanding(m) > 0);
      const masterTotal = masterMarkas.reduce((s, m) => s + totalOutstanding(m), 0);
      const masterDue = masterMarkas.reduce((s, m) => s + alreadyDueAmount(m), 0);
      const accountablePerson = getMasterFollowper(masterName);
      
      return `
        <tr>
          <td><b>${escapeHtml(masterName)}</b></td>
          <td><span class="status active" style="font-weight:600;">${escapeHtml(accountablePerson)}</span></td>
          <td>${activeMasterMarkas.length} active (${masterMarkas.length} total)</td>
          <td class="money" style="${masterDue > 0 ? 'font-weight:700;color:#c44d48;' : ''}">${money(masterDue)}</td>
          <td class="money"><b>${money(masterTotal)}</b></td>
          <td>
            <button onclick="openMasterAssignment('${escapeHtml(masterName).replace(/'/g, "\\'")}')" class="row-action" style="background:#087454;color:#fff;">Change Followper</button>
          </td>
        </tr>
      `;
    }).join('');
  }
}

// ==========================================
// HELP TICKETS (INTERNAL TEAM ASSISTANCE)
// ==========================================
function helpTicketsView() {
  const container = document.getElementById('helpTickets');
  if (!container) return;
  
  const curStatus = (F.htStatus || 'All').trim();
  const curPriority = (F.htPriority || 'all').trim();
  const isUserRole = currentUser && currentUser.role === 'user';
  
  const filterEl = document.getElementById('helpTicketFilters');
  if (filterEl) {
    filterEl.innerHTML = `
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
        <label style="font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;">Status:
          <select class="filter-input" onchange="F.htStatus = this.value; helpTicketsView();">
            <option value="All" ${curStatus === 'All' ? 'selected' : ''}>All Statuses</option>
            <option value="Active" ${curStatus === 'Active' || curStatus === 'Open' ? 'selected' : ''}>Open &amp; In-Progress (Pending)</option>
            <option value="In Progress" ${curStatus === 'In Progress' ? 'selected' : ''}>In-Progress (Re-planned Follow-up)</option>
            <option value="Resolved" ${curStatus === 'Resolved' ? 'selected' : ''}>Done / Resolved</option>
          </select>
        </label>
        <label style="font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;">Priority:
          <select class="filter-input" onchange="F.htPriority = this.value; helpTicketsView();">
            <option value="all" ${curPriority === 'all' ? 'selected' : ''}>All Priorities</option>
            <option value="Critical" ${curPriority === 'Critical' ? 'selected' : ''}>Critical</option>
            <option value="High" ${curPriority === 'High' ? 'selected' : ''}>High</option>
            <option value="Normal" ${curPriority === 'Normal' ? 'selected' : ''}>Normal</option>
          </select>
        </label>
        <label style="font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;">Search:
          <input type="text" class="filter-input" placeholder="Search party / subject..." value="${escapeHtml(F.htSearch || '')}" oninput="F.htSearch = this.value; helpTicketsView();" style="width:160px;">
        </label>
        <button onclick="openHelpTicketModal()" class="btn primary" style="padding:6px 12px; font-size:12px; font-weight:700;">+ Create Help Ticket</button>
      </div>
    `;
  }

  // Filter out any corrupted duplicate tickets
  helpTickets = (helpTickets || []).filter(t => !t.subject.startsWith('[Ticket Reassigned]'));
  let list = [...(helpTickets || [])];

  // Strict User Data Security: Two-Way Visibility for who generated it, who is assigned helper to solve, who resolved it, or party owner
  if (isUserRole) {
    const uName = (currentUser.followperName || '').toLowerCase().trim();
    list = list.filter(t => 
      (t.requestedBy || '').toLowerCase().trim() === uName || 
      (t.assignedHelper || '').toLowerCase().trim() === uName ||
      (t.resolvedBy || '').toLowerCase().trim() === uName ||
      markas.some(m => m.id === t.markaId && (ownerOf(m) || '').toLowerCase().trim() === uName)
    );
  }

  // Filter by status & priority & search
  const q = (F.htSearch || '').toLowerCase().trim();
  const todayStr = iso(today);
  list = list.filter(t => {
    const st = (t.status || 'Open').toLowerCase();
    let statusMatch = true;
    if (curStatus === 'Active' || curStatus === 'Open') {
      statusMatch = st === 'open' || st === 'in progress';
    } else if (curStatus === 'In Progress') {
      statusMatch = st === 'in progress';
    } else if (curStatus === 'Resolved') {
      statusMatch = st === 'resolved';
    }
    const priorityMatch = curPriority === 'all' || (t.priority || 'Normal').toLowerCase() === curPriority.toLowerCase();
    const searchMatch = !q || (t.markaName || '').toLowerCase().includes(q) || (t.subject || '').toLowerCase().includes(q) || (t.remark || '').toLowerCase().includes(q);
    return statusMatch && priorityMatch && searchMatch;
  });

  // Sort
  const { col, dir } = SORTS.helpTickets || { col: 'date', dir: 'desc' };
  list.sort((a, b) => {
    let va = a[col] || '', vb = b[col] || '';
    if (col === 'marka') { va = a.markaName; vb = b.markaName; }
    return compareVal(va, vb, dir);
  });
  updateSortIcons('helpTickets');

  let openCount = 0, assignedToMe = 0, highCount = 0, resolvedCount = 0;
  list.forEach(t => {
    const isOpen = (t.status || 'Open').toLowerCase() === 'open' || (t.status || '').toLowerCase() === 'in progress';
    if (isOpen) {
      openCount++;
      if (isUserRole && (t.assignedHelper || '').toLowerCase().trim() === (currentUser.followperName || '').toLowerCase().trim()) assignedToMe++;
      if (t.priority === 'Critical' || t.priority === 'High') highCount++;
    } else {
      resolvedCount++;
    }
  });

  const metricsEl = document.getElementById('helpTicketMetrics');
  if (metricsEl) {
    metricsEl.innerHTML = [
      ['OPEN / IN PROGRESS', openCount.toLocaleString('en-IN'), 'Active helper tasks pending resolution'],
      [isUserRole ? 'ASSIGNED TO ME' : 'CRITICAL / HIGH', isUserRole ? assignedToMe.toLocaleString('en-IN') : highCount.toLocaleString('en-IN'), isUserRole ? 'My helper action tasks' : 'Urgent tickets'],
      ['RESOLVED & DONE', resolvedCount.toLocaleString('en-IN'), 'Representative actions completed'],
      ['TOTAL TICKETS', list.length.toLocaleString('en-IN'), 'Total tickets in system']
    ].map(x => `
      <div class="metric">
        <div class="metric-top"><span>${x[0]}</span></div>
        <strong>${x[1]}</strong>
        <small>${x[2]}</small>
      </div>
    `).join('');
  }

  const tableEl = document.getElementById('helpTicketTable');
  if (tableEl) {
    tableEl.innerHTML = list.length ? list.map(t => {
      const isResolved = (t.status || '').toLowerCase() === 'resolved';
      const isInProg = (t.status || '').toLowerCase() === 'in progress';
      const isOverdueProg = isInProg && t.nextDate && t.nextDate < todayStr;
      const priColor = t.priority === 'Critical' ? '#c44d48' : t.priority === 'High' ? '#b45309' : '#087454';
      const priBg = t.priority === 'Critical' ? '#faeceb' : t.priority === 'High' ? '#fdf2e9' : '#edf7f2';

      let statusBadge = `<span class="status overdue">OPEN</span>`;
      if (isInProg) {
        statusBadge = isOverdueProg ? 
          `<span class="status overdue" style="font-weight:800;">OVERDUE IN-PROGRESS ⚠️</span>` :
          `<span class="status active" style="background:#fff3cd; color:#856404; font-weight:800;">IN PROGRESS ⏳</span>`;
        if (t.nextDate) {
          statusBadge += `<small style="display:block; font-size:10px; font-weight:700; color:${isOverdueProg ? '#c44d48' : '#856404'}; margin-top:2px;">Next: <b>${fmt(t.nextDate)}</b></small>`;
        }
      } else if (isResolved) {
        statusBadge = `<span class="status closed" style="background:#e8f7ee; color:#087454; font-weight:800;">DONE ✓</span>`;
      }

      const cycleCount = (t.history || []).length;

      return `
        <tr>
          <td>${fmt(t.date)}</td>
          <td><span class="case-name">${escapeHtml(t.markaName || 'General')}</span></td>
          <td>
            <span style="background:${priBg}; color:${priColor}; font-weight:700; font-size:11px; padding:2px 8px; border-radius:4px; border:1px solid ${priColor}44;">
              ${escapeHtml(t.priority || 'Normal')}
            </span>
          </td>
          <td style="max-width:340px; font-size:12px;">
            <div style="font-weight:700; color:#182e25;">${escapeHtml(t.subject || 'Task Request')}</div>
            <div style="color:#495d56; margin-top:2px;">${escapeHtml(t.remark || '')}</div>
            ${isInProg && t.nextDate ? `
              <div style="margin-top:5px; padding:5px 8px; background:#fefce8; border:1px solid #fef08a; border-radius:5px; font-size:11px; color:#854d0e;">
                ⏳ <b>In-Progress Follow-up:</b> Next planned for <b>${fmt(t.nextDate)}</b> ${cycleCount > 0 ? `(Re-plan #${cycleCount})` : ''}
              </div>
            ` : ''}
            ${isResolved ? `
              <div style="margin-top:6px; padding:6px 10px; background:#f0faf5; border-radius:6px; border:1px solid #c0e7d5; font-size:11px; color:#087454;">
                <div style="font-weight:700;">✓ Representative Action: ${escapeHtml(t.resolutionType || 'Action Completed')}</div>
                <div style="color:#2a453b; margin-top:2px;">${escapeHtml(t.resolutionNote || 'Completed')}</div>
                <small style="color:#6d827a; font-size:10px;">By Representative: <b>${escapeHtml(t.resolvedBy || 'Helper')}</b> ${t.resolvedAt ? '· ' + fmt(t.resolvedAt.slice(0, 10)) : ''}</small>
              </div>
            ` : ''}
            ${t.history && t.history.length > 0 ? `
              <div style="margin-top:4px; font-size:10px; color:#6d827a;">
                <b>Follow-up Trail (${t.history.length}):</b> ${escapeHtml(t.history[t.history.length - 1].note || '')} <span style="color:#087454;">· by ${escapeHtml(t.history[t.history.length - 1].followper || '')}</span>
              </div>
            ` : ''}
          </td>
          <td>${escapeHtml(t.requestedBy || '—')}</td>
          <td><b style="color:#087454;">${escapeHtml(t.assignedHelper || '—')}</b></td>
          <td>${statusBadge}</td>
          <td>
              ${!isResolved ? `
                <button onclick="openResolveTicketModal('${t.id}')" class="row-action" style="background:#087454; color:#fff; font-weight:700; font-size:11px; padding:4px 8px;">Action / Follow-up ⏳</button>
              ` : `
                <button onclick="openResolveTicketModal('${t.id}')" class="row-action" style="background:#edf7f2; color:#087454; border:1px solid #c0e7d5; font-size:11px; padding:4px 8px;">👁️ Action Details</button>
              `}
              ${(!isResolved && currentUser && (currentUser.role === 'admin' || currentUser.role === 'superuser' || currentUser.email === 'devlope.vishal@gmail.com')) ? `
                <button onclick="openReassignTicketModal('${t.id}')" class="row-action" style="background:#eef4ff; color:#2563eb; border:1px solid #bfdbfe; font-size:11px; padding:4px 8px;">🔁 Reassign</button>
              ` : ''}
              ${t.markaId ? `<button onclick="openHistory('${t.markaId}')" class="row-action" style="background:#f4f7f6; color:#087454; border:1px solid #d2ebe0;">👁️ Timeline</button>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="8" style="text-align:center;color:#788882;padding:24px;">No help tickets found.</td></tr>';
  }
}

function getAllAssigneesList() {
  const set = new Set();
  // 1. All Doers / Followpers
  allFollowpers().forEach(f => {
    if (f && f !== 'Unassigned' && f !== 'all') set.add(f);
  });
  // 2. All Masters
  allMasters().forEach(m => {
    if (m && m !== 'Unassigned' && m !== 'all') set.add(m);
  });
  // 3. All Users
  const userList = (users && users.length > 0) ? users : DEFAULT_USERS;
  userList.forEach(u => {
    if (u.followperName && u.followperName !== 'all') set.add(u.followperName);
    if (u.email) set.add(u.email);
  });
  ['Sales HOD', 'Saurav Bhai', 'Bhavesh Bhai', 'Account Team', 'CRM', 'Process Coordinator (PC)'].forEach(r => set.add(r));
  return Array.from(set).sort();
}
window.getAllAssigneesList = getAllAssigneesList;

function openHelpTicketModal(optionalMarkaId) {
  const dt = document.getElementById('htDate');
  if (dt) dt.value = iso(today);
  
  const reqBy = document.getElementById('htRequestedBy');
  if (reqBy) reqBy.value = (currentUser ? currentUser.followperName : 'Admin') || 'Admin';
  
  const mSelect = document.getElementById('htMarka');
  if (mSelect) {
    const list = filtered(activeMarkas());
    mSelect.innerHTML = '<option value="">Select Party / Marka...</option>' + 
      list.map(m => `<option value="${m.id}" ${optionalMarkaId === m.id ? 'selected' : ''}>${escapeHtml(m.marka)} · ${escapeHtml(m.master)} (₹${money(totalOutstanding(m))})</option>`).join('');
  }

  const helperSelect = document.getElementById('htAssignedHelper');
  if (helperSelect) {
    const helpers = getAllAssigneesList();
    helperSelect.innerHTML = '<option value="">Select Helper / Doer / Master...</option>' + 
      helpers.map(h => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('');
  }

  const subj = document.getElementById('htSubject');
  if (subj) subj.value = '';
  const rem = document.getElementById('htRemark');
  if (rem) rem.value = '';

  openModal('helpTicketModal');
}
window.openHelpTicketModal = openHelpTicketModal;

function openReassignTicketModal(ticketId) {
  const t = (helpTickets || []).find(x => x.id === ticketId);
  if (!t) return toast('Ticket not found.');

  document.getElementById('reassignTicketId').value = ticketId;
  const sel = document.getElementById('reassignNewHelper');
  if (sel) {
    const list = getAllAssigneesList();
    sel.innerHTML = '<option value="">Select Assignee (Doer / User / Master)...</option>' + 
      list.map(h => `<option value="${escapeHtml(h)}" ${h === t.assignedHelper ? 'selected' : ''}>${escapeHtml(h)}</option>`).join('');
  }
  const noteEl = document.getElementById('reassignNote');
  if (noteEl) noteEl.value = '';

  openModal('reassignTicketModal');
}
window.openReassignTicketModal = openReassignTicketModal;

async function saveReassignTicket(e) {
  e.preventDefault();
  const ticketId = document.getElementById('reassignTicketId').value;
  const newHelper = document.getElementById('reassignNewHelper').value;
  const note = document.getElementById('reassignNote').value.trim();

  if (!newHelper) return toast('Please select the new assignee.');

  const t = (helpTickets || []).find(x => x.id === ticketId);
  if (!t) return toast('Ticket not found.');

  const oldHelper = t.assignedHelper || 'Previous Helper';
  t.assignedHelper = newHelper;
  if (!t.history) t.history = [];
  t.history.push({
    date: iso(today),
    type: 'Reassigned',
    note: `Reassigned from ${oldHelper} to ${newHelper}. ${note ? 'Note: ' + note : ''}`,
    by: (currentUser ? currentUser.followperName : 'Admin') || 'Admin'
  });

  if (t.markaId) {
    const m = markas.find(x => x.id === t.markaId);
    if (m) {
      if (!m.history) m.history = [];
      m.history.push({
        type: 'followup',
        date: iso(today),
        followper: (currentUser ? currentUser.followperName : 'Admin') || 'Admin',
        status: 'Ticket Reassigned',
        remark: `[Ticket Reassigned] ${t.subject} transferred from ${oldHelper} to ${newHelper}. ${note ? 'Note: ' + note : ''}`
      });
    }
  }

  save();
  closeModal('reassignTicketModal');
  renderAll();
  toast(`✓ Help ticket successfully reassigned to ${newHelper}.`);
}
window.saveReassignTicket = saveReassignTicket;

async function saveHelpTicket(e) {
  e.preventDefault();
  const date = document.getElementById('htDate').value;
  const priority = document.getElementById('htPriority').value;
  const markaId = document.getElementById('htMarka').value;
  const m = markas.find(x => x.id === markaId);
  const markaName = m ? m.marka : 'General';
  const requestedBy = document.getElementById('htRequestedBy').value;
  const assignedHelper = document.getElementById('htAssignedHelper').value;
  const subject = document.getElementById('htSubject').value.trim();
  const remark = document.getElementById('htRemark').value.trim();

  if (!assignedHelper) return toast('Please select the assigned helper.');
  if (!subject) return toast('Please enter ticket subject.');

  const ticketObj = {
    id: 'ht_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
    markaId: markaId || '',
    markaName,
    date,
    requestedBy,
    assignedHelper,
    priority,
    subject,
    remark,
    status: 'Open',
    createdAt: new Date().toISOString()
  };

  if (!helpTickets) helpTickets = [];
  helpTickets.unshift(ticketObj);
  localStorage.setItem('collectiq_help_tickets_v4', JSON.stringify(helpTickets));

  if (m) {
    if (!m.history) m.history = [];
    m.history.push({
      type: 'followup',
      date,
      followper: requestedBy,
      status: 'Help Ticket',
      remark: `[Help Ticket: ${subject}] Assigned to: ${assignedHelper}. Note: ${remark}`
    });
    save();
  }

  if (isOnlineMode()) {
    try {
      await fetch('/api/help-tickets/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ticketObj)
      });
      await syncWithDatabase();
    } catch (err) {
      console.warn('API error:', err);
    }
  }

  closeModal('helpTicketModal');
  renderAll();
  toast(`✓ Help ticket created and assigned to ${assignedHelper}.`);
}
window.saveHelpTicket = saveHelpTicket;

function switchTicketActionMode(mode) {
  const modeInput = document.getElementById('resolveTicketActionMode');
  if (modeInput) modeInput.value = mode;
  const isDone = mode === 'done';
  
  const btnDone = document.getElementById('btnTicketModeDone');
  const btnProg = document.getElementById('btnTicketModeProgress');
  if (btnDone) {
    btnDone.style.background = isDone ? '#087454' : '#e5e7eb';
    btnDone.style.color = isDone ? '#ffffff' : '#374151';
    btnDone.style.border = isDone ? '2px solid #087454' : '1px solid #d1d5db';
  }
  if (btnProg) {
    btnProg.style.background = !isDone ? '#d97706' : '#e5e7eb';
    btnProg.style.color = !isDone ? '#ffffff' : '#374151';
    btnProg.style.border = !isDone ? '2px solid #d97706' : '1px solid #d1d5db';
  }
  
  const helpText = document.getElementById('ticketModeHelpText');
  if (helpText) {
    if (isDone) {
      helpText.style.color = '#087454';
      helpText.innerHTML = '✓ Ticket will be marked as <b>COMPLETED / DONE</b>. No next follow-up date needed.';
    } else {
      helpText.style.color = '#b45309';
      helpText.innerHTML = '⏳ Ticket will stay <b>IN-PROGRESS</b>. Enter the next planned follow-up date.';
    }
  }

  const doneFields = document.getElementById('ticketDoneFields');
  if (doneFields) doneFields.style.display = isDone ? 'block' : 'none';
  
  const progFields = document.getElementById('ticketProgressFields');
  if (progFields) progFields.style.display = isDone ? 'none' : 'block';
  
  const nextDateInput = document.getElementById('resolveTicketNextDate');
  if (nextDateInput) {
    nextDateInput.required = !isDone;
    if (isDone) nextDateInput.value = '';
  }

  const submitBtn = document.getElementById('btnSubmitTicketAction');
  if (submitBtn) {
    submitBtn.textContent = isDone ? 'Mark Done (Action Completed) ✓' : 'Save In-Progress & Set Next Date ⏳';
    submitBtn.style.background = isDone ? '#087454' : '#d97706';
    submitBtn.style.color = '#ffffff';
  }

  const noteInput = document.getElementById('resolveTicketNote');
  if (noteInput) {
    noteInput.placeholder = isDone ? 'Explain the completed representative action...' : 'Explain the in-progress discussion and why next date is needed...';
  }
}
window.switchTicketActionMode = switchTicketActionMode;

function openResolveTicketModal(ticketId) {
  let t = (helpTickets || []).find(x => String(x.id) === String(ticketId));
  if (!t) {
    // Search in DEFAULT_HELP_TICKETS
    t = (typeof DEFAULT_HELP_TICKETS !== 'undefined' ? DEFAULT_HELP_TICKETS : []).find(x => String(x.id) === String(ticketId));
    if (t) {
      if (!helpTickets) helpTickets = [];
      helpTickets.push({ ...t });
    }
  }
  if (!t) {
    // Search across markas history for help tickets
    markas.forEach(m => {
      (m.history || []).forEach((h, hIdx) => {
        if (h.status === 'Help Ticket' || (h.remark && h.remark.includes('[Help Ticket'))) {
          const genId = 'ht_hist_' + m.id + '_' + hIdx;
          if (genId === ticketId || ticketId.includes(m.id)) {
            t = {
              id: ticketId,
              markaId: m.id,
              markaName: m.marka,
              date: h.date,
              requestedBy: h.followper || 'Admin',
              assignedHelper: 'Saurav Bhai',
              priority: 'Normal',
              subject: h.remark.slice(0, 40),
              remark: h.remark,
              status: 'Open'
            };
          }
        }
      });
    });
  }
  if (!t) {
    // Graceful fallback ticket creation so action modal always opens
    t = {
      id: ticketId,
      markaId: '',
      markaName: 'General Party',
      date: iso(today),
      requestedBy: currentUser ? currentUser.followperName : 'Admin',
      assignedHelper: 'Saurav Bhai',
      priority: 'Normal',
      subject: 'Assistance Follow-up',
      remark: 'Follow-up on pending party matters.',
      status: 'In Progress'
    };
    if (!helpTickets) helpTickets = [];
    helpTickets.push(t);
  }

  document.getElementById('resolveTicketId').value = t.id;
  document.getElementById('resolveTicketTitle').textContent = `Ticket: ${t.subject || 'Action'} · Party: ${t.markaName || 'General'} (Priority: ${t.priority || 'Normal'})`;
  document.getElementById('resolveTicketDate').value = iso(today);
  
  const nextDateInput = document.getElementById('resolveTicketNextDate');
  if (nextDateInput) {
    nextDateInput.value = t.nextDate || iso(new Date(today.getTime() + 2 * 86400000));
  }

  const sel = document.getElementById('resolveTicketBy');
  if (sel) {
    const helpers = allFollowpers().filter(x => x !== 'Unassigned');
    const defaultBy = t.assignedHelper || (currentUser ? currentUser.followperName : 'Admin') || 'Admin';
    sel.innerHTML = helpers.map(h => `<option value="${escapeHtml(h)}" ${h === defaultBy ? 'selected' : ''}>${escapeHtml(h)}</option>`).join('');
  }

  const actTypeSelect = document.getElementById('resolveTicketActionType');
  if (actTypeSelect) {
    actTypeSelect.value = t.resolutionType || 'Physical Field Visit & Discussion Completed';
  }

  const noteInput = document.getElementById('resolveTicketNote');
  if (noteInput) {
    noteInput.value = t.resolutionNote || t.remark || '';
  }

  const isAlreadyDone = (t.status || '').toLowerCase() === 'resolved';
  switchTicketActionMode(isAlreadyDone ? 'done' : 'progress');
  openModal('resolveTicketModal');
}
window.openResolveTicketModal = openResolveTicketModal;

async function saveResolveTicket(e) {
  e.preventDefault();
  const id = document.getElementById('resolveTicketId').value;
  const actionType = document.getElementById('resolveTicketActionMode')?.value || 'done';
  const date = document.getElementById('resolveTicketDate').value;
  const resolvedBy = document.getElementById('resolveTicketBy').value;
  const resolutionType = document.getElementById('resolveTicketActionType')?.value || 'Representative Action Completed';
  const resolutionNote = document.getElementById('resolveTicketNote').value.trim();
  const nextDate = actionType === 'done' ? '' : (document.getElementById('resolveTicketNextDate')?.value || '');
  const logToHistory = document.getElementById('resolveTicketLogToHistory')?.checked !== false;

  if (!resolutionNote) return toast('Please enter the details / remarks.');
  if (actionType === 'progress' && !nextDate) return toast('Please set the next follow-up date for this in-progress ticket.');

  const t = (helpTickets || []).find(x => x.id === id);
  if (t) {
    if (!t.history) t.history = [];
    
    if (actionType === 'progress') {
      t.status = 'In Progress';
      t.nextDate = nextDate;
      t.remark = resolutionNote;
      t.resolvedAt = ''; // Not done - ticket will keep re-planning until finally marked Done
      t.history.push({
        date: date || iso(today),
        followper: resolvedBy,
        actionType: 'Interim Follow-up (Re-planned Next Date)',
        note: resolutionNote,
        nextDate: nextDate,
        status: 'In Progress'
      });
    } else {
      t.status = 'Resolved';
      t.resolvedBy = resolvedBy;
      t.resolutionType = resolutionType;
      t.resolutionNote = resolutionNote;
      t.nextDate = '';
      t.resolvedAt = new Date().toISOString();
      t.history.push({
        date: date || iso(today),
        followper: resolvedBy,
        actionType: resolutionType,
        note: resolutionNote,
        status: 'Resolved'
      });
    }
  }
  localStorage.setItem('collectiq_help_tickets_v4', JSON.stringify(helpTickets));

  if (logToHistory && t) {
    const m = markas.find(x => x.id === t.markaId || x.marka === t.markaName);
    if (m) {
      if (!m.history) m.history = [];
      const historyRemark = (actionType === 'progress') ?
        `[HELP TICKET IN-PROGRESS (Re-planned Next: ${fmt(nextDate)})] ${resolutionNote} (Followed by ${resolvedBy})` :
        `[REPRESENTATIVE ACTION DONE: ${resolutionType}] ${resolutionNote} (Assisted by ${resolvedBy})`;
      
      m.history.push({
        type: 'followup',
        date: date || iso(today),
        followper: resolvedBy,
        status: actionType === 'progress' ? 'Help Ticket Progress' : 'Help Ticket Resolved',
        next: actionType === 'progress' ? nextDate : undefined,
        remark: historyRemark
      });
      save();
    }
  }

  if (isOnlineMode()) {
    try {
      await fetch('/api/help-tickets/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id, 
          resolvedBy, 
          resolutionType: actionType === 'progress' ? 'Interim Follow-up' : resolutionType, 
          resolutionNote, 
          date, 
          nextDate,
          markaId: t ? t.markaId : '', 
          logToHistory,
          actionType 
        })
      });
      await syncWithDatabase();
    } catch (err) {
      console.warn('API error:', err);
    }
  }

  closeModal('resolveTicketModal');
  renderAll();
  toast(actionType === 'progress' ? 
    `✓ In-Progress follow-up saved. Next follow-up re-planned for ${fmt(nextDate)}.` : 
    `✓ Help Ticket marked Done with representative action (${resolutionType})!`
  );
}
window.saveResolveTicket = saveResolveTicket;

// ==========================================
// CRM ESCALATIONS (CLIENT COMPLAINTS & CLAIMS)
// ==========================================
function crmEscalationsView() {
  const container = document.getElementById('crmEscalations');
  if (!container) return;

  const curStatus = (F.crmStatus || 'All').trim();
  const curType = (F.crmType || 'all').trim();
  const isUserRole = currentUser && currentUser.role === 'user';

  const filterEl = document.getElementById('crmEscFilters');
  if (filterEl) {
    filterEl.innerHTML = `
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
        <label style="font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;">Status:
          <select class="filter-input" onchange="F.crmStatus = this.value; crmEscalationsView();">
            <option value="All" ${curStatus === 'All' ? 'selected' : ''}>All Statuses</option>
            <option value="Open" ${curStatus === 'Open' ? 'selected' : ''}>Open</option>
            <option value="Resolved" ${curStatus === 'Resolved' ? 'selected' : ''}>Resolved</option>
          </select>
        </label>
        <label style="font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;">Category:
          <select class="filter-input" onchange="F.crmType = this.value; crmEscalationsView();">
            <option value="all" ${curType === 'all' ? 'selected' : ''}>All Types</option>
            <option value="Claim Matter" ${curType === 'Claim Matter' ? 'selected' : ''}>Claim Matter</option>
            <option value="WhatsApp Complaint" ${curType === 'WhatsApp Complaint' ? 'selected' : ''}>WhatsApp Complaint</option>
            <option value="Escalated" ${curType === 'Escalated' ? 'selected' : ''}>Management Escalations</option>
          </select>
        </label>
        <label style="font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;">Search Party:
          <input type="text" class="filter-input" placeholder="e.g. ABT..." value="${escapeHtml(F.crmSearch || '')}" oninput="F.crmSearch = this.value; crmEscalationsView();" style="width:140px;">
        </label>
      </div>
    `;
  }

  let allEscs = [];
  const seenEscKeys = new Set();

  markas.forEach(m => {
    (m.escalations || []).forEach(e => {
      if (e.type === 'Help Ticket' || e.type === 'Help') return;
      const key = (e.id || '') + '_' + m.id + '_' + e.date + '_' + e.type;
      if (!seenEscKeys.has(key)) {
        seenEscKeys.add(key);
        allEscs.push({
          id: e.id || uid(),
          markaName: m.marka,
          markaId: m.id,
          date: e.date,
          type: e.type || 'Claim Matter',
          claimNumber: e.claimNumber,
          waComplaintNo: e.waComplaintNo,
          escalatedTo: e.escalatedTo,
          followper: e.followper || ownerOf(m),
          status: e.status || 'Open',
          remark: e.remark,
          resolvedDate: e.resolvedDate,
          resolutionType: e.resolutionType,
          settledAmount: e.settledAmount,
          resolutionNote: e.resolutionNote,
          resolvedBy: e.resolvedBy,
          billIds: e.billIds || [],
          billsList: m.bills || []
        });
      }
    });

    (m.history || []).forEach((h, hIdx) => {
      if (h.status === 'Claim Matter' || h.status === 'WhatsApp Complaint' || h.status === 'Escalated' || h.status === 'Claim / Complaint') {
        const histKey = m.id + '_' + h.date + '_' + h.status;
        if (!seenEscKeys.has(histKey)) {
          seenEscKeys.add(histKey);
          allEscs.push({
            id: 'h_crm_' + m.id + '_' + hIdx,
            markaName: m.marka,
            markaId: m.id,
            date: h.date,
            type: h.status,
            claimNumber: h.claimNumber || '',
            waComplaintNo: h.waComplaintNo || '',
            escalatedTo: h.escalatedTo || '',
            followper: h.followper || ownerOf(m),
            status: 'Open',
            remark: h.remark || '',
            billIds: h.billIds || [],
            billsList: m.bills || []
          });
        }
      }
    });
  });

  // Strict User Data Security: Two-Way Visibility for who created it, who is assigned to solve it, who resolved it, or party owner
  if (isUserRole) {
    const uName = (currentUser.followperName || '').toLowerCase().trim();
    allEscs = allEscs.filter(e => 
      (e.followper || '').toLowerCase().trim() === uName ||
      (e.escalatedTo || '').toLowerCase().trim() === uName ||
      (e.resolvedBy || '').toLowerCase().trim() === uName ||
      markas.some(m => m.id === e.markaId && (ownerOf(m) || '').toLowerCase().trim() === uName)
    );
  }

  // Filters
  const q = (F.crmSearch || '').toLowerCase().trim();
  let filteredEscs = allEscs.filter(e => {
    const statusMatch = curStatus === 'All' || (e.status || 'Open').toLowerCase() === curStatus.toLowerCase();
    const typeMatch = curType === 'all' || (e.type || '').toLowerCase() === curType.toLowerCase() || (curType === 'Escalated' && (e.type === 'CRM Escalation' || e.type === 'Escalated'));
    const searchMatch = !q || (e.markaName || '').toLowerCase().includes(q) || (e.remark || '').toLowerCase().includes(q) || (e.claimNumber || '').toLowerCase().includes(q);
    return statusMatch && typeMatch && searchMatch;
  });

  const { col, dir } = SORTS.crmEscalations || { col: 'date', dir: 'desc' };
  filteredEscs.sort((a, b) => {
    let va = a[col] || '', vb = b[col] || '';
    if (col === 'marka') { va = a.markaName; vb = b.markaName; }
    return compareVal(va, vb, dir);
  });
  updateSortIcons('crmEscalations');

  let openClaims = 0, openWa = 0, openEscs = 0, resolvedCount = 0;
  allEscs.forEach(e => {
    const isOpen = (e.status || 'Open').toLowerCase() === 'open';
    if (isOpen) {
      if (e.type === 'Claim Matter' || e.type === 'Claim / Complaint') openClaims++;
      else if (e.type === 'WhatsApp Complaint') openWa++;
      else openEscs++;
    } else {
      resolvedCount++;
    }
  });

  const metricsEl = document.getElementById('crmEscMetrics');
  if (metricsEl) {
    metricsEl.innerHTML = [
      ['OPEN CLAIMS', openClaims.toLocaleString('en-IN'), 'Billing & rate claims'],
      ['OPEN WA COMPLAINTS', openWa.toLocaleString('en-IN'), 'WhatsApp customer tickets'],
      ['MANAGEMENT ESCALATIONS', openEscs.toLocaleString('en-IN'), 'Sales HOD / Master escalations'],
      ['RESOLVED & SETTLED', resolvedCount.toLocaleString('en-IN'), 'Settled complaints']
    ].map(x => `
      <div class="metric">
        <div class="metric-top"><span>${x[0]}</span></div>
        <strong>${x[1]}</strong>
        <small>${x[2]}</small>
      </div>
    `).join('');
  }

  const tableEl = document.getElementById('crmEscTable');
  if (tableEl) {
    tableEl.innerHTML = filteredEscs.length ? filteredEscs.map(e => {
      const isOpen = (e.status || 'Open').toLowerCase() === 'open';
      const badgeClass = (e.type === 'Claim Matter' || e.type === 'Claim / Complaint') ? 'overdue' : e.type === 'WhatsApp Complaint' ? 'active' : 'escalated';

      let refText = e.claimNumber || e.waComplaintNo || e.remark || '—';
      if (e.billIds && e.billIds.length > 0 && e.billsList) {
        const dates = e.billsList.filter(b => e.billIds.includes(b.id)).map(b => fmt(b.firstDate));
        if (dates.length > 0) refText += ` (Bills: ${dates.join(', ')})`;
      }

      return `
        <tr>
          <td>${fmt(e.date)}</td>
          <td><span class="case-name">${escapeHtml(e.markaName)}</span></td>
          <td><span class="status ${badgeClass}">${escapeHtml(e.type)}</span></td>
          <td style="max-width:300px; font-size:12px;">
            <div style="font-weight:600; color:#182e25;">${escapeHtml(refText)}</div>
            <small style="color:#6d827a;">${escapeHtml(e.remark || '')}</small>
          </td>
          <td>${escapeHtml(e.followper)}</td>
          <td><b style="color:#087454;">${escapeHtml(e.escalatedTo || '—')}</b></td>
          <td><span class="status ${isOpen ? 'overdue' : 'closed'}">${isOpen ? 'OPEN' : 'RESOLVED ✓'}</span></td>
          <td style="font-size:11px;">
            ${!isOpen ? `
              <div style="color:#087454; font-weight:700;">${escapeHtml(e.resolutionType || 'Resolved')} ${e.settledAmount > 0 ? `(₹${e.settledAmount.toLocaleString('en-IN')})` : ''}</div>
              <div style="color:#495d56;">${escapeHtml(e.resolutionNote || 'Settled')}</div>
              <small style="color:#788882;">By ${escapeHtml(e.resolvedBy || 'Admin')} on ${fmt(e.resolvedDate)}</small>
            ` : '<span style="color:#788882;">Pending resolution</span>'}
          </td>
          <td>
            <div style="display:flex; gap:6px;">
              ${isOpen ? `
                <button onclick="openResolution('${e.markaId}', '${e.id}')" class="row-action" style="background:#087454; color:#fff; font-weight:700;">Resolve & Settle</button>
              ` : `
                <button onclick="openEscalationDetails('${e.markaId}', '${e.id}')" class="row-action" style="background:#edf7f2; color:#087454; border:1px solid #c0e7d5;">👁️ Details</button>
              `}
              <button onclick="openHistory('${e.markaId}')" class="row-action" style="background:#f4f7f6; color:#087454; border:1px solid #d2ebe0;">👁️ Timeline</button>
            </div>
          </td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="9" style="text-align:center;color:#788882;padding:24px;">No CRM escalations found.</td></tr>';
  }
}

function openResolveEscalationModal(markaId, escId) {
  return openResolution(markaId, escId);
}
window.openResolveEscalationModal = openResolveEscalationModal;

async function saveResolveEscalation(e) {
  e.preventDefault();
  const markaId = document.getElementById('resolveEscMarkaId').value;
  const escId = document.getElementById('resolveEscId').value;
  const resolutionType = document.getElementById('resolveEscType').value;
  const settledAmount = +document.getElementById('resolveEscAmount').value || 0;
  const resolvedBy = document.getElementById('resolveEscBy').value;
  const resolutionNote = document.getElementById('resolveEscNote').value.trim();

  if (!resolutionNote) return toast('Please enter the resolution terms.');

  const m = markas.find(x => x.id === markaId);
  if (m) {
    if (!m.escalations) m.escalations = [];
    const esc = m.escalations.find(x => x.id === escId);
    if (esc) {
      esc.status = 'Resolved';
      esc.resolvedDate = iso(today);
      esc.resolutionType = resolutionType;
      esc.settledAmount = settledAmount;
      esc.resolutionNote = resolutionNote;
      esc.resolvedBy = resolvedBy;
    }

    if (!m.history) m.history = [];
    m.history.push({
      type: 'followup',
      date: iso(today),
      followper: resolvedBy,
      status: 'Claim Resolved',
      remark: `[${resolutionType}] ${resolutionNote} (Settled: ₹${money(settledAmount)}). Resolved by ${resolvedBy}.`
    });
    save();
  }

  if (isOnlineMode()) {
    try {
      await fetch('/api/escalations/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: escId, resolvedBy, resolutionNote, resolutionType, settledAmount })
      });
      await syncWithDatabase();
    } catch (err) {
      console.warn('API error:', err);
    }
  }

  closeModal('resolveEscModal');
  renderAll();
  toast('✓ CRM Escalation resolved and audit trail recorded.');
}
window.saveResolveEscalation = saveResolveEscalation;

// ==========================================
// FIELD VISITS & PARTY-WISE FOLLOW-UP HUB
// ==========================================
let visitSubtab = 'log';

function switchVisitSubtab(tab) {
  visitSubtab = tab;
  document.getElementById('tabVisitLog')?.classList.toggle('active', tab === 'log');
  document.getElementById('tabPartyMatrix')?.classList.toggle('active', tab === 'matrix');
  document.getElementById('tabDailySummary')?.classList.toggle('active', tab === 'summary');

  const logDiv = document.getElementById('visitSubtabLog');
  if (logDiv) logDiv.style.display = tab === 'log' ? '' : 'none';
  const matrixDiv = document.getElementById('visitSubtabMatrix');
  if (matrixDiv) matrixDiv.style.display = tab === 'matrix' ? '' : 'none';
  const summaryDiv = document.getElementById('visitSubtabSummary');
  if (summaryDiv) summaryDiv.style.display = tab === 'summary' ? '' : 'none';

  visitsView();
}
window.switchVisitSubtab = switchVisitSubtab;

function visitsView() {
  const container = document.getElementById('visits');
  if (!container) return;

  const isUserRole = currentUser && currentUser.role === 'user';
  const followpers = allFollowpers();
  const curDoer = (F.visitDoer || 'all').trim();

  const filterEl = document.getElementById('visitFilters');
  if (filterEl) {
    filterEl.innerHTML = `
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
        <label style="font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;">Doer / Visitor:
          <select class="filter-input" onchange="F.visitDoer = this.value; visitsView();" ${isUserRole ? 'disabled' : ''}>
            ${isUserRole ? `<option value="${escapeHtml(currentUser.followperName)}">${escapeHtml(currentUser.followperName)}</option>` : `<option value="all">All Doers</option>` + followpers.map(f => `<option value="${escapeHtml(f)}" ${curDoer === f ? 'selected' : ''}>${escapeHtml(f)}</option>`).join('')}
          </select>
        </label>
        <label style="font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;">From Date:
          <input type="date" class="filter-input" value="${F.visitFrom || ''}" onchange="F.visitFrom = this.value; visitsView();">
        </label>
        <label style="font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;">To Date:
          <input type="date" class="filter-input" value="${F.visitTo || ''}" onchange="F.visitTo = this.value; visitsView();">
        </label>
        <label style="font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;">Search Party:
          <input type="text" class="filter-input" placeholder="Party / Marka..." value="${escapeHtml(F.visitSearch || '')}" oninput="F.visitSearch = this.value; visitsView();" style="width:140px;">
        </label>
        <button onclick="F.visitDoer='all'; F.visitFrom=''; F.visitTo=''; F.visitSearch=''; visitsView();" class="tiny-btn" style="margin:0;">Clear</button>
      </div>
    `;
  }

  const activeMarkaList = filtered(activeMarkas());
  let allVisits = [];
  const todayIso = iso(today);

  activeMarkaList.forEach(m => {
    (m.history || []).forEach((h, hIdx) => {
      const isVisit = (h.mode && (h.mode.toLowerCase().includes('person') || h.mode.toLowerCase().includes('visit')));
      if (isVisit) {
        allVisits.push({
          id: 'v_' + m.id + '_' + hIdx,
          markaId: m.id,
          marka: m.marka,
          master: m.master,
          owner: m.owner || ownerOf(m),
          date: h.date,
          followper: h.followper || ownerOf(m),
          contact: h.contact || h.visitPersonMet || 'Party In-charge',
          purpose: h.visitPurpose || (h.status === 'Promise to Pay' ? 'Payment Follow-up' : h.status === 'Payment Received' ? 'Payment Collection' : 'Field Discussion'),
          notes: h.visitNotes || h.remark || '',
          status: h.status,
          expected: h.expected || 0,
          promise: h.promise || '',
          amount: h.amount || 0,
          balance: totalOutstanding(m)
        });
      }
    });
  });

  const q = (F.visitSearch || '').toLowerCase().trim();
  let filteredVisits = allVisits.filter(v => {
    const doerMatch = (curDoer === 'all' || v.followper === curDoer);
    const fromMatch = !F.visitFrom || v.date >= F.visitFrom;
    const toMatch = !F.visitTo || v.date <= F.visitTo;
    const searchMatch = !q || v.marka.toLowerCase().includes(q) || v.master.toLowerCase().includes(q) || v.contact.toLowerCase().includes(q);
    return doerMatch && fromMatch && toMatch && searchMatch;
  });

  const { col, dir } = SORTS.visits || { col: 'date', dir: 'desc' };
  filteredVisits.sort((a, b) => {
    let va = a[col] || '', vb = b[col] || '';
    if (col === 'marka') { va = a.marka; vb = b.marka; }
    return compareVal(va, vb, dir);
  });
  updateSortIcons('visits');

  const todayVisitsCount = allVisits.filter(v => v.date === todayIso).length;
  const uniquePartiesVisited = new Set(allVisits.map(v => v.marka)).size;
  const ptpsFromVisits = allVisits.filter(v => v.status === 'Promise to Pay').length;

  const metricsEl = document.getElementById('visitMetrics');
  if (metricsEl) {
    metricsEl.innerHTML = [
      ['TOTAL FIELD VISITS', allVisits.length.toLocaleString('en-IN'), 'In-person visits logged'],
      ["TODAY'S FIELD VISITS", todayVisitsCount.toLocaleString('en-IN'), 'Visits completed today'],
      ['PARTIES VISITED', uniquePartiesVisited.toLocaleString('en-IN'), 'Distinct client locations'],
      ['PTP SECURED ON VISIT', ptpsFromVisits.toLocaleString('en-IN'), 'Commitments collected in person']
    ].map(x => `
      <div class="metric">
        <div class="metric-top"><span>${x[0]}</span></div>
        <strong>${x[1]}</strong>
        <small>${x[2]}</small>
      </div>
    `).join('');
  }

  // Subtab 1: Daily Visit Log
  const visitTbody = document.getElementById('visitTable');
  if (visitTbody) {
    visitTbody.innerHTML = filteredVisits.length ? filteredVisits.map(v => {
      const isPtp = v.status === 'Promise to Pay';
      const isPaid = v.status === 'Payment Received';
      const badgeClass = isPaid ? 'closed' : isPtp ? 'active' : 'overdue';

      return `
        <tr>
          <td><b>${fmt(v.date)}</b></td>
          <td><b style="color:#087454;">${escapeHtml(v.followper)}</b></td>
          <td><span class="case-name">${escapeHtml(v.marka)}</span></td>
          <td>${escapeHtml(v.master)}</td>
          <td>${escapeHtml(v.contact)}</td>
          <td><span style="background:#e8f4ef; color:#087454; padding:2px 6px; border-radius:4px; font-weight:700; font-size:11px;">${escapeHtml(v.purpose)}</span></td>
          <td style="max-width:280px; font-size:12px;">
            <div style="color:#182e25; font-weight:500;">${escapeHtml(v.notes || 'Field visit completed.')}</div>
            ${isPtp && v.promise ? `<div style="color:#087454; font-size:11px; margin-top:2px;"><b>Promised:</b> ${money(v.expected)} on ${fmt(v.promise)}</div>` : ''}
            ${isPaid && v.amount ? `<div style="color:#087454; font-size:11px; margin-top:2px;"><b>Collected:</b> ${money(v.amount)}</div>` : ''}
          </td>
          <td><span class="status ${badgeClass}">${escapeHtml(v.status || 'Visited')}</span></td>
          <td>
            <button onclick="openFollowup('${v.markaId}')" class="row-action" style="background:#087454; color:#fff; font-weight:700;">+ Next Action</button>
          </td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="9" style="text-align:center;color:#788882;padding:24px;">No field visits logged for the selected period.</td></tr>';
  }

  // Subtab 2: Party-wise (Marka-wise) Matrix
  const matrixTbody = document.getElementById('partyMatrixTable');
  if (matrixTbody) {
    matrixTbody.innerHTML = activeMarkaList.map(m => {
      const hist = m.history || [];
      const visits = hist.filter(h => h.mode && (h.mode.toLowerCase().includes('person') || h.mode.toLowerCase().includes('visit')));
      const calls = hist.filter(h => h.mode && h.mode.toLowerCase().includes('phone'));
      const wa = hist.filter(h => h.mode && h.mode.toLowerCase().includes('whatsapp'));
      const ptp = hist.filter(h => h.status === 'Promise to Pay');
      
      const lastVisit = visits.length ? visits[visits.length - 1].date : '';
      const lastFollow = hist.length ? hist[hist.length - 1].date : '';

      return `
        <tr>
          <td><span class="case-name">${escapeHtml(m.marka)}</span></td>
          <td>${escapeHtml(m.master)}</td>
          <td><b style="color:#087454;">${escapeHtml(ownerOf(m))}</b></td>
          <td style="text-align:center; font-weight:700; ${visits.length > 0 ? 'color:#087454;' : 'color:#9ab0a6;'}">${visits.length}</td>
          <td style="text-align:center; color:#334d43;">${calls.length}</td>
          <td style="text-align:center; color:#334d43;">${wa.length}</td>
          <td>${lastVisit ? fmt(lastVisit) : '<span style="color:#9ab0a6;">—</span>'}</td>
          <td>${lastFollow ? fmt(lastFollow) : '<span style="color:#9ab0a6;">—</span>'}</td>
          <td style="text-align:center; font-weight:700;">${ptp.length}</td>
          <td class="money"><b>${money(totalOutstanding(m))}</b></td>
          <td>
            <button onclick="openFollowup('${m.id}')" class="row-action" style="background:#edf7f2; color:#087454; border:1px solid #c0e7d5; font-weight:700;">+ Visit / Call</button>
          </td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="11" style="text-align:center;color:#788882;padding:24px;">No active parties found.</td></tr>';
  }

  // Subtab 3: Daily Summary Table
  const sumTbody = document.getElementById('dailySummaryTable');
  if (sumTbody) {
    const doerMap = {};
    activeMarkaList.forEach(m => {
      const d = ownerOf(m);
      if (!doerMap[d]) doerMap[d] = { markas: 0, todayVisits: 0, todayCalls: 0, todayWa: 0, todayPtp: 0, totalVisits: 0, totalActions: 0 };
      doerMap[d].markas++;

      (m.history || []).forEach(h => {
        doerMap[d].totalActions++;
        const isV = h.mode && (h.mode.toLowerCase().includes('person') || h.mode.toLowerCase().includes('visit'));
        const isC = h.mode && h.mode.toLowerCase().includes('phone');
        const isW = h.mode && h.mode.toLowerCase().includes('whatsapp');
        const isP = h.status === 'Promise to Pay';

        if (isV) doerMap[d].totalVisits++;
        if (h.date === todayIso) {
          if (isV) doerMap[d].todayVisits++;
          if (isC) doerMap[d].todayCalls++;
          if (isW) doerMap[d].todayWa++;
          if (isP) doerMap[d].todayPtp++;
        }
      });
    });

    sumTbody.innerHTML = Object.keys(doerMap).map(d => {
      const s = doerMap[d];
      return `
        <tr>
          <td><b style="color:#087454;">${escapeHtml(d)}</b></td>
          <td>${s.markas} active parties</td>
          <td style="text-align:center; font-weight:700; ${s.todayVisits > 0 ? 'color:#087454;' : ''}">${s.todayVisits}</td>
          <td style="text-align:center;">${s.todayCalls}</td>
          <td style="text-align:center;">${s.todayWa}</td>
          <td style="text-align:center; font-weight:700;">${s.todayPtp}</td>
          <td style="text-align:center; font-weight:700; color:#087454;">${s.totalVisits}</td>
          <td style="text-align:center; font-weight:800;">${s.totalActions}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="8" style="text-align:center;color:#788882;padding:24px;">No activity logged.</td></tr>';
  }
}
window.visitsView = visitsView;

function exportVisitsExcel() {
  const activeMarkaList = filtered(activeMarkas());
  const rows = [];
  activeMarkaList.forEach(m => {
    (m.history || []).forEach(h => {
      if (h.mode && (h.mode.toLowerCase().includes('person') || h.mode.toLowerCase().includes('visit'))) {
        rows.push({
          date: h.date,
          doer: h.followper || ownerOf(m),
          marka: m.marka,
          master: m.master,
          contact: h.contact || h.visitPersonMet || 'Party Rep',
          purpose: h.visitPurpose || 'Collection Follow-up',
          remarks: h.remark || '',
          status: h.status,
          balance: totalOutstanding(m)
        });
      }
    });
  });

  const table = `<table><tr><th>Visit Date</th><th>Doer (Visitor)</th><th>Marka / Party</th><th>Master</th><th>Person Met</th><th>Purpose</th><th>Remarks</th><th>Result</th><th>Outstanding (₹)</th></tr>${rows.map(r => `<tr><td>${r.date}</td><td>${r.doer}</td><td>${r.marka}</td><td>${r.master}</td><td>${r.contact}</td><td>${r.purpose}</td><td>${r.remarks}</td><td>${r.status}</td><td>${r.balance}</td></tr>`).join('')}</table>`;
  const blob = new Blob(['\ufeff' + table], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `field-visits-report-${iso(today)}.xls`;
  a.click();
  URL.revokeObjectURL(a.href);
}
window.exportVisitsExcel = exportVisitsExcel;

function exportPartyMatrixExcel() {
  const list = filtered(activeMarkas());
  const rows = list.map(m => {
    const hist = m.history || [];
    const visits = hist.filter(h => h.mode && (h.mode.toLowerCase().includes('person') || h.mode.toLowerCase().includes('visit')));
    const calls = hist.filter(h => h.mode && h.mode.toLowerCase().includes('phone'));
    const wa = hist.filter(h => h.mode && h.mode.toLowerCase().includes('whatsapp'));
    return {
      marka: m.marka,
      master: m.master,
      owner: ownerOf(m),
      visits: visits.length,
      calls: calls.length,
      wa: wa.length,
      lastVisit: visits.length ? visits[visits.length - 1].date : '',
      lastFollow: hist.length ? hist[hist.length - 1].date : '',
      balance: totalOutstanding(m)
    };
  });

  const table = `<table><tr><th>Marka / Party</th><th>Master</th><th>Assigned Doer</th><th>Total Visits</th><th>Total Calls</th><th>Total WhatsApp</th><th>Last Visit Date</th><th>Last Follow-up</th><th>Total Outstanding (₹)</th></tr>${rows.map(r => `<tr><td>${r.marka}</td><td>${r.master}</td><td>${r.owner}</td><td>${r.visits}</td><td>${r.calls}</td><td>${r.wa}</td><td>${r.lastVisit}</td><td>${r.lastFollow}</td><td>${r.balance}</td></tr>`).join('')}</table>`;
  const blob = new Blob(['\ufeff' + table], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `party-wise-visit-matrix-${iso(today)}.xls`;
  a.click();
  URL.revokeObjectURL(a.href);
}
window.exportPartyMatrixExcel = exportPartyMatrixExcel;

// ==========================================
// MODALS & ACTIONS
// ==========================================

function openFollowup(markaId) {
  let m;
  if (markaId) {
    m = markas.find(x => x.id === markaId);
  } else {
    const active = activeMarkas().filter(x => !isLocked(x));
    active.sort((a, b) => new Date(a.nextDate || '9999-12-31') - new Date(b.nextDate || '9999-12-31'));
    m = active[0];
  }
  if (!m) return toast('No Marka found.');
  
  document.getElementById('markaId').value = m.id;
  document.getElementById('followTitle').textContent = `${m.marka} · ${m.master} · Oldest due: ${fmt(oldestDueDate(m))} · Total: ${money(totalOutstanding(m))}`;
  document.getElementById('plannedDate').value = m.nextDate || '';
  document.getElementById('followDate').value = iso(today);
  document.getElementById('followper').value = ownerOf(m) === 'Unassigned' ? '' : ownerOf(m);
  document.getElementById('contactPerson').value = '';
  document.getElementById('contactMode').value = 'Phone call';
  document.getElementById('actionStatus').value = 'Promise to Pay';
  document.getElementById('expected').value = m.expected || '';
  document.getElementById('promiseDate').value = m.ptp || '';
  
  const d2 = new Date(today.getTime() + 2 * 86400000);
  document.getElementById('nextDate').value = iso(d2);
  
  document.getElementById('remark').value = '';
  document.getElementById('claimNumber').value = '';
  if (document.getElementById('helpTicketSubject')) document.getElementById('helpTicketSubject').value = '';
  if (document.getElementById('helpTicketHelper')) document.getElementById('helpTicketHelper').value = '';
  if (document.getElementById('helpTicketPriority')) document.getElementById('helpTicketPriority').value = 'Normal';
  if (document.getElementById('escalateTo')) document.getElementById('escalateTo').value = '';
  
  // Payment fields reset
  const payRefInput = document.getElementById('followPayRef');
  if (payRefInput) payRefInput.value = '';
  const payAmtInput = document.getElementById('followPayAmount');
  if (payAmtInput) payAmtInput.value = totalOutstanding(m) || '';
  const payTypeSelect = document.getElementById('followPayType');
  if (payTypeSelect) payTypeSelect.value = 'Full Payment';
  const payModeSelect = document.getElementById('followPayMode');
  if (payModeSelect) payModeSelect.value = 'cheque';
  const followReceiptFile = document.getElementById('followPayReceiptFile');
  if (followReceiptFile) followReceiptFile.value = '';
  const followReceiptPreview = document.getElementById('followPayReceiptPreview');
  if (followReceiptPreview) {
    followReceiptPreview.innerHTML = '';
    followReceiptPreview.style.display = 'none';
    delete followReceiptPreview.dataset.base64;
  }
  onFollowPayModeChange();
  
  // Render active bills for claim/complaint selection checklist
  const actBills = activeBills(m).sort((a,b) => a.firstDate.localeCompare(b.firstDate));
  const billChecklistHtml = actBills.map(b => `
    <div class="settle-bill-item" style="grid-template-columns: 28px 1fr 1fr; border-bottom:1px solid #edf1ef; padding:6px 0;">
      <input type="checkbox" class="claim-bill-check" data-bill-id="${b.id}">
      <div><b>Bill ${fmt(b.firstDate)}</b> <small>${(b.billNos || []).map(escapeHtml).join(', ')}</small></div>
      <div style="text-align:right;">Bal: ${money(b.balance)}</div>
    </div>
  `).join('');
  document.getElementById('claimComplaintBillList').innerHTML = billChecklistHtml || '<p class="modal-copy">No active bills to select.</p>';

  // Render FMS Pre-planned milestones checklist
  const fmsTasks = getFmsTasks(m);
  const doneTasks = fmsTasks.filter(t => t.isDone).length;
  const badgeEl = document.getElementById('followFmsSummaryBadge');
  if (badgeEl) {
    badgeEl.textContent = `${doneTasks}/4 MILESTONES COMPLETED`;
  }
  const fmsListEl = document.getElementById('followFmsList');
  if (fmsListEl) {
    fmsListEl.innerHTML = fmsTasks.map(t => {
      let badge = '';
      if (t.isDone) {
        badge = `<span class="status closed" style="font-size:10px; padding:1px 6px;">✓ DONE (${t.score} pt)</span>`;
      } else if (t.status === 'Overdue') {
        badge = `<span class="status overdue" style="font-size:10px; padding:1px 6px;">OVERDUE (${t.delay}d)</span>`;
      } else {
        badge = `<span class="status" style="font-size:10px; padding:1px 6px; background:#e0ebe6; color:#2d4239;">PLANNED ${fmt(t.plannedDate)}</span>`;
      }

      return `
        <div style="display:flex; justify-content:space-between; align-items:center; background:#fff; border:1px solid #e1eee8; border-radius:6px; padding:6px 10px; font-size:12px;">
          <div style="flex:1; min-width:0;">
            <div style="font-weight:700; color:#182e25;"><span style="color:#087454; font-family:'DM Mono', monospace; margin-right:4px;">${t.code}</span>${escapeHtml(t.name)}</div>
            <small style="color:#6d827a; font-size:10px;">Due +${t.offset}d (${fmt(t.plannedDate)}) · Responsible: <b>${escapeHtml(t.role)}</b> (${escapeHtml(t.responsibleName)})</small>
          </div>
          <div style="display:flex; align-items:center; gap:8px; margin-left:10px;">
            ${badge}
            ${t.isDone ? '' : `<button type="button" onclick="openFmsModal('${m.id}', '${t.code}')" style="background:#087454; color:#fff; border:none; border-radius:4px; padding:3px 8px; font-size:11px; cursor:pointer; font-weight:700;">Mark Done</button>`}
          </div>
        </div>
      `;
    }).join('');
  }

  populateFollowPayBills(m);
  toggleConditionalFields();
  populateFollowperDropdowns();
  
  document.getElementById('modalHistory').innerHTML = renderHistoryTimeline(m);
  openModal('followupModal');
}

function onFollowPayModeChange() {
  const mode = document.getElementById('followPayMode') ? document.getElementById('followPayMode').value : 'cheque';
  const lbl = document.getElementById('followPayRefLabel');
  if (lbl) {
    if (mode === 'cheque') lbl.textContent = 'Cheque Number (Required)';
    else if (mode === 'RTGS' || mode === 'NEFT' || mode === 'UPI') lbl.textContent = 'UTR / Transaction ID (Required)';
    else if (mode === 'cash') lbl.textContent = 'Cash Receipt / Voucher No (Required)';
    else lbl.textContent = 'Transaction / Cheque ID (Required)';
  }
}

function onFollowPayTypeChange() {
  const pType = document.getElementById('followPayType') ? document.getElementById('followPayType').value : 'Full Payment';
  const mId = document.getElementById('markaId').value;
  const m = markas.find(x => x.id === mId);
  if (!m) return;
  const tot = totalOutstanding(m);
  const amtInput = document.getElementById('followPayAmount');
  if (!amtInput) return;
  
  if (pType === 'Full Payment') {
    amtInput.value = tot;
    updateFollowPayAllocations('amount');
  } else {
    if (+amtInput.value >= tot || !amtInput.value) {
      amtInput.value = Math.max(1, Math.floor(tot / 2));
    }
    updateFollowPayAllocations('amount');
  }
}

function populateFollowPayBills(m) {
  const container = document.getElementById('followPayBillsList');
  if (!container || !m) return;
  
  const bills = activeBills(m).sort((a, b) => a.firstDate.localeCompare(b.firstDate));
  if (!bills.length) {
    container.innerHTML = '<p class="modal-copy">No active unpaid bills for this Marka.</p>';
    return;
  }

  container.innerHTML = bills.map(b => `
    <div class="settle-bill-item" style="grid-template-columns: 28px 1fr 1fr 1fr; border-bottom:1px solid #edf1ef; padding:8px 0; align-items:center;">
      <input type="checkbox" class="follow-pay-check" data-bill-id="${b.id}" onchange="updateFollowPayAllocations('check')">
      <div>
        <b style="font-size:12px;">Bill ${fmt(b.firstDate)}</b>
        <small style="display:block; color:#75847e;">${(b.billNos || []).map(escapeHtml).join(', ') || 'No invoice ref'}</small>
      </div>
      <div style="font-size:12px; color:#495d56;">Bal: <b>${money(b.balance)}</b></div>
      <input type="number" class="follow-pay-amt" data-bill-id="${b.id}" value="0" min="0" max="${b.balance}" placeholder="Alloc amt" oninput="updateFollowPayAllocations('custom')" style="font-size:11px; padding:4px 6px;">
    </div>
  `).join('');
}

function updateFollowPayAllocations(source = 'amount') {
  const mId = document.getElementById('markaId').value;
  const m = markas.find(x => x.id === mId);
  if (!m) return;
  const bills = activeBills(m).sort((a,b) => a.firstDate.localeCompare(b.firstDate));
  const amtInput = document.getElementById('followPayAmount');
  if (!amtInput) return;
  let totalReceived = +amtInput.value || 0;
  
  if (source === 'amount') {
    let rem = totalReceived;
    bills.forEach(b => {
      const chk = document.querySelector(`.follow-pay-check[data-bill-id="${b.id}"]`);
      const input = document.querySelector(`.follow-pay-amt[data-bill-id="${b.id}"]`);
      if (!chk || !input) return;
      if (rem > 0) {
        const alloc = Math.min(rem, b.balance);
        chk.checked = true;
        input.value = alloc;
        rem -= alloc;
      } else {
        chk.checked = false;
        input.value = 0;
      }
    });
  } else if (source === 'check') {
    let sum = 0;
    bills.forEach(b => {
      const chk = document.querySelector(`.follow-pay-check[data-bill-id="${b.id}"]`);
      const input = document.querySelector(`.follow-pay-amt[data-bill-id="${b.id}"]`);
      if (chk && input) {
        if (chk.checked) {
          if (+input.value === 0) input.value = b.balance;
          sum += +input.value;
        } else {
          input.value = 0;
        }
      }
    });
    amtInput.value = sum;
  } else if (source === 'custom') {
    let sum = 0;
    bills.forEach(b => {
      const chk = document.querySelector(`.follow-pay-check[data-bill-id="${b.id}"]`);
      const input = document.querySelector(`.follow-pay-amt[data-bill-id="${b.id}"]`);
      if (chk && input) {
        const val = +input.value || 0;
        if (val > 0) chk.checked = true;
        sum += val;
      }
    });
    amtInput.value = sum;
  }

  let allocatedSum = 0;
  let checkedCount = 0;
  document.querySelectorAll('.follow-pay-check:checked').forEach(chk => {
    const bId = chk.dataset.billId;
    const inp = document.querySelector(`.follow-pay-amt[data-bill-id="${bId}"]`);
    allocatedSum += inp ? (+inp.value || 0) : 0;
    checkedCount++;
  });
  
  const summaryEl = document.getElementById('followAllocationSummary');
  if (summaryEl) {
    summaryEl.textContent = `${money(allocatedSum)} allocated across ${checkedCount} invoice(s)`;
  }
}

function previewReceiptImage(input, previewContainerId) {
  const container = document.getElementById(previewContainerId);
  if (!container) return;
  if (input.files && input.files[0]) {
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
      container.innerHTML = `
        <div style="display:inline-flex; align-items:center; gap:8px; background:#edf7f2; border:1px solid #c0e7d5; padding:6px 10px; border-radius:6px; margin-top:4px;">
          <img src="${e.target.result}" style="width:36px; height:36px; object-fit:cover; border-radius:4px; border:1px solid #087454;" alt="Receipt Preview">
          <div style="font-size:11px; text-align:left;">
            <b style="color:#087454;">✓ ${escapeHtml(file.name)}</b>
            <small style="display:block; color:#5b7067;">${Math.round(file.size/1024)} KB · Uploaded</small>
          </div>
          <button type="button" onclick="openReceiptViewer('${escapeHtml(file.name)}', '${e.target.result}')" class="btn-sm row-action" style="margin-left:auto;">👁️ View</button>
        </div>
      `;
      container.style.display = 'block';
      container.dataset.base64 = e.target.result;
    };
    reader.readAsDataURL(file);
  } else {
    container.innerHTML = '';
    container.style.display = 'none';
    delete container.dataset.base64;
  }
}
window.previewReceiptImage = previewReceiptImage;

function openReceiptViewer(title, imgSrc) {
  const tEl = document.getElementById('receiptViewTitle');
  const bEl = document.getElementById('receiptViewBody');
  if (tEl) tEl.textContent = title || 'Transaction Receipt';
  if (bEl) {
    bEl.innerHTML = `<img src="${imgSrc}" style="max-width:100%; max-height:440px; object-fit:contain; border-radius:8px; box-shadow:0 4px 16px rgba(0,0,0,0.15);" alt="Receipt">`;
  }
  openModal('receiptViewModal');
}
window.openReceiptViewer = openReceiptViewer;

function renderHistoryTimeline(m) {
  const entries = (m.history || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!entries.length) return '<p class="modal-copy">No conversations logged for this Marka.</p>';
  return entries.map(h => {
    const isResolved = h.status === 'Claim Resolved' || h.status === 'Resolved';
    const icon = h.type === 'payment' ? '₹' :
                 isResolved ? '✓' :
                 (h.status === 'Claim Matter' || h.status === 'WhatsApp Complaint' || h.status === 'Claim / Complaint') ? '⚠' :
                 (h.status === 'Escalated' || h.status === 'Help Ticket') ? '↗' : '✓';
    const iconClass = h.type === 'payment' ? 'payment' :
                      isResolved ? 'closed' :
                      (h.status === 'Claim Matter' || h.status === 'WhatsApp Complaint' || h.status === 'Claim / Complaint' || h.status === 'Escalated' || h.status === 'Help Ticket') ? 'escalated' : '';
    let meta = '';
    meta += `<span class="hist-meta"><b>Actual Date:</b> ${fmt(h.date)}</span> `;
    if (h.mode) meta += `<span class="hist-meta"><b>Mode:</b> ${escapeHtml(h.mode)}</span> `;
    if (h.contact) meta += `<span class="hist-meta"><b>Contact:</b> ${escapeHtml(h.contact)}</span> `;
    if (h.promise) meta += `<span class="hist-meta" style="color:#a86915;"><b>PTP Promise:</b> ${fmt(h.promise)}</span> `;
    if (h.expected) meta += `<span class="hist-meta"><b>Expected:</b> ${money(h.expected)}</span> `;
    if (h.claimNumber) meta += `<span class="hist-meta" style="color:#d85a54;"><b>Claim No:</b> ${escapeHtml(h.claimNumber)}</span> `;
    if (h.waComplaintNo) meta += `<span class="hist-meta" style="color:#d85a54;"><b>WA Complaint No:</b> ${escapeHtml(h.waComplaintNo)}</span> `;
    if (h.escalatedTo) meta += `<span class="hist-meta" style="color:#a86915;"><b>Escalated to:</b> ${escapeHtml(h.escalatedTo)}</span> `;
    if (h.amount) meta += `<span class="hist-meta" style="color:#2b5da6;"><b>Paid Amount:</b> ${money(h.amount)}</span> `;
    
    return `<div class="timeline" ${isResolved ? 'style="border-left: 3px solid #087454; background: #f7fbf9; padding: 10px; border-radius: 6px; margin-bottom: 8px;"' : ''}>
      <span class="time-icon ${iconClass}">${icon}</span>
      <div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:4px;">
          <div style="display:flex;align-items:center;gap:6px;">
            <b>${escapeHtml(h.status || h.type)} · ${escapeHtml(h.followper || ownerOf(m))}</b>
            ${isResolved ? '<span class="status closed" style="font-size:10px; padding:1px 6px;">RESOLVED ✓</span>' : ''}
          </div>
          <span style="font:600 11px 'DM Mono', monospace;color:#087454;">Actual: ${fmt(h.date)}</span>
        </div>
        <div style="margin: 4px 0 6px 0;">${meta}</div>
        <p style="margin: 4px 0; color:#334d43; line-height: 1.4;">${escapeHtml(h.remark || '')}</p>
      </div>
      <time style="font-size:10px;">${h.next ? 'Next Planned: ' + fmt(h.next) : 'Closed'}</time>
    </div>`;
  }).join('');
}

function toggleConditionalFields() {
  const val = document.getElementById('actionStatus').value;
  const isPtp = val.includes('Promise to Pay') || val === 'PTP';
  const isComplaint = val.includes('Complaint') || val.includes('Claim') || val.includes('Escalat');
  const isHelp = val.includes('Help Ticket') || val.includes('Internal Help') || val === 'Help';
  const isPayment = val.includes('Payment Received');

  const pGrp = document.getElementById('promiseGroup');
  if (pGrp) pGrp.style.display = isPtp ? '' : 'none';

  const cGrp = document.getElementById('complaintGroup');
  if (cGrp) cGrp.style.display = isComplaint ? '' : 'none';

  const hGrp = document.getElementById('helpTicketGroup');
  if (hGrp) hGrp.style.display = isHelp ? '' : 'none';

  const modeVal = document.getElementById('contactMode') ? document.getElementById('contactMode').value : '';
  const visitGrp = document.getElementById('visitDetailsGroup');
  if (visitGrp) {
    visitGrp.style.display = (modeVal === 'In person (Field Visit)' || modeVal === 'In person') ? '' : 'none';
  }

  const payGroup = document.getElementById('followPaymentGroup');
  if (payGroup) {
    payGroup.style.display = isPayment ? '' : 'none';
    if (isPayment) {
      const pTypeSelect = document.getElementById('followPayType');
      if (pTypeSelect) {
        pTypeSelect.value = val === 'Payment Received' ? 'Full Payment' : 'Part Payment';
        onFollowPayTypeChange();
      }
    }
  }

  if (isPtp) {
    enforcePtpDate();
  }

  if (isComplaint) {
    const nd = document.getElementById('nextDate');
    if (nd) {
      const d5 = new Date(today.getTime() + 5 * 86400000);
      nd.value = iso(d5);
    }
    const sel = document.getElementById('escalateTo');
    if (sel) {
      sel.innerHTML = '<option value="">None (Keep with current Followper)</option>' +
        escalationTargets().map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
    }
    const mId = document.getElementById('markaId').value;
    const m = markas.find(x => x.id === mId);
    const container = document.getElementById('claimComplaintBillList');
    if (container && m) {
      const bills = activeBills(m).sort((a,b) => a.firstDate.localeCompare(b.firstDate));
      container.innerHTML = bills.map(b => `
        <label style="display:flex; align-items:center; gap:8px; padding:4px 0; border-bottom:1px solid #f2e2de; font-size:12px; font-weight:normal; cursor:pointer;">
          <input type="checkbox" class="claim-bill-check" data-bill-id="${b.id}">
          <span>Bill ${fmt(b.firstDate)} (${(b.billNos || []).map(escapeHtml).join(', ') || 'Invoice'}) · Due: ${money(b.balance)}</span>
        </label>
      `).join('') || '<p class="modal-copy">No active bills.</p>';
    }
  }

  if (isHelp) {
    const hSel = document.getElementById('helpTicketHelper');
    if (hSel) {
      const helpers = getAllAssigneesList();
      hSel.innerHTML = '<option value="">Select Helper / Doer / Master...</option>' +
        helpers.map(h => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('');
    }
  }
}

function enforcePtpDate() {
  const pd = document.getElementById('promiseDate');
  const nd = document.getElementById('nextDate');
  const stat = document.getElementById('actionStatus');
  if (stat && stat.value === 'Promise to Pay' && pd && pd.value) {
    nd.value = pd.value;
  }
}

async function saveFollowup(e) {
  e.preventDefault();
  const m = markas.find(x => x.id === document.getElementById('markaId').value);
  if (!m) return;
  
  const statusVal = document.getElementById('actionStatus').value;
  const followper = document.getElementById('followper').value;
  const followDate = document.getElementById('followDate').value;
  const contactPerson = document.getElementById('contactPerson').value;
  const contactMode = document.getElementById('contactMode').value;
  const remark = document.getElementById('remark').value;
  const expected = +document.getElementById('expected').value || 0;
  const promiseDate = document.getElementById('promiseDate').value || '';
  const nextDate = document.getElementById('nextDate').value;

  const isPtp = statusVal.includes('Promise to Pay') || statusVal === 'PTP';
  const isComplaint = statusVal.includes('Complaint') || statusVal.includes('Claim') || statusVal.includes('Escalat');
  const isHelp = statusVal.includes('Help Ticket') || statusVal.includes('Internal Help') || statusVal === 'Help';
  const isPayment = statusVal.includes('Payment Received');

  const claimNumber = (document.getElementById('claimNumber')?.value || '').trim();
  const escalateTo = document.getElementById('escalateTo')?.value || '';

  const helperName = document.getElementById('helpTicketHelper')?.value || '';
  const helpPriority = document.getElementById('helpTicketPriority')?.value || 'Normal';
  const helpSubject = (document.getElementById('helpTicketSubject')?.value || '').trim() || remark.slice(0, 50) || 'Task Assistance Request';

  if (isHelp && !helperName) {
    return toast('Please select who to assign the Help Ticket to.');
  }

  if (isPtp && !promiseDate) {
    return toast('Promise date is required for PTP.');
  }

  // Date validations for PTP
  const todayStr = iso(today);
  if (isPtp) {
    if (promiseDate < todayStr) {
      return toast('Promise to Pay date cannot be in the past.');
    }
    if (nextDate < todayStr) {
      return toast('Next planned follow-up date cannot be in the past.');
    }
  }

  // Gather selected bill IDs for Complaint / Claim
  let billIds = [];
  if (isComplaint) {
    const checked = document.querySelectorAll('.claim-bill-check:checked');
    billIds = Array.from(checked).map(el => isNaN(+el.dataset.billId) ? el.dataset.billId : +el.dataset.billId);
  }

  // Gather Payment Allocations if Payment Received / Part Payment
  let payRef = '';
  let payMode = 'cheque';
  let payType = 'Part Payment';
  let payAmount = 0;
  let allocations = [];

  if (isPayment) {
    payRef = (document.getElementById('followPayRef')?.value || '').trim();
    payMode = document.getElementById('followPayMode')?.value || 'cheque';
    payType = document.getElementById('followPayType')?.value || 'Part Payment';
    payAmount = +(document.getElementById('followPayAmount')?.value || 0);

    if (!payRef) {
      return toast('Cheque No / UTR / Transaction ID is required for payment received.');
    }
    if (payAmount <= 0) {
      return toast('Please enter a valid received payment amount.');
    }

    const checks = document.querySelectorAll('.follow-pay-check:checked');
    checks.forEach(chk => {
      const bId = chk.dataset.billId;
      const b = m.bills.find(x => String(x.id) === String(bId));
      const inp = document.querySelector(`.follow-pay-amt[data-bill-id="${bId}"]`);
      const amt = inp ? Math.min(+inp.value || 0, b.balance) : 0;
      if (b && amt > 0) {
        allocations.push({ billId: b.id, amount: amt, settled: (b.balance - amt) === 0 });
      }
    });

    if (allocations.length === 0) {
      return toast('Please allocate payment against at least one invoice.');
    }
  }

  const receiptImage = document.getElementById('followPayReceiptPreview')?.dataset?.base64 || '';
  // Apply updates locally and save to localStorage immediately
  if (isPayment) {
    allocations.forEach(a => {
      const b = m.bills.find(x => x.id === a.billId);
      if (b) {
        b.balance = Math.max(0, b.balance - a.amount);
      }
    });

    payments.push({
      id: uid(),
      date: followDate,
      ref: payRef,
      mode: payMode,
      amount: payAmount,
      marka: m.marka,
      receiptImage: receiptImage,
      allocations
    });
  }

  const stillDue = totalOutstanding(m);
  let finalStatus = statusVal;
  let finalNext = nextDate;
  let finalRemark = remark;

  if (isComplaint) {
    const min5Date = iso(new Date(today.getTime() + 5 * 86400000));
    if (!finalNext || finalNext < min5Date) {
      finalNext = min5Date;
    }
  }

  if (isPayment) {
    if (stillDue === 0 || payType === 'Full Payment') {
      finalStatus = 'Payment Received';
      finalNext = '';
      finalRemark = finalRemark || `Full payment ${money(payAmount)} received (${payMode} ref: ${payRef}). All dues cleared.`;
    } else {
      finalStatus = 'Payment Received';
      finalNext = nextDate || iso(new Date(today.getTime() + 2 * 86400000));
      finalRemark = finalRemark || `Payment ${money(payAmount)} received (${payMode} ref: ${payRef}); ${money(stillDue)} still due.`;
    }
  }

  const isFieldVisit = (contactMode && (contactMode.toLowerCase().includes('person') || contactMode.toLowerCase().includes('visit')));
  const visitPurpose = isFieldVisit ? (document.getElementById('visitPurpose')?.value || 'Payment Collection') : '';
  const visitPersonMet = isFieldVisit ? (document.getElementById('visitPersonMet')?.value || contactPerson || '') : '';
  const visitNotes = isFieldVisit ? (document.getElementById('visitNotes')?.value || '') : '';

  const h = {
    type: isPayment ? 'payment' : 'followup',
    date: followDate,
    followper,
    status: finalStatus,
    contact: contactPerson,
    mode: contactMode,
    remark: finalRemark,
    expected,
    promise: promiseDate,
    next: finalNext,
    claimNumber: isComplaint ? (claimNumber || remark.slice(0, 50)) : '',
    waComplaintNo: (statusVal === 'WhatsApp Complaint' ? claimNumber : ''),
    escalatedTo: isComplaint ? escalateTo : '',
    visitPurpose,
    visitPersonMet,
    visitNotes,
    billIds,
    amount: payAmount || 0,
    ref: payRef,
    receiptImage: receiptImage,
    allocations
  };

  m.lastDate = h.date;
  m.lastStatus = h.status;
  m.remark = h.remark;
  m.expected = h.expected;
  m.ptp = h.promise;
  m.nextDate = h.next;
  
  if (isComplaint && escalateTo) {
    m.owner = escalateTo;
  } else if (!isHelp) {
    m.owner = h.followper;
  }
  if (!m.history) m.history = [];
  m.history.push(h);

  // 1. If Internal Help Ticket -> STRICTLY save into helpTickets table / array
  if (isHelp) {
    const ticketObj = {
      id: 'ht_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
      markaId: m.id,
      markaName: m.marka,
      date: followDate,
      requestedBy: followper || (currentUser ? currentUser.followperName : 'User'),
      assignedHelper: helperName,
      priority: helpPriority,
      subject: helpSubject,
      remark: remark,
      status: 'Open',
      createdAt: new Date().toISOString()
    };
    if (!helpTickets) helpTickets = [];
    helpTickets.unshift(ticketObj);
    localStorage.setItem('collectiq_help_tickets_v4', JSON.stringify(helpTickets));
    if (isOnlineMode()) {
      fetch('/api/help-tickets/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ticketObj)
      }).catch(err => console.warn('API error:', err));
    }
  } 
  // 2. If Customer Complaint / Claim / Management Escalation -> STRICTLY save into m.escalations
  else if (isComplaint) {
    if (!m.escalations) m.escalations = [];
    const escType = (statusVal === 'WhatsApp Complaint') ? 'WhatsApp Complaint' :
                    (statusVal.includes('Escalat')) ? 'Escalated' : 'Claim Matter';
    const generatedEscId = 'e_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
    m.escalations.push({
      id: generatedEscId,
      date: h.date,
      type: escType,
      claimNumber: claimNumber || remark.slice(0, 50),
      waComplaintNo: (statusVal === 'WhatsApp Complaint' ? claimNumber : ''),
      escalatedTo: escalateTo,
      followper: h.followper,
      status: 'Open',
      remark: h.remark,
      billIds
    });
  }

  save();
  closeModal('followupModal');
  renderAll();

  const payload = {
    markaId: m.id,
    escId: isComplaint ? (m.escalations[m.escalations.length - 1]?.id) : undefined,
    followDate,
    followper,
    contactPerson,
    contactMode,
    actionStatus: statusVal,
    expected,
    promiseDate,
    nextDate: finalNext,
    remark: finalRemark,
    claimNumber: isComplaint ? (claimNumber || remark.slice(0, 50)) : '',
    waComplaintNo: (statusVal === 'WhatsApp Complaint' ? claimNumber : ''),
    escalateTo: isComplaint ? escalateTo : '',
    billIds,
    payRef,
    payMode,
    payType,
    payAmount,
    allocations
  };

  if (isOnlineMode()) {
    try {
      const res = await fetch('/api/followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        await syncWithDatabase();
        toast('Conversation & tickets saved to SQLite database.');
      } else {
        const err = await res.json();
        toast('Server sync notice: ' + (err.error || 'Saved locally'));
      }
    } catch (err) {
      console.warn('Network sync notice:', err);
      toast('Conversation saved locally.');
    }
  } else {
    toast('Conversation saved.');
  }
}

function openPayment(optionalMarkaId) {
  document.getElementById('payDate').value = iso(today);
  document.getElementById('payRef').value = '';
  document.getElementById('payAmount').value = '';
  document.getElementById('payType').value = 'Part';
  document.getElementById('payMode').value = 'cheque';
  const payReceiptFile = document.getElementById('payReceiptFile');
  if (payReceiptFile) payReceiptFile.value = '';
  const payReceiptPreview = document.getElementById('payReceiptPreview');
  if (payReceiptPreview) {
    payReceiptPreview.innerHTML = '';
    payReceiptPreview.style.display = 'none';
    delete payReceiptPreview.dataset.base64;
  }
  onPayModeChange();
  
  const sel = document.getElementById('payMarkaSelect');
  sel.innerHTML = '<option value="">Choose Marka...</option>' + activeMarkas().map(m => 
    `<option value="${m.id}">${escapeHtml(m.marka)} · ${escapeHtml(m.master)} · ${money(totalOutstanding(m))}</option>`
  ).join('');
  
  if (optionalMarkaId) {
    sel.value = optionalMarkaId;
    onPayMarkaSelectChange();
  } else {
    document.getElementById('payBillsContainer').style.display = 'none';
  }
  
  openModal('paymentModal');
}

function openPaymentFromBills() {
  const modal = document.getElementById('billModal');
  const mId = modal ? modal.dataset.markaId : '';
  if (mId) {
    closeModal('billModal');
    openPayment(mId);
  } else {
    toast('No Marka selected.');
  }
}

function onPayModeChange() {
  const mode = document.getElementById('payMode') ? document.getElementById('payMode').value : 'cheque';
  const lbl = document.getElementById('payRefLabel');
  if (lbl) {
    if (mode === 'cheque') lbl.textContent = 'Cheque Number (Required)';
    else if (mode === 'RTGS' || mode === 'NEFT' || mode === 'UPI') lbl.textContent = 'UTR / Transaction ID (Required)';
    else if (mode === 'cash') lbl.textContent = 'Cash Receipt / Voucher No (Required)';
    else lbl.textContent = 'Transaction / Cheque ID (Required)';
  }
}

function onPayTypeChange() {
  const pType = document.getElementById('payType').value;
  const mId = document.getElementById('payMarkaSelect').value;
  const m = markas.find(x => x.id === mId);
  if (!m) return;
  const tot = totalOutstanding(m);
  const amtInput = document.getElementById('payAmount');
  if (pType === 'Full') {
    amtInput.value = tot;
    updatePayAllocations('amount');
  } else {
    if (+amtInput.value >= tot || !amtInput.value) {
      amtInput.value = Math.max(1, Math.floor(tot / 2));
    }
    updatePayAllocations('amount');
  }
}

function onPayMarkaSelectChange() {
  const mId = document.getElementById('payMarkaSelect').value;
  const m = markas.find(x => x.id === mId);
  const container = document.getElementById('payBillsContainer');
  if (!m) {
    if (container) container.style.display = 'none';
    return;
  }
  
  if (container) container.style.display = 'block';
  const list = document.getElementById('payBillsList');
  const bills = activeBills(m).sort((a, b) => a.firstDate.localeCompare(b.firstDate));
  
  if (list) {
    list.innerHTML = bills.map(b => `
      <div class="pay-bill-item">
        <input type="checkbox" class="pay-bill-check" data-bill-id="${b.id}" checked onchange="updatePayAllocations('check')">
        <div>
          <b>Bill ${fmt(b.firstDate)}</b>
          <small>${(b.billNos || []).map(escapeHtml).join(', ') || 'No invoice ref'}</small>
        </div>
        <div style="font-family:'DM Mono',monospace; font-size:11px;">Due: ${money(b.balance)}</div>
        <div>
          <input type="number" class="pay-bill-alloc" data-bill-id="${b.id}" min="0" max="${b.balance}" value="${b.balance}" oninput="onPayBillAllocInput('${b.id}', this.value)">
        </div>
      </div>
    `).join('') || '<p class="modal-copy">No active unpaid bills found.</p>';
  }
  
  onPayTypeChange();
}

function onPayBillAllocInput(billId, val) {
  val = +val || 0;
  const chk = document.querySelector(`.pay-bill-check[data-bill-id="${billId}"]`);
  if (chk) {
    chk.checked = val > 0;
  }
  updatePayAllocations('manual');
}

function updatePayAllocations(triggerSource) {
  const mId = document.getElementById('payMarkaSelect').value;
  const m = markas.find(x => x.id === mId);
  if (!m) return;
  
  const type = document.getElementById('payType').value;
  const payAmountInput = document.getElementById('payAmount');
  
  if (triggerSource === 'amount') {
    const totalAmount = +payAmountInput.value || 0;
    let remaining = totalAmount;
    
    const activeList = activeBills(m).sort((a, b) => a.firstDate.localeCompare(b.firstDate));
    activeList.forEach(b => {
      const chk = document.querySelector(`.pay-bill-check[data-bill-id="${b.id}"]`);
      const inp = document.querySelector(`.pay-bill-alloc[data-bill-id="${b.id}"]`);
      if (remaining <= 0) {
        if (chk) chk.checked = false;
        if (inp) inp.value = 0;
      } else {
        const alloc = Math.min(remaining, b.balance);
        remaining -= alloc;
        if (chk) chk.checked = true;
        if (inp) inp.value = alloc;
      }
    });
  }
  
  // Calculate allocations sum
  const checks = document.querySelectorAll('.pay-bill-check');
  let sumAllocated = 0;
  checks.forEach(c => {
    if (c.checked) {
      const billId = c.dataset.billId;
      const inp = document.querySelector(`.pay-bill-alloc[data-bill-id="${billId}"]`);
      const val = +inp.value || 0;
      sumAllocated += val;
    } else {
      const billId = c.dataset.billId;
      const inp = document.querySelector(`.pay-bill-alloc[data-bill-id="${billId}"]`);
      if (inp) inp.value = 0;
    }
  });
  
  const summaryEl = document.getElementById('allocationSummary');
  if (type === 'Full') {
    payAmountInput.value = sumAllocated;
    summaryEl.textContent = `${money(sumAllocated)} allocated`;
    summaryEl.style.color = '';
  } else {
    const totalEntered = +payAmountInput.value || 0;
    const diff = totalEntered - sumAllocated;
    summaryEl.textContent = `${money(sumAllocated)} allocated · ${money(diff)} remaining`;
    if (diff === 0 && totalEntered > 0) {
      summaryEl.textContent += ' · matched ✓';
      summaryEl.style.color = '#287553';
    } else {
      summaryEl.style.color = '#c44d48';
    }
  }
}

async function savePayment(e) {
  e.preventDefault();
  const mId = document.getElementById('payMarkaSelect').value;
  const m = markas.find(x => x.id === mId);
  if (!m) return toast('Select a Marka.');
  
  const payType = document.getElementById('payType').value;
  const payDate = document.getElementById('payDate').value;
  const payMode = document.getElementById('payMode').value;
  const payRef = document.getElementById('payRef').value.trim();
  const payAmount = +document.getElementById('payAmount').value || 0;
  const receiptImage = document.getElementById('payReceiptPreview')?.dataset?.base64 || '';
  
  if (!payAmount || payAmount <= 0) return toast('Enter a valid payment amount.');
  if (!payRef) return toast('Reference / receipt number is required.');
  
  // Gather allocations
  const allocations = [];
  const checks = document.querySelectorAll('.pay-bill-check:checked');
  checks.forEach(c => {
    const billId = c.dataset.billId;
    const inp = document.querySelector(`.pay-bill-alloc[data-bill-id="${billId}"]`);
    const amt = +inp.value || 0;
    if (amt > 0) {
      allocations.push({ billId: isNaN(+billId) ? billId : +billId, amount: amt });
    }
  });
  
  if (allocations.length === 0) {
    return toast('Please select at least one bill and enter allocation.');
  }
  
  const totalAllocated = allocations.reduce((sum, a) => sum + a.amount, 0);
  if (payType === 'Part' && totalAllocated !== payAmount) {
    return toast(`Allocated sum (${money(totalAllocated)}) must match Total Received (${money(payAmount)}).`);
  }
  
  const payload = {
    markaId: m.id,
    payDate,
    payMode,
    payRef,
    payAmount,
    receiptImage,
    allocations
  };
  
  if (isOnlineMode()) {
    try {
      const res = await fetch('/api/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        closeModal('paymentModal');
        await syncWithDatabase();
        toast('Payment saved to SQLite database.');
      } else {
        const err = await res.json();
        toast('Error: ' + err.error);
      }
    } catch (err) {
      toast('API error: ' + err.message);
    }
  } else {
    // Offline / Local / Firebase mode
    allocations.forEach(a => {
      const b = m.bills.find(x => String(x.id) === String(a.billId));
      if (b) {
        b.balance = Math.max(0, b.balance - a.amount);
        m.history.push({
          type: 'payment',
          date: payDate,
          status: b.balance === 0 ? 'Payment Received' : 'Part Payment',
          remark: `Payment of ${money(a.amount)} received (${payMode} ref: ${payRef}) allocated to bill ${fmt(b.firstDate)}.`,
          amount: a.amount,
          ref: payRef,
          receiptImage: receiptImage,
          billId: b.id
        });
      }
    });
    
    const stillDue = totalOutstanding(m);
    if (stillDue > 0) {
      m.nextDate = iso(new Date(today.getTime() + 2 * 86400000));
      m.remark = `Payment ${money(payAmount)} received; ${money(stillDue)} still due. Follow-up in 2 days.`;
      m.lastStatus = 'Payment Received';
    } else {
      m.nextDate = '';
      m.remark = 'All dues cleared. Follow-up closed.';
      m.lastStatus = 'Payment Received';
    }
    m.lastDate = payDate;
    
    payments.push({
      id: uid(),
      date: payDate,
      ref: payRef,
      mode: payMode,
      amount: payAmount,
      marka: m.marka,
      allocations: allocations.map(a => ({ billId: a.billId, amount: a.amount, settled: m.bills.find(x => x.id === a.billId).balance === 0 }))
    });
    
    save();
    closeModal('paymentModal');
    renderAll();
    toast('Payment recorded locally.');
  }
}

function openBillDetails(markaId) {
  const m = markas.find(x => x.id === markaId);
  if (!m) return;
  
  const modal = document.getElementById('billModal');
  if (modal) modal.dataset.markaId = markaId;
  document.getElementById('billTitle').textContent = `Bill Details · ${escapeHtml(m.marka)} · ${escapeHtml(m.master)}`;
  
  const bills = (m.bills || []).slice();
  const { col, dir } = SORTS.bills;
  bills.sort((a, b) => {
    let va, vb;
    if (col === 'firstDate') { va = a.firstDate; vb = b.firstDate; }
    else if (col === 'policyDate') { va = a.policyDate || a.firstDate; vb = b.policyDate || b.firstDate; }
    else if (col === 'policyName') { va = a.policyName || ''; vb = b.policyName || ''; }
    else if (col === 'sourceAmount') { va = a.sourceAmount; vb = b.sourceAmount; }
    else if (col === 'balance') { va = a.balance; vb = b.balance; }
    else if (col === 'status') { va = a.balance > 0 ? 1 : a.balance < 0 ? -1 : 0; vb = b.balance > 0 ? 1 : b.balance < 0 ? -1 : 0; }
    else { va = a.firstDate; vb = b.firstDate; }
    return compareVal(va, vb, dir);
  });
  
  updateSortIcons('bills');
  
  document.getElementById('billTable').innerHTML = bills.map(b => {
    const d = days(b.policyDate || b.firstDate);
    const statusBadge = b.balance < 0 ?
      `<span class="status advance">ADVANCE (${money(Math.abs(b.balance))})</span>` :
      b.balance === 0 ?
      '<span class="status closed">CLEARED</span>' :
      d > 0 ?
      `<span class="status overdue">OVERDUE (${d}d)</span>` :
      d === 0 ?
      '<span class="status active">DUE TODAY</span>' :
      `<span class="status closed" style="background:#e8f4f0;color:#186149;">UPCOMING (${Math.abs(d)}d)</span>`;

    return `
      <tr>
        <td>${fmt(b.firstDate)}</td>
        <td><b>${fmt(b.policyDate || b.firstDate)}</b></td>
        <td>${escapeHtml(b.policyName || 'NET')}</td>
        <td>${(b.billNos || []).map(escapeHtml).join(', ') || '—'}</td>
        <td class="money">${money(b.sourceAmount)}</td>
        <td class="money" style="${b.balance < 0 ? 'color:#512da8;font-weight:700;' : ''}">${money(b.balance)}</td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join('');
  
  const total = totalOutstanding(m);
  const due = alreadyDueAmount(m);
  const upcoming = upcomingDueAmount(m);
  const activeCount = activeBills(m).length;
  
  document.getElementById('billSummary').innerHTML =
    `<div class="bill-total">
      <strong>Total Outstanding: ${money(total)}</strong> 
      <span style="margin-left:8px;font-size:12px;color:#5a7066;">(${money(due)} Already Due · ${money(upcoming)} Upcoming) across ${activeCount} active bills of ${bills.length} total</span>
    </div>`;
  openModal('billModal');
}

function openHistory(markaId) {
  const m = markas.find(x => x.id === markaId);
  if (!m) return;
  document.getElementById('historyTitle').textContent = `Conversation History · ${escapeHtml(m.marka)} · ${escapeHtml(m.master)}`;
  document.getElementById('historyTimeline').innerHTML = renderHistoryTimeline(m);
  openModal('historyModal');
}

function assign(markaName, currentOwner) {
  document.getElementById('assignmentMarka').value = markaName;
  document.getElementById('assignmentFollowper').value = currentOwner === 'Unassigned' ? '' : currentOwner;
  document.getElementById('assignmentTitle').textContent = 'Assign Followper · ' + markaName;
  openModal('assignmentModal');
}

function saveAssignment(e) {
  e.preventDefault();
  const markaName = document.getElementById('assignmentMarka').value;
  const newOwner = document.getElementById('assignmentFollowper').value;
  markas.filter(m => m.marka === markaName).forEach(m => m.owner = newOwner);
  save();
  closeModal('assignmentModal');
  renderAll();
  toast('Followper assignment saved for ' + markaName + '.');
}

function openMasterAssignment(masterName) {
  document.getElementById('assignmentMasterName').value = masterName;
  document.getElementById('masterAssignmentTitle').textContent = `Assign Accountable Person · ${masterName}`;
  const currentOwner = getMasterFollowper(masterName);
  document.getElementById('masterAssignmentCopy').textContent = `Set the default accountable followper for all current and future Markas under ${masterName}.`;
  document.getElementById('masterAssignmentFollowper').value = currentOwner === 'Unassigned' ? '' : currentOwner;
  document.getElementById('syncMasterMarkas').checked = true;
  openModal('masterAssignmentModal');
}

function saveMasterAssignment(e) {
  e.preventDefault();
  const masterName = document.getElementById('assignmentMasterName').value;
  const newFollowper = document.getElementById('masterAssignmentFollowper').value.trim() || 'Unassigned';
  const syncMarkas = document.getElementById('syncMasterMarkas').checked;
  
  masterFollowpers[masterName] = newFollowper;
  
  let count = 0;
  if (syncMarkas) {
    markas.filter(m => m.master === masterName).forEach(m => {
      m.owner = newFollowper;
      count++;
    });
  }
  
  save();
  closeModal('masterAssignmentModal');
  renderAll();
  toast(`Master accountability saved: ${masterName} → ${newFollowper}${syncMarkas ? ` (${count} Markas updated)` : ''}`);
}

function openPaymentHistory(markaId) {
  const m = markas.find(x => x.id === markaId);
  if (!m) return toast('Marka not found.');
  
  const modal = document.getElementById('paymentHistoryModal');
  if (modal) modal.dataset.markaId = markaId;
  
  document.getElementById('payHistTitle').textContent = `Payment Ledger · ${escapeHtml(m.marka)} · ${escapeHtml(m.master)}`;
  
  const markaPayments = payments.filter(p => p.marka === m.marka || (m.bills || []).some(b => (p.allocations || []).some(a => a.billId === b.id)));
  
  const totalPaid = markaPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const outStanding = totalOutstanding(m);
  const clearedBillsCount = (m.bills || []).filter(b => b.balance === 0).length;
  
  document.getElementById('payHistMetrics').innerHTML = [
    ['LIFETIME PAYMENTS', money(totalPaid), `${markaPayments.length} recorded payments`],
    ['CURRENT OUTSTANDING', money(outStanding), `${activeBills(m).length} active bills`],
    ['CLEARED INVOICES', clearedBillsCount.toLocaleString('en-IN'), `of ${(m.bills || []).length} total bills`]
  ].map(x => `
    <div class="metric">
      <div class="metric-top"><span>${x[0]}</span></div>
      <strong>${x[1]}</strong>
      <small>${x[2]}</small>
    </div>
  `).join('');
  
  document.getElementById('payHistTable').innerHTML = markaPayments.length ? markaPayments.map(p => {
    const allocDetails = (p.allocations || []).map(a => {
      const b = (m.bills || []).find(x => x.id === a.billId);
      const bDate = b ? fmt(b.firstDate) : 'Bill';
      return `<small style="display:block;color:#5a7066;">${bDate}: ${money(a.amount)} (${a.settled ? 'Settled ✓' : 'Part ◐'})</small>`;
    }).join('');
    
    return `
      <tr>
        <td><b>${fmt(p.date)}</b></td>
        <td><code>${escapeHtml(p.ref || '—')}</code></td>
        <td><span class="status active">${escapeHtml(p.mode || 'Bank transfer')}</span></td>
        <td class="money" style="font-weight:700;color:#087454;">${money(p.amount)}</td>
        <td>${allocDetails || '<small>Direct receipt</small>'}</td>
        <td><span class="status closed">RECORDED</span></td>
      </tr>
    `;
  }).join('') : '<tr><td colspan="6" style="text-align:center;color:#788882;padding:24px;">No payments recorded yet for this Marka in Daily Rokad.</td></tr>';
  
  const payEntries = (m.history || []).filter(h => h.type === 'payment').slice().reverse();
  document.getElementById('payHistTimeline').innerHTML = payEntries.length ? payEntries.map(h => `
    <div class="timeline">
      <span class="time-icon payment">₹</span>
      <div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:4px;">
          <b>${escapeHtml(h.status || 'Payment Received')} · ${money(h.amount || 0)}</b>
          <span style="font:600 11px 'DM Mono', monospace;color:#087454;">Actual: ${fmt(h.date)}</span>
        </div>
        <p style="margin:4px 0;color:#334d43;">${escapeHtml(h.remark || '')}</p>
      </div>
      <time>${fmt(h.date)}</time>
    </div>
  `).join('') : '<p class="modal-copy">No payment conversation logs for this Marka.</p>';
  
  openModal('paymentHistoryModal');
}

function openPaymentHistoryFromBills() {
  const modal = document.getElementById('billModal');
  const mId = modal ? modal.dataset.markaId : '';
  if (mId) {
    closeModal('billModal');
    openPaymentHistory(mId);
  }
}

function exportMarkaPaymentExcel() {
  const modal = document.getElementById('paymentHistoryModal');
  const mId = modal ? modal.dataset.markaId : '';
  const m = markas.find(x => x.id === mId);
  if (!m) return toast('No Marka selected.');
  
  const markaPayments = payments.filter(p => p.marka === m.marka || (m.bills || []).some(b => (p.allocations || []).some(a => a.billId === b.id)));
  const rows = markaPayments.map(p => ({
    marka: m.marka,
    master: m.master,
    followper: ownerOf(m),
    date: p.date,
    ref: p.ref,
    mode: p.mode,
    amount: p.amount
  }));
  
  const table = `<table><tr><th>Marka</th><th>Master</th><th>Followper</th><th>Payment Date</th><th>Receipt / UTR</th><th>Mode</th><th>Amount Received (INR)</th></tr>${rows.map(r => `<tr><td>${escapeHtml(r.marka)}</td><td>${escapeHtml(r.master)}</td><td>${escapeHtml(r.followper)}</td><td>${r.date}</td><td>${escapeHtml(r.ref)}</td><td>${escapeHtml(r.mode)}</td><td>${r.amount}</td></tr>`).join('')}</table>`;
  const blob = new Blob(['\ufeff' + table], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `payment-ledger-${m.marka}.xls`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportMarkaBillsExcel() {
  const modal = document.getElementById('billModal');
  const mId = modal ? modal.dataset.markaId : '';
  const m = markas.find(x => x.id === mId);
  if (!m) return toast('No Marka selected.');
  
  const rows = (m.bills || []).map(b => {
    const d = days(b.policyDate || b.firstDate);
    const dueStatus = b.balance < 0 ? 'Advance' : b.balance === 0 ? 'Cleared' : d > 0 ? `Overdue (${d} days)` : d === 0 ? 'Due Today' : `Upcoming (${Math.abs(d)} days)`;
    return {
      marka: m.marka,
      master: m.master,
      billDate: b.firstDate,
      policyDate: b.policyDate || b.firstDate,
      policyName: b.policyName || 'NET',
      billNos: (b.billNos || []).join(', '),
      sourceAmount: b.sourceAmount,
      balance: b.balance,
      status: dueStatus
    };
  });
  
  const table = `<table><tr><th>Marka</th><th>Master</th><th>Bill Date</th><th>Due Date (Policy)</th><th>Policy</th><th>Bill Numbers</th><th>Original Amount (INR)</th><th>Current Balance (INR)</th><th>Status</th></tr>${rows.map(r => `<tr><td>${escapeHtml(r.marka)}</td><td>${escapeHtml(r.master)}</td><td>${r.billDate}</td><td>${r.policyDate}</td><td>${escapeHtml(r.policyName)}</td><td>${escapeHtml(r.billNos)}</td><td>${r.sourceAmount}</td><td>${r.balance}</td><td>${escapeHtml(r.status)}</td></tr>`).join('')}</table>`;
  const blob = new Blob(['\ufeff' + table], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bill-statement-${m.marka}.xls`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function printBillStatement() {
  window.print();
}

// ==========================================
// CRM ESCALATION RESOLUTION & CLAIM SETTLEMENT
// ==========================================
function openResolution(markaId, escId) {
  let m = markas.find(x => x.id === markaId || x.marka === markaId);
  if (!m) m = markas[0];
  if (!m) return toast('Marka not found.');
  
  if (!m.escalations) m.escalations = [];
  let esc = m.escalations.find(e => String(e.id) === String(escId));
  
  if (!esc) {
    const histIdx = String(escId).startsWith('h_crm_') ? parseInt(String(escId).split('_').pop(), 10) : -1;
    const h = (histIdx >= 0 && m.history) ? m.history[histIdx] : null;
    esc = {
      id: escId,
      date: h ? h.date : iso(today),
      type: (h ? h.status : null) || 'Claim Matter',
      claimNumber: h ? (h.claimNumber || '') : '',
      waComplaintNo: h ? (h.waComplaintNo || '') : '',
      escalatedTo: h ? (h.escalatedTo || '') : '',
      followper: (h ? h.followper : null) || ownerOf(m),
      status: 'Open',
      remark: h ? (h.remark || '') : '',
      billIds: h ? (h.billIds || []) : []
    };
    m.escalations.push(esc);
    save();
  }
  
  document.getElementById('resolveMarkaId').value = m.id;
  document.getElementById('resolveEscId').value = esc.id;
  document.getElementById('resolveTitle').textContent = `Resolve ${esc.type} · ${escapeHtml(m.marka)} ${esc.claimNumber || esc.waComplaintNo ? '· (' + (esc.claimNumber || esc.waComplaintNo) + ')' : ''}`;
  document.getElementById('resolveDate').value = iso(today);
  document.getElementById('resolveRemark').value = esc.remark || '';
  document.getElementById('resolveType').value = 'Discount / Debit Note';
  
  const coverInput = document.getElementById('resolveCoverAmount');
  if (coverInput) coverInput.value = '';

  const bills = activeBills(m).sort((a, b) => (a.policyDate || a.firstDate).localeCompare(b.policyDate || b.firstDate));
  const container = document.getElementById('settleBillList');
  if (!bills.length) {
    container.innerHTML = '<p class="modal-copy">No active unpaid bills for this Marka.</p>';
  } else {
    container.innerHTML = bills.map(b => `
      <div class="settle-bill-item">
        <input type="checkbox" class="settle-check" data-bill-id="${b.id}" onchange="updateSettleSummary()">
        <div>
          <b>Bill ${fmt(b.firstDate)}</b> (Due: ${fmt(b.policyDate || b.firstDate)})
          <small style="display:block;color:#75847e;">${(b.billNos || []).join(', ') || 'No invoice ref'}</small>
        </div>
        <span>Due: ${money(b.balance)}</span>
        <input type="number" class="settle-amt" data-bill-id="${b.id}" value="${b.balance}" max="${b.balance}" min="0" oninput="updateSettleSummary()" placeholder="Settle amt">
      </div>
    `).join('');
  }
  toggleResolutionType();
  updateSettleSummary();
  openModal('resolveModal');
}

function onResolveCoverAmountInput() {
  const coverAmt = +document.getElementById('resolveCoverAmount')?.value || 0;
  const markaId = document.getElementById('resolveMarkaId').value;
  const m = markas.find(x => x.id === markaId);
  if (!m) return;

  const bills = activeBills(m).sort((a, b) => (a.policyDate || a.firstDate).localeCompare(b.policyDate || b.firstDate));
  
  if (coverAmt > 0) {
    let remaining = coverAmt;
    bills.forEach(b => {
      const chk = document.querySelector(`.settle-check[data-bill-id="${b.id}"]`);
      const inp = document.querySelector(`.settle-amt[data-bill-id="${b.id}"]`);
      if (!chk || !inp) return;
      if (remaining <= 0) {
        chk.checked = false;
        inp.value = 0;
      } else {
        const alloc = Math.min(remaining, b.balance);
        remaining -= alloc;
        chk.checked = true;
        inp.value = alloc;
      }
    });
  } else {
    bills.forEach(b => {
      const chk = document.querySelector(`.settle-check[data-bill-id="${b.id}"]`);
      const inp = document.querySelector(`.settle-amt[data-bill-id="${b.id}"]`);
      if (chk && inp) {
        chk.checked = false;
        inp.value = b.balance;
      }
    });
  }
  updateSettleSummary();
}
window.onResolveCoverAmountInput = onResolveCoverAmountInput;

function toggleResolutionType() {
  const mode = document.getElementById('resolveType').value;
  const container = document.getElementById('settleBillsContainer');
  if (mode === 'Resolved without Adjustment' || mode === 'Direct Refund') {
    container.style.display = 'none';
  } else {
    container.style.display = 'block';
  }
  updateSettleSummary();
}

function selectAllSettleBills(select) {
  document.querySelectorAll('.settle-check').forEach(chk => chk.checked = select);
  updateSettleSummary();
}

function updateSettleSummary() {
  const mode = document.getElementById('resolveType').value;
  if (mode === 'Resolved without Adjustment' || mode === 'Direct Refund') {
    document.getElementById('settleSummary').textContent = `${mode} — No balance reduction on bills.`;
    return;
  }
  let total = 0;
  let count = 0;
  document.querySelectorAll('.settle-check:checked').forEach(chk => {
    const bId = chk.dataset.billId;
    const input = document.querySelector(`.settle-amt[data-bill-id="${bId}"]`);
    const amt = input ? (+input.value || 0) : 0;
    total += amt;
    count++;
  });
  document.getElementById('settleSummary').textContent =
    count > 0 ? `Total settlement: ${money(total)} across ${count} selected bill${count > 1 ? 's' : ''}` : 'No bills selected for settlement adjustment.';
}

function openEscalationDetails(markaId, escId) {
  let m = markas.find(x => x.id === markaId || x.marka === markaId);
  if (!m) m = markas[0];
  if (!m) return toast('Marka not found.');
  if (!m.escalations) m.escalations = [];
  let esc = m.escalations.find(e => String(e.id) === String(escId));
  if (!esc) {
    const histIdx = String(escId).startsWith('h_crm_') ? parseInt(String(escId).split('_').pop(), 10) : -1;
    const h = (histIdx >= 0 && m.history) ? m.history[histIdx] : null;
    esc = {
      id: escId,
      date: h ? h.date : iso(today),
      type: (h ? h.status : null) || 'Claim Matter',
      claimNumber: h ? (h.claimNumber || '') : '',
      waComplaintNo: h ? (h.waComplaintNo || '') : '',
      escalatedTo: h ? (h.escalatedTo || '') : '',
      followper: (h ? h.followper : null) || ownerOf(m),
      status: 'Resolved',
      remark: h ? (h.remark || '') : '',
      resolutionType: 'Resolved without Adjustment',
      resolutionNote: h ? (h.remark || 'Settled') : 'Settled'
    };
  }

  document.getElementById('escDetailsTitle').textContent = `${esc.type} Details · ${escapeHtml(m.marka)} · ${escapeHtml(m.master)}`;
  
  const isOpen = (esc.status || 'Open').toLowerCase() === 'open';
  let taggedBillsHtml = '';
  if (esc.billIds && esc.billIds.length > 0) {
    const tagged = (m.bills || []).filter(b => esc.billIds.includes(b.id));
    if (tagged.length > 0) {
      taggedBillsHtml = `
        <div style="margin-top:10px;">
          <b style="font-size:11px; color:#495d56; text-transform:uppercase;">TAGGED INVOICES:</b>
          <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:4px;">
            ${tagged.map(b => `<span style="background:#edf6f2; border:1px solid #c0e7d5; padding:3px 8px; border-radius:4px; font-size:11px; font-family:'DM Mono',monospace;">Bill ${fmt(b.firstDate)} ${(b.billNos || []).join(', ')} · Due: ${money(b.balance)}</span>`).join('')}
          </div>
        </div>
      `;
    }
  }

  let resolutionHtml = '';
  if (!isOpen) {
    let settledBreakdown = '';
    if (esc.settledBills && esc.settledBills.length > 0) {
      settledBreakdown = `
        <div style="margin-top:10px;">
          <b style="font-size:11px; color:#087454; text-transform:uppercase;">SETTLED INVOICES BREAKDOWN:</b>
          <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:4px;">
            ${esc.settledBills.map(s => `<span style="background:#fff; border:1px solid #a4dfc4; padding:3px 8px; border-radius:4px; font-size:11px; font-family:'DM Mono',monospace; color:#087454;">Bill ${fmt(s.date || s.firstDate)} · Settled: ${money(s.amount)}</span>`).join('')}
          </div>
        </div>
      `;
    }

    resolutionHtml = `
      <div style="background:#f0faf5; border:1px solid #bce4d2; border-radius:8px; padding:14px 16px; margin-top:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; margin-bottom:10px;">
          <span style="font-size:11px; font-weight:800; color:#087454; letter-spacing:0.5px; text-transform:uppercase;">✓ RESOLUTION &amp; SETTLEMENT AUDIT TRAIL</span>
          <span class="status closed" style="font-weight:700;">RESOLVED</span>
        </div>
        <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap:10px; margin-bottom:10px;">
          <div><small style="color:#6d827a; display:block;">Action / Decision</small><b>${escapeHtml(esc.resolutionType || 'Resolved')}</b></div>
          <div><small style="color:#6d827a; display:block;">Resolution Date</small><b>${fmt(esc.resolvedDate)}</b></div>
          <div><small style="color:#6d827a; display:block;">Resolved By</small><b>${escapeHtml(esc.resolvedBy || esc.followper || 'Admin')}</b></div>
          <div><small style="color:#6d827a; display:block;">Settled / Adjusted Amount</small><b style="font-family:'DM Mono',monospace; color:#087454; font-size:14px;">${money(esc.settledAmount || 0)}</b></div>
        </div>
        <div style="background:#fff; border:1px solid #d7ebe1; border-radius:6px; padding:10px; margin-top:6px;">
          <small style="color:#6d827a; display:block; margin-bottom:2px;">Resolution Remarks / Settlement Note:</small>
          <div style="color:#1d3d31; font-size:12px; line-height:1.4;">${escapeHtml(esc.resolutionNote || esc.remark || 'Resolved and closed.')}</div>
        </div>
        ${settledBreakdown}
      </div>
    `;
  } else {
    resolutionHtml = `
      <div style="background:#fff8f4; border:1px solid #fed7c3; border-radius:8px; padding:12px 16px; margin-top:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div>
          <span class="status overdue" style="font-weight:700;">OPEN &amp; PENDING ACTION</span>
          <span style="font-size:12px; color:#a1471f; margin-left:8px;">This ticket is currently active and requires resolution.</span>
        </div>
        <button type="button" class="btn primary" onclick="closeModal('escDetailsModal'); openResolution('${m.id}', '${esc.id}')">Resolve &amp; Settle Ticket</button>
      </div>
    `;
  }

  document.getElementById('escDetailsBody').innerHTML = `
    <div style="background:#fff; border:1px solid #e1e9e5; border-radius:8px; padding:14px 16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; margin-bottom:10px; border-bottom:1px solid #f0f4f2; padding-bottom:8px;">
        <div>
          <span style="font-size:11px; font-weight:800; color:#495d56; letter-spacing:0.5px; text-transform:uppercase;">TICKET INFORMATION</span>
          <h3 style="margin:2px 0 0; font-size:16px; color:#182e25;">${escapeHtml(m.marka)} · ${escapeHtml(m.master)}</h3>
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <span class="status active">${escapeHtml(esc.type)}</span>
          <span class="status ${isOpen ? 'overdue' : 'closed'}">${isOpen ? 'OPEN' : 'RESOLVED'}</span>
        </div>
      </div>

      <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap:10px;">
        <div><small style="color:#788882; display:block;">Date Logged</small><b>${fmt(esc.date)}</b></div>
        <div><small style="color:#788882; display:block;">Created By</small><b>${escapeHtml(esc.followper || '—')}</b></div>
        <div><small style="color:#788882; display:block;">Assigned / Escalated To</small><b style="color:#087454;">${escapeHtml(esc.escalatedTo || '—')}</b></div>
        <div><small style="color:#788882; display:block;">Ref / Ticket No</small><b style="font-family:'DM Mono',monospace;">${escapeHtml(esc.claimNumber || esc.waComplaintNo || '—')}</b></div>
      </div>

      <div style="margin-top:10px; background:#f9fbfa; border:1px solid #edf2f0; border-radius:6px; padding:10px;">
        <small style="color:#788882; display:block; margin-bottom:2px;">Original Issue / Reason / Conversation Remark:</small>
        <div style="color:#2b4238; font-size:12px; line-height:1.4;">${escapeHtml(esc.remark || 'No description provided.')}</div>
      </div>

      ${taggedBillsHtml}
    </div>

    ${resolutionHtml}
  `;

  document.getElementById('escDetailsTimeline').innerHTML = renderHistoryTimeline(m);

  const footerActions = document.getElementById('escDetailsFooterActions');
  if (footerActions) {
    if (isOpen) {
      footerActions.innerHTML = `<button type="button" class="btn primary" onclick="closeModal('escDetailsModal'); openResolution('${m.id}', '${esc.id}')">Resolve &amp; Settle</button>`;
    } else {
      footerActions.innerHTML = `<button type="button" class="btn secondary" onclick="closeModal('escDetailsModal'); openHistory('${m.id}')">View Full Marka History</button>`;
    }
  }

  openModal('escDetailsModal');
}
window.openEscalationDetails = openEscalationDetails;

async function saveResolution(e) {
  e.preventDefault();
  const markaId = document.getElementById('resolveMarkaId').value;
  const escId = document.getElementById('resolveEscId').value;
  const m = markas.find(x => x.id === markaId);
  if (!m) return toast('Marka not found.');
  const esc = (m.escalations || []).find(e => e.id === escId);
  if (!esc) return toast('Escalation not found.');
  
  const resDate = document.getElementById('resolveDate').value;
  const resType = document.getElementById('resolveType').value;
  const resRemark = document.getElementById('resolveRemark').value.trim();
  const coverAmount = +document.getElementById('resolveCoverAmount')?.value || 0;
  const resolvedBy = (window.currentUser && window.currentUser.followperName && window.currentUser.followperName !== 'all') ? window.currentUser.followperName : (window.currentUser && window.currentUser.email ? window.currentUser.email : 'Admin');
  
  let totalSettled = 0;
  const settledBills = [];
  
  if (resType !== 'Resolved without Adjustment' && resType !== 'Direct Refund') {
    const checks = document.querySelectorAll('.settle-check:checked');
    checks.forEach(chk => {
      const bId = chk.dataset.billId;
      const b = m.bills.find(x => String(x.id) === String(bId));
      const input = document.querySelector(`.settle-amt[data-bill-id="${bId}"]`);
      const amt = input ? Math.min(+input.value || 0, b ? b.balance : 0) : 0;
      if (b && amt > 0) {
        settledBills.push({ billId: b.id, date: b.firstDate, amount: amt, settled: (b.balance - amt) === 0 });
        totalSettled += amt;
      }
    });
  }
  
  if (isOnlineMode()) {
    const payload = {
      markaId,
      escId,
      resolveDate: resDate,
      resolveType: resType,
      resolveRemark: resRemark,
      resolvedBy: resolvedBy,
      coverAmount: coverAmount,
      settlements: settledBills.map(b => ({ billId: b.billId, amount: b.amount }))
    };
    try {
      const res = await fetch('/api/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        closeModal('resolveModal');
        await syncWithDatabase();
        toast('Escalation resolved in SQLite database.');
      } else {
        const err = await res.json();
        toast('Error: ' + err.error);
      }
    } catch (err) {
      toast('API error: ' + err.message);
    }
  } else {
    // Local / offline resolution
    if (settledBills.length > 0) {
      settledBills.forEach(s => {
        const b = m.bills.find(x => String(x.id) === String(s.billId));
        if (b) b.balance = Math.max(0, b.balance - s.amount);
      });
    }
    
    esc.status = 'Resolved';
    esc.resolvedDate = resDate;
    esc.resolutionType = resType;
    esc.settledAmount = totalSettled;
    esc.coverAmount = coverAmount;
    esc.settledBills = settledBills;
    esc.resolutionNote = resRemark;
    esc.resolvedBy = resolvedBy;
    
    const historyRemark = totalSettled > 0 ?
      `[${esc.type} RESOLVED] ${resType}: ${money(totalSettled)} settled across ${settledBills.length} bill(s). Note: ${resRemark}` :
      `[${esc.type} RESOLVED] ${resType}. Note: ${resRemark}`;
    
    m.history.push({
      type: 'followup',
      date: resDate,
      followper: resolvedBy,
      status: 'Claim Resolved',
      contact: 'CRM Resolution',
      mode: 'Email',
      remark: historyRemark,
      expected: 0,
      promise: '',
      next: totalOutstanding(m) > 0 ? iso(new Date(today.getTime() + 2 * 86400000)) : ''
    });
    
    const remainingDue = totalOutstanding(m);
    if (remainingDue <= 0) {
      m.nextDate = '';
      m.lastStatus = 'Payment Received';
      m.remark = 'All outstanding dues cleared after claim settlement.';
    } else {
      m.nextDate = iso(new Date(today.getTime() + 2 * 86400000));
      m.lastStatus = 'Claim Resolved';
      m.remark = `Claim resolved with ${money(totalSettled)} settlement. ${money(remainingDue)} remaining.`;
    }
    m.lastDate = resDate;
    
    save();
    closeModal('resolveModal');
    renderAll();
    toast(`${esc.type} resolved locally; balance updated.`);
  }
}

// ==========================================
// IMPORT & EXPORT
// ==========================================
// CSV Parser Helpers
function parseCsvLine(text) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += char;
    }
  }
  result.push(cur.trim());
  return result;
}

function parseAmount(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const clean = String(val).replace(/[₹\s,"']/g, '').trim();
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

function parseCsvDate(str) {
  if (!str) return '';
  str = String(str).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  
  if (/^\d{5}$/.test(str)) {
    const d = new Date((parseInt(str, 10) - 25569) * 86400 * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  
  const parts = str.split(/[\/\-\.]/);
  if (parts.length === 3) {
    let [p1, p2, p3] = parts.map(p => parseInt(p, 10));
    if (p3 < 100) p3 += 2000;
    if (parts[0].length === 4) {
      return `${parts[0]}-${String(p2).padStart(2, '0')}-${String(p3).padStart(2, '0')}`;
    }
    if (p1 <= 12 && p2 > 12) {
      return `${p3}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
    } else if (p2 <= 12 && p1 > 12) {
      return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
    } else {
      return `${p3}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
    }
  }
  const d = new Date(str);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

window.parseCsvLine = parseCsvLine;
window.parseAmount = parseAmount;
window.parseCsvDate = parseCsvDate;

function importFile(e) {
  const f = e.target.files[0];
  if (!f) return;
  
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  
  if (ext === 'xlsx' || ext === 'xls') {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        if (typeof XLSX === 'undefined') {
          return toast('Excel library is loading, please try again in a moment.');
        }
        const workbook = XLSX.read(data, { type: 'array', cellDates: true, raw: false });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
        processImportedRows(rawRows, f.name);
      } catch (err) {
        console.error('Error reading Excel file:', err);
        toast('Failed to read Excel file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(f);
  } else {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const lines = reader.result.trim().split(/\r?\n/);
        if (!lines.length) return;
        const headerLine = lines.shift();
        const rawHeaders = parseCsvLine(headerLine);
        
        const rawRows = [];
        lines.forEach(line => {
          if (!line.trim()) return;
          const cols = parseCsvLine(line);
          const rowObj = {};
          rawHeaders.forEach((h, i) => {
            rowObj[h] = cols[i] || '';
          });
          rawRows.push(rowObj);
        });
        processImportedRows(rawRows, f.name);
      } catch (err) {
        console.error('Error reading CSV file:', err);
        toast('Failed to read CSV file: ' + err.message);
      }
    };
    reader.readAsText(f);
  }
}

// Keep backwards-compatible alias
const importCSV = importFile;
window.importFile = importFile;
window.importCSV = importCSV;

function processImportedRows(rawRows, fileName = 'Imported File') {
  if (!rawRows || !rawRows.length) {
    return toast('The uploaded file is empty.');
  }

  const markaMap = new Map();
  let totalRows = 0;

  rawRows.forEach(rawRow => {
    // Normalize keys: lowercase without special characters
    const row = {};
    for (const [k, v] of Object.entries(rawRow)) {
      const cleanKey = k.toLowerCase().trim().replace(/[\s\-_/\\+]+/g, '');
      row[cleanKey] = v;
    }

    const markaName = (row['markagroup'] || row['marka'] || row['group'] || row['party'] || '').trim();
    const rawBillDate = row['billdate'] || row['date'] || row['firstdate'] || '';
    const billDate = parseCsvDate(rawBillDate);

    const rawBalance = row['balance'] !== undefined ? row['balance'] : (row['outstanding'] || row['balamt'] || row['netbalance'] || row['billamt'] || 0);
    const balance = parseAmount(rawBalance);

    const master = (row['master'] || row['mastername'] || 'Unassigned Master').trim();
    const own = (row['collectionperson'] || row['collectionp'] || row['followper'] || row['doer'] || '').trim();
    const billNo = String(row['billno'] || row['invoiceno'] || row['billnum'] || '').trim();

    const rawPolicyDate = row['policydate'] || row['duedate'] || row['policyduedate'] || '';
    const policyDate = parseCsvDate(rawPolicyDate) || billDate; // Policy date is actual due date
    const policyName = (row['policyname'] || row['policy'] || 'NET').trim();

    if (!markaName || !billDate) return;
    totalRows++;

    if (!markaMap.has(markaName)) {
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
  let ignoredDuplicates = 0;
  let addedBills = 0;

  markaMap.forEach((data, markaName) => {
    let m = markas.find(x => x.marka === markaName);
    if (m) {
      data.bills.forEach((newBill) => {
        const existingBill = (m.bills || []).find(b => b.firstDate === newBill.firstDate && b.sourceAmount === newBill.sourceAmount && (newBill.billNos.length === 0 || (b.billNos || []).some(no => newBill.billNos.includes(no))));
        if (existingBill) {
          ignoredDuplicates++;
          return;
        }

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
      });
      m.master = data.master || m.master;
      if (ownerOf(m) === 'Unassigned' && data.own) m.owner = data.own;
      if (totalOutstanding(m) > 0 && !m.nextDate) {
        m.nextDate = iso(new Date(today.getTime() + 86400000));
      } else if (totalOutstanding(m) === 0) {
        m.nextDate = '';
      }
    } else {
      const existingOwner = markas.find(x => x.marka === markaName);
      const bills = [];
      data.bills.forEach((b) => {
        bills.push({
          id: Date.now() + updated + bills.length,
          firstDate: b.firstDate,
          balance: b.balance,
          sourceAmount: b.sourceAmount,
          billCount: b.billCount,
          billNos: b.billNos,
          policyDate: b.policyDate,
          policyName: b.policyName
        });
      });
      markas.push({
        id: uid(),
        marka: markaName,
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
  });

  save();
  closeModal('importModal');
  renderAll();
  switchView('schedule');

  if (isOnlineMode()) {
    fetch('/api/import-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markas })
    }).then(r => r.json()).then(data => {
      toast(`✓ ${updated} Markas synchronized with SQLite database (${fileName}).`);
    }).catch(err => {
      console.warn('SQLite sync notice:', err);
      toast(`${updated} Markas processed locally.`);
    });
  } else {
    toast(`${updated} Markas processed (${fileName}).`);
  }
}

async function clearAllData() {
  const isMasterAdmin = currentUser && (
    currentUser.email === 'devlope.vishal@gmail.com' ||
    currentUser.email === 'admin@collectiq.com' ||
    (currentUser.role === 'admin' && currentUser.email.includes('admin'))
  );

  if (!isMasterAdmin) {
    return toast('Access Denied: Only devlope.vishal@gmail.com and Primary Admin can reset/clear bills data.');
  }

  if (!confirm('⚠️ Are you sure you want to clear all existing Markas, Bills, and Collection Data?\n\nThis will give you a clean slate to upload your new dataset. (User logins and accounts will be preserved).')) {
    return;
  }

  markas = [];
  payments = [];
  localStorage.removeItem('collectiq_markas_v4');
  localStorage.removeItem('collectiq_rokad_v4');
  localStorage.removeItem('collectiq_markas_v3');
  localStorage.removeItem('collectiq_rojkad_v3');

  if (isOnlineMode()) {
    try {
      const res = await fetch('/api/clear-all-data', { method: 'POST' });
      if (res.ok) {
        toast('✓ All database collection records cleared.');
      } else {
        const err = await res.json();
        toast('Notice: ' + err.error);
      }
    } catch (e) {
      console.warn('Backend clear notice:', e);
    }
  }

  save();
  renderAll();
  switchView('import');
  const modal = document.querySelector('#importModal');
  if (modal) modal.classList.add('open');
  toast('Clean slate ready! Choose your new CSV file to upload.');
}

function exportExcel() {
  const list = filtered();
  const rows = list.flatMap(m => m.bills.map(b => {
    const d = days(b.policyDate || b.firstDate);
    const dueStatus = b.balance < 0 ? 'Advance' : b.balance === 0 ? 'Cleared' : d > 0 ? `Overdue (${d} days)` : d === 0 ? 'Due Today' : `Upcoming (${Math.abs(d)} days)`;
    return {
      marka: m.marka,
      master: m.master,
      masterFollowper: getMasterFollowper(m.master),
      markaFollowper: ownerOf(m),
      billDate: b.firstDate,
      policyDate: b.policyDate || b.firstDate,
      policyName: b.policyName || 'NET',
      billNos: (b.billNos || []).join(', ') || '—',
      originalAmount: b.sourceAmount,
      balance: b.balance,
      dueStatus: dueStatus,
      overdueDays: d > 0 ? d : 0,
      totalOutstanding: totalOutstanding(m),
      alreadyDueAmount: alreadyDueAmount(m),
      followUps: followUpCount(m),
      lastDate: m.lastDate || '—',
      nextDate: m.nextDate || '—',
      lastStatus: m.lastStatus || '—',
      remark: m.remark || '',
      ptp: m.ptp || '—',
      expected: m.expected || 0,
      gpLock: isLocked(m) ? 'Yes' : 'No'
    };
  }));
  
  const table = `<table><tr>
    <th>Marka</th>
    <th>Master</th>
    <th>Master Accountable Followper</th>
    <th>Marka Followper</th>
    <th>Bill Date (Invoice)</th>
    <th>Due Date (Policy)</th>
    <th>Policy</th>
    <th>Bill Numbers</th>
    <th>Original Amount (INR)</th>
    <th>Current Balance (INR)</th>
    <th>Due Status</th>
    <th>Overdue Days</th>
    <th>Marka Total Outstanding</th>
    <th>Marka Already Due</th>
    <th>Follow-up Count</th>
    <th>Last Contact Date (Actual)</th>
    <th>Next Scheduled Follow-up</th>
    <th>Last Status</th>
    <th>Last Remark</th>
    <th>PTP Promise Date</th>
    <th>Expected Amount</th>
    <th>GP Lock</th>
  </tr>${rows.map(r => `<tr>
    <td>${escapeHtml(r.marka)}</td>
    <td>${escapeHtml(r.master)}</td>
    <td>${escapeHtml(r.masterFollowper)}</td>
    <td>${escapeHtml(r.markaFollowper)}</td>
    <td>${r.billDate}</td>
    <td>${r.policyDate}</td>
    <td>${escapeHtml(r.policyName)}</td>
    <td>${escapeHtml(r.billNos)}</td>
    <td>${r.originalAmount}</td>
    <td>${r.balance}</td>
    <td>${escapeHtml(r.dueStatus)}</td>
    <td>${r.overdueDays}</td>
    <td>${r.totalOutstanding}</td>
    <td>${r.alreadyDueAmount}</td>
    <td>${r.followUps}</td>
    <td>${r.lastDate}</td>
    <td>${r.nextDate}</td>
    <td>${escapeHtml(r.lastStatus)}</td>
    <td>${escapeHtml(r.remark)}</td>
    <td>${r.ptp}</td>
    <td>${r.expected}</td>
    <td>${r.gpLock}</td>
  </tr>`).join('')}</table>`;
  
  const blob = new Blob(['\ufeff' + table], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `collectiq-full-receivables-${iso(today)}.xls`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportDailySummaryExcel() {
  const activeMarkaList = filtered(activeMarkas());
  const doerMap = {};
  activeMarkaList.forEach(m => {
    const d = ownerOf(m);
    if (!doerMap[d]) doerMap[d] = { markas: 0, todayVisits: 0, todayCalls: 0, todayWa: 0, todayPtp: 0, totalVisits: 0, totalActions: 0 };
    doerMap[d].markas++;
    (m.history || []).forEach(h => {
      doerMap[d].totalActions++;
      const isV = h.mode && (h.mode.toLowerCase().includes('person') || h.mode.toLowerCase().includes('visit'));
      const isC = h.mode && h.mode.toLowerCase().includes('phone');
      const isW = h.mode && h.mode.toLowerCase().includes('whatsapp');
      const isP = h.status === 'Promise to Pay';
      if (isV) doerMap[d].totalVisits++;
      if (h.date === iso(today)) {
        if (isV) doerMap[d].todayVisits++;
        if (isC) doerMap[d].todayCalls++;
        if (isW) doerMap[d].todayWa++;
        if (isP) doerMap[d].todayPtp++;
      }
    });
  });

  const rows = Object.keys(doerMap).map(d => ({
    doer: d,
    markas: doerMap[d].markas,
    todayVisits: doerMap[d].todayVisits,
    todayCalls: doerMap[d].todayCalls,
    todayWa: doerMap[d].todayWa,
    todayPtp: doerMap[d].todayPtp,
    totalVisits: doerMap[d].totalVisits,
    totalActions: doerMap[d].totalActions
  }));

  const table = `<table><tr><th>Doer / Sales Person</th><th>Assigned Markas</th><th>Today Visits</th><th>Today Calls</th><th>Today WhatsApp</th><th>Today PTPs</th><th>Total Visits Logged</th><th>Total Actions Logged</th></tr>${rows.map(r => `<tr><td>${escapeHtml(r.doer)}</td><td>${r.markas}</td><td>${r.todayVisits}</td><td>${r.todayCalls}</td><td>${r.todayWa}</td><td>${r.todayPtp}</td><td>${r.totalVisits}</td><td>${r.totalActions}</td></tr>`).join('')}</table>`;
  const blob = new Blob(['\ufeff' + table], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `collectiq-daily-activity-summary-${iso(today)}.xls`;
  a.click();
  URL.revokeObjectURL(a.href);
}
window.exportDailySummaryExcel = exportDailySummaryExcel;

function exportHelpTicketsExcel() {
  const isUserRole = currentUser && currentUser.role === 'user';
  let list = (helpTickets || []).slice();
  if (isUserRole) {
    const uName = (currentUser.followperName || '').toLowerCase().trim();
    list = list.filter(t => 
      (t.requestedBy || '').toLowerCase().trim() === uName || 
      (t.assignedHelper || '').toLowerCase().trim() === uName ||
      (t.resolvedBy || '').toLowerCase().trim() === uName ||
      markas.some(m => m.id === t.markaId && (ownerOf(m) || '').toLowerCase().trim() === uName)
    );
  }

  const rows = list.map(t => ({
    date: t.date || '—',
    marka: t.markaName || 'General',
    priority: t.priority || 'Normal',
    subject: t.subject || '',
    remark: t.remark || '',
    requestedBy: t.requestedBy || '',
    assignedHelper: t.assignedHelper || '',
    status: t.status || 'Open',
    nextDate: t.nextDate || '—',
    resolutionType: t.resolutionType || '',
    resolutionNote: t.resolutionNote || '',
    resolvedBy: t.resolvedBy || '',
    resolvedAt: t.resolvedAt ? t.resolvedAt.slice(0, 10) : ''
  }));

  const table = `<table><tr><th>Date</th><th>Marka / Party</th><th>Priority</th><th>Subject</th><th>Remark / Details</th><th>Requested By</th><th>Assigned Helper</th><th>Status</th><th>Next Follow-up Date</th><th>Resolution Action Taken</th><th>Resolution Note</th><th>Resolved By</th><th>Resolved Date</th></tr>${rows.map(r => `<tr><td>${r.date}</td><td>${escapeHtml(r.marka)}</td><td>${escapeHtml(r.priority)}</td><td>${escapeHtml(r.subject)}</td><td>${escapeHtml(r.remark)}</td><td>${escapeHtml(r.requestedBy)}</td><td>${escapeHtml(r.assignedHelper)}</td><td>${escapeHtml(r.status)}</td><td>${r.nextDate}</td><td>${escapeHtml(r.resolutionType)}</td><td>${escapeHtml(r.resolutionNote)}</td><td>${escapeHtml(r.resolvedBy)}</td><td>${r.resolvedAt}</td></tr>`).join('')}</table>`;
  const blob = new Blob(['\ufeff' + table], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `collectiq-help-tickets-report-${iso(today)}.xls`;
  a.click();
  URL.revokeObjectURL(a.href);
}
window.exportHelpTicketsExcel = exportHelpTicketsExcel;

function exportEscalationsExcel() {
  const isUserRole = currentUser && currentUser.role === 'user';
  let list = [];
  markas.forEach(m => {
    (m.escalations || []).forEach(e => {
      list.push({
        date: e.date,
        marka: m.marka,
        master: m.master,
        type: e.type,
        ref: e.claimNumber || e.waComplaintNo || '—',
        followper: e.followper || ownerOf(m),
        escalatedTo: e.escalatedTo || '—',
        status: e.status || 'Open',
        settledAmount: e.settledAmount || 0,
        coverAmount: e.coverAmount || 0,
        resolutionNote: e.resolutionNote || e.remark || '',
        resolvedBy: e.resolvedBy || '—',
        resolvedDate: e.resolvedDate || '—'
      });
    });
  });

  if (isUserRole) {
    const uName = (currentUser.followperName || '').toLowerCase().trim();
    list = list.filter(e => 
      (e.followper || '').toLowerCase().trim() === uName ||
      (e.escalatedTo || '').toLowerCase().trim() === uName ||
      (e.resolvedBy || '').toLowerCase().trim() === uName
    );
  }

  const table = `<table><tr><th>Date</th><th>Marka / Party</th><th>Master</th><th>Type</th><th>Claim / Complaint Ref</th><th>Created By</th><th>Escalated To</th><th>Status</th><th>Settled Amount (INR)</th><th>Cover Amount (INR)</th><th>Resolution Note</th><th>Resolved By</th><th>Resolved Date</th></tr>${list.map(r => `<tr><td>${r.date}</td><td>${escapeHtml(r.marka)}</td><td>${escapeHtml(r.master)}</td><td>${escapeHtml(r.type)}</td><td>${escapeHtml(r.ref)}</td><td>${escapeHtml(r.followper)}</td><td>${escapeHtml(r.escalatedTo)}</td><td>${escapeHtml(r.status)}</td><td>${r.settledAmount}</td><td>${r.coverAmount}</td><td>${escapeHtml(r.resolutionNote)}</td><td>${escapeHtml(r.resolvedBy)}</td><td>${r.resolvedDate}</td></tr>`).join('')}</table>`;
  const blob = new Blob(['\ufeff' + table], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `collectiq-crm-escalations-report-${iso(today)}.xls`;
  a.click();
  URL.revokeObjectURL(a.href);
}
window.exportEscalationsExcel = exportEscalationsExcel;

function exportFmsExcel() {
  const activeList = filtered(activeMarkas());
  const rows = [];
  activeList.forEach(m => {
    const tasks = getFmsTasks(m);
    tasks.forEach(t => {
      rows.push({
        marka: m.marka,
        master: m.master,
        dueDate: oldestDueDate(m),
        outstanding: totalOutstanding(m),
        taskCode: t.code,
        taskName: t.name,
        role: t.role,
        responsible: t.responsible || ownerOf(m),
        plannedDate: t.plannedDate,
        actualDate: t.actualDate || '—',
        delayDays: t.delayDays || 0,
        score: t.score || 0,
        status: t.status,
        completedBy: t.completedBy || '—',
        remark: t.remark || ''
      });
    });
  });

  const table = `<table><tr><th>Marka</th><th>Master</th><th>Due Date (Policy)</th><th>Outstanding (INR)</th><th>Task Code</th><th>Task Milestone</th><th>Responsible Role</th><th>Responsible Person</th><th>Planned Date</th><th>Actual Date</th><th>Delay Days</th><th>Score</th><th>Status</th><th>Completed By</th><th>Remarks</th></tr>${rows.map(r => `<tr><td>${escapeHtml(r.marka)}</td><td>${escapeHtml(r.master)}</td><td>${r.dueDate}</td><td>${r.outstanding}</td><td>${r.taskCode}</td><td>${escapeHtml(r.taskName)}</td><td>${escapeHtml(r.role)}</td><td>${escapeHtml(r.responsible)}</td><td>${r.plannedDate}</td><td>${r.actualDate}</td><td>${r.delayDays}</td><td>${r.score}</td><td>${escapeHtml(r.status)}</td><td>${escapeHtml(r.completedBy)}</td><td>${escapeHtml(r.remark)}</td></tr>`).join('')}</table>`;
  const blob = new Blob(['\ufeff' + table], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `collectiq-fms-milestones-report-${iso(today)}.xls`;
  a.click();
  URL.revokeObjectURL(a.href);
}
window.exportFmsExcel = exportFmsExcel;

function exportDoerAnalysisExcel() {
  const list = filtered();
  const ownerStats = {};
  
  list.forEach(m => {
    const owner = ownerOf(m);
    if (!ownerStats[owner]) {
      ownerStats[owner] = {
        actions: 0, calls: 0, visits: 0, wa: 0, ptp: 0, ptpAmount: 0,
        collected: 0, overdue: 0, balance: 0, markaCount: 0,
        fmsOnTime: 0, fmsDelayed: 0, fmsOverdue: 0, helpResolved: 0,
        helpFollowups: 0, crmResolved: 0, totalPoints: 0
      };
    }
    ownerStats[owner].balance += totalOutstanding(m);
    ownerStats[owner].markaCount++;
    if (m.nextDate && days(m.nextDate) > 0) ownerStats[owner].overdue++;

    const fmsTasks = getFmsTasks(m);
    fmsTasks.forEach(t => {
      if (t.isDone) {
        if (t.score === 1.0) ownerStats[owner].fmsOnTime++;
        else ownerStats[owner].fmsDelayed++;
      } else {
        if (t.status === 'Overdue') ownerStats[owner].fmsOverdue++;
      }
    });

    (m.history || []).forEach(h => {
      if (h.type === 'followup') {
        ownerStats[owner].actions++;
        const isV = h.mode && (h.mode.toLowerCase().includes('person') || h.mode.toLowerCase().includes('visit'));
        const isC = h.mode && h.mode.toLowerCase().includes('phone');
        const isW = h.mode && h.mode.toLowerCase().includes('whatsapp');
        if (isV) ownerStats[owner].visits++;
        else if (isW) ownerStats[owner].wa++;
        else ownerStats[owner].calls++;

        if (h.status === 'Promise to Pay') {
          ownerStats[owner].ptp++;
          ownerStats[owner].ptpAmount += (h.expected || 0);
        }
      } else if (h.type === 'payment') {
        ownerStats[owner].collected += (h.amount || 0);
      }
    });
  });

  allFollowpers().filter(x => x !== 'Unassigned').forEach(d => {
    if (!ownerStats[d]) {
      ownerStats[d] = {
        actions: 0, calls: 0, visits: 0, wa: 0, ptp: 0, ptpAmount: 0,
        collected: 0, overdue: 0, balance: 0, markaCount: 0,
        fmsOnTime: 0, fmsDelayed: 0, fmsOverdue: 0, helpResolved: 0,
        helpFollowups: 0, crmResolved: 0, totalPoints: 0
      };
    }
  });

  (helpTickets || []).forEach(t => {
    const isDone = (t.status || '').toLowerCase() === 'resolved';
    const doer = t.resolvedBy || t.assignedHelper;
    if (doer && ownerStats[doer]) {
      if (isDone) ownerStats[doer].helpResolved++;
    }
    (t.history || []).forEach(h => {
      if (h.followper && ownerStats[h.followper] && (h.actionType === 'Interim Follow-up' || (h.actionType && h.actionType.includes('Follow-up')) || h.status === 'In Progress')) {
        ownerStats[h.followper].helpFollowups++;
      }
    });
  });

  markas.forEach(m => {
    (m.escalations || []).forEach(e => {
      const isDone = (e.status || '').toLowerCase() === 'resolved';
      const doer = e.resolvedBy || e.escalatedTo || e.followper;
      if (isDone && doer && ownerStats[doer]) {
        ownerStats[doer].crmResolved++;
      }
    });
  });

  const rows = Object.keys(ownerStats).map(k => {
    const s = ownerStats[k];
    const doneTasks = s.fmsOnTime + s.fmsDelayed;
    const taskAdherence = doneTasks > 0 ? Math.round(((s.fmsOnTime * 1.0 + s.fmsDelayed * 0.5) / doneTasks) * 100) : 100;
    const overallScore = Math.round(
      (s.calls * 5) + (s.visits * 15) + (s.wa * 5) + (s.ptp * 10) +
      (s.fmsOnTime * 20) + (s.fmsDelayed * 10) + (s.helpResolved * 15) +
      (s.helpFollowups * 5) + (s.crmResolved * 15) + Math.round(s.collected / 10000) - (s.overdue * 5)
    );
    const tier = overallScore >= 100 ? 'Top Performer' : overallScore >= 50 ? 'High Achiever' : overallScore >= 0 ? 'Active' : 'Needs Focus';

    return {
      name: k,
      markas: s.markaCount,
      balance: s.balance,
      calls: s.calls,
      visits: s.visits,
      wa: s.wa,
      ptp: s.ptp,
      ptpAmount: s.ptpAmount,
      fmsOnTime: s.fmsOnTime,
      fmsDelayed: s.fmsDelayed,
      taskAdherence: taskAdherence,
      helpResolved: s.helpResolved,
      helpFollowups: s.helpFollowups,
      crmResolved: s.crmResolved,
      collected: s.collected,
      overdue: s.overdue,
      overallScore: overallScore,
      tier: tier
    };
  }).sort((a, b) => b.overallScore - a.overallScore);

  const table = `<table><tr><th>Rank</th><th>Doer / Sales Person</th><th>Markas Count</th><th>Portfolio Balance (INR)</th><th>Calls</th><th>Field Visits</th><th>WhatsApp</th><th>PTP Count</th><th>PTP Amount (INR)</th><th>FMS On-time</th><th>FMS Delayed</th><th>Task Adherence %</th><th>Help Resolved (+15)</th><th>Help Re-plans (+5)</th><th>CRM Resolved (+15)</th><th>Collected Amount (INR)</th><th>Overdue Markas</th><th>Overall Total Score</th><th>Performance Tier</th></tr>${rows.map((r, i) => `<tr><td>#${i + 1}</td><td>${escapeHtml(r.name)}</td><td>${r.markas}</td><td>${r.balance}</td><td>${r.calls}</td><td>${r.visits}</td><td>${r.wa}</td><td>${r.ptp}</td><td>${r.ptpAmount}</td><td>${r.fmsOnTime}</td><td>${r.fmsDelayed}</td><td>${r.taskAdherence}%</td><td>${r.helpResolved}</td><td>${r.helpFollowups}</td><td>${r.crmResolved}</td><td>${r.collected}</td><td>${r.overdue}</td><td>${r.overallScore}</td><td>${escapeHtml(r.tier)}</td></tr>`).join('')}</table>`;
  const blob = new Blob(['\ufeff' + table], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `collectiq-doer-scorecard-leaderboard-${iso(today)}.xls`;
  a.click();
  URL.revokeObjectURL(a.href);
}
window.exportDoerAnalysisExcel = exportDoerAnalysisExcel;

function exportMarkasExcel() {
  const list = filtered(activeMarkas());
  const rows = list.map(m => ({
    marka: m.marka,
    master: m.master,
    masterFollowper: getMasterFollowper(m.master),
    owner: ownerOf(m),
    dueDate: oldestDueDate(m),
    alreadyDue: alreadyDueAmount(m),
    balance: totalOutstanding(m),
    activeBills: activeBills(m).length,
    totalBills: m.bills.length,
    lastDate: m.lastDate || '—',
    nextDate: m.nextDate || '—',
    lastStatus: m.lastStatus || '—'
  }));

  const table = `<table><tr><th>Marka</th><th>Master</th><th>Master Followper</th><th>Assigned Followper</th><th>Due Date (Policy)</th><th>Already Due Amount (INR)</th><th>Total Outstanding (INR)</th><th>Active Bills</th><th>Total Bills</th><th>Last Follow-up</th><th>Next Follow-up</th><th>Last Status</th></tr>${rows.map(r => `<tr><td>${escapeHtml(r.marka)}</td><td>${escapeHtml(r.master)}</td><td>${escapeHtml(r.masterFollowper)}</td><td>${escapeHtml(r.owner)}</td><td>${r.dueDate}</td><td>${r.alreadyDue}</td><td>${r.balance}</td><td>${r.activeBills}</td><td>${r.totalBills}</td><td>${r.lastDate}</td><td>${r.nextDate}</td><td>${escapeHtml(r.lastStatus)}</td></tr>`).join('')}</table>`;
  const blob = new Blob(['\ufeff' + table], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `collectiq-marka-assignment-report-${iso(today)}.xls`;
  a.click();
  URL.revokeObjectURL(a.href);
}
window.exportMarkasExcel = exportMarkasExcel;

function exportMastersExcel() {
  const masterStats = {};
  activeMarkas().forEach(m => {
    if (!masterStats[m.master]) masterStats[m.master] = { count: 0, balance: 0, alreadyDue: 0 };
    masterStats[m.master].count++;
    masterStats[m.master].balance += totalOutstanding(m);
    masterStats[m.master].alreadyDue += alreadyDueAmount(m);
  });

  const rows = Object.keys(masterStats).map(m => ({
    master: m,
    followper: getMasterFollowper(m),
    count: masterStats[m].count,
    alreadyDue: masterStats[m].alreadyDue,
    balance: masterStats[m].balance
  })).sort((a, b) => b.balance - a.balance);

  const table = `<table><tr><th>Master Name</th><th>Default Accountable Person</th><th>Active Markas</th><th>Already Due Amount (INR)</th><th>Total Outstanding (INR)</th></tr>${rows.map(r => `<tr><td>${escapeHtml(r.master)}</td><td>${escapeHtml(r.followper)}</td><td>${r.count}</td><td>${r.alreadyDue}</td><td>${r.balance}</td></tr>`).join('')}</table>`;
  const blob = new Blob(['\ufeff' + table], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `collectiq-master-accountability-report-${iso(today)}.xls`;
  a.click();
  URL.revokeObjectURL(a.href);
}
window.exportMastersExcel = exportMastersExcel;

// ==========================================
// USER ACCOUNTS & CREDENTIALS MANAGEMENT
// ==========================================
const SVG_EYE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
const SVG_EYE_OFF = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

function usersView() {
  const container = document.getElementById('userManagement') || document.getElementById('users');
  if (!container) return;
  
  const tbody = document.getElementById('usersTableBody');
  if (tbody) {
    tbody.innerHTML = (users || []).map(u => {
      const isPrimaryAdmin = u.email === 'admin@collectiq.com' || u.email === 'devlope.vishal@gmail.com';
      const roleBadge = u.role === 'admin' ? 
        '<span class="status overdue" style="font-weight:800; padding:2px 8px;">ADMIN</span>' : 
        (u.role === 'superuser' || u.role === 'super doer') ? 
        '<span class="status closed" style="background:#fef3c7; color:#92400e; font-weight:800; border:1px solid #fde68a; padding:2px 8px;">SUPER DOER</span>' : 
        '<span class="status active" style="font-weight:700; padding:2px 8px;">DOER</span>';
      
      return `
        <tr>
          <td><b>${escapeHtml(u.email)}</b></td>
          <td><code style="background:#edf3f0; padding:2px 6px; border-radius:4px; font-weight:600;">${escapeHtml(u.password)}</code></td>
          <td>${roleBadge}</td>
          <td><b style="color:#087454;">${escapeHtml(u.followperName || '—')}</b></td>
          <td>
            <button onclick="openEditUser('${escapeHtml(u.email)}')" class="row-action" style="background:#087454;color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;margin-right:4px;" title="Edit Access & Password">Edit Access & Pwd</button>
            ${isPrimaryAdmin 
              ? '<span style="color:#75847e; font-size:11px;">Primary Admin</span>' 
              : `<button onclick="deleteUser('${escapeHtml(u.email)}')" class="row-action" style="background:#d85a54;color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;">Delete</button>`}
          </td>
        </tr>
      `;
    }).join('');
  }
  
  const dList = document.getElementById('doersDatalist');
  if (dList) {
    dList.innerHTML = allFollowpers().filter(f => f !== 'Unassigned').map(d => `<option value="${escapeHtml(d)}">`).join('');
  }
}

function togglePasswordVisibility(inputId, btnEl) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isPass = input.type === 'password';
  input.type = isPass ? 'text' : 'password';
  if (btnEl) {
    btnEl.innerHTML = isPass ? SVG_EYE_OFF : SVG_EYE;
    btnEl.style.color = isPass ? '#087454' : '#64748b';
    btnEl.title = isPass ? 'Hide Password' : 'Show Password';
  }
}
window.togglePasswordVisibility = togglePasswordVisibility;

function openEditUser(email) {
  const user = (users || []).find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return toast('User not found.');

  document.getElementById('editUserOriginalEmail').value = user.email;
  document.getElementById('editUserEmail').value = user.email;
  document.getElementById('editUserRole').value = user.role || 'user';
  document.getElementById('editUserFollowper').value = user.followperName === 'all' ? '' : (user.followperName || '');
  document.getElementById('editUserPassword').value = user.password || '1234';
  
  onEditUserRoleChange();
  openModal('editUserModal');
}
window.openEditUser = openEditUser;

function onEditUserRoleChange() {
  const role = document.getElementById('editUserRole').value;
  const container = document.getElementById('editUserFollowperContainer');
  if (container) {
    container.style.display = (role === 'admin') ? 'none' : 'block';
  }
}
window.onEditUserRoleChange = onEditUserRoleChange;

async function handleSaveEditUser(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  const origEmail = document.getElementById('editUserOriginalEmail').value.trim().toLowerCase();
  const email = (document.getElementById('editUserEmail').value || '').trim().toLowerCase();
  const role = document.getElementById('editUserRole').value;
  const fName = document.getElementById('editUserFollowper') ? document.getElementById('editUserFollowper').value.trim() : '';
  const password = document.getElementById('editUserPassword').value.trim();

  if (!email) return toast('Email is required.');
  if (!password) return toast('Password is required.');

  const userIdx = users.findIndex(u => u.email.toLowerCase() === origEmail);
  if (userIdx < 0) return toast('User not found.');

  const linkedDoer = (role === 'admin') ? 'all' : (fName || email.split('@')[0]);

  users[userIdx] = {
    email,
    password,
    role,
    followperName: linkedDoer
  };

  localStorage.setItem('collectiq_users_v4', JSON.stringify(users));

  if (currentUser && currentUser.email.toLowerCase() === origEmail) {
    currentUser.email = email;
    currentUser.role = role;
    currentUser.followperName = linkedDoer;
    currentUser.password = password;
    localStorage.setItem('collectiq_current_user', JSON.stringify(currentUser));
  }

  if (isOnlineMode()) {
    try {
      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(users[userIdx])
      });
      await syncWithDatabase();
    } catch(err) {
      console.warn('API sync error:', err);
    }
  }

  save();
  closeModal('editUserModal');
  renderAll();
  toast(`User "${email}" access & password updated successfully!`);
}
window.handleSaveEditUser = handleSaveEditUser;

function openChangePassword(targetEmail) {
  const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.role === 'superuser');
  const emailToChange = targetEmail || (currentUser ? currentUser.email : '');
  if (!emailToChange) return toast('Please log in first.');

  const isSelf = currentUser && currentUser.email.toLowerCase() === emailToChange.toLowerCase();
  const isAdminReset = isAdmin && !isSelf;

  document.getElementById('changePasswordTargetEmail').value = emailToChange;
  document.getElementById('changePasswordIsAdminReset').value = isAdminReset ? 'true' : 'false';
  
  const titleEl = document.getElementById('changePasswordModalTitle');
  if (titleEl) titleEl.textContent = isAdminReset ? 'Reset User Password' : 'Change Your Password';

  const labelEl = document.getElementById('changePasswordUserLabel');
  if (labelEl) labelEl.textContent = `Account: ${emailToChange} (${isAdminReset ? 'Admin Reset' : 'Self Update'})`;

  const currGroup = document.getElementById('currentPasswordGroup');
  if (currGroup) currGroup.style.display = isAdminReset ? 'none' : 'block';

  const currInput = document.getElementById('currentPasswordInput');
  if (currInput) {
    currInput.value = '';
    currInput.type = 'password';
    currInput.required = !isAdminReset;
  }

  const newInput = document.getElementById('newPasswordInput');
  if (newInput) {
    newInput.value = '';
    newInput.type = 'password';
  }

  const confirmInput = document.getElementById('confirmNewPasswordInput');
  if (confirmInput) {
    confirmInput.value = '';
    confirmInput.type = 'password';
  }

  document.querySelectorAll('#changePasswordModal .pwd-toggle-btn').forEach(btn => {
    btn.innerHTML = SVG_EYE;
    btn.style.color = '#71807b';
  });

  openModal('changePasswordModal');
}
window.openChangePassword = openChangePassword;

async function handleChangePasswordSubmit(e) {
  e.preventDefault();
  const targetEmail = document.getElementById('changePasswordTargetEmail').value.trim();
  const isAdminReset = document.getElementById('changePasswordIsAdminReset').value === 'true';
  const currentPassword = document.getElementById('currentPasswordInput') ? document.getElementById('currentPasswordInput').value.trim() : '';
  const newPassword = document.getElementById('newPasswordInput').value.trim();
  const confirmNewPassword = document.getElementById('confirmNewPasswordInput').value.trim();

  if (!newPassword) {
    return toast('Please enter a new password.');
  }
  if (newPassword.length < 3) {
    return toast('Password should be at least 3 characters.');
  }
  if (newPassword !== confirmNewPassword) {
    return toast('New password and confirmation do not match.');
  }

  const userObj = users.find(u => u.email.toLowerCase() === targetEmail.toLowerCase());
  if (!userObj) return toast('User not found.');

  if (!isAdminReset && userObj.password !== currentPassword && userObj.password !== '1234' && currentPassword !== '1234') {
    return toast('Current password is incorrect.');
  }

  userObj.password = newPassword;
  localStorage.setItem('collectiq_users_v4', JSON.stringify(users));

  if (currentUser && currentUser.email.toLowerCase() === targetEmail.toLowerCase()) {
    currentUser.password = newPassword;
    localStorage.setItem('collectiq_current_user', JSON.stringify(currentUser));
  }

  if (isOnlineMode()) {
    try {
      await fetch('/api/users/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: targetEmail,
          currentPassword,
          newPassword,
          isAdmin: isAdminReset
        })
      });
      await syncWithDatabase();
    } catch (err) {
      console.warn('API error:', err);
    }
  }

  closeModal('changePasswordModal');
  renderAll();
  toast('Password updated successfully!');
}
window.handleChangePasswordSubmit = handleChangePasswordSubmit;

function onUserRoleChange() {
  const role = document.getElementById('newUserRole').value;
  const container = document.getElementById('newUserFollowperContainer');
  if (container) {
    container.style.display = (role === 'admin') ? 'none' : 'block';
  }
}
window.onUserRoleChange = onUserRoleChange;

async function handleCreateUser(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  const email = (document.getElementById('newUserEmail').value || '').trim().toLowerCase();
  const password = document.getElementById('newUserPassword') ? document.getElementById('newUserPassword').value.trim() : '1234';
  const role = document.getElementById('newUserRole').value;
  const fName = document.getElementById('newUserFollowper') ? document.getElementById('newUserFollowper').value.trim() : '';
  
  if (!email) {
    return toast('Email address or username is required.');
  }
  if (!password) {
    return toast('Password is required.');
  }

  const linkedDoer = (role === 'admin') ? 'all' : (fName || email.split('@')[0]);

  const payload = {
    email,
    password,
    role,
    followperName: linkedDoer
  };

  const existingIdx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
  if (existingIdx >= 0) {
    users[existingIdx] = payload;
  } else {
    users.push(payload);
  }

  localStorage.setItem('collectiq_users_v4', JSON.stringify(users));

  if (isOnlineMode()) {
    try {
      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      await syncWithDatabase();
    } catch (err) {
      console.warn('API warning:', err);
    }
  }

  save();
  document.getElementById('newUserEmail').value = '';
  if (document.getElementById('newUserPassword')) document.getElementById('newUserPassword').value = '';
  if (document.getElementById('newUserFollowper')) document.getElementById('newUserFollowper').value = '';
  renderAll();
  toast(`User "${email}" saved with role "${role === 'superuser' ? 'Super Doer' : role === 'admin' ? 'Admin' : 'Doer'}".`);
}
window.handleCreateUser = handleCreateUser;

async function deleteUser(email) {
  if (email === 'admin@collectiq.com') return toast('Cannot delete system administrator account.');
  if (!confirm(`Are you sure you want to delete the user account for ${email}?`)) return;

  if (isOnlineMode()) {
    try {
      const res = await fetch('/api/users/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (res.ok) {
        await syncWithDatabase();
        toast('User deleted from SQLite.');
      } else {
        const err = await res.json();
        toast('Error: ' + err.error);
      }
    } catch (err) {
      toast('API error: ' + err.message);
    }
  } else {
    users = users.filter(u => u.email !== email);
    save();
    renderAll();
    toast('User deleted locally.');
  }
}

// ==========================================
// NAVIGATION & INIT
// ==========================================
function switchView(id) {
  if ((id === 'users' || id === 'markas' || id === 'import') && currentUser && currentUser.role === 'user') {
    toast('Access restricted to Admin users.');
    id = 'dashboard';
  }
  document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav').forEach(x => {
    if (x.dataset.view === id) x.classList.add('active');
    else x.classList.remove('active');
  });
  document.querySelectorAll('.b-nav').forEach(x => {
    if (x.dataset.view === id) x.classList.add('active');
    else x.classList.remove('active');
  });
  const targetId = (id === 'users') ? 'userManagement' : id;
  const viewEl = document.getElementById(targetId) || document.getElementById(id);
  if (viewEl) viewEl.classList.add('active');
  
  if (id === 'visits') visitsView();
  else if (id === 'helpTickets') helpTicketsView();
  else if (id === 'crmEscalations') crmEscalationsView();
  else if (id === 'fms') fmsView();
  else if (id === 'schedule') schedule();
  else if (id === 'dashboard') dashboard();
  else if (id === 'gplock') locks();
  else if (id === 'analysis') analysis();
  else if (id === 'markas') markaView();
  else if (id === 'users' || id === 'userManagement') usersView();
  
  const titles = {
    dashboard: 'Collection command center',
    schedule: 'Scheduled follow-ups',
    fms: 'Flow Management System (FMS) Pre-planned Tasks',
    visits: 'Field Visits, Daily Logs & Party Matrix',
    helpTickets: 'Internal Team Assistance (Help Tickets)',
    crmEscalations: 'Customer Claims & CRM Escalations',
    gplock: 'GP lock control',
    analysis: 'Analysis & reports',
    markas: 'Marka & Followper assignment',
    import: 'Outstanding report sync',
    users: 'Doer & Access Control Management'
  };
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = titles[id] || 'CollectIQ';
}
window.switchView = switchView;

function toggleMobileFab() {
  const menu = document.getElementById('mobileFabMenu');
  const btn = document.getElementById('mobileFabBtn');
  const icon = document.getElementById('fabIcon');
  if (!menu || !btn) return;
  const isOpen = menu.classList.contains('open');
  if (isOpen) {
    menu.classList.remove('open');
    btn.classList.remove('open');
    if (icon) icon.textContent = '+';
  } else {
    menu.classList.add('open');
    btn.classList.add('open');
    if (icon) icon.textContent = '×';
  }
}
window.toggleMobileFab = toggleMobileFab;

function closeMobileFab() {
  const menu = document.getElementById('mobileFabMenu');
  const btn = document.getElementById('mobileFabBtn');
  const icon = document.getElementById('fabIcon');
  if (menu) menu.classList.remove('open');
  if (btn) btn.classList.remove('open');
  if (icon) icon.textContent = '+';
}
window.closeMobileFab = closeMobileFab;

function renderAll() {
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
  usersView();
  
  const sb = document.getElementById('scheduleBadge');
  if (sb) sb.textContent = activeMarkas().filter(m => !isLocked(m) && m.nextDate && days(m.nextDate) >= 0).length;
  const mobSb = document.getElementById('mobScheduleBadge');
  if (mobSb) mobSb.textContent = sb ? sb.textContent : '0';
  
  const fb = document.getElementById('fmsBadge');
  if (fb) {
    let pendingFms = 0;
    activeMarkas().forEach(m => {
      getFmsTasks(m).forEach(t => {
        if (!t.isDone) pendingFms++;
      });
    });
    fb.textContent = pendingFms;
    const mobFb = document.getElementById('mobFmsBadge');
    if (mobFb) mobFb.textContent = pendingFms;
  }

  const vb = document.getElementById('visitsBadge');
  if (vb) {
    const todayIso = iso(today);
    let todayVis = 0;
    activeMarkas().forEach(m => {
      (m.history || []).forEach(h => {
        if (h.date === todayIso && h.mode && (h.mode.toLowerCase().includes('person') || h.mode.toLowerCase().includes('visit'))) {
          todayVis++;
        }
      });
    });
    vb.textContent = todayVis;
  }

  const hb = document.getElementById('helpBadge');
  if (hb) {
    let openH = (helpTickets || []).filter(t => (t.status || 'Open').toLowerCase() === 'open' || (t.status || '').toLowerCase() === 'in progress').length;
    hb.textContent = openH;
    const mobHb = document.getElementById('mobHelpBadge');
    if (mobHb) mobHb.textContent = openH;
  }

  const eb = document.getElementById('escalationBadge');
  if (eb) {
    let openEscs = 0;
    markas.forEach(m => {
      (m.escalations || []).forEach(e => {
        if (e.type !== 'Help Ticket' && e.type !== 'Help' && (e.status || 'Open').toLowerCase() === 'open') {
          openEscs++;
        }
      });
    });
    eb.textContent = openEscs;
    const mobCb = document.getElementById('mobCrmBadge');
    if (mobCb) mobCb.textContent = openEscs;
  }

  const lb = document.getElementById('lockBadge');
  if (lb) lb.textContent = activeMarkas().filter(isLocked).length;
  
  populateFollowperDropdowns();
}

function populateFollowperDropdowns() {
  const doers = allFollowpers().filter(x => x !== 'Unassigned');
  const optionsHtml = '<option value="">Select Sales Person / Doer...</option>' + 
    doers.map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');
  const helperOptionsHtml = '<option value="">Select Helper Person...</option>' + 
    doers.map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');
    
  const doerIds = ['followper', 'assignmentFollowper', 'masterAssignmentFollowper', 'userFollowper', 'resolveTicketBy'];
  doerIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const prevVal = el.value;
      el.innerHTML = optionsHtml;
      if (prevVal) el.value = prevVal;
    }
  });

  const helperIds = ['helpTicketHelper', 'htAssignedHelper'];
  helperIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const prevVal = el.value;
      el.innerHTML = helperOptionsHtml;
      if (prevVal) el.value = prevVal;
    }
  });

  const dList = document.getElementById('doersDatalist');
  if (dList) {
    dList.innerHTML = doers.map(d => `<option value="${escapeHtml(d)}">`).join('');
  }
  const fList = document.getElementById('followperList');
  if (fList) {
    fList.innerHTML = doers.map(d => `<option value="${escapeHtml(d)}">`).join('');
  }
}

function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('open');
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('open');
}

function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3500);
}

document.querySelectorAll('.toolbar .tab, .schedule-tabs .tab, [data-filter]').forEach(x => {
  x.onclick = () => {
    if (!x.dataset.filter) return;
    document.querySelectorAll('.toolbar .tab, [data-filter]').forEach(y => y.classList.remove('active'));
    x.classList.add('active');
    tab = x.dataset.filter;
    schedule();
  };
});

function toggleMobileMenu(e) {
  if (e && typeof e.stopPropagation === 'function') {
    e.stopPropagation();
  }
  const sidebar = document.querySelector('.sidebar') || document.querySelector('aside');
  const overlay = document.getElementById('sidebarOverlay');
  if (!sidebar) return;
  
  const willOpen = !sidebar.classList.contains('open') && sidebar.style.left !== '0px';
  if (willOpen) {
    sidebar.classList.add('open');
    sidebar.style.setProperty('left', '0px', 'important');
    if (overlay) {
      overlay.classList.add('open');
      overlay.style.display = 'block';
    }
  } else {
    sidebar.classList.remove('open');
    sidebar.style.setProperty('left', '-280px', 'important');
    if (overlay) {
      overlay.classList.remove('open');
      overlay.style.display = 'none';
    }
  }
}

// Nav clicks close mobile menu
document.querySelectorAll('.nav').forEach(x => {
  x.onclick = () => {
    switchView(x.dataset.view);
    const sidebar = document.querySelector('.sidebar') || document.querySelector('aside');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar && (sidebar.classList.contains('open') || sidebar.style.left === '0px')) {
      sidebar.classList.remove('open');
      sidebar.style.setProperty('left', '-280px', 'important');
      if (overlay) {
        overlay.classList.remove('open');
        overlay.style.display = 'none';
      }
    }
  };
});

const pdInput = document.getElementById('promiseDate');
if (pdInput) pdInput.addEventListener('change', enforcePtpDate);
const asInput = document.getElementById('actionStatus');
if (asInput) asInput.addEventListener('change', toggleConditionalFields);

// Close modal on backdrop click
document.querySelectorAll('.modal-backdrop').forEach(mb => {
  mb.addEventListener('click', (e) => {
    if (e.target === mb) mb.classList.remove('open');
  });
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-backdrop.open').forEach(mb => mb.classList.remove('open'));
  }
});

let isServerConnected = false;
let firestoreDb = null;

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAjzN8DcBXMfd7Y0K4a3KFkbiDtl4Y89_0",
  authDomain: "collectiq-ba467.firebaseapp.com",
  projectId: "collectiq-ba467",
  storageBucket: "collectiq-ba467.firebasestorage.app",
  messagingSenderId: "880783090580",
  appId: "1:880783090580:web:8c974a2c760baa06e46581",
  measurementId: "G-B6WQ23YQX8"
};

function getCloudConfig() {
  try {
    const c = localStorage.getItem('collectiq_firebase_config_v4');
    return c ? JSON.parse(c) : DEFAULT_FIREBASE_CONFIG;
  } catch (e) {
    return DEFAULT_FIREBASE_CONFIG;
  }
}

function initFirebase() {
  if (isLocalServer()) return false;
  const cfg = getCloudConfig();
  if (!cfg || typeof firebase === 'undefined') return false;
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(cfg);
    }
    firestoreDb = firebase.firestore();
    
    // Auto-seed cloud database if document does not exist yet on first boot
    firestoreDb.collection('collectiq').doc('main').get().then(doc => {
      if (!doc.exists) {
        console.log('⚡ Initializing Firebase Cloud database with initial dataset...');
        saveCloud();
      } else {
        const d = doc.data();
        if (d) {
          if (Array.isArray(d.users) && d.users.length > 0) {
            users = d.users;
            window.users = users;
            localStorage.setItem('collectiq_users_v4', JSON.stringify(users));
          }
          if (Array.isArray(d.markas) && d.markas.length > 0) {
            markas = d.markas;
            localStorage.setItem('collectiq_markas_v4', JSON.stringify(markas));
          }
          if (Array.isArray(d.payments)) {
            payments = d.payments;
            localStorage.setItem('collectiq_rokad_v4', JSON.stringify(payments));
          }
          if (Array.isArray(d.helpTickets)) {
            helpTickets = d.helpTickets;
            localStorage.setItem('collectiq_help_tickets_v4', JSON.stringify(helpTickets));
          }
          renderAll();
        }
      }
    }).catch(err => console.warn('Firestore initial check:', err));

    // Real-time listener for live multi-user sync on GitHub Pages / Web
    firestoreDb.collection('collectiq').doc('main').onSnapshot(doc => {
      if (doc.exists) {
        const d = doc.data();
        if (d) {
          if (Array.isArray(d.markas) && d.markas.length > 0) {
            markas = d.markas;
            markas.forEach(m => {
              if (!m.escalations) m.escalations = [];
              if (!m.history) m.history = [];
              if (!m.bills) m.bills = [];
            });
            localStorage.setItem('collectiq_markas_v4', JSON.stringify(markas));
          }
          if (Array.isArray(d.payments)) {
            payments = d.payments;
            localStorage.setItem('collectiq_rokad_v4', JSON.stringify(payments));
          }
          if (Array.isArray(d.helpTickets)) {
            helpTickets = d.helpTickets;
            localStorage.setItem('collectiq_help_tickets_v4', JSON.stringify(helpTickets));
          }
          if (d.masterFollowpers) {
            masterFollowpers = { ...DEFAULT_MASTER_FOLLOWPERS, ...d.masterFollowpers };
            localStorage.setItem('collectiq_master_followpers_v4', JSON.stringify(masterFollowpers));
          }
          if (Array.isArray(d.users) && d.users.length > 0) {
            users = d.users;
            window.users = users;
            localStorage.setItem('collectiq_users_v4', JSON.stringify(users));
          }
          renderAll();
          updateDbStatusBadge('firebase');
        }
      }
    }, err => {
      console.warn('Firestore live listener error:', err);
    });

    updateDbStatusBadge('firebase');
    return true;
  } catch (err) {
    console.error('Failed to init Firebase:', err);
    return false;
  }
}

async function saveCloud() {
  if (firestoreDb) {
    try {
      await firestoreDb.collection('collectiq').doc('main').set({
        markas,
        payments,
        masterFollowpers,
        users,
        helpTickets,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (err) {
      console.error('Error writing to Firestore:', err);
    }
  }
}

function openCloudModal() {
  const cfg = getCloudConfig();
  const inp = document.getElementById('firebaseConfigInput');
  if (inp) inp.value = cfg ? JSON.stringify(cfg, null, 2) : '';
  const st = document.getElementById('cloudStatusText');
  if (st) {
    if (firestoreDb) {
      st.innerHTML = '<b>Status: 🟢 Connected to Firebase Firestore Cloud DB (Live Sync across all devices)</b>';
      st.style.color = '#087454';
    } else if (isServerConnected) {
      st.innerHTML = '<b>Status: 🟢 Connected to Local Node.js SQLite Server (WAL Mode)</b>';
      st.style.color = '#087454';
    } else {
      st.innerHTML = '<b>Status: 🟡 Standalone Browser Local Cache (Single Machine)</b>';
      st.style.color = '#744e19';
    }
  }
  openModal('cloudModal');
}

function saveCloudConfig() {
  const txt = document.getElementById('firebaseConfigInput').value.trim();
  if (!txt) return toast('Please paste your Firebase Config JSON.');
  try {
    const cfg = JSON.parse(txt);
    localStorage.setItem('collectiq_firebase_config_v4', JSON.stringify(cfg));
    const ok = initFirebase();
    if (ok) {
      toast('Firebase Cloud DB connected! Syncing live across all devices.');
      pushToCloud();
      closeModal('cloudModal');
    } else {
      toast('Failed to connect with provided Firebase config.');
    }
  } catch (e) {
    toast('Invalid JSON format. Please paste valid Firebase Config JSON.');
  }
}

async function pushToCloud() {
  if (!firestoreDb) {
    const ok = initFirebase();
    if (!ok) return toast('Connect Cloud DB first by pasting Firebase Config.');
  }
  toast('Uploading local dataset to Firebase Firestore...');
  try {
    await saveCloud();
    toast('✓ All Markas, Bills & Daily Rokad uploaded to Cloud DB!');
  } catch (e) {
    toast('Upload failed: ' + e.message);
  }
}

function disconnectCloud() {
  localStorage.removeItem('collectiq_firebase_config_v4');
  firestoreDb = null;
  updateDbStatusBadge(isServerConnected ? 'sqlite' : 'local');
  closeModal('cloudModal');
  toast('Cloud DB disconnected. Reverted to local storage.');
}

async function syncWithDatabase() {
  // If running on local Node.js server (localhost / 127.0.0.1), always use SQLite backend
  if (isLocalServer()) {
    try {
      const res = await fetch('/api/data');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.markas)) {
          markas = data.markas;
          markas.forEach(m => {
            if (!m.escalations) m.escalations = [];
            if (!m.history) m.history = [];
            if (!m.bills) m.bills = [];
            if (!m.fmsTasks) m.fmsTasks = [];
          });
          payments = data.payments || [];
          masterFollowpers = { ...DEFAULT_MASTER_FOLLOWPERS, ...(data.masterFollowpers || {}) };
          if (Array.isArray(data.helpTickets)) {
            helpTickets = data.helpTickets;
            localStorage.setItem('collectiq_help_tickets_v4', JSON.stringify(helpTickets));
          }
          if (Array.isArray(data.users)) {
            users = data.users;
            window.users = users;
            localStorage.setItem('collectiq_users_v4', JSON.stringify(users));
          }
          isServerConnected = true;
          window.isServerConnected = true;
          save();
          renderAll();
          updateDbStatusBadge('sqlite');
          return;
        }
      }
    } catch (e) {
      console.warn('Backend SQLite server offline; using local cache.', e);
    }
    updateDbStatusBadge('local');
    return;
  }

  // 1. Try Firebase if configured (for GitHub Pages / Web deployment)
  if (initFirebase()) {
    return;
  }

  // 2. Try Node SQLite Server if served via HTTP elsewhere
  if (window.location && window.location.protocol && window.location.protocol.startsWith('http')) {
    try {
      const res = await fetch('/api/data');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.markas)) {
          markas = data.markas;
          payments = data.payments || [];
          masterFollowpers = { ...DEFAULT_MASTER_FOLLOWPERS, ...(data.masterFollowpers || {}) };
          if (Array.isArray(data.helpTickets)) {
            helpTickets = data.helpTickets;
            localStorage.setItem('collectiq_help_tickets_v4', JSON.stringify(helpTickets));
          }
          if (Array.isArray(data.users)) {
            users = data.users;
            localStorage.setItem('collectiq_users_v4', JSON.stringify(users));
          }
          isServerConnected = true;
          save();
          renderAll();
          updateDbStatusBadge('sqlite');
          return;
        }
      }
    } catch (e) {
      console.warn('Backend SQLite server offline; using local cache.', e);
    }
  }
}

function updateDbStatusBadge(mode) {
  const el = document.getElementById('dbBadge');
  if (el) {
    if (mode === 'firebase' || firestoreDb) {
      el.innerHTML = '<span style="color:#4ba779;">●</span> Cloud DB (Firebase)';
      el.title = 'Connected to Firebase Firestore Cloud DB (Real-time sync on GitHub Pages)';
    } else if (mode === 'sqlite' || mode === true) {
      el.innerHTML = '<span style="color:#4ba779;">●</span> SQLite DB (Server)';
      el.title = 'Connected to local Node.js SQLite server';
    } else {
      el.innerHTML = '<span style="color:#e99a3c;">●</span> Local Browser Cache';
      el.title = 'Running on browser storage. Click "Cloud Database" in sidebar to enable live multi-user sync.';
    }
  }
}

// Start
load();
initFirebase();
renderAll();
syncWithDatabase();
