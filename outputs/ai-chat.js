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
    lines.forEach(raw => {
      const line = raw.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
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

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { renderMessageHtml, runAgentTurn };
    return;
  }

  // ---------- Browser ----------

  // Filled in when the Render service exists (plan Task 7).
  const AI_SERVER_URL_PROD = '';
  const AI_SERVER_URL = ['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://localhost:8080' : AI_SERVER_URL_PROD;
  const REQUEST_TIMEOUT_MS = 70000;
  const MAX_CHATS = 30;
  const MAX_STORED_MESSAGES = 40;

  const ERRORS = {
    busy: 'AI abhi busy hai, thodi der baad try karein.',
    not_configured: 'AI ki keys server pe nahi daali gayi hain. Admin: Render mein API keys daalni hain.',
    rate_limited: 'Bahut zyada sawaal ek saath aa gaye. 10 minute baad try karein.',
    offline: 'AI server se connect nahi ho pa raha. Internet check karein ya thodi der baad try karein.',
    no_server: 'AI server abhi set nahi hua hai. Admin se baat karein.'
  };

  const CHIPS = ['Aaj kisko call karun?', 'Toote PTP dikhao', 'Mera score kya hai?', 'Party ka haal: '];

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
    const chat = { id: 'c' + Date.now().toString(36), title: 'Nayi chat', updatedAt: Date.now(), messages: [], display: [] };
    state.chats.unshift(chat);
    state.currentId = chat.id;
    return chat;
  }

  function buildCtx() {
    return {
      markas, payments, helpTickets,
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
    idle: ['', ''], waking: ['waking', 'AI jaag raha hai…'], ready: ['ready', 'Ready'],
    busy: ['busy', 'Soch raha hai…'], offline: ['down', 'Connect nahi ho raha'],
    not_configured: ['down', 'Setup baaki'], no_server: ['down', 'Server set nahi']
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
          <button type="button" class="ai-new-btn" data-new>＋ Nayi chat</button>
          <div class="ai-chat-list" id="aiChatList"></div>
        </aside>
        <div class="ai-main">
          <div class="ai-header">
            <div class="ai-title">
              <button type="button" class="ai-list-toggle" data-toggle-list title="Purani chats">☰</button>
              <span class="ai-logo">🤖</span>
              <div><b>CollectIQ AI Assistant</b><small>Aapke collection data se jawab</small></div>
            </div>
            <div class="ai-header-actions">
              <span id="aiStatus" class="ai-status"></span>
              <button type="button" class="ai-summary-btn" data-summary>☀️ Subah ki summary</button>
            </div>
          </div>
          <div class="ai-messages" id="aiMessages"></div>
          <form class="ai-input" id="aiForm">
            <textarea id="aiInput" rows="1" placeholder="Sawaal likhiye… (jaise: JGG ka haal batao)"></textarea>
            <button type="submit" class="ai-send" id="aiSend" title="Bhejo">➤</button>
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
      </button>`).join('') : '<p class="ai-empty-list">Abhi koi chat nahi.</p>';
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
          <h3>Namaste${name ? ' ' + escapeHtml(name) : ''}!</h3>
          <p>Main aapke parties, bills, follow-ups aur payments ke baare mein bata sakta hoon, WhatsApp message likh sakta hoon aur follow-up form bhar sakta hoon.</p>
          <div class="ai-chips">${CHIPS.map(c => `<button type="button" class="ai-chip" data-chip="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}</div>
        </div>`;
      return;
    }
    el.innerHTML = chat.display.map((d, i) => {
      if (d.role === 'user') return `<div class="ai-msg user"><div class="ai-bubble">${escapeHtml(d.text).replace(/\n/g, '<br>')}</div></div>`;
      const actions = (d.actions || []).map((a, j) =>
        `<button type="button" class="ai-action-btn" data-action="${i}:${j}">📝 Form kholo: ${escapeHtml(a.marka)}</button>`).join('');
      return `
        <div class="ai-msg bot ${d.error ? 'error' : ''}">
          <div class="ai-bubble">${renderMessageHtml(d.text, escapeHtml)}${actions ? `<div class="ai-actions">${actions}</div>` : ''}</div>
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
    const done = () => toast('✓ Copy ho gaya');
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
    try { document.execCommand('copy'); done(); } catch (e) { toast('Copy nahi ho paya'); }
    ta.remove();
  }

  function openFormAction(action) {
    const m = (markas || []).find(x => String(x.id) === String(action.markaId));
    if (!m) return toast('Party nahi mili: ' + action.marka);
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
    toast('Form bhar diya hai. Check karke Save dabaiye.');
  }

  function plainSummary(s) {
    const lines = [
      `**${fmt(s.date)} ki summary**`,
      `- Aaj ke follow-up (overdue samet): ${s.followupsToday}`,
      `- Toote PTP: ${s.brokenPtps}`,
      `- Kal ka collection: ${money(s.collectedYesterday)}`,
      `- Aaj ab tak collection: ${money(s.collectedToday)}`,
      `- Mere khule help tickets: ${s.openTicketsForMe}`
    ];
    if (s.pendingFms !== null) lines.push(`- Pending FMS milestones: ${s.pendingFms}`);
    if (s.top5.length) {
      lines.push('', '**Sabse pehle inhe call karein:**');
      s.top5.forEach(r => lines.push(`- ${r.marka} (${r.master}) — due ${money(r.alreadyDue)}, kul ${money(r.outstanding)}`));
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
      chat.display.push({ role: 'bot', text: result.finalText || 'Jawab khaali aaya, dobara poochiye.', actions: result.actions, provider: result.provider });
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
    const apiText = 'Meri aaj ki subah ki summary professional aur chhoti likho. Sirf yahi numbers use karo (system ne nikaale hain):\n' + JSON.stringify(s);
    ask('☀️ Subah ki summary', apiText, { noTools: true, fallbackText: plainSummary(s) });
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
