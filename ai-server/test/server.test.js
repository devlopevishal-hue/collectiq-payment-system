const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server.js');

const OK_ORIGIN = 'https://devlopevishal-hue.github.io';
const KEYS = { ZAI_API_KEY: 'z', GROQ_API_KEY: 'g' };

function providerFetch(seen = []) {
  return async (url, opts) => {
    seen.push(JSON.parse(opts.body));
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', content: 'theek hai' } }] }) };
  };
}

async function start(opts) {
  const server = createServer(opts);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise(r => server.close(r)) };
}

function chat(base, body, headers = {}) {
  return fetch(base + '/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: OK_ORIGIN, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}

const BODY = { messages: [{ role: 'user', content: 'aaj kisko call karun?' }], user: { name: 'Surendra', role: 'user' }, today: '2026-10-02' };

test('health reports whether keys are configured', async () => {
  const s = await start({ env: KEYS, fetchImpl: providerFetch() });
  assert.deepEqual(await (await fetch(s.base + '/health')).json(), { ok: true, configured: true });
  await s.close();
  const s2 = await start({ env: {}, fetchImpl: providerFetch() });
  assert.equal((await (await fetch(s2.base + '/health')).json()).configured, false);
  await s2.close();
});

test('preflight from our site is allowed, from another site is refused', async () => {
  const s = await start({ env: KEYS, fetchImpl: providerFetch() });
  const ok = await fetch(s.base + '/chat', { method: 'OPTIONS', headers: { Origin: OK_ORIGIN } });
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), OK_ORIGIN);
  const bad = await fetch(s.base + '/chat', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
  assert.equal(bad.status, 403);
  await s.close();
});

test('chat from another site or without Origin is refused', async () => {
  const s = await start({ env: KEYS, fetchImpl: providerFetch() });
  assert.equal((await chat(s.base, BODY, { Origin: 'https://evil.example' })).status, 403);
  const noOrigin = await fetch(s.base + '/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(BODY) });
  assert.equal(noOrigin.status, 403);
  await s.close();
});

test('chat forwards system prompt + last 12 messages and returns the reply', async () => {
  const seen = [];
  const s = await start({ env: KEYS, fetchImpl: providerFetch(seen) });
  const messages = Array.from({ length: 14 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'm' + i }));
  const res = await chat(s.base, { ...BODY, messages });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { message: { role: 'assistant', content: 'theek hai' }, provider: 'glm' });
  const sent = seen[0].messages;
  assert.equal(sent[0].role, 'system');
  assert.match(sent[0].content, /Surendra/);
  assert.deepEqual(sent.slice(1).map(m => m.content), messages.slice(2).map(m => m.content));
  assert.equal(seen[0].tools.length, 11);
  await s.close();
});

test('history never starts with an orphan tool or assistant message', async () => {
  const seen = [];
  const s = await start({ env: KEYS, fetchImpl: providerFetch(seen) });
  const messages = [
    { role: 'user', content: 'q1' },
    { role: 'assistant', content: null, tool_calls: [{ id: 't1', type: 'function', function: { name: 'get_broken_ptps', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 't1', content: '{}' },
    ...Array.from({ length: 11 }, (_, i) => ({ role: i % 2 ? 'user' : 'assistant', content: 'x' + i }))
  ];
  await chat(s.base, { ...BODY, messages });
  assert.equal(seen[0].messages[1].role, 'user');
  await s.close();
});

test('allowTools false sends no tools', async () => {
  const seen = [];
  const s = await start({ env: KEYS, fetchImpl: providerFetch(seen) });
  await chat(s.base, { ...BODY, allowTools: false });
  assert.equal(seen[0].tools, undefined);
  await s.close();
});

test('31st request from one IP within 10 minutes is rate limited', async () => {
  const s = await start({ env: KEYS, fetchImpl: providerFetch(), now: () => 1000 });
  for (let i = 0; i < 30; i++) assert.equal((await chat(s.base, BODY)).status, 200);
  const res = await chat(s.base, BODY);
  assert.equal(res.status, 429);
  assert.equal((await res.json()).error, 'rate_limited');
  await s.close();
});

test('oversized and malformed bodies are rejected', async () => {
  const s = await start({ env: KEYS, fetchImpl: providerFetch() });
  assert.equal((await chat(s.base, 'x'.repeat(200 * 1024 + 1))).status, 413);
  assert.equal((await chat(s.base, '{not json')).status, 400);
  assert.equal((await chat(s.base, { user: {} })).status, 400);
  await s.close();
});

test('no keys gives not_configured, provider failure gives busy', async () => {
  const s = await start({ env: {}, fetchImpl: providerFetch() });
  const r1 = await chat(s.base, BODY);
  assert.equal(r1.status, 503);
  assert.equal((await r1.json()).error, 'not_configured');
  await s.close();
  const failing = async () => ({ ok: false, status: 500, json: async () => ({}) });
  const s2 = await start({ env: KEYS, fetchImpl: failing });
  const r2 = await chat(s2.base, BODY);
  assert.equal(r2.status, 503);
  assert.equal((await r2.json()).error, 'busy');
  await s2.close();
});
