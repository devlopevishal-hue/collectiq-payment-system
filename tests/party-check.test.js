const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../party-check.js');

const docs = [
  { id: 'a1', marka: 'ACT', master: 'BABLU SHERA MASTER', owner: 'Surendra', bills: [{ id: 1, balance: 1000 }, { id: 2, balance: 0 }], history: [{ date: '2026-10-01' }, { date: '2026-10-06' }] },
  { id: 'a2', marka: 'act ', master: 'Bablu  Shera Master', owner: 'Surendra', bills: [{ id: 3, balance: 500 }], history: [] },
  { id: 'k1', marka: 'ACT', master: 'KAMLESH MASTER', owner: 'Mahavir', bills: [], history: [{ date: 20261005 }] },
  { id: 's1', marka: 'SKT', master: 'KAMLESH MASTER', owner: 'Mahavir', bills: [{ id: 9, balance: 200 }], history: [] },
  { id: 'x', marka: '', master: 'KAMLESH MASTER' },
  null
];
const payments = [
  { id: 'p1', marka: 'ACT', allocations: [{ billId: 2, amount: 100 }] },
  { id: 'p2', marka: 'ACT', allocations: [{ billId: '3', amount: 50 }] },
  { id: 'p3', marka: 'ACT', allocations: [{ billId: 1, amount: 10 }, { billId: 2, amount: 5 }] }
];

test('partyKey: master + marka, ignoring case and extra spaces', () => {
  assert.equal(P.partyKey('act ', 'Bablu  Shera Master'), 'BABLU SHERA MASTER|ACT');
  assert.equal(P.partyKey('ACT', 'BABLU SHERA MASTER'), P.partyKey(' act', 'bablu shera master '));
  assert.notEqual(P.partyKey('ACT', 'BABLU SHERA MASTER'), P.partyKey('ACT', 'KAMLESH MASTER'));
});

test('checkParties: same master + same marka twice is a duplicate, richest copy first', () => {
  const r = P.checkParties(docs, { shownIds: new Set(['a2', 'k1', 's1']), payments });
  assert.equal(r.records, 4);
  assert.equal(r.parties, 3);
  assert.equal(r.duplicates.length, 1);
  const g = r.duplicates[0];
  assert.equal(g.marka, 'ACT');
  assert.equal(g.master, 'BABLU SHERA MASTER');
  assert.deepEqual(g.copies.map(c => c.id), ['a1', 'a2']);
  assert.deepEqual(
    { ...g.copies[0] },
    { id: 'a1', marka: 'ACT', master: 'BABLU SHERA MASTER', owner: 'Surendra', bills: 2, outstanding: 1000, history: 2, lastEntry: '2026-10-06', payments: 2, shown: false }
  );
  assert.equal(g.copies[1].payments, 1);
  assert.equal(g.copies[1].shown, true);
  assert.equal(r.extraCopies, 1);
});

test('checkParties: same marka name under different masters is listed separately', () => {
  const r = P.checkParties(docs, { shownIds: new Set(['a2', 'k1', 's1']) });
  assert.equal(r.sharedNames.length, 1);
  const s = r.sharedNames[0];
  assert.equal(s.marka, 'ACT');
  assert.deepEqual(s.parties.map(p => [p.master, p.copies, p.shown]), [['BABLU SHERA MASTER', 2, true], ['KAMLESH MASTER', 1, true]]);
  assert.equal(r.sharedNames[0].parties[1].lastEntry, '2026-10-05');
});

test('checkParties: clean data and odd input give empty lists', () => {
  const r = P.checkParties([docs[3]], {});
  assert.deepEqual([r.records, r.parties, r.duplicates.length, r.sharedNames.length, r.extraCopies], [1, 1, 0, 0, 0]);
  assert.equal(r.duplicates.length, 0);
  assert.deepEqual(P.checkParties(null).duplicates, []);
  assert.equal(P.checkParties([{ id: 'z', marka: 'Z', master: 'M', bills: 'bad', history: [null, { date: 'x' }] }]).records, 1);
});

test('findSharedIds: two different parties using one record ID', () => {
  const app = [
    { id: 'm_229', marka: 'SAN', master: 'KALPESH MASTER' },
    { id: 'm_229', marka: 'SNK', master: 'KALPESH MASTER' },
    { id: 'm_1', marka: 'ACT', master: 'BABLU SHERA MASTER' },
    null
  ];
  const seed = [
    { id: 'm_1', marka: 'act', master: 'Bablu Shera Master' },
    { id: 'm_229', marka: 'SNK', master: 'KALPESH MASTER' },
    { id: 'm_7', marka: 'SKT', master: 'KAMLESH MASTER' },
    { id: 'm_7', marka: 'SKT', master: 'KAMLESH MASTER' }
  ];
  const r = P.findSharedIds(app, seed);
  assert.deepEqual(r, [{ id: 'm_229', parties: [{ marka: 'SAN', master: 'KALPESH MASTER' }, { marka: 'SNK', master: 'KALPESH MASTER' }] }]);
  assert.deepEqual(P.findSharedIds(null, undefined), []);
});

