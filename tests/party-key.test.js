const test = require('node:test');
const assert = require('node:assert/strict');
const PK = require('../party-key.js');

function row(id, marka, master, bills = []) {
  return { id, marka, master, bills };
}

test('partyKey separates the same party under different Masters', () => {
  assert.equal(PK.partyKey(' jgg ', 'Kunal Master'), PK.partyKey('JGG', 'KUNAL MASTER'));
  assert.notEqual(PK.partyKey('JGG', 'KUNAL MASTER'), PK.partyKey('JGG', 'GUDDU MASTER'));
  assert.equal(PK.partyKey('JGG', ''), PK.partyKey('JGG', 'Unassigned Master'));
});

test('findPartyRow matches name and Master together', () => {
  const list = [row('a', 'JGG', 'KUNAL MASTER'), row('b', 'JGG', 'GUDDU MASTER')];
  assert.equal(PK.findPartyRow(list, 'jgg', 'guddu master').id, 'b');
  assert.equal(PK.findPartyRow(list, 'JGG', 'BABLU MASTER'), null);
});

test('resolveImportTarget: exact row, moved Master, or a new row', () => {
  const list = [row('a', 'JGG', 'KUNAL MASTER')];
  // Exact party + Master
  assert.equal(PK.resolveImportTarget(list, 'JGG', 'KUNAL MASTER', ['KUNAL MASTER']).id, 'a');
  // File now lists JGG only under GUDDU: the party moved, keep its row
  assert.equal(PK.resolveImportTarget(list, 'JGG', 'GUDDU MASTER', ['GUDDU MASTER']).id, 'a');
  // File lists JGG under both: GUDDU becomes its own row
  assert.equal(PK.resolveImportTarget(list, 'JGG', 'GUDDU MASTER', ['KUNAL MASTER', 'GUDDU MASTER']), null);
  // A brand new party
  assert.equal(PK.resolveImportTarget(list, 'MAU', 'KUNAL MASTER', ['KUNAL MASTER']), null);
});

test('moveBillsFromSiblings moves only matching bills of the same party', () => {
  const merged = row('a', 'JGG', 'KUNAL MASTER', [
    { id: 1, billNos: ['B1'], balance: 100 },
    { id: 2, billNos: ['B2'], balance: 200 }
  ]);
  const other = row('c', 'MAU', 'KUNAL MASTER', [{ id: 3, billNos: ['B2'], balance: 50 }]);
  const split = row('b', 'JGG', 'GUDDU MASTER', []);
  const list = [merged, other, split];
  assert.equal(PK.moveBillsFromSiblings(list, split, ['B2']), 1);
  assert.deepEqual(merged.bills.map(b => b.id), [1]);
  assert.deepEqual(split.bills.map(b => b.id), [2]);
  assert.deepEqual(other.bills.map(b => b.id), [3]);
});

test('paymentBelongsTo uses markaId, then allocations, then party + Master', () => {
  const a = row('a', 'JGG', 'KUNAL MASTER', [{ id: 1 }]);
  const b = row('b', 'JGG', 'GUDDU MASTER', [{ id: 2 }]);
  const byId = { marka: 'JGG', markaId: 'b' };
  assert.equal(PK.paymentBelongsTo(byId, a), false);
  assert.equal(PK.paymentBelongsTo(byId, b), true);

  const byAlloc = { marka: 'JGG', allocations: [{ billId: 1, amount: 10 }] };
  assert.equal(PK.paymentBelongsTo(byAlloc, a), true);
  assert.equal(PK.paymentBelongsTo(byAlloc, b), false);

  const byMaster = { marka: 'JGG', master: 'GUDDU MASTER', allocations: [] };
  assert.equal(PK.paymentBelongsTo(byMaster, a), false);
  assert.equal(PK.paymentBelongsTo(byMaster, b), true);

  assert.equal(PK.partyForPayment([a, b], byAlloc).id, 'a');
});

test('ticketBelongsTo falls back to the name only without a markaId', () => {
  const a = row('a', 'JGG', 'KUNAL MASTER');
  const b = row('b', 'JGG', 'GUDDU MASTER');
  assert.equal(PK.ticketBelongsTo({ markaId: 'a', markaName: 'JGG' }, b), false);
  assert.equal(PK.ticketBelongsTo({ markaName: 'jgg' }, b), true);
});
