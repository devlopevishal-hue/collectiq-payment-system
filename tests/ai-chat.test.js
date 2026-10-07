const test = require('node:test');
const assert = require('node:assert/strict');
const { renderMessageHtml, runAgentTurn, renderTicketCard, runCardAction } = require('../ai-chat.js');

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

test('renderMessageHtml renders a markdown table safely', () => {
  const html = renderMessageHtml('Top:\n| # | Party | Due |\n|---|---|---|\n| 1 | JGG | ₹71,16,538 |\n| 2 | <i>ASY</i> | ₹11,04,458 |\nBas.', escapeHtml);
  assert.match(html, /<table class="ai-table">/);
  assert.match(html, /<th>Party<\/th>/);
  assert.match(html, /<td>JGG<\/td>/);
  assert.match(html, /<td>&lt;i&gt;ASY&lt;\/i&gt;<\/td>/);
  assert.doesNotMatch(html, /\|---/);
  assert.match(html, /Bas\./);
});

const ticketAction = {
  type: 'ticket', op: 'create',
  payload: { markaId: 'a', markaName: 'JGG', assignedHelper: 'Saurav Bhai', priority: 'High', subject: '<b>Visit</b>', remark: '' },
  preview: { title: '🎫 New ticket', rows: [['Marka', 'JGG (BABLU SHERA MASTER)'], ['Subject', '<b>Visit</b>']] }
};

test('renderTicketCard: escapes text and shows three buttons while pending', () => {
  const html = renderTicketCard(ticketAction, 'pending', '3:0', escapeHtml);
  assert.ok(!html.includes('<b>Visit</b>'));
  assert.ok(html.includes('&lt;b&gt;Visit&lt;/b&gt;'));
  assert.ok(html.includes('🎫 New ticket'));
  assert.ok(html.includes('JGG (BABLU SHERA MASTER)'));
  for (const attr of ['data-ticket-confirm', 'data-ticket-edit', 'data-ticket-cancel']) assert.ok(html.includes(attr), attr);
  assert.ok(html.includes('data-card="3:0"'));
});

test('renderTicketCard: saved, cancelled, edited and error cards have no buttons', () => {
  const saved = renderTicketCard(ticketAction, 'saved', '1:0', escapeHtml);
  assert.ok(saved.includes('✓ Saved'));
  assert.ok(!saved.includes('data-ticket-confirm'));
  assert.ok(renderTicketCard(ticketAction, 'cancelled', '1:0', escapeHtml).includes('Cancelled'));
  assert.ok(!renderTicketCard(ticketAction, 'edited', '1:0', escapeHtml).includes('data-ticket-confirm'));
  const err = renderTicketCard(ticketAction, 'error', '1:0', escapeHtml, 'Ticket <already> resolved.');
  assert.ok(err.includes('Ticket &lt;already&gt; resolved.'));
  assert.ok(!err.includes('data-ticket-edit'));
});

test('runCardAction: only a pending card runs, and only once', () => {
  let calls = 0;
  const saved = { action: ticketAction, status: 'saved' };
  assert.equal(runCardAction(saved, () => { calls++; return {}; }), saved);
  assert.equal(calls, 0);
  assert.deepEqual(runCardAction({ action: ticketAction, status: 'pending' }, () => { calls++; return {}; }), { status: 'saved' });
  assert.equal(calls, 1);
});

test('runCardAction: executor errors and exceptions become an error status', () => {
  const card = () => ({ action: ticketAction, status: 'pending' });
  assert.deepEqual(runCardAction(card(), () => ({ error: 'Ticket already resolved.' })), { status: 'error', error: 'Ticket already resolved.' });
  assert.deepEqual(runCardAction(card(), () => { throw new Error('boom'); }), { status: 'error', error: 'boom' });
});

test('renderTicketCard also renders follow-up and FMS cards', () => {
  const followup = {
    type: 'followup', op: 'ptp', payload: {},
    preview: { title: '📞 Follow-up update', rows: [['Marka', 'JGG (BABLU SHERA MASTER)'], ['Remark', '<script>x</script>']] }
  };
  const fu = renderTicketCard(followup, 'pending', '2:0', escapeHtml);
  assert.ok(fu.includes('📞 Follow-up update'));
  assert.ok(fu.includes('&lt;script&gt;x&lt;/script&gt;'));
  assert.ok(!fu.includes('<script>'));
  assert.ok(fu.includes('data-ticket-confirm'));
  const fms = { type: 'fms', op: 'done', payload: {}, preview: { title: '✅ FMS done', rows: [['FMS-1', 'Update Payment — planned 2026-09-03 → 0.5 pt (late)']] } };
  const saved = renderTicketCard(fms, 'saved', '2:1', escapeHtml);
  assert.ok(saved.includes('✅ FMS done'));
  assert.ok(saved.includes('✓ Saved'));
  assert.ok(!saved.includes('data-ticket-confirm'));
});

test('renderTicketCard: payment card shows the big amount and how much of the balance it clears', () => {
  const action = {
    type: 'followup', op: 'payment', payload: { payRupees: 30000 },
    preview: { title: '💰 Payment received', rows: [['Amount', '₹30,000'], ['Balance after', '₹70,000']] }
  };
  const html = renderTicketCard(action, 'pending', '1:0', escapeHtml);
  assert.ok(html.includes('kind-payment'));
  assert.ok(html.includes('data-amount="30000"'));
  assert.ok(html.includes('₹30,000'));
  assert.ok(html.includes('--pct:30%'));
  const saved = renderTicketCard(action, 'saved', '1:0', escapeHtml);
  assert.ok(saved.includes('ai-card-stamp'));
  assert.ok(!renderTicketCard(action, 'pending', '1:0', escapeHtml).includes('ai-card-stamp'));
});

test('renderTicketCard: each action kind gets its own class', () => {
  const kinds = [
    [{ type: 'followup', op: 'ptp' }, 'kind-ptp'], [{ type: 'followup', op: 'complaint' }, 'kind-complaint'],
    [{ type: 'fms', op: 'done' }, 'kind-fms'], [{ type: 'ticket', op: 'create' }, 'kind-ticket']
  ];
  for (const [a, cls] of kinds) {
    assert.ok(renderTicketCard({ ...a, payload: {}, preview: { title: 'x', rows: [] } }, 'pending', '0:0', escapeHtml).includes(cls), cls);
  }
});
