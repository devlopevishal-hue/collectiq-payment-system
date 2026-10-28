const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../payment-upload.js');

const HEADER = ['Party', 'Party Marka', 'Policy', 'Bill Amount', 'Disc Amount', 'RD Amount', 'Claim Amount', 'TDS Amount', 'Paid Amount', 'Days', 'Master'];
let n = 0;
const uid = () => 'id' + (++n);

function party() {
  return {
    id: 'm_7', marka: 'AKYT', master: 'BABLU SHERA MASTER',
    bills: [
      { id: 2, firstDate: '2026-08-10', balance: 100000, sourceAmount: 100000 },
      { id: 1, firstDate: '2026-08-01', balance: 53006, sourceAmount: 53006 },
      { id: 3, firstDate: '2026-09-01', balance: 20000, sourceAmount: 20000 }
    ],
    history: []
  };
}

test('parseGrid: reads the report format and leaves out the total and blank rows', () => {
  const { error, rows } = U.parseGrid([
    HEADER,
    ['AKSHAY TEX', 'akyt', '3% PARTY', '1,53,006', 0, 0, 0, '2,916', '1,50,090', 79, 'Bablu Shera Master'],
    ['', '', '', 153006, 0, 0, 0, 2916, 150090, 79, ''],
    ['', '', '', '', '', '', '', '', '', '', '']
  ]);
  assert.equal(error, '');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].marka, 'AKYT');
  assert.equal(rows[0].master, 'BABLU SHERA MASTER');
  assert.equal(rows[0].billAmount, 153006);
  assert.equal(rows[0].paid, 150090);
  assert.equal(rows[0].tds, 2916);
  assert.equal(rows[0].deductions, 2916);
  assert.equal(rows[0].rowNo, 2);
});

test('parseGrid: a sheet without Party Marka / Paid Amount is refused', () => {
  assert.match(U.parseGrid([['Name', 'Value'], ['a', 1]]).error, /Header row not found/);
});

test('plan: finds the party, flags unknown parties and repeats', () => {
  const m = party();
  const { rows } = U.parseGrid([HEADER,
    ['', 'AKYT', '', 0, 0, 0, 0, 0, 5000, 0, 'BABLU SHERA MASTER'],
    ['', 'ZZZ', '', 0, 0, 0, 0, 0, 5000, 0, ''],
    ['', 'AKYT', '', 0, 0, 0, 0, 0, 5000, 0, ''],
    ['', 'AKYT', '', 0, 0, 0, 0, 0, 0, 0, '']
  ]);
  const items = U.plan(rows, { markas: [m], payments: [], date: '2026-10-28' });
  assert.deepEqual(items.map(i => i.status), ['ready', 'notFound', 'duplicate', 'noAmount']);
  const again = U.plan(rows.slice(0, 1), { markas: [m], payments: [{ markaId: 'm_7', date: '2026-10-28', amount: 5000 }], date: '2026-10-28' });
  assert.equal(again[0].status, 'duplicate');
});

test('plan: marka alone matches only when that name is one party', () => {
  const a = { id: 'a', marka: 'JGG', master: 'M1', bills: [] };
  const b = { id: 'b', marka: 'JGG', master: 'M2', bills: [] };
  const { rows } = U.parseGrid([HEADER, ['', 'JGG', '', 0, 0, 0, 0, 0, 100, 0, ''], ['', 'JGG', '', 0, 0, 0, 0, 0, 200, 0, 'M2']]);
  const items = U.plan(rows, { markas: [a, b], date: '2026-10-28' });
  assert.equal(items[0].status, 'notFound');
  assert.equal(items[1].party, b);
});

test('apply: paid + TDS settle the oldest bills first and the payment keeps the paid amount', () => {
  const m = party();
  const { rows } = U.parseGrid([HEADER, ['', 'AKYT', '3% PARTY', 153006, 0, 0, 0, 2916, 150090, 79, 'BABLU SHERA MASTER']]);
  const [item] = U.plan(rows, { markas: [m], date: '2026-10-28' });
  const p = U.apply(item, { mode: 'RTGS', today: '2026-10-28', uid });
  assert.equal(p.amount, 150090);
  assert.equal(p.source, 'bulk-upload');
  assert.deepEqual(p.deductions, { disc: 0, rd: 0, claim: 0, tds: 2916 });
  assert.deepEqual(p.allocations.map(a => [a.billId, a.amount, a.settled]), [[1, 53006, true], [2, 100000, true]]);
  assert.deepEqual(m.bills.map(b => b.balance), [0, 0, 20000]);
  assert.equal(m.nextDate, '2026-10-30');
  assert.equal(m.lastDate, '2026-10-28');
  assert.equal(m.history.length, 2);
});

test('apply: more than the dues becomes an advance credit and closes the follow-up', () => {
  const m = { id: 'x', marka: 'X', master: 'M', bills: [{ id: 1, firstDate: '2026-08-01', balance: 1000 }], nextDate: '2026-10-29' };
  const { rows } = U.parseGrid([HEADER, ['', 'X', '', 0, 0, 0, 0, 0, 1500, 0, 'M']]);
  const [item] = U.plan(rows, { markas: [m], date: '2026-10-28' });
  const p = U.apply(item, { uid });
  assert.equal(p.allocations.length, 2);
  assert.equal(p.allocations[1].isAdvance, true);
  assert.equal(p.allocations[1].amount, 500);
  assert.equal(m.bills[1].balance, -500);
  assert.equal(m.nextDate, '');
  assert.equal(m.lastStatus, 'Advance Payment');
});

test('toIso: dates from the sheet', () => {
  assert.equal(U.toIso('28/10/2026'), '2026-10-28');
  assert.equal(U.toIso('2026-10-28'), '2026-10-28');
  assert.equal(U.toIso('5-1-26'), '2026-01-05');
  assert.equal(U.toIso(''), '');
});
