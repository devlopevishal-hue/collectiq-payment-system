const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, '..', 'data', 'collectiq.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = OFF;');
db.exec('PRAGMA journal_mode = WAL;');

// Read latestReportCases
global.window = {};
const code = fs.readFileSync(path.join(__dirname, '..', 'latest-report-data.js'), 'utf-8');
eval(code);

const cases = global.window.latestReportCases;
console.log(`Seeding ${cases.length} markas into SQLite database...`);

db.exec('BEGIN TRANSACTION;');
db.exec('DELETE FROM bills;');
db.exec('DELETE FROM markas;');

const insertMarka = db.prepare(`
  INSERT INTO markas (id, marka, master, owner, next_date, last_date, last_status, remark, ptp, expected, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertBill = db.prepare(`
  INSERT INTO bills (id, marka_id, first_date, balance, source_amount, bill_count, bill_nos_json, policy_date, policy_name, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const now = new Date().toISOString();
let totalBills = 0;

for (const m of cases) {
  insertMarka.run(
    String(m.id),
    m.marka,
    m.master || 'Unassigned Master',
    m.owner || 'Unassigned',
    m.nextDate || '',
    m.lastDate || '',
    m.lastStatus || '',
    m.remark || '',
    m.ptp || '',
    m.expected || 0,
    now,
    now
  );

  for (const b of (m.bills || [])) {
    insertBill.run(
      String(b.id),
      String(m.id),
      b.firstDate || '',
      b.balance || 0,
      b.sourceAmount || b.balance || 0,
      b.billCount || 1,
      JSON.stringify(b.billNos || []),
      b.policyDate || b.firstDate || '',
      b.policyName || 'NET',
      now
    );
    totalBills++;
  }
}

db.exec('COMMIT;');
db.exec('PRAGMA foreign_keys = ON;');

console.log(`Successfully populated ${cases.length} markas and ${totalBills} bills into collectiq.db!`);