test('placeCloudDoc: same ID + same party replaces; same name under another master is a new party', () => {
  const list = [
    { id: 'm_23', marka: 'JVDT', master: 'RIPTESH MASTER', history: [{}], bills: [{}, {}] },
    { id: 'm_229', marka: 'SAN', master: 'KALPESH MASTER', history: [], bills: [] },
    { id: 'm_229', marka: 'SNK', master: 'KALPESH MASTER', history: [], bills: [] }
  ];
  assert.deepEqual(P.placeCloudDoc(list, { id: 'm_23', marka: 'JVDT', master: 'Riptesh Master' }), { index: 0, replace: true });
  assert.deepEqual(P.placeCloudDoc(list, { id: 'x9', marka: 'JVDT', master: 'KALPESH MASTER' }), { index: -1, replace: false });
  // one record ID shared by SAN and SNK: the SNK data must land on SNK, not on SAN
  assert.deepEqual(P.placeCloudDoc(list, { id: 'm_229', marka: 'SNK', master: 'KALPESH MASTER' }), { index: 2, replace: true });
  assert.deepEqual(P.placeCloudDoc(list, { id: 'm_229', marka: 'SAN', master: 'KALPESH MASTER' }), { index: 1, replace: true });
});

test('placeCloudDoc: a second copy of the same party is shown only if it has more data', () => {
  const list = [{ id: 'a', marka: 'ADT', master: 'BABLU SHERA MASTER', history: [{}, {}], bills: [{}] }];
  assert.deepEqual(P.placeCloudDoc(list, { id: 'b', marka: 'adt', master: 'Bablu Shera Master', history: [], bills: [{}, {}, {}] }), { index: 0, replace: false });
  assert.deepEqual(P.placeCloudDoc(list, { id: 'b', marka: 'ADT', master: 'BABLU SHERA MASTER', history: [{}, {}, {}], bills: [] }), { index: 0, replace: true });
  assert.deepEqual(P.placeCloudDoc(list, { id: 'c', marka: 'ADT', master: 'BABLU SHERA MASTER', history: [{}, {}], bills: [{}] }), { index: 0, replace: false });
  assert.deepEqual(P.placeCloudDoc([], { id: 'c', marka: 'ADT', master: 'X' }), { index: -1, replace: false });
});

test('findParty: by master + marka, by name only when the name is used once', () => {
  const list = [
    { id: '1', marka: 'JVDT', master: 'RIPTESH MASTER' },
    { id: '2', marka: 'JVDT', master: 'KALPESH MASTER' },
    { id: '3', marka: 'SKT', master: 'KAMLESH MASTER' }
  ];
  assert.equal(P.findParty(list, 'jvdt', 'Kalpesh Master').id, '2');
  assert.equal(P.findParty(list, 'JVDT'), null);
  assert.equal(P.findParty(list, 'skt').id, '3');
  assert.equal(P.findParty(list, 'SKT', 'OTHER MASTER'), null);
  assert.equal(P.findParty(null, 'SKT'), null);
});

test('paymentBelongs: party ID first, then bills, then name only when the name is used once', () => {
  const list = [
    { id: '1', marka: 'JVDT', master: 'RIPTESH MASTER', bills: [{ id: 11 }] },
    { id: '2', marka: 'JVDT', master: 'KALPESH MASTER', bills: [{ id: 22 }] },
    { id: '3', marka: 'SKT', master: 'KAMLESH MASTER', bills: [{ id: 33 }] }
  ];
  const [r, k, s] = list;
  assert.equal(P.paymentBelongs({ markaId: '2', marka: 'JVDT' }, k, list), true);
  assert.equal(P.paymentBelongs({ markaId: '2', marka: 'JVDT' }, r, list), false);
  assert.equal(P.paymentBelongs({ marka: 'JVDT', allocations: [{ billId: '22' }] }, k, list), true);
  assert.equal(P.paymentBelongs({ marka: 'JVDT', allocations: [{ billId: '22' }] }, r, list), false);
  assert.equal(P.paymentBelongs({ marka: 'JVDT', allocations: [] }, r, list), false);
  assert.equal(P.paymentBelongs({ marka: 'JVDT', master: 'RIPTESH MASTER', allocations: [] }, r, list), true);
  assert.equal(P.paymentBelongs({ marka: 'skt', allocations: [{ billId: 999 }] }, s, list), true);
  assert.equal(P.paymentBelongs({ marka: 'SKT' }, r, list), false);
  assert.equal(P.paymentBelongs(null, r, list), false);
});

