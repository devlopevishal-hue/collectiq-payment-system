// CollectIQ Server & SQLite Database
// Built with Node.js built-in HTTP and node:sqlite (Zero npm dependencies required)

const http = require('http');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'collectiq.db');
const STATIC_DIR = path.join(__dirname, 'outputs');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize SQLite Database
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

// Initialize Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS masters (
    master_name TEXT PRIMARY KEY,
    followper_name TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS markas (
    id TEXT PRIMARY KEY,
    marka TEXT NOT NULL UNIQUE,
    master TEXT NOT NULL,
    owner TEXT NOT NULL,
    next_date TEXT,
    last_date TEXT,
    last_status TEXT,
    remark TEXT,
    ptp TEXT,
    expected REAL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bills (
    id TEXT PRIMARY KEY,
    marka_id TEXT NOT NULL,
    first_date TEXT NOT NULL,
    balance REAL NOT NULL,
    source_amount REAL NOT NULL,
    bill_count INTEGER DEFAULT 1,
    bill_nos_json TEXT,
    policy_date TEXT,
    policy_name TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (marka_id) REFERENCES markas(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS history (
    id TEXT PRIMARY KEY,
    marka_id TEXT NOT NULL,
    type TEXT NOT NULL,
    date TEXT NOT NULL,
    followper TEXT,
    status TEXT,
    contact TEXT,
    mode TEXT,
    remark TEXT,
    expected REAL DEFAULT 0,
    promise TEXT,
    next TEXT,
    claim_number TEXT,
    wa_complaint_no TEXT,
    escalated_to TEXT,
    amount REAL DEFAULT 0,
    bill_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (marka_id) REFERENCES markas(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS escalations (
    id TEXT PRIMARY KEY,
    marka_id TEXT NOT NULL,
    date TEXT NOT NULL,
    type TEXT NOT NULL,
    claim_number TEXT,
    wa_complaint_no TEXT,
    escalated_to TEXT,
    followper TEXT,
    status TEXT NOT NULL DEFAULT 'Open',
    remark TEXT,
    resolved_date TEXT,
    resolution_type TEXT,
    settled_amount REAL DEFAULT 0,
    resolution_note TEXT,
    FOREIGN KEY (marka_id) REFERENCES markas(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    ref TEXT NOT NULL,
    mode TEXT NOT NULL,
    amount REAL NOT NULL,
    marka TEXT NOT NULL,
    allocations_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    email TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    followper_name TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS fms_tasks (
    id TEXT PRIMARY KEY,
    marka_id TEXT NOT NULL,
    task_code TEXT NOT NULL,
    task_name TEXT NOT NULL,
    responsible_role TEXT NOT NULL,
    responsible_name TEXT,
    offset_days INTEGER NOT NULL,
    due_date TEXT NOT NULL,
    planned_date TEXT NOT NULL,
    actual_date TEXT,
    status TEXT NOT NULL DEFAULT 'Pending',
    score REAL DEFAULT 0,
    remark TEXT,
    completed_by TEXT,
    completed_at TEXT,
    FOREIGN KEY (marka_id) REFERENCES markas(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS help_tickets (
    id TEXT PRIMARY KEY,
    marka_id TEXT NOT NULL,
    marka_name TEXT NOT NULL,
    date TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    assigned_helper TEXT NOT NULL,
    priority TEXT DEFAULT 'Normal',
    subject TEXT NOT NULL,
    remark TEXT NOT NULL,
    status TEXT DEFAULT 'Open',
    resolution_note TEXT DEFAULT '',
    resolved_by TEXT DEFAULT '',
    resolved_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// Schema migrations
try {
  db.exec("ALTER TABLE escalations ADD COLUMN bill_ids_json TEXT;");
  console.log('✓ Migration: Added bill_ids_json to escalations.');
} catch (e) {
  // column already exists
}
try {
  db.exec("ALTER TABLE escalations ADD COLUMN resolved_by TEXT;");
  console.log('✓ Migration: Added resolved_by to escalations.');
} catch (e) {
  // column already exists
}
try {
  db.exec("ALTER TABLE history ADD COLUMN bill_ids_json TEXT;");
  console.log('✓ Migration: Added bill_ids_json to history.');
} catch (e) {
  // column already exists
}
try {
  db.exec("ALTER TABLE help_tickets ADD COLUMN resolution_type TEXT DEFAULT '';");
  console.log('✓ Migration: Added resolution_type to help_tickets.');
} catch (e) {
  // column already exists
}
try {
  db.exec("ALTER TABLE help_tickets ADD COLUMN next_date TEXT DEFAULT '';");
  console.log('✓ Migration: Added next_date to help_tickets.');
} catch (e) {
  // column already exists
}
try {
  db.exec("ALTER TABLE help_tickets ADD COLUMN history_json TEXT DEFAULT '[]';");
  console.log('✓ Migration: Added history_json to help_tickets.');
} catch (e) {
  // column already exists
}
try {
  db.exec("ALTER TABLE escalations ADD COLUMN cover_amount REAL DEFAULT 0;");
  console.log('✓ Migration: Added cover_amount to escalations.');
} catch (e) {
  // column already exists
}

console.log('✓ SQLite Database schema initialized at:', DB_PATH);

// Default Master Followper Mappings
const DEFAULT_MASTERS = {
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

// Seed default masters if empty
const masterCountStmt = db.prepare('SELECT COUNT(*) AS c FROM masters');
if (masterCountStmt.get().c === 0) {
  const insertMaster = db.prepare('INSERT INTO masters (master_name, followper_name, updated_at) VALUES (?, ?, ?)');
  const now = new Date().toISOString();
  for (const [m, f] of Object.entries(DEFAULT_MASTERS)) {
    insertMaster.run(m, f, now);
  }
  console.log('✓ Seeded default master-followper mappings.');
}

// Seed or sync default users
const insertOrUpdateUser = db.prepare(`
  INSERT INTO users (email, password, role, followper_name, created_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(email) DO UPDATE SET password = excluded.password, role = excluded.role, followper_name = excluded.followper_name
`);
const nowTime = new Date().toISOString();
insertOrUpdateUser.run('admin@collectiq.com', '1234', 'admin', 'all', nowTime);
insertOrUpdateUser.run('devlope.vishal@gmail.com', '1234', 'admin', 'all', nowTime);
insertOrUpdateUser.run('accounts@collectiq.com', '1234', 'user', 'Account Team', nowTime);
insertOrUpdateUser.run('crm@collectiq.com', '1234', 'user', 'CRM', nowTime);
insertOrUpdateUser.run('sales.hod@collectiq.com', '1234', 'user', 'Sales HOD', nowTime);
insertOrUpdateUser.run('surendra@collectiq.com', '1234', 'user', 'Surendra', nowTime);
insertOrUpdateUser.run('mahavir@collectiq.com', '1234', 'user', 'Mahavir', nowTime);
insertOrUpdateUser.run('girdharilal@collectiq.com', '1234', 'user', 'Girdharilal', nowTime);
insertOrUpdateUser.run('sajjan@collectiq.com', '1234', 'user', 'Sajjan', nowTime);
insertOrUpdateUser.run('anil.sharma@collectiq.com', '1234', 'user', 'Anil Sharma', nowTime);
insertOrUpdateUser.run('manish.agarwal@collectiq.com', '1234', 'user', 'Manish Agarwal', nowTime);
insertOrUpdateUser.run('ravi.sharma@collectiq.com', '1234', 'user', 'Ravi Kant Sharma', nowTime);
insertOrUpdateUser.run('saurav@collectiq.com', '1234', 'user', 'Saurav Bhai', nowTime);
insertOrUpdateUser.run('bhavesh@collectiq.com', '1234', 'user', 'Bhavesh Bhai', nowTime);
insertOrUpdateUser.run('pc@collectiq.com', '1234', 'user', 'Process Coordinator (PC)', nowTime);
console.log('✓ Seeded and verified all default user accounts in SQLite.');

// Seed Markas and Bills from latest-report-data.js if database is fresh
const markaCountStmt = db.prepare('SELECT COUNT(*) AS c FROM markas');
if (markaCountStmt.get().c === 0) {
  const reportDataFile = path.join(STATIC_DIR, 'latest-report-data.js');
  if (fs.existsSync(reportDataFile)) {
    try {
      const code = fs.readFileSync(reportDataFile, 'utf8');
      const fakeWindow = {};
      eval(`(function(window){ ${code} })(fakeWindow)`);
      const rawCases = fakeWindow.latestReportCases || [];
      
      if (rawCases.length > 0) {
        console.log(`⚡ Seeding ${rawCases.length} raw invoices into SQLite database...`);
        const markaMap = new Map();
        
        rawCases.forEach(c => {
          if (!markaMap.has(c.marka)) {
            markaMap.set(c.marka, { cases: [] });
          }
          markaMap.get(c.marka).cases.push(c);
        });

        const insertMarka = db.prepare(`
          INSERT INTO markas (id, marka, master, owner, next_date, last_date, last_status, remark, ptp, expected, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertBill = db.prepare(`
          INSERT INTO bills (id, marka_id, first_date, balance, source_amount, bill_count, bill_nos_json, policy_date, policy_name, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const now = new Date().toISOString();
        let mIdx = 1;
        
        db.exec('BEGIN TRANSACTION;');
        markaMap.forEach((data, markaName) => {
          const first = data.cases[0];
          const mId = 'm_' + (mIdx++);
          const masterName = first.master || 'Unassigned Master';
          
          let owner = first.owner;
          if (!owner || owner === 'Unassigned') {
            const clean = masterName.trim().toUpperCase();
            owner = DEFAULT_MASTERS[clean] || 'Unassigned';
          }
          
          const activeCases = data.cases.filter(c => c.balance > 0);
          let nextDate = '';
          activeCases.forEach(c => {
            if (c.nextDate && (!nextDate || c.nextDate < nextDate)) nextDate = c.nextDate;
          });

          insertMarka.run(
            mId,
            markaName,
            masterName,
            owner,
            nextDate || '',
            first.lastDate || '',
            first.lastStatus || '',
            first.remark || '',
            first.ptp || '',
            first.expected || 0,
            now,
            now
          );

          data.cases.forEach((c, bIdx) => {
            insertBill.run(
              `${mId}_b${bIdx + 1}`,
              mId,
              c.firstDate || '',
              c.balance || 0,
              c.sourceAmount || c.balance || 0,
              c.billCount || 1,
              JSON.stringify(c.billNos || []),
              c.policyDate || '',
              c.policyName || '',
              now
            );
          });
        });
        db.exec('COMMIT;');
        
        console.log(`✓ Seeded ${markaMap.size} Markas and ${rawCases.length} Bills into SQLite database.`);
      }
    } catch (err) {
      console.error('Error auto-seeding report data:', err);
    }
  }
}

// Helpers to load full dataset from SQLite
function getFullData() {
  const markasRows = db.prepare('SELECT * FROM markas ORDER BY marka ASC').all();
  const billsRows = db.prepare('SELECT * FROM bills').all();
  const historyRows = db.prepare('SELECT * FROM history ORDER BY date ASC').all();
  const escalationRows = db.prepare('SELECT * FROM escalations').all();
  const fmsRows = db.prepare('SELECT * FROM fms_tasks').all();
  const paymentRows = db.prepare('SELECT * FROM payments ORDER BY date DESC').all();
  const masterRows = db.prepare('SELECT * FROM masters').all();
  const userRows = db.prepare('SELECT * FROM users').all();

  const billsByMarka = new Map();
  billsRows.forEach(b => {
    if (!billsByMarka.has(b.marka_id)) billsByMarka.set(b.marka_id, []);
    billsByMarka.get(b.marka_id).push({
      id: b.id,
      firstDate: b.first_date,
      balance: b.balance,
      sourceAmount: b.source_amount,
      billCount: b.bill_count,
      billNos: JSON.parse(b.bill_nos_json || '[]'),
      policyDate: b.policy_date || '',
      policyName: b.policy_name || ''
    });
  });

  const historyByMarka = new Map();
  historyRows.forEach(h => {
    if (!historyByMarka.has(h.marka_id)) historyByMarka.set(h.marka_id, []);
    historyByMarka.get(h.marka_id).push({
      id: h.id,
      type: h.type,
      date: h.date,
      followper: h.followper,
      status: h.status,
      contact: h.contact,
      mode: h.mode,
      remark: h.remark,
      expected: h.expected,
      promise: h.promise,
      next: h.next,
      claimNumber: h.claim_number,
      waComplaintNo: h.wa_complaint_no,
      escalatedTo: h.escalated_to,
      amount: h.amount,
      billId: h.bill_id,
      billIds: JSON.parse(h.bill_ids_json || '[]')
    });
  });

  const escalationsByMarka = new Map();
  escalationRows.forEach(e => {
    if (!escalationsByMarka.has(e.marka_id)) escalationsByMarka.set(e.marka_id, []);
    escalationsByMarka.get(e.marka_id).push({
      id: e.id,
      date: e.date,
      type: e.type,
      claimNumber: e.claim_number,
      waComplaintNo: e.wa_complaint_no,
      escalatedTo: e.escalated_to,
      followper: e.followper,
      status: e.status,
      remark: e.remark,
      resolvedDate: e.resolved_date,
      resolutionType: e.resolution_type,
      settledAmount: e.settled_amount,
      coverAmount: e.cover_amount || 0,
      resolutionNote: e.resolution_note,
      resolvedBy: e.resolved_by || '',
      billIds: JSON.parse(e.bill_ids_json || '[]')
    });
  });

  const fmsByMarka = new Map();
  fmsRows.forEach(f => {
    if (!fmsByMarka.has(f.marka_id)) fmsByMarka.set(f.marka_id, []);
    fmsByMarka.get(f.marka_id).push({
      id: f.id,
      taskCode: f.task_code,
      taskName: f.task_name,
      responsibleRole: f.responsible_role,
      responsibleName: f.responsible_name,
      offsetDays: f.offset_days,
      dueDate: f.due_date,
      plannedDate: f.planned_date,
      actualDate: f.actual_date,
      status: f.status,
      score: f.score,
      remark: f.remark,
      completedBy: f.completed_by,
      completedAt: f.completed_at
    });
  });

  const markas = markasRows.map(m => ({
    id: m.id,
    marka: m.marka,
    master: m.master,
    owner: m.owner,
    nextDate: m.next_date,
    lastDate: m.last_date,
    lastStatus: m.last_status,
    remark: m.remark,
    ptp: m.ptp,
    expected: m.expected,
    bills: billsByMarka.get(m.id) || [],
    history: historyByMarka.get(m.id) || [],
    escalations: escalationsByMarka.get(m.id) || [],
    fmsTasks: fmsByMarka.get(m.id) || []
  }));

  const payments = paymentRows.map(p => ({
    id: p.id,
    date: p.date,
    ref: p.ref,
    mode: p.mode,
    amount: p.amount,
    marka: p.marka,
    allocations: JSON.parse(p.allocations_json || '[]')
  }));

  const masterFollowpers = {};
  masterRows.forEach(r => masterFollowpers[r.master_name] = r.followper_name);

  const helpTicketRows = db.prepare('SELECT * FROM help_tickets ORDER BY created_at DESC').all();
  const helpTickets = helpTicketRows.map(h => ({
    id: h.id,
    markaId: h.marka_id,
    markaName: h.marka_name,
    date: h.date,
    requestedBy: h.requested_by,
    assignedHelper: h.assigned_helper,
    priority: h.priority,
    subject: h.subject,
    remark: h.remark,
    status: h.status,
    nextDate: h.next_date || '',
    history: JSON.parse(h.history_json || '[]'),
    resolutionType: h.resolution_type || '',
    resolutionNote: h.resolution_note || '',
    resolvedBy: h.resolved_by || '',
    resolvedAt: h.resolved_at || '',
    createdAt: h.created_at,
    updatedAt: h.updated_at
  }));

  const users = userRows.map(u => ({
    email: u.email,
    password: u.password,
    role: u.role,
    followperName: u.followper_name
  }));

  return { markas, payments, masterFollowpers, users, helpTickets, dbType: 'SQLite (WAL)' };
}

// HTTP Server
const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Endpoints
  if (pathname === '/api/data' && req.method === 'GET') {
    try {
      const data = getFullData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname === '/api/followup' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { markaId, followDate, followper, contactPerson, contactMode, actionStatus, expected, promiseDate, nextDate, remark, claimNumber, waComplaintNo, escalateTo, billIds } = payload;
        
        const now = new Date().toISOString();
        const hid = 'h_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);

        // Insert conversation history
        db.prepare(`
          INSERT INTO history (id, marka_id, type, date, followper, status, contact, mode, remark, expected, promise, next, claim_number, wa_complaint_no, escalated_to, bill_ids_json, created_at)
          VALUES (?, ?, 'followup', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          hid, markaId, followDate || now.slice(0,10), followper || '', actionStatus || 'Follow-up', contactPerson || '', contactMode || 'Phone call', remark || '',
          expected || 0, promiseDate || '', nextDate || '', claimNumber || '', waComplaintNo || '', escalateTo || '', JSON.stringify(billIds || []), now
        );

        // Update Marka
        const currentMarka = db.prepare('SELECT * FROM markas WHERE id = ?').get(markaId);
        let newOwner = followper;
        if (actionStatus === 'Help Ticket') {
          newOwner = currentMarka ? currentMarka.owner : followper;
        } else if ((actionStatus === 'Escalated' || actionStatus === 'CRM Escalation') && escalateTo) {
          newOwner = escalateTo;
        }

        // Handle payment settlement if Payment Received / Part Payment
        const { payMode, payRef, payAmount, allocations } = payload;
        let appliedAllocations = [];
        if ((actionStatus === 'Payment Received' || actionStatus === 'Part Payment') && Array.isArray(allocations) && allocations.length > 0) {
          allocations.forEach(a => {
            const b = db.prepare('SELECT * FROM bills WHERE id = ?').get(a.billId);
            if (b) {
              const newBal = Math.max(0, b.balance - a.amount);
              db.prepare('UPDATE bills SET balance = ?, updated_at = ? WHERE id = ?').run(newBal, now, b.id);
              appliedAllocations.push({ billId: b.id, amount: a.amount, settled: newBal === 0 });
            }
          });

          // Insert into payments table
          const pid = 'p_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
          db.prepare(`
            INSERT INTO payments (id, date, ref, mode, amount, marka, allocations_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(pid, followDate, payRef || 'REF-' + Date.now().toString().slice(-4), payMode || 'cheque', payAmount || 0, currentMarka.marka, JSON.stringify(appliedAllocations), now);
        }

        // Check remaining balance if payment was made
        const remStmt = db.prepare('SELECT SUM(balance) AS total FROM bills WHERE marka_id = ? AND balance > 0').get(markaId);
        const stillDue = remStmt ? (remStmt.total || 0) : 0;
        let finalStatus = actionStatus;
        let finalNextDate = nextDate;
        let finalRemark = remark;

        if (actionStatus === 'Payment Received' || actionStatus === 'Part Payment') {
          if (stillDue === 0) {
            finalStatus = 'Payment Received';
            finalNextDate = '';
            finalRemark = finalRemark || `Full payment received (${payMode || 'cheque'} ref: ${payRef || ''}). All dues cleared.`;
          } else {
            finalStatus = 'Part Payment';
            finalNextDate = finalNextDate || new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
            finalRemark = finalRemark || `Part payment received (${payMode || 'cheque'} ref: ${payRef || ''}); ₹${stillDue.toLocaleString('en-IN')} still due.`;
          }
        }
        
        db.prepare(`
          UPDATE markas SET
            last_date = ?,
            last_status = ?,
            remark = ?,
            expected = ?,
            ptp = ?,
            next_date = ?,
            owner = ?,
            updated_at = ?
          WHERE id = ?
        `).run(followDate, finalStatus, finalRemark, expected || 0, promiseDate || '', finalNextDate, newOwner, now, markaId);

        // Create Escalation if needed
        const isEscalation = actionStatus && (
          actionStatus.includes('Dispute') ||
          actionStatus.includes('Complaint') ||
          actionStatus.includes('Claim') ||
          actionStatus.includes('Escalat')
        );
        if (isEscalation) {
          const eid = payload.escId || ('e_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4));
          const cleanType = actionStatus.includes('WhatsApp') ? 'WhatsApp Complaint' :
                            actionStatus.includes('Dispute') ? 'Dispute' :
                            actionStatus.includes('Escalat') ? 'Escalated' : 'Claim Matter';
          db.prepare(`
            INSERT INTO escalations (id, marka_id, date, type, claim_number, wa_complaint_no, escalated_to, followper, status, remark, bill_ids_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Open', ?, ?)
          `).run(eid, markaId, followDate, cleanType, claimNumber || '', waComplaintNo || '', escalateTo || '', followper, remark, JSON.stringify(billIds || []));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Follow-up saved to SQLite database.', stillDue }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/payment' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { markaId, payDate, payMode, payRef, payAmount, allocations } = payload;
        
        const marka = db.prepare('SELECT * FROM markas WHERE id = ?').get(markaId);
        if (!marka) throw new Error('Marka not found');

        const now = new Date().toISOString();
        const appliedAllocations = [];

        if (Array.isArray(allocations) && allocations.length > 0) {
          allocations.forEach(a => {
            const b = db.prepare('SELECT * FROM bills WHERE id = ?').get(String(a.billId)) || db.prepare('SELECT * FROM bills WHERE id = ?').get(a.billId);
            if (b) {
              const newBal = Math.max(0, b.balance - a.amount);
              db.prepare('UPDATE bills SET balance = ?, updated_at = ? WHERE id = ?').run(newBal, now, b.id);
              appliedAllocations.push({ billId: b.id, amount: a.amount, settled: newBal === 0 });

              // Add history
              const hid = 'h_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
              db.prepare(`
                INSERT INTO history (id, marka_id, type, date, followper, status, remark, amount, bill_id, created_at)
                VALUES (?, ?, 'payment', ?, ?, ?, ?, ?, ?, ?)
              `).run(
                hid, markaId, payDate, marka.owner, newBal === 0 ? 'Payment Received' : 'Part Payment',
                `Payment: ₹${a.amount.toLocaleString('en-IN')} allocated to bill ${b.first_date}.`, a.amount, b.id, now
              );
            }
          });
        } else {
          // FIFO Fallback
          const bills = db.prepare('SELECT * FROM bills WHERE marka_id = ? AND balance > 0 ORDER BY first_date ASC').all();
          let remaining = payAmount;
          bills.forEach(b => {
            if (remaining <= 0) return;
            const alloc = Math.min(remaining, b.balance);
            const newBal = b.balance - alloc;
            remaining -= alloc;

            db.prepare('UPDATE bills SET balance = ?, updated_at = ? WHERE id = ?').run(newBal, now, b.id);
            appliedAllocations.push({ billId: b.id, amount: alloc, settled: newBal === 0 });

            // Add history
            const hid = 'h_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
            db.prepare(`
              INSERT INTO history (id, marka_id, type, date, followper, status, remark, amount, bill_id, created_at)
              VALUES (?, ?, 'payment', ?, ?, ?, ?, ?, ?, ?)
            `).run(
              hid, markaId, payDate, marka.owner, newBal === 0 ? 'Payment Received' : 'Part Payment',
              `Daily Rokad: ₹${alloc.toLocaleString('en-IN')} allocated to bill ${b.first_date}.`, alloc, b.id, now
            );
          });
        }

        // Check remaining balance for Marka
        const remStmt = db.prepare('SELECT SUM(balance) AS total FROM bills WHERE marka_id = ? AND balance > 0').get(markaId);
        const stillDue = remStmt.total || 0;
        
        const nextFollowDate = stillDue > 0 ? new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10) : '';
        const lastRemark = stillDue > 0 ? `Part payment ₹${payAmount.toLocaleString('en-IN')} received; ₹${stillDue.toLocaleString('en-IN')} still due.` : 'All dues cleared. Follow-up closed.';
        const lastStatus = stillDue > 0 ? 'Part Payment' : 'Payment Received';

        db.prepare(`
          UPDATE markas SET
            last_date = ?,
            last_status = ?,
            remark = ?,
            next_date = ?,
            updated_at = ?
          WHERE id = ?
        `).run(payDate, lastStatus, lastRemark, nextFollowDate, now, markaId);

        // Record in payments table
        const pid = 'p_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
        db.prepare(`
          INSERT INTO payments (id, date, ref, mode, amount, marka, allocations_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(pid, payDate, payRef, payMode, payAmount, marka.marka, JSON.stringify(appliedAllocations), now);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, allocations: appliedAllocations, stillDue }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/resolve' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { markaId, escId, resolveDate, resolveType, resolveRemark, settlements, resolvedBy, coverAmount } = payload;
        const now = new Date().toISOString();

        let totalSettled = 0;
        if (Array.isArray(settlements) && settlements.length > 0) {
          settlements.forEach(s => {
            const b = db.prepare('SELECT * FROM bills WHERE id = ?').get(s.billId);
            if (b) {
              const newBal = Math.max(0, b.balance - s.amount);
              db.prepare('UPDATE bills SET balance = ?, updated_at = ? WHERE id = ?').run(newBal, now, b.id);
              totalSettled += s.amount;
            }
          });
        }

        db.prepare(`
          UPDATE escalations SET
            status = 'Resolved',
            resolved_date = ?,
            resolution_type = ?,
            settled_amount = ?,
            cover_amount = ?,
            resolution_note = ?,
            resolved_by = ?
          WHERE id = ?
        `).run(resolveDate, resolveType, totalSettled, coverAmount || 0, resolveRemark, resolvedBy || 'Admin', escId);

        // Add history log
        const hid = 'h_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
        db.prepare(`
          INSERT INTO history (id, marka_id, type, date, followper, status, remark, created_at)
          VALUES (?, ?, 'followup', ?, ?, 'Claim Resolved', ?, ?)
        `).run(hid, markaId, resolveDate, resolvedBy || 'Admin', `CRM Resolved (${resolveType}): ₹${totalSettled.toLocaleString('en-IN')} settled. ${resolveRemark}`, now);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, totalSettled }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/master-assignment' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { masterName, newFollowper, syncMarkas } = JSON.parse(body);
        const now = new Date().toISOString();

        db.prepare(`
          INSERT INTO masters (master_name, followper_name, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(master_name) DO UPDATE SET followper_name = excluded.followper_name, updated_at = excluded.updated_at
        `).run(masterName, newFollowper, now);

        let updatedMarkas = 0;
        if (syncMarkas) {
          const resStmt = db.prepare('UPDATE markas SET owner = ?, updated_at = ? WHERE master = ?').run(newFollowper, now, masterName);
          updatedMarkas = resStmt.changes;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, updatedMarkas }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/assignment' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { markaName, newFollowper } = JSON.parse(body);
        const now = new Date().toISOString();
        db.prepare('UPDATE markas SET owner = ?, updated_at = ? WHERE marka = ?').run(newFollowper, now, markaName);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { email, password } = JSON.parse(body);
        const cleanEmail = (email || '').trim().toLowerCase();
        const cleanPass = (password || '').trim();
        
        const user = db.prepare(`
          SELECT * FROM users 
          WHERE (LOWER(email) = LOWER(?) OR LOWER(followper_name) = LOWER(?) OR LOWER(email) LIKE LOWER(?)) 
          AND (password = ? OR (password IS NULL AND ? = '1234'))
        `).get(cleanEmail, cleanEmail, cleanEmail + '@%', cleanPass, cleanPass);

        if (user) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            user: { email: user.email, role: user.role, followperName: user.followper_name }
          }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid email/username or password.' }));
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/users' && req.method === 'GET') {
    try {
      const rows = db.prepare('SELECT email, password, role, followper_name FROM users ORDER BY email ASC').all();
      const users = rows.map(u => ({ email: u.email, password: u.password, role: u.role, followperName: u.followper_name }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(users));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname === '/api/users' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { email, password, role, followperName } = JSON.parse(body);
        const now = new Date().toISOString();
        db.prepare(`
          INSERT INTO users (email, password, role, followper_name, created_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(email) DO UPDATE SET password = excluded.password, role = excluded.role, followper_name = excluded.followper_name
        `).run(email, password || email, role || 'user', followperName || 'all', now);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/users/delete' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { email } = JSON.parse(body);
        db.prepare('DELETE FROM users WHERE email = ?').run(email);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/users/change-password' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { email, currentPassword, newPassword, isAdmin } = JSON.parse(body);
        if (!email || !newPassword) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Email and new password are required.' }));
        }

        const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email);
        if (!user) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'User account not found.' }));
        }

        if (!isAdmin) {
          if (!currentPassword) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Current password is required.' }));
          }
          if (user.password !== currentPassword && user.password !== '1234' && currentPassword !== '1234') {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Incorrect current password.' }));
          }
        }

        db.prepare('UPDATE users SET password = ? WHERE LOWER(email) = LOWER(?)').run(newPassword, email);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Password updated successfully!' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/fms/complete' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { markaId, taskCode, taskName, responsibleRole, responsibleName, offsetDays, dueDate, plannedDate, actualDate, remark, completedBy } = payload;
        const now = new Date().toISOString();

        // On-Time (1.0) vs Delayed (0.5) scoring engine
        const isDelayed = actualDate > plannedDate;
        const score = isDelayed ? 0.5 : 1.0;
        const status = isDelayed ? 'Done (Delayed)' : 'Done (On-Time)';

        const taskId = 'fms_' + markaId + '_' + taskCode;
        db.prepare(`
          INSERT INTO fms_tasks (id, marka_id, task_code, task_name, responsible_role, responsible_name, offset_days, due_date, planned_date, actual_date, status, score, remark, completed_by, completed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            actual_date = excluded.actual_date,
            status = excluded.status,
            score = excluded.score,
            remark = excluded.remark,
            completed_by = excluded.completed_by,
            completed_at = excluded.completed_at
        `).run(taskId, markaId, taskCode, taskName, responsibleRole, responsibleName || '', offsetDays, dueDate, plannedDate, actualDate, status, score, remark || '', completedBy || 'Admin', now);

        // Also record history log for full audit trail
        const hid = 'h_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
        const histRemark = `[${taskCode} COMPLETED] ${taskName}. Planned: ${plannedDate}, Actual: ${actualDate} (${isDelayed ? 'Delayed: 0.5 pt' : 'On-Time: 1.0 pt'}). Responsible: ${responsibleRole} (${responsibleName || completedBy}). Note: ${remark || 'Milestone achieved.'}`;
        db.prepare(`
          INSERT INTO history (id, marka_id, type, date, followper, status, remark, created_at)
          VALUES (?, ?, 'followup', ?, ?, 'FMS Task Completed', ?, ?)
        `).run(hid, markaId, actualDate, completedBy || 'Admin', histRemark, now);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, score, status, isDelayed }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/help-tickets/create' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { id, markaId, markaName, date, requestedBy, assignedHelper, priority, subject, remark } = payload;
        const now = new Date().toISOString();
        const ticketId = id || ('ht_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4));
        db.prepare(`
          INSERT INTO help_tickets (id, marka_id, marka_name, date, requested_by, assigned_helper, priority, subject, remark, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open', ?, ?)
        `).run(ticketId, markaId || '', markaName || '', date || now.slice(0, 10), requestedBy || '', assignedHelper || '', priority || 'Normal', subject || '', remark || '', now, now);

        if (markaId) {
          const hid = 'h_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
          db.prepare(`
            INSERT INTO history (id, marka_id, type, date, followper, status, remark, created_at)
            VALUES (?, ?, 'followup', ?, ?, 'Help Ticket', ?, ?)
          `).run(hid, markaId, date || now.slice(0, 10), requestedBy || 'User', `[Help Ticket: ${subject}] Assigned to: ${assignedHelper}. Note: ${remark}`, now);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, id: ticketId }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/help-tickets/resolve' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { id, resolvedBy, resolutionType, resolutionNote, date, nextDate, markaId, logToHistory, actionType } = JSON.parse(body);
        const now = new Date().toISOString();
        const existingTicket = db.prepare('SELECT * FROM help_tickets WHERE id = ?').get(id);
        const targetMarkaId = markaId || (existingTicket ? existingTicket.marka_id : '');
        const historyList = JSON.parse((existingTicket && existingTicket.history_json) || '[]');
        
        historyList.push({
          date: date || now.slice(0, 10),
          followper: resolvedBy || 'Representative',
          actionType: resolutionType || (actionType === 'progress' ? 'Interim Follow-up' : 'Action Completed'),
          note: resolutionNote || '',
          nextDate: nextDate || '',
          status: actionType === 'progress' ? 'In Progress' : 'Resolved'
        });

        if (actionType === 'progress') {
          db.prepare(`
            UPDATE help_tickets
            SET status = 'In Progress', next_date = ?, remark = ?, history_json = ?, updated_at = ?
            WHERE id = ?
          `).run(nextDate || '', resolutionNote || '', JSON.stringify(historyList), now, id);

          if (logToHistory && targetMarkaId) {
            const hid = 'h_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
            db.prepare(`
              INSERT INTO history (id, marka_id, type, date, followper, status, remark, next, created_at)
              VALUES (?, ?, 'followup', ?, ?, 'Help Ticket Progress', ?, ?, ?)
            `).run(hid, targetMarkaId, date || now.slice(0, 10), resolvedBy || 'Representative', `[HELP PROGRESS (Next: ${nextDate || '—'})] ${resolutionNote}`, nextDate || '', now);
          }
        } else {
          db.prepare(`
            UPDATE help_tickets
            SET status = 'Resolved', resolved_by = ?, resolution_type = ?, resolution_note = ?, next_date = '', history_json = ?, resolved_at = ?, updated_at = ?
            WHERE id = ?
          `).run(resolvedBy || '', resolutionType || 'Representative Action Completed', resolutionNote || '', JSON.stringify(historyList), now, now, id);

          if (logToHistory && targetMarkaId) {
            const hid = 'h_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
            db.prepare(`
              INSERT INTO history (id, marka_id, type, date, followper, status, remark, created_at)
              VALUES (?, ?, 'followup', ?, ?, 'Help Ticket Resolved', ?, ?)
            `).run(hid, targetMarkaId, date || now.slice(0, 10), resolvedBy || 'Representative', `[HELP ACTION: ${resolutionType || 'Done'}] ${resolutionNote}`, now);
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/escalations/resolve' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { id, resolvedBy, resolutionNote, resolutionType, settledAmount } = JSON.parse(body);
        const now = new Date().toISOString();
        db.prepare(`
          UPDATE escalations
          SET status = 'Resolved', resolved_by = ?, resolution_note = ?, resolution_type = ?, settled_amount = ?, resolved_date = ?, updated_at = ?
          WHERE id = ?
        `).run(resolvedBy || '', resolutionNote || '', resolutionType || 'Resolved', settledAmount || 0, now.slice(0, 10), now, id);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/clear-all-data' && req.method === 'POST') {
    try {
      db.exec('PRAGMA foreign_keys = OFF;');
      db.exec('DELETE FROM bills;');
      db.exec('DELETE FROM history;');
      db.exec('DELETE FROM escalations;');
      db.exec('DELETE FROM help_tickets;');
      db.exec('DELETE FROM fms_tasks;');
      db.exec('DELETE FROM payments;');
      db.exec('DELETE FROM markas;');
      db.exec('PRAGMA foreign_keys = ON;');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'All outstanding, FMS and collection data cleared. User accounts preserved.' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname === '/api/import-sync' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { markas: importedMarkas } = JSON.parse(body);
        if (Array.isArray(importedMarkas)) {
          const insertMarka = db.prepare(`
            INSERT INTO markas (id, marka, master, owner, next_date, last_date, last_status, remark, ptp, expected, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(marka) DO UPDATE SET
              master = excluded.master,
              owner = CASE WHEN markas.owner = 'Unassigned' THEN excluded.owner ELSE markas.owner END,
              next_date = excluded.next_date,
              updated_at = excluded.updated_at
          `);

          const insertBill = db.prepare(`
            INSERT INTO bills (id, marka_id, first_date, balance, source_amount, bill_count, bill_nos_json, policy_date, policy_name, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              balance = excluded.balance,
              source_amount = excluded.source_amount,
              updated_at = excluded.updated_at
          `);

          const now = new Date().toISOString();
          db.exec('BEGIN TRANSACTION;');
          importedMarkas.forEach(m => {
            insertMarka.run(
              m.id, m.marka, m.master, m.owner || 'Unassigned',
              m.nextDate || '', m.lastDate || '', m.lastStatus || '', m.remark || '',
              m.ptp || '', m.expected || 0, now, now
            );
            (m.bills || []).forEach(b => {
              insertBill.run(
                String(b.id), m.id, b.firstDate, b.balance, b.sourceAmount,
                b.billCount || 1, JSON.stringify(b.billNos || []),
                b.policyDate || '', b.policyName || '', now
              );
            });
          });
          db.exec('COMMIT;');
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, count: importedMarkas ? importedMarkas.length : 0 }));
      } catch (err) {
        try { db.exec('ROLLBACK;'); } catch (e) {}
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Static File Serving
  let filePath = path.join(STATIC_DIR, pathname === '/' ? 'index.html' : pathname);
  
  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
  };

  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 Not Found</h1>', 'utf-8');
      } else {
        res.writeHead(500);
        res.end('Server Error: ' + error.code, 'utf-8');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 CollectIQ SQLite Database Server Running!`);
  console.log(`📡 Local Access   : http://localhost:${PORT}`);
  console.log(`💾 Database File  : ${DB_PATH}`);
  console.log(`=======================================================`);
});
