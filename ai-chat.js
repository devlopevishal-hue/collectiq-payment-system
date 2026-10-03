// CollectIQ AI Assistant page.
// Pure helpers (renderMessageHtml, runAgentTurn) are exported for Node tests;
// everything else runs only in the browser after app.js and ai-tools.js.
(function (root) {
  const MAX_ROUNDS = 5;

  // ---------- Pure helpers ----------

  function formatText(segment, esc) {
    const lines = esc(segment).split('\n');
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    let html = '';
    let inList = false;
    let pendingBreak = false;
    let table = null;
    const cells = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
    const flushTable = () => {
      if (!table) return;
      const [head, ...body] = table;
      html += '<table class="ai-table"><thead><tr>' + head.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>' +
        body.map(r => '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>').join('') + '</tbody></table>';
      table = null;
      pendingBreak = false;
    };
    lines.forEach(raw => {
      const line = raw.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      if (/^\s*\|.*\|\s*$/.test(line)) {
        if (inList) { html += '</ul>'; inList = false; }
        if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) return; // separator row
        (table || (table = [])).push(cells(line));
        return;
      }
      flushTable();
      const item = line.match(/^\s*[-*•]\s+(.*)$/);
      if (item) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += `<li>${item[1]}</li>`;
        pendingBreak = false;
        return;
      }
      if (inList) { html += '</ul>'; inList = false; pendingBreak = false; }
      if (pendingBreak) html += '<br>';
      html += line;
      pendingBreak = true;
    });
    flushTable();
    if (inList) html += '</ul>';
    return html;
  }

  function draftHtml(segment, esc) {
    return '<div class="ai-draft"><div class="ai-draft-label">WhatsApp draft</div>' +
      `<pre class="ai-draft-text">${esc(segment.trim())}</pre>` +
      '<button type="button" class="ai-copy-btn" data-copy>📋 Copy</button></div>';
  }

  function renderMessageHtml(text, esc) {
    const parts = String(text || '').split(/```draft[^\n]*\n?([\s\S]*?)```/);
    return parts.map((p, i) => (i % 2 ? draftHtml(p, esc) : formatText(p, esc))).join('');
  }

  // One user turn: ask the model, run requested tools locally, repeat.
  async function runAgentTurn({ messages, postChat, runTool, maxRounds = MAX_ROUNDS }) {
    const msgs = messages.slice();
    const actions = [];
    let provider = '';
    for (let round = 0; round < maxRounds; round++) {
      const reply = await postChat(msgs, { allowTools: true });
      provider = reply.provider || provider;
      const msg = reply.message;
      msgs.push(msg);
      if (!msg.tool_calls || !msg.tool_calls.length) {
        return { messages: msgs, finalText: msg.content || '', actions, provider };
      }
      msg.tool_calls.forEach(call => {
        const result = runTool(call.function.name, call.function.arguments);
        if (result && result.ok && result.action) actions.push(result.action);
        msgs.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      });
    }
    const last = await postChat(msgs, { allowTools: false });
    msgs.push(last.message);
    return { messages: msgs, finalText: last.message.content || '', actions, provider: last.provider || provider };
  }

  const CARD_STATUS_TEXT = { saved: '✓ Saved', cancelled: 'Cancelled', edited: '✏️ Opened in the form' };

  // A help-ticket change proposed by the AI. Nothing is saved until Confirm.
  function renderTicketCard(action, status, index, esc, error) {
    const preview = action.preview || {};
    const rows = (preview.rows || []).map(([label, value]) =>
      `<tr><th>${esc(String(label))}</th><td>${esc(String(value))}</td></tr>`).join('');
    const footer = status === 'pending'
      ? `<div class="ai-ticket-buttons">
          <button type="button" class="ai-ticket-confirm" data-ticket-confirm data-card="${esc(String(index))}">✓ Confirm</button>
          <button type="button" class="ai-ticket-edit" data-ticket-edit data-card="${esc(String(index))}">✏️ Edit in form</button>
          <button type="button" class="ai-ticket-cancel" data-ticket-cancel data-card="${esc(String(index))}">✗ Cancel</button>
        </div>`
      : `<div class="ai-ticket-status">${status === 'error' ? '⚠️ ' + esc(String(error || 'Could not save.')) : (CARD_STATUS_TEXT[status] || '')}</div>`;
    return `<div class="ai-ticket-card ${esc(String(status))}"><div class="ai-ticket-title">${esc(String(preview.title || 'Help ticket'))}</div>` +
      `<table class="ai-ticket-rows">${rows}</table>${footer}</div>`;
  }

  // Runs a pending card once; any other card is returned unchanged.
  function runCardAction(card, execute) {
    if (!card || card.status !== 'pending') return card;
    let result;
    try {
      result = execute(card.action) || {};
    } catch (e) {
      result = { error: e && e.message ? e.message : String(e) };
    }
    return result.error ? { status: 'error', error: result.error } : { status: 'saved' };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { renderMessageHtml, runAgentTurn, renderTicketCard, runCardAction };
    return;
  }

  // ---------- Browser ----------

  // Render service that holds the API keys. A developer can point a browser at a
  // local ai-server by setting localStorage 'collectiq_ai_server_url'.
  const AI_SERVER_URL_PROD = 'https://collectiq-ai.onrender.com';
  const AI_SERVER_URL = (function () {
    try { return localStorage.getItem('collectiq_ai_server_url') || AI_SERVER_URL_PROD; } catch (e) { return AI_SERVER_URL_PROD; }
  })();
  const REQUEST_TIMEOUT_MS = 70000;
  const MAX_CHATS = 30;
  const MAX_STORED_MESSAGES = 40;

  const ERRORS = {
    busy: 'The AI is busy right now. Please try again in a moment.',
    not_configured: 'The AI keys are not set on the server yet. Admin: add the API keys in Render.',
    rate_limited: 'Too many questions at once. Please try again in 10 minutes.',
    offline: 'Cannot reach the AI server. Check your internet or try again shortly.',
    no_server: 'The AI server is not set up yet. Please contact the admin.'
  };

  const CHIPS = ['Who should I call today?', 'Show broken PTPs', "What's my score?", 'Party status: '];

  const state = { chats: [], currentId: null, status: 'idle', busy: false, mounted: false, showList: false };

  function user() {
    return (typeof currentUser !== 'undefined' && currentUser) || { email: 'guest', role: 'user', followperName: '' };
  }

  function storageKey() {
    return 'collectiq_ai_chats_v1:' + (user().email || 'guest');
  }

  function loadChats() {
    try {
      const raw = localStorage.getItem(storageKey());
      state.chats = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(state.chats)) state.chats = [];
    } catch (e) {
      state.chats = [];
    }
  }

  function saveChats() {
    try {
      state.chats.sort((a, b) => b.updatedAt - a.updatedAt);
      state.chats = state.chats.slice(0, MAX_CHATS);
      state.chats.forEach(c => { c.messages = c.messages.slice(-MAX_STORED_MESSAGES); });
      localStorage.setItem(storageKey(), JSON.stringify(state.chats));
    } catch (e) { /* storage full or blocked: chat still works for this session */ }
  }

  function currentChat() {
    return state.chats.find(c => c.id === state.currentId) || null;
  }

  function newChat() {
    const chat = { id: 'c' + Date.now().toString(36), title: 'New chat', updatedAt: Date.now(), messages: [], display: [] };
    state.chats.unshift(chat);
    state.currentId = chat.id;
    return chat;
  }

  function buildCtx() {
    return {
      markas, payments, helpTickets,
      assignees: getAllAssigneesList(),
      followpers: allFollowpers(),
      user: user(),
      today: iso(today),
      h: { ownerOf, crrOf, totalOutstanding, alreadyDueAmount, oldestDueDate, isLocked, getFmsTasks }
    };
  }

  async function request(path, options = {}) {
    if (!AI_SERVER_URL) throw Object.assign(new Error('no server'), { code: 'no_server' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(AI_SERVER_URL + path, { ...options, signal: controller.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.error || 'error'), { code: data.error || 'busy' });
      return data;
    } catch (e) {
      if (e.code) throw e;
      throw Object.assign(e, { code: 'offline' });
    } finally {
      clearTimeout(timer);
    }
  }

  function postChat(messages, opts) {
    const u = user();
    return request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        user: { name: u.followperName && u.followperName !== 'all' ? u.followperName : u.email, role: u.role },
        today: iso(today),
        allowTools: opts.allowTools !== false
      })
    });
  }

  async function wakeUp() {
    setStatus('waking');
    try {
      const h = await request('/health');
      setStatus(h.configured ? 'ready' : 'not_configured');
    } catch (e) {
      setStatus(e.code === 'no_server' ? 'no_server' : 'offline');
    }
  }

  const STATUS_TEXT = {
    idle: ['', ''], waking: ['waking', 'Waking up AI…'], ready: ['ready', 'Ready'],
    busy: ['busy', 'Thinking…'], offline: ['down', 'Offline'],
    not_configured: ['down', 'Setup pending'], no_server: ['down', 'No server']
  };

  function setStatus(s) {
    state.status = s;
    const el = document.getElementById('aiStatus');
    if (!el) return;
    const [cls, text] = STATUS_TEXT[s] || STATUS_TEXT.idle;
    el.className = 'ai-status ' + cls;
    el.textContent = text;
  }

  // ---------- Rendering ----------

  function shell() {
    return `
      <div class="ai-shell ${state.showList ? 'show-list' : ''}">
        <aside class="ai-sidebar">
          <button type="button" class="ai-new-btn" data-new>＋ New chat</button>
          <div class="ai-chat-list" id="aiChatList"></div>
        </aside>
        <div class="ai-main">
          <div class="ai-header">
            <div class="ai-title">
              <button type="button" class="ai-list-toggle" data-toggle-list title="Past chats">☰</button>
              <span class="ai-logo">🤖</span>
              <div><b>CollectIQ AI Assistant</b><small>Answers from your collection data</small></div>
            </div>
            <div class="ai-header-actions">
              <span id="aiStatus" class="ai-status"></span>
              <button type="button" class="ai-summary-btn" data-summary>☀️ Morning summary</button>
            </div>
          </div>
          <div class="ai-messages" id="aiMessages"></div>
          <form class="ai-input" id="aiForm">
            <textarea id="aiInput" rows="1" placeholder="Ask a question… (e.g. How is JGG doing?)"></textarea>
            <button type="submit" class="ai-send" id="aiSend" title="Send">➤</button>
          </form>
        </div>
      </div>`;
  }

  function renderList() {
    const el = document.getElementById('aiChatList');
    if (!el) return;
    el.innerHTML = state.chats.length ? state.chats.map(c => `
      <button type="button" class="ai-chat-item ${c.id === state.currentId ? 'active' : ''}" data-open="${escapeHtml(c.id)}">
        ${escapeHtml(c.title)}<small>${new Date(c.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</small>
      </button>`).join('') : '<p class="ai-empty-list">No chats yet.</p>';
  }

  function renderMessages() {
    const el = document.getElementById('aiMessages');
    if (!el) return;
    const chat = currentChat();
    if (!chat || !chat.display.length) {
      const name = user().followperName && user().followperName !== 'all' ? user().followperName : '';
      el.innerHTML = `
        <div class="ai-welcome">
          <div class="ai-welcome-icon">🤖</div>
          <h3>Hello${name ? ' ' + escapeHtml(name) : ''}!</h3>
          <p>Ask me about your parties, bills, follow-ups and payments. I can also draft WhatsApp reminders and prepare follow-ups, FMS milestones and help tickets for you to confirm.</p>
          <div class="ai-chips">${CHIPS.map(c => `<button type="button" class="ai-chip" data-chip="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}</div>
        </div>`;
      return;
    }
    el.innerHTML = chat.display.map((d, i) => {
      if (d.role === 'user') return `<div class="ai-msg user"><div class="ai-bubble">${escapeHtml(d.text).replace(/\n/g, '<br>')}</div></div>`;
      const actions = (d.actions || []).map((a, j) =>
        `<button type="button" class="ai-action-btn" data-action="${i}:${j}">📝 Open form: ${escapeHtml(a.marka)}</button>`).join('');
      const cards = (d.cards || []).map((c, j) => renderTicketCard(c.action, c.status, `${i}:${j}`, escapeHtml, c.error)).join('');
      return `
        <div class="ai-msg bot ${d.error ? 'error' : ''}">
          <div class="ai-bubble">${renderMessageHtml(d.text, escapeHtml)}${actions ? `<div class="ai-actions">${actions}</div>` : ''}${cards}</div>
          ${d.error ? '' : `<div class="ai-meta"><button type="button" class="ai-copy-msg" data-copy-msg="${i}">📋 Copy</button>${d.provider ? `<span>${d.provider === 'glm' ? 'GLM' : 'Groq'}</span>` : ''}</div>`}
        </div>`;
    }).join('') + (state.busy ? '<div class="ai-msg bot"><div class="ai-bubble ai-typing"><span></span><span></span><span></span></div></div>' : '');
    el.scrollTop = el.scrollHeight;
  }

  function renderAllAI() {
    renderList();
    renderMessages();
    const send = document.getElementById('aiSend');
    if (send) send.disabled = state.busy;
  }

  // ---------- Actions ----------

  function copyText(text) {
    const done = () => toast('✓ Copied');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('Could not copy'); }
    ta.remove();
  }

  function openFormAction(action) {
    const m = (markas || []).find(x => String(x.id) === String(action.markaId));
    if (!m) return toast('Party not found: ' + action.marka);
    openFollowup(m.id);
    const f = action.fields || {};
    const set = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined && v !== null && v !== '') el.value = v; };
    set('contactMode', f.contactMode);
    set('actionStatus', f.actionStatus);
    toggleConditionalFields();
    set('expected', f.expected || '');
    set('promiseDate', f.promiseDate);
    set('nextDate', f.nextDate);
    set('remark', f.remark);
    toast('Form filled in. Please check it and press Save.');
  }

  function actorName() {
    const u = user();
    return u.followperName && u.followperName !== 'all' ? u.followperName : u.email;
  }

  // Confirm: re-checks against current data, then saves like the ticket forms do.
  function executeTicket(action) {
    const p = action.payload || {};
    const by = actorName();
    const date = iso(today);
    if (!helpTickets) helpTickets = [];
    const store = { helpTickets, markas };
    let r;
    if (action.op === 'create') {
      r = TicketActions.createTicket(store, { ...p, date, requestedBy: by, now: Date.now() });
    } else if (action.op === 'progress') {
      r = TicketActions.progressTicket(store, p.ticketId, { date, by, note: p.note, nextDate: p.nextDate });
    } else if (action.op === 'done') {
      r = TicketActions.completeTicket(store, p.ticketId, { date, by, resolutionType: p.resolutionType, note: p.note, now: Date.now() });
    } else if (action.op === 'reassign') {
      if (!TicketActions.canReassign(user())) return { error: 'Only an admin or superuser can reassign tickets.' };
      r = TicketActions.reassignTicket(store, p.ticketId, { newHelper: p.newHelper, note: p.note, by, date });
    } else {
      return { error: 'Unknown ticket action.' };
    }
    if (r.error) return r;
    persistTicketChange({ ticket: r.ticket, marka: r.marka, op: action.op }).catch(e => console.warn('Ticket sync error:', e));
    return {};
  }

  function editTicket(action) {
    const p = action.payload || {};
    const set = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
    if (action.op === 'create') {
      openHelpTicketModal(p.markaId || '');
      set('htAssignedHelper', p.assignedHelper);
      set('htPriority', p.priority);
      set('htSubject', p.subject);
      set('htRemark', p.remark);
    } else if (action.op === 'progress' || action.op === 'done') {
      openResolveTicketModal(p.ticketId);
      if (!document.getElementById('resolveTicketModal').classList.contains('open')) return false;
      switchTicketActionMode(action.op);
      set('resolveTicketNote', p.note);
      set('resolveTicketNextDate', p.nextDate);
      set('resolveTicketActionType', p.resolutionType);
    } else if (action.op === 'reassign') {
      openReassignTicketModal(p.ticketId);
      if (!document.getElementById('reassignTicketModal').classList.contains('open')) return false;
      set('reassignNewHelper', p.newHelper);
      set('reassignNote', p.note);
    }
    toast('Form filled in. Please check it and press Save.');
    return true;
  }

  // Confirm on a Promise-to-Pay card: same write as the Update Follow-up form.
  function executeFollowup(action) {
    const p = action.payload || {};
    const m = (markas || []).find(x => String(x.id) === String(p.markaId));
    if (!m) return { error: 'Party not found.' };
    const todayIso = iso(today);
    const plus = n => iso(new Date(today.getTime() + n * 86400000));
    if (action.op === 'payment') {
      const ref = String(p.payRef || '').trim().toLowerCase();
      const date = p.date || todayIso;
      const dup = (payments || []).find(x => String(x.marka || '').toUpperCase() === String(m.marka).toUpperCase() &&
        (ref && ref !== 'n/a' ? String(x.ref || '').toLowerCase() === ref : Number(x.amount) === Number(p.payRupees) && x.date === date));
      if (dup) return { error: `This payment is already recorded (${dup.date}).` };
      const r = FollowupActions.applyPaymentFollowup(m, payments, {
        date, followper: p.followper, contactPerson: p.contactPerson, contactMode: p.contactMode, remark: p.remark,
        expected: m.expected || 0, promiseDate: m.ptp || '', nextDate: p.nextDate,
        payRef: p.payRef, payMode: p.payMode, payAmount: p.payRupees,
        payType: Number(p.payRupees) >= totalOutstanding(m) ? 'Full Payment' : 'Part Payment',
        ownerFallback: ownerOf(m), paymentFollowperFallback: actorName(),
        defaultNext: plus(2), newId: uid, money, now: Date.now()
      });
      if (r.error) return r;
      persistFollowupChange({ marka: m, payload: r.payload, payment: r.payment }).catch(e => console.warn('Payment sync error:', e));
      return {};
    }
    if (action.op === 'complaint') {
      const r = FollowupActions.applyComplaintFollowup(m, {
        date: todayIso, followper: p.followper, contactPerson: p.contactPerson, contactMode: p.contactMode, remark: p.remark,
        expected: m.expected || 0, promiseDate: m.ptp || '', nextDate: p.nextDate, claimNumber: p.claimNumber,
        escalateTo: p.escalateTo, billIds: [], minNext: plus(5), requireDetail: true,
        newEscId: () => 'e_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4)
      });
      if (r.error) return r;
      persistFollowupChange({ marka: m, payload: r.payload }).catch(e => console.warn('Follow-up sync error:', e));
      return {};
    }
    if (p.promiseDate < todayIso || p.nextDate < todayIso) return { error: 'The promise date has passed. Please ask again.' };
    const r = FollowupActions.applyPtpFollowup(m, {
      date: todayIso, followper: p.followper, contactPerson: p.contactPerson, contactMode: p.contactMode,
      expected: p.expectedRupees, promiseDate: p.promiseDate, nextDate: p.nextDate, remark: p.remark,
      ownerFallback: ownerOf(m)
    });
    if (r.error) return r;
    persistFollowupChange({ marka: m, payload: r.payload }).catch(e => console.warn('Follow-up sync error:', e));
    return {};
  }

  // Confirm on an FMS card: every milestone is re-checked before any is written.
  function executeFms(action) {
    const p = action.payload || {};
    const m = (markas || []).find(x => String(x.id) === String(p.markaId));
    if (!m) return { error: 'Party not found.' };
    const tasks = getFmsTasks(m);
    for (const code of p.codes || []) {
      const t = tasks.find(x => x.code === code);
      if (!t) return { error: `${code} is not available for ${m.marka} any more.` };
      if (t.isDone) return { error: `${code} was already marked done by ${t.completedBy || 'someone'}.` };
    }
    const baseDueDate = oldestDueDate(m);
    for (const code of p.codes || []) {
      const r = FollowupActions.completeFmsTask(m, code, { baseDueDate, actualDate: p.actualDate, completedBy: actorName(), remark: p.note, now: Date.now() });
      if (r.error) return r;
    }
    persistFollowupChange({ marka: m, payload: null }).catch(e => console.warn('FMS sync error:', e));
    return {};
  }

  function editAction(action) {
    const p = action.payload || {};
    const set = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
    if (action.type === 'ticket') return editTicket(action);
    if (action.type === 'followup') {
      openFollowup(p.markaId);
      if (!document.getElementById('followupModal').classList.contains('open')) return false;
      set('followper', p.followper);
      set('contactPerson', p.contactPerson);
      set('contactMode', p.contactMode);
      if (action.op === 'payment') {
        set('actionStatus', 'Payment Received');
        toggleConditionalFields();
        set('followPayType', p.payType);
        set('followPayMode', p.payMode);
        onFollowPayModeChange();
        set('followPayRef', p.payRef);
        set('followPayAmount', p.payRupees);
        set('followDate', p.date);
        updateFollowPayAllocations('amount');
      } else if (action.op === 'complaint') {
        set('actionStatus', 'WhatsApp Complaint / Claim Matter');
        toggleConditionalFields();
        set('claimNumber', p.claimNumber);
        set('escalateTo', p.escalateTo);
      } else {
        set('actionStatus', 'Promise to Pay');
        toggleConditionalFields();
        set('expected', p.expectedRupees);
        set('promiseDate', p.promiseDate);
      }
      set('nextDate', p.nextDate);
      set('remark', p.remark);
    } else if (action.type === 'fms') {
      openFmsModal(p.markaId, (p.codes || [])[0]);
      if (!document.getElementById('fmsModal').classList.contains('open')) return false;
      set('fmsActualDate', p.actualDate);
      set('fmsRemark', p.note);
      updateFmsScorePreview();
    }
    toast('Form filled in. Please check it and press Save.');
    return true;
  }

  const CARD_TYPES = ['ticket', 'followup', 'fms'];
  const EXECUTORS = { ticket: executeTicket, followup: executeFollowup, fms: executeFms };
  const SAVED_TEXT = { ticket: '✓ Ticket saved.', followup: '✓ Follow-up saved.', fms: '✓ FMS saved.' };

  function cardAt(ref) {
    const [i, j] = String(ref).split(':').map(Number);
    const chat = currentChat();
    const d = chat && chat.display[i];
    return d && d.cards ? d.cards[j] : null;
  }

  function onCardButton(t) {
    const chat = currentChat();
    const card = cardAt(t.dataset.card);
    if (!chat || !card || card.status !== 'pending') return;
    if (t.hasAttribute('data-ticket-confirm')) {
      const execute = EXECUTORS[card.action.type] || (() => ({ error: 'Unknown action.' }));
      Object.assign(card, runCardAction(card, execute));
      if (card.status === 'saved') {
        const note = card.action.op === 'payment' ? '✓ Payment saved.' : (SAVED_TEXT[card.action.type] || '✓ Saved.');
        chat.display.push({ role: 'bot', text: note });
        chat.messages.push({ role: 'assistant', content: note });
        try { renderAll(); } catch (e) { /* page views refresh on next visit */ }
      }
    } else if (t.hasAttribute('data-ticket-edit')) {
      if (editAction(card.action)) card.status = 'edited';
    } else if (t.hasAttribute('data-ticket-cancel')) {
      card.status = 'cancelled';
    }
    chat.updatedAt = Date.now();
    saveChats();
    renderAllAI();
  }

  function plainSummary(s) {
    const lines = [
      `**Summary for ${fmt(s.date)}**`,
      `- Follow-ups due today (incl. overdue): ${s.followupsToday}`,
      `- Broken PTPs: ${s.brokenPtps}`,
      `- Collected yesterday: ${money(s.collectedYesterday)}`,
      `- Collected today so far: ${money(s.collectedToday)}`,
      `- My open help tickets: ${s.openTicketsForMe}`
    ];
    if (s.pendingFms !== null) lines.push(`- Pending FMS milestones: ${s.pendingFms}`);
    if (s.top5.length) {
      lines.push('', '**Call these first:**');
      s.top5.forEach(r => lines.push(`- ${r.marka} (${r.master}) — due ${money(r.alreadyDue)}, total ${money(r.outstanding)}`));
    }
    return lines.join('\n');
  }

  async function ask(displayText, apiText, opts = {}) {
    if (state.busy) return;
    const chat = currentChat() || newChat();
    if (!chat.display.length) chat.title = displayText.slice(0, 40);
    chat.display.push({ role: 'user', text: displayText });
    chat.updatedAt = Date.now();
    state.busy = true;
    setStatus('busy');
    renderAllAI();

    const ctx = buildCtx();
    const history = chat.messages.concat({ role: 'user', content: apiText });
    try {
      let result;
      if (opts.noTools) {
        const reply = await postChat(history, { allowTools: false });
        result = { messages: history.concat(reply.message), finalText: reply.message.content || '', actions: [], provider: reply.provider };
      } else {
        result = await runAgentTurn({
          messages: history,
          postChat,
          runTool: (name, args) => CollectIQAITools.runTool(ctx, name, args)
        });
      }
      chat.messages = result.messages;
      chat.display.push({
        role: 'bot',
        text: result.finalText || 'Got an empty reply. Please ask again.',
        actions: result.actions.filter(a => !CARD_TYPES.includes(a.type)),
        cards: result.actions.filter(a => CARD_TYPES.includes(a.type)).map(a => ({ action: a, status: 'pending' })),
        provider: result.provider
      });
      setStatus('ready');
    } catch (e) {
      chat.messages = history.slice(0, -1);
      const fallback = opts.fallbackText ? '\n\n' + opts.fallbackText : '';
      chat.display.push({ role: 'bot', text: (ERRORS[e.code] || ERRORS.busy) + fallback, error: !fallback });
      setStatus(e.code === 'not_configured' || e.code === 'no_server' ? e.code : 'offline');
    } finally {
      state.busy = false;
      chat.updatedAt = Date.now();
      saveChats();
      renderAllAI();
    }
  }

  function askSummary() {
    const s = CollectIQAITools.computeMorningSummary(buildCtx());
    const apiText = 'Write my morning summary for today, short and professional, in English. Use only these numbers (computed by the system):\n' + JSON.stringify(CollectIQAITools.formatMoney(s));
    ask('☀️ Morning summary', apiText, { noTools: true, fallbackText: plainSummary(s) });
  }

  function bind(container) {
    container.addEventListener('click', e => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.hasAttribute('data-new')) { newChat(); state.showList = false; mount(true); return; }
      if (t.hasAttribute('data-toggle-list')) { state.showList = !state.showList; container.querySelector('.ai-shell').classList.toggle('show-list', state.showList); return; }
      if (t.hasAttribute('data-summary')) { askSummary(); return; }
      if (t.dataset.open) { state.currentId = t.dataset.open; state.showList = false; mount(true); return; }
      if (t.dataset.chip) {
        const input = document.getElementById('aiInput');
        if (t.dataset.chip.endsWith(': ')) { input.value = t.dataset.chip; input.focus(); }
        else ask(t.dataset.chip, t.dataset.chip);
        return;
      }
      if (t.hasAttribute('data-copy')) { copyText(t.closest('.ai-draft').querySelector('pre').textContent); return; }
      if (t.dataset.copyMsg !== undefined) {
        const d = currentChat().display[Number(t.dataset.copyMsg)];
        copyText(d.text.replace(/```draft[^\n]*\n?|```/g, '').replace(/\*\*/g, ''));
        return;
      }
      if (t.dataset.card !== undefined) { onCardButton(t); return; }
      if (t.dataset.action) {
        const [i, j] = t.dataset.action.split(':').map(Number);
        openFormAction(currentChat().display[i].actions[j]);
      }
    });
    container.addEventListener('submit', e => {
      e.preventDefault();
      const input = document.getElementById('aiInput');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      ask(text, text);
    });
    container.addEventListener('keydown', e => {
      if (e.target.id === 'aiInput' && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('aiForm').requestSubmit();
      }
    });
  }

  function mount(force) {
    const container = document.getElementById('aiAssistant');
    if (!container) return;
    if (!state.mounted) {
      bind(container);
      state.mounted = true;
    }
    if (force || !container.querySelector('.ai-shell')) {
      container.innerHTML = shell();
      setStatus(state.status);
    }
    renderAllAI();
  }

  function aiAssistantView() {
    const key = storageKey();
    if (state.loadedKey !== key) {
      loadChats();
      state.loadedKey = key;
      state.currentId = state.chats[0] ? state.chats[0].id : null;
    }
    mount(false);
    if (state.status === 'idle' || state.status === 'offline' || state.status === 'no_server') wakeUp();
  }

  root.aiAssistantView = aiAssistantView;
})(typeof window !== 'undefined' ? window : globalThis);