test('partyLabel: adds the master only when the name is used under several masters', () => {
  const list = [
    { id: '1', marka: 'JVDT', master: 'RIPTESH MASTER' },
    { id: '2', marka: 'jvdt ', master: 'KALPESH MASTER' },
    { id: '3', marka: 'SKT', master: 'KAMLESH MASTER' }
  ];
  const names = P.sharedNameSet(list);
  assert.equal(P.partyLabel(list[0], names), 'JVDT · RIPTESH MASTER');
  assert.equal(P.partyLabel(list[1], names), 'jvdt · KALPESH MASTER');
  assert.equal(P.partyLabel(list[2], names), 'SKT');
});

test('placeCloudDoc: master changed on another PC updates that party instead of adding a second one', () => {
  const list = [
    { id: 'm_23', marka: 'JVDT', master: 'RIPTESH MASTER' },
    { id: 'm_5', marka: 'ACT', master: 'BABLU SHERA MASTER' }
  ];
  assert.deepEqual(P.placeCloudDoc(list, { id: 'm_23', marka: 'JVDT', master: 'KALPESH MASTER' }), { index: 0, replace: true });
});

test('fewerBillsThanFile: live parties holding fewer bills than the old Excel file', () => {
  const live = [
    { id: '1', marka: 'ADT', master: 'BABLU SHERA MASTER', bills: [{ id: 1 }, { id: 2 }] },
    { id: '2', marka: 'JGG', master: 'BABLU SHERA MASTER', bills: [{ id: 1 }, { id: 2 }, { id: 3 }] },
    { id: '3', marka: 'NEW', master: 'X', bills: [] },
    null
  ];
  const file = [
    { id: '1', marka: 'adt', master: 'Bablu Shera Master', bills: [{ id: 1 }, { id: 2 }, { id: 3 }] },
    { id: '2', marka: 'JGG', master: 'BABLU SHERA MASTER', bills: [{ id: 1 }] },
    { id: '9', marka: 'ONLYFILE', master: 'X', bills: [{ id: 1 }] }
  ];
  assert.deepEqual(P.fewerBillsThanFile(live, file), [{ marka: 'ADT', master: 'BABLU SHERA MASTER', live: 2, file: 3 }]);
  assert.deepEqual(P.fewerBillsThanFile(null, file), []);
});

test('placeCloudDoc: a party whose record ID is shared with another party takes its own record from the live database', () => {
  const list = [
    { id: 'm_229', marka: 'SAN', master: 'KALPESH MASTER', history: [{}, {}], bills: [{}] },
    { id: 'm_229', marka: 'SNK', master: 'KALPESH MASTER', history: [{}, {}, {}], bills: [{}] }
  ];
  // after the split, SNK's own record arrives with less history than the old local copy
  assert.deepEqual(P.placeCloudDoc(list, { id: 'm_229~SNK', marka: 'SNK', master: 'KALPESH MASTER', history: [{}], bills: [] }), { index: 1, replace: true });
});

test('planIdSplit: the party already in the live record keeps it, the other gets its own record', () => {
  const parties = [
    { id: 'm_229', marka: 'SAN', master: 'KALPESH MASTER' },
    { id: 'm_229', marka: 'SNK', master: 'KALPESH MASTER' }
  ];
  const p1 = P.planIdSplit('m_229', parties, { id: 'm_229', marka: 'SNK', master: 'KALPESH MASTER' });
  assert.equal(p1.keeper.marka, 'SNK');
  assert.deepEqual(p1.moves.map(x => [x.party.marka, x.newId]), [['SAN', 'm_229~SAN']]);
  const p2 = P.planIdSplit('m_229', parties, null);
  assert.equal(p2.keeper.marka, 'SAN');
  assert.deepEqual(p2.moves.map(x => x.newId), ['m_229~SNK']);
  const odd = P.planIdSplit('m_7', [{ id: 'm_7', marka: 'Z/B C', master: 'X' }, { id: 'm_7', marka: 'AAA', master: 'X' }], null);
  assert.equal(odd.keeper.marka, 'AAA');
  assert.deepEqual(odd.moves.map(x => x.newId), ['m_7~Z-B-C']);
});

test('shownParties: one copy per party, the same on every device whatever the order', () => {
  const copies = [
    { id: 'm_12', marka: 'PALK', master: 'AVINASH MASTER', bills: [1, 2], history: [] },
    { id: 'muny', marka: 'palk', master: 'Avinash  Master', bills: [1, 2, 3], history: [{}] },
    { id: 'munw', marka: 'PALK', master: 'AVINASH MASTER', bills: [1, 2, 3], history: [{}] },
    { id: 'k1', marka: 'PALK', master: 'KAMLESH MASTER', bills: [], history: [] },
    { id: 'z9', marka: 'TIE', master: 'X', bills: [1], history: [] },
    { id: 'a1', marka: 'TIE', master: 'X', bills: [1], history: [] },
    null,
    { marka: 'NOID', master: 'X' }
  ];
  const ids = list => P.shownParties(list).map(m => m.id).sort();
  assert.deepEqual(ids(copies), ['a1', 'k1', 'munw']);
  assert.deepEqual(ids([...copies].reverse()), ['a1', 'k1', 'munw']);
});
