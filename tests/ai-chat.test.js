const test = require('node:test');
const assert = require('node:assert/strict');
const { renderMessageHtml, runAgentTurn } = require('../ai-chat.js');

// Same implementation as escapeHtml in app.js.
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

test('renderMessageHtml escapes HTML before formatting', () => {
  const html = renderMessageHtml('<img src=x onerror=alert(1)> **ok**', escapeHtml);
  assert.match(html, /&lt;img/);
  assert.match(html, /<b>ok<\/b>/);
  assert.doesNotMatch(html, /<img/);
});

test('renderMessageHtml turns dash lines into a list and keeps line breaks', () => {
  const html = renderMessageHtml('Aaj ki list:\n- JGG\n- MAU\nBas.', escapeHtml);
  assert.match(html, /<ul><li>JGG<\/li><li>MAU<\/li><\/ul>/);
  assert.match(html, /Aaj ki list:/);
  assert.match(html, /Bas\./);
});

test('renderMessageHtml renders a draft block as a copyable card', () => {
  const html = renderMessageHtml('Ye lo:\n```draft\nNamaste ji, <b>₹50,000</b> baaki hai.\n```\nDhanyavaad', escapeHtml);
  assert.match(html, /class="ai-draft"/);
  assert.match(html, /data-copy/);
  assert.match(html, /Namaste ji, &lt;b&gt;₹50,000&lt;\/b&gt; baaki hai\./);
  assert.match(html, /Dhanyavaad/);
});

function toolCall(id, name, args) {
  return { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] };
}

test('runAgentTurn runs a requested tool and returns the final answer', async () => {
  const replies = [toolCall('c1', 'get_party_details', { name: 'JGG' }), { role: 'assistant', content: 'JGG ka ₹70,000 baaki hai.' }];
  const sent = [];
  const ran = [];
  const out = await runAgentTurn({
    messages: [{ role: 'user', content: 'JGG ka haal?' }],
    postChat: async (messages, opts) => { sent.push({ messages: messages.slice(), opts }); return { message: replies.shift(), provider: 'glm' }; },
    runTool: (name, args) => { ran.push([name, args]); return { marka: 'JGG', outstanding: 70000 }; }
  });
  assert.deepEqual(ran, [['get_party_details', '{"name":"JGG"}']]);
  assert.equal(out.finalText, 'JGG ka ₹70,000 baaki hai.');
  assert.equal(out.provider, 'glm');
  const toolMsg = sent[1].messages.find(m => m.role === 'tool');
  assert.equal(toolMsg.tool_call_id, 'c1');
  assert.deepEqual(JSON.parse(toolMsg.content), { marka: 'JGG', outstanding: 70000 });
});

test('runAgentTurn collects follow-up form actions', async () => {
  const action = { type: 'open_followup', markaId: 'a', marka: 'JGG', fields: {} };
  const replies = [toolCall('c1', 'prepare_followup_form', { party: 'JGG', status: 'Promise to Pay' }), { role: 'assistant', content: 'Form kholo dabaiye.' }];
  const out = await runAgentTurn({
    messages: [{ role: 'user', content: 'JGG ne 10 ko bola' }],
    postChat: async () => ({ message: replies.shift(), provider: 'groq' }),
    runTool: () => ({ ok: true, action })
  });
  assert.deepEqual(out.actions, [action]);
});

test('runAgentTurn stops after 5 tool rounds and asks for a final answer without tools', async () => {
  const opts = [];
  let n = 0;
  const out = await runAgentTurn({
    messages: [{ role: 'user', content: 'loop' }],
    postChat: async (messages, o) => {
      opts.push(o);
      n++;
      return { message: o.allowTools ? toolCall('c' + n, 'get_broken_ptps', {}) : { role: 'assistant', content: 'final' }, provider: 'glm' };
    },
    runTool: () => ({ rows: [] })
  });
  assert.equal(opts.length, 6);
  assert.deepEqual(opts.map(o => o.allowTools), [true, true, true, true, true, false]);
  assert.equal(out.finalText, 'final');
});
