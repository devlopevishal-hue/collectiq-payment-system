const test = require('node:test');
const assert = require('node:assert/strict');
const { callWithFallback } = require('../providers.js');

const KEYS = { ZAI_API_KEY: 'zai-key', GROQ_API_KEY: 'groq-key' };
const MSGS = [{ role: 'user', content: 'hi' }];

function reply(message, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => ({ choices: [{ message }] }), text: async () => '' };
}

function fakeFetch(handlers) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts, body: JSON.parse(opts.body) });
    const which = url.includes('z.ai') ? 'glm' : 'groq';
    return handlers[which](opts);
  };
  fn.calls = calls;
  return fn;
}

test('GLM answers first with the right model, tools and key', async () => {
  const f = fakeFetch({ glm: () => reply({ role: 'assistant', content: 'namaste' }), groq: () => { throw new Error('should not call'); } });
  const r = await callWithFallback({ messages: MSGS, tools: [{ type: 'function', function: { name: 'x', parameters: { type: 'object' } } }], env: KEYS, fetchImpl: f });
  assert.equal(r.provider, 'glm');
  assert.equal(r.message.content, 'namaste');
  assert.equal(f.calls[0].url, 'https://api.z.ai/api/paas/v4/chat/completions');
  assert.equal(f.calls[0].body.model, 'glm-4.7-flash');
  assert.equal(f.calls[0].body.tool_choice, 'auto');
  assert.equal(f.calls[0].opts.headers.Authorization, 'Bearer zai-key');
});

test('GLM 429 falls back to Groq', async () => {
  const f = fakeFetch({ glm: () => reply({}, 429), groq: () => reply({ role: 'assistant', content: 'groq here' }) });
  const r = await callWithFallback({ messages: MSGS, tools: [], env: KEYS, fetchImpl: f });
  assert.equal(r.provider, 'groq');
  assert.equal(f.calls[1].url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(f.calls[1].body.model, 'openai/gpt-oss-120b');
  assert.equal(f.calls[1].body.tools, undefined);
});

test('GLM timeout falls back to Groq', async () => {
  const hang = opts => new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const f = fakeFetch({ glm: hang, groq: () => reply({ role: 'assistant', content: 'late but here' }) });
  const r = await callWithFallback({ messages: MSGS, tools: [], env: KEYS, fetchImpl: f, timeoutMs: 50 });
  assert.equal(r.provider, 'groq');
});

test('GLM malformed tool-call JSON falls back to Groq', async () => {
  const bad = { role: 'assistant', content: null, tool_calls: [{ id: 't1', type: 'function', function: { name: 'x', arguments: '{oops' } }] };
  const f = fakeFetch({ glm: () => reply(bad), groq: () => reply({ role: 'assistant', content: 'ok' }) });
  assert.equal((await callWithFallback({ messages: MSGS, tools: [], env: KEYS, fetchImpl: f })).provider, 'groq');
});

test('valid tool calls are returned as-is', async () => {
  const good = { role: 'assistant', content: null, tool_calls: [{ id: 't1', type: 'function', function: { name: 'get_party_details', arguments: '{"name":"JGG"}' } }] };
  const f = fakeFetch({ glm: () => reply(good), groq: () => reply({}) });
  const r = await callWithFallback({ messages: MSGS, tools: [], env: KEYS, fetchImpl: f });
  assert.equal(r.message.tool_calls[0].function.name, 'get_party_details');
});

test('only a Groq key: GLM is skipped', async () => {
  const f = fakeFetch({ glm: () => { throw new Error('should not call'); }, groq: () => reply({ role: 'assistant', content: 'g' }) });
  const r = await callWithFallback({ messages: MSGS, tools: [], env: { GROQ_API_KEY: 'g' }, fetchImpl: f });
  assert.equal(r.provider, 'groq');
  assert.equal(f.calls.length, 1);
});

test('both providers failing rejects with ALL_FAILED', async () => {
  const f = fakeFetch({ glm: () => reply({}, 500), groq: () => reply({}, 503) });
  await assert.rejects(callWithFallback({ messages: MSGS, tools: [], env: KEYS, fetchImpl: f }), err => err.code === 'ALL_FAILED');
});

test('no keys rejects with NOT_CONFIGURED', async () => {
  await assert.rejects(callWithFallback({ messages: MSGS, tools: [], env: {}, fetchImpl: async () => reply({}) }), err => err.code === 'NOT_CONFIGURED');
});

test('custom model names come from env', async () => {
  const f = fakeFetch({ glm: () => reply({ role: 'assistant', content: 'x' }), groq: () => reply({}) });
  await callWithFallback({ messages: MSGS, tools: [], env: { ...KEYS, GLM_MODEL: 'glm-4.5-flash' }, fetchImpl: f });
  assert.equal(f.calls[0].body.model, 'glm-4.5-flash');
});
