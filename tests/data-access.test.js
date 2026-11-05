const test = require('node:test');
const assert = require('node:assert/strict');
const DA = require('../data-access.js');

const h = { ownerOf: m => m.owner || 'Unassigned', crrOf: m => m.crr || 'Unassigned' };
const parties = [
  { id: 1, marka: 'A', master: 'Bhaskar', owner: 'Mahavir', crr: 'Ravi Bhai' },
  { id: 2, marka: 'B', master: 'Bhaskar 2', owner: 'Anil Sharma', crr: 'Nayan Bhai' },
  { id: 3, marka: 'C', master: 'Kiran', owner: 'Anil', crr: 'Ravi Bhai' },
  { id: 4, marka: 'D', master: 'Kiran', owner: 'Surendra', crr: 'Mahendra Bhai' }
];
const ids = (rule) => DA.filterParties(rule, parties, h).map(m => m.id);

test('admins always see everything, whatever is saved', () => {
  const rule = DA.ruleFor({ role: 'admin', access: { mode: 'custom', masters: ['Kiran'] } });
  assert.equal(rule.all, true);
  assert.deepEqual(ids(rule), [1, 2, 3, 4]);
});

test('role default: unchanged behaviour', () => {
  const doer = DA.ruleFor({ role: 'user', followperName: 'Mahavir' });
  assert.equal(doer.strict, false, 'a Doer can still pick All Team Markas');
  assert.deepEqual(ids(doer), [1]);
  assert.deepEqual(ids(DA.ruleFor({ role: 'user', followperName: 'Anil' })), [2, 3], 'loose match as before');
  assert.deepEqual(ids(DA.ruleFor({ role: 'crr', followperName: 'Ravi Bhai' })), [1, 3]);
  assert.equal(DA.ruleFor({ role: 'crr', followperName: 'Mahendra Bhai' }).all, true);
  assert.equal(DA.ruleFor({ role: 'accounts', followperName: 'Account Team' }).all, true);
  assert.equal(DA.ruleFor({ role: 'superuser', followperName: 'Saurav Bhai' }).all, true);
  assert.deepEqual(ids(DA.ruleFor({ role: 'user', followperName: 'Unassigned' })), []);
});

test('all parties opens everything up, even for a Doer', () => {
  assert.equal(DA.ruleFor({ role: 'user', followperName: 'Mahavir', access: { mode: 'all' } }).all, true);
});

test('custom: any ticked master, doer or CRR, exact names, strict', () => {
  const rule = DA.ruleFor({ role: 'accounts', access: { mode: 'custom', masters: ['bhaskar'], followpers: ['Anil'], crrs: [] } });
  assert.equal(rule.strict, true);
  // Master "bhaskar" is not "Bhaskar 2"; doer "Anil" is not "Anil Sharma".
  assert.deepEqual(ids(rule), [1, 3]);
  const crr = DA.ruleFor({ role: 'superuser', access: { mode: 'custom', crrs: ['Mahendra Bhai'] } });
  assert.deepEqual(ids(crr), [4]);
});

test('custom limits a Mahendra CRR login too', () => {
  const rule = DA.ruleFor({ role: 'crr', followperName: 'Mahendra Bhai', access: { mode: 'custom', masters: ['Kiran'] } });
  assert.deepEqual(ids(rule), [3, 4]);
});

test('custom with nothing ticked shows nothing', () => {
  assert.deepEqual(ids(DA.ruleFor({ role: 'pc', access: { mode: 'custom' } })), []);
});

test('normalize tidies the saved setting', () => {
  assert.deepEqual(DA.normalize(null), { mode: 'role' });
  assert.deepEqual(DA.normalize({ mode: 'weird' }), { mode: 'role' });
  assert.deepEqual(DA.normalize({ mode: 'custom', masters: [' Kiran ', 'kiran', '', null], followpers: 'x' }),
    { mode: 'custom', masters: ['Kiran'], followpers: [], crrs: [] });
});

test('describe for the Users table', () => {
  assert.equal(DA.describe(undefined, 'user'), 'Default for role');
  assert.equal(DA.describe({ mode: 'all' }, 'user'), 'All parties');
  assert.equal(DA.describe({ mode: 'custom' }, 'admin'), 'All parties (admin)');
  assert.equal(DA.describe({ mode: 'custom', masters: ['Kiran'], crrs: ['Ravi Bhai'] }, 'crr'), 'Masters: Kiran · CRR: Ravi Bhai');
  assert.equal(DA.describe({ mode: 'custom' }, 'crr'), 'Nothing (no parties chosen)');
});
