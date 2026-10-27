const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../list-filters.js');

test('sameName: exact match ignoring case and extra spaces, never a part of another name', () => {
  assert.equal(L.sameName('Anil Sharma', ' anil  sharma '), true);
  assert.equal(L.sameName('Anil', 'Anil Sharma'), false);
  assert.equal(L.sameName('1', '11'), false);
  assert.equal(L.sameName('11', '1'), false);
  assert.equal(L.sameName('', ''), false);
  assert.equal(L.sameName(null, undefined), false);
});

test('partyStatus: one status per party, same as the STATUS column', () => {
  // daysPast: >0 = next date already passed, 0 = today, <0 = in the future
  assert.equal(L.partyStatus({ locked: true, nextDate: '2026-10-01', daysPast: 26 }), 'locked');
  assert.equal(L.partyStatus({ locked: true, nextDate: '2026-10-27', daysPast: 0 }), 'locked');
  assert.equal(L.partyStatus({ locked: false, nextDate: '', daysPast: 0 }), 'closed');
  assert.equal(L.partyStatus({ locked: false, nextDate: '2026-10-01', daysPast: 26 }), 'overdue');
  assert.equal(L.partyStatus({ locked: false, nextDate: '2026-10-27', daysPast: 0 }), 'today');
  assert.equal(L.partyStatus({ locked: false, nextDate: '2026-11-02', daysPast: -6 }), 'upcoming');
});

test('scheduleTab: All = Overdue + Due today + Upcoming, no party counted twice', () => {
  assert.equal(L.scheduleTab('locked'), 'overdue');
  assert.equal(L.scheduleTab('overdue'), 'overdue');
  assert.equal(L.scheduleTab('today'), 'due');
  assert.equal(L.scheduleTab('upcoming'), 'upcoming');
  assert.equal(L.scheduleTab('closed'), 'upcoming');
});

test('crmItems: a complaint saved with the form shows once, with its real status', () => {
  const party = {
    id: 'm1', marka: 'ADT',
    escalations: [
      { id: 'e1', date: '2026-10-20', type: 'WhatsApp Complaint', status: 'Resolved', remark: 'rate issue', followper: 'Surendra' },
      { id: 'h1', date: '2026-10-22', type: 'Help Ticket', status: 'Open' }
    ],
    history: [
      { date: '2026-10-20', status: 'WhatsApp Complaint', remark: 'rate issue', followper: 'Surendra' },
      { date: '2026-10-21', status: 'Claim Resolved', remark: 'settled' },
      { date: '2026-09-05', status: 'Claim Matter', remark: 'old claim from before escalations were saved', followper: 'Surendra' },
      { date: '2026-10-23', status: 'Promise to Pay' },
      null
    ]
  };
  const rows = L.crmItems([party, null], () => 'Owner');
  assert.deepEqual(rows.map(r => [r.date, r.type, r.status]), [
    ['2026-10-20', 'WhatsApp Complaint', 'Resolved'],
    ['2026-09-05', 'Claim Matter', 'Open']
  ]);
  assert.equal(rows[0].markaId, 'm1');
  assert.equal(rows[0].markaName, 'ADT');
  assert.equal(rows[1].followper, 'Surendra');
});

test('crmItems: escalation without a status counts as Open; history type follows its words', () => {
  const rows = L.crmItems([{
    id: 'm2', marka: 'JGG',
    escalations: [{ id: 'e9', date: '2026-10-01' }],
    history: [
      { date: '2026-10-02', status: 'Escalated to Management' },
      { date: '2026-10-03', status: 'WhatsApp Complaint / Claim Matter' }
    ]
  }], () => 'Mahavir');
  assert.deepEqual(rows.map(r => [r.type, r.status, r.followper]), [
    ['Claim Matter', 'Open', 'Mahavir'],
    ['Escalated', 'Open', 'Mahavir'],
    ['WhatsApp Complaint', 'Open', 'Mahavir']
  ]);
});

test('crmItems: the same complaint saved twice (old double save) shows once', () => {
  const e = { id: 'e1', date: '2026-10-01', type: 'Claim Matter', status: 'Open' };
  assert.equal(L.crmItems([{ id: 'x', marka: 'X', escalations: [e, { ...e }], history: [] }], () => '').length, 1);
  const h = { date: '2026-10-02', status: 'Claim Matter' };
  assert.equal(L.crmItems([{ id: 'y', marka: 'Y', escalations: [], history: [h, { ...h }] }], () => '').length, 1);
  // two different complaints on one day stay two
  assert.equal(L.crmItems([{ id: 'z', marka: 'Z', escalations: [{ id: 'a', date: '2026-10-03', type: 'Claim Matter' }, { id: 'b', date: '2026-10-03', type: 'WhatsApp Complaint' }], history: [] }], () => '').length, 2);
});

test('followperMatches: exact name, but a user always sees the parties the login already limited to them', () => {
  assert.equal(L.followperMatches('Anil Sharma', 'Anil', null), false);
  assert.equal(L.followperMatches('anil  sharma', 'Anil Sharma', null), true);
  assert.equal(L.followperMatches('Mahavir Ji', 'Mahavir', { role: 'user', followperName: 'Mahavir' }), true);
  assert.equal(L.followperMatches('Mahavir Ji', 'Mahavir', { role: 'admin', followperName: 'all' }), false);
  assert.equal(L.followperMatches('Surendra', 'all', null), true);
  assert.equal(L.followperMatches('Surendra', '', null), true);
});
