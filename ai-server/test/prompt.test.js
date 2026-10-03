const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSystemPrompt, TOOL_SCHEMAS } = require('../prompt.js');
const { tools } = require('../../ai-tools.js');

test('tool schemas match the browser tools exactly', () => {
  assert.deepEqual(TOOL_SCHEMAS.map(t => t.function.name).sort(), Object.keys(tools).sort());
  TOOL_SCHEMAS.forEach(t => {
    assert.equal(t.type, 'function');
    assert.equal(t.function.parameters.type, 'object');
    assert.ok(t.function.description.length > 10);
  });
});

test('prepare_followup_form schema only allows the form statuses', () => {
  const s = TOOL_SCHEMAS.find(t => t.function.name === 'prepare_followup_form');
  assert.deepEqual(s.function.parameters.properties.status.enum,
    ['Payment Received', 'Promise to Pay', 'WhatsApp Complaint / Claim Matter', 'Internal Help Ticket']);
});

test('system prompt carries user, role, date and the core rules', () => {
  const p = buildSystemPrompt({ name: 'Surendra', role: 'user', today: '2026-10-02' });
  assert.match(p, /Surendra/);
  assert.match(p, /2026-10-02/);
  assert.match(p, /₹/);
  assert.match(p, /```draft/);
  assert.match(p, /never invent/i);
});

test('system prompt tolerates missing user info', () => {
  assert.match(buildSystemPrompt({}), /CollectIQ/);
});

test('system prompt asks for Roman Hinglish and keeping tool order', () => {
  const p = buildSystemPrompt({ name: 'Surendra', role: 'user', today: '2026-10-02' });
  assert.match(p, /Roman/);
  assert.match(p, /rank/);
});

test('system prompt: copy amounts as given and do not guess form fields', () => {
  const p = buildSystemPrompt({ name: 'A', role: 'admin', today: '2026-10-02' });
  assert.match(p, /exactly as/i);
  assert.match(p, /contact_mode/);
});

test('ticket tools: schemas use the app enums', () => {
  const TA = require('../../ticket-actions.js');
  const s = TOOL_SCHEMAS.find(t => t.function.name === 'prepare_ticket_action').function.parameters;
  assert.deepEqual(s.properties.op.enum, ['create', 'progress', 'done', 'reassign']);
  assert.deepEqual(s.properties.priority.enum, TA.PRIORITIES);
  assert.deepEqual(s.properties.resolution_type.enum, TA.RESOLUTION_TYPES);
  assert.deepEqual(s.required, ['op']);
  assert.ok(TOOL_SCHEMAS.find(t => t.function.name === 'find_tickets'));
});

test('system prompt: ticket changes go through a card and Confirm', () => {
  const p = buildSystemPrompt({ name: 'A', role: 'admin', today: '2026-10-03' });
  assert.match(p, /find_tickets/);
  assert.match(p, /prepare_ticket_action/);
  assert.match(p, /Confirm/);
  assert.match(p, /suggestion/);
});

test('follow-up and FMS tools: schemas and prompt rules', () => {
  assert.equal(TOOL_SCHEMAS.length, 11);
  const fu = TOOL_SCHEMAS.find(t => t.function.name === 'prepare_followup_form').function.parameters;
  assert.ok(fu.properties.contact_person);
  const fms = TOOL_SCHEMAS.find(t => t.function.name === 'prepare_fms_done').function.parameters;
  assert.deepEqual(fms.required, ['party', 'codes']);
  assert.equal(fms.properties.codes.type, 'array');
  assert.deepEqual(fms.properties.codes.items.enum, ['FMS-1', 'FMS-2', 'FMS-3', 'FMS-4']);
  const p = buildSystemPrompt({ name: 'A', role: 'user', today: '2026-10-03' });
  assert.match(p, /prepare_fms_done/);
  assert.match(p, /Promise to Pay[^\n]*Confirm/);
  assert.doesNotMatch(p, /\(promise, payment, complaint\)[^\n]*Open form/);
});
