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

  function cardKind(action) {
    if (action.type === 'followup') return action.op === 'payment' ? 'payment' : action.op === 'complaint' ? 'complaint' : 'ptp';
    return action.type === 'fms' ? 'fms' : 'ticket';
  }

  const rupeeText = n => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n));

  // Big amount + how much of the outstanding this payment clears.
  function paymentSummary(action, esc) {
    const amount = Number((action.payload || {}).payRupees) || 0;
    if (!amount) return '';
    const afterRow = ((action.preview || {}).rows || []).find(r => r[0] === 'Balance after');
    const after = afterRow ? Number(String(afterRow[1]).replace(/[^\d]/g, '')) || 0 : 0;
    const pct = Math.min(100, Math.round(amount * 100 / (amount + after)));
    return `<div class="ai-card-amount" data-amount="${amount}">${esc(rupeeText(amount))}</div>` +
      `<div class="ai-card-progress" style="--pct:${pct}%"><i></i></div>` +
      `<div class="ai-card-progress-cap"><span>${pct}% of dues cleared</span><span>Left ${esc(rupeeText(after))}</span></div>`;
  }

  // An action the AI proposes (ticket, follow-up, payment, FMS). Nothing is saved until Confirm.
  // Spreads a payment over the ticked bills, oldest first (same as the form).
  function allocate(bills, selected, amount) {
    let rest = Number(amount) || 0;
    const out = {};
    bills.forEach(b => {
      if (!selected.includes(String(b.id)) || rest <= 0) return;
      const amt = Math.min(rest, b.due);
      out[String(b.id)] = amt;
      rest -= amt;
    });
    return { perBill: out, advance: Math.max(0, rest) };
  }

  // Invoice checklist inside complaint and payment cards.
  function billPicker(kind, action, status, index, esc, extra) {
    const bills = extra.bills || [];
    const selected = (extra.selected || []).map(String);
    const isPay = kind === 'payment';
    const alloc = isPay ? allocate(bills, selected, (action.payload || {}).payRupees) : null;
    const pending = status === 'pending';
    const shown = pending ? bills : bills.filter(b => selected.includes(String(b.id)));
    const items = shown.map(b => {
      const on = selected.includes(String(b.id));
      const amt = isPay && on ? alloc.perBill[String(b.id)] : null;
      const note = isPay
        ? (amt ? `${rupeeText(amt)} ${amt === b.due ? 'full' : 'part'}` : on ? 'not needed' : `due ${rupeeText(b.due)}`)
        : `due ${rupeeText(b.due)}`;
      const box = pending ? `<input type="checkbox" data-bill-pick="${esc(String(index))}" value="${esc(String(b.id))}"${on ? ' checked' : ''}>` : '<span class="ai-bill-dot">✓</span>';
      return `<label class="ai-bill${on ? ' on' : ''}" data-text="${esc(String(b.label).toLowerCase())}">${box}<span>${esc(String(b.label))}</span><em>${esc(note)}</em></label>`;
    }).join('');
    const head = isPay ? 'Apply to invoices' : 'Affected invoices';
    const summary = isPay && alloc.advance > 0 ? `<div class="ai-bill-advance">Advance ${esc(rupeeText(alloc.advance))}</div>` : '';
    const search = pending && bills.length > 8 ? `<input class="ai-bill-search" data-bill-search="${esc(String(index))}" placeholder="Search bill no. or date">` : '';
    return `<div class="ai-bill-pick"><div class="ai-bill-head"><b>${head}</b><span>${selected.length} selected</span></div>${search}` +
      `<div class="ai-bill-list">${items || '<p class="ai-bill-empty">No invoices selected.</p>'}</div>${summary}</div>`;
  }

  function renderTicketCard(action, status, index, esc, error, extra) {
    const preview = action.preview || {};
    const kind = cardKind(action);
    const picker = extra && extra.bills && (kind === 'payment' || kind === 'complaint');
    // The checklist replaces the tool's fixed bill lines, which go stale once ticks change.
    const visibleRows = (preview.rows || []).filter(([label]) =>
      !picker || !(/^Bill /.test(label) || label === 'Advance' || label === 'Invoices'));
    const rows = visibleRows.map(([label, value]) =>
      `<tr><th>${esc(String(label))}</th><td>${esc(String(value))}</td></tr>`).join('');
    const footer = status === 'pending'
      ? `<div class="ai-ticket-buttons">
          <button type="button" class="ai-ticket-confirm" data-ticket-confirm data-card="${esc(String(index))}">✓ Confirm</button>
          <button type="button" class="ai-ticket-edit" data-ticket-edit data-card="${esc(String(index))}">✏️ Edit in form</button>
          <button type="button" class="ai-ticket-cancel" data-ticket-cancel data-card="${esc(String(index))}">✗ Cancel</button>
        </div>`
      : `<div class="ai-ticket-status">${status === 'error' ? '⚠️ ' + esc(String(error || 'Could not save.')) : (CARD_STATUS_TEXT[status] || '')}</div>`;
    const stamp = status === 'saved' ? '<div class="ai-card-stamp" aria-hidden="true">SAVED</div>' : '';
    return `<div class="ai-ticket-card ${esc(String(status))} kind-${kind}" data-card-ref="${esc(String(index))}">` +
      `<div class="ai-card-top"><div class="ai-ticket-title">${esc(String(preview.title || 'Help ticket'))}</div></div>` +
      (kind === 'payment' ? paymentSummary(action, esc) : '') +
      `<table class="ai-ticket-rows">${rows}</table>${picker ? billPicker(kind, action, status, index, esc, extra) : ''}${footer}${stamp}</div>`;
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

  // ---------- Voice helpers (pure) ----------

  const AUDIO_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

  function pickAudioType(isSupported) {
    return AUDIO_TYPES.find(t => { try { return isSupported(t); } catch (e) { return false; } }) || '';
  }

  // What the speaker reads aloud: the sentences, without tables, drafts,
  // markdown marks or emoji.
  function speakableText(text) {
    const lines = String(text || '').replace(/```draft[^\n]*\n?[\s\S]*?```/g, '').split('\n');
    const words = lines
      .filter(l => !/^\s*\|/.test(l))
      .map(l => l.replace(/\*\*/g, '').replace(/^\s*(?:[-*•]|\d+\.)\s+/, '').replace(/[\p{Extended_Pictographic}️]/gu, '').trim())
      .filter(Boolean)
      .map(l => (/[.!?:]$/.test(l) ? l : l + '.'));
    return words.join(' ').slice(0, 600);
  }

  function formatClock(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { renderMessageHtml, runAgentTurn, renderTicketCard, runCardAction, pickAudioType, speakableText, formatClock };
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

  const TILES = [
    { icon: '📞', tint: 'violet', title: "Today's follow-ups", sub: 'Who to call first', chip: 'Who should I call today?' },
    { icon: '💰', tint: 'green', title: 'Payment entry', sub: 'Cheque / UPI received', chip: 'Payment aaya: ' },
    { icon: '⚠️', tint: 'amber', title: 'Broken PTPs', sub: 'Promises not kept', chip: 'Show broken PTPs' },
    { icon: '🎫', tint: 'pink', title: 'Help ticket', sub: 'Assign a task', chip: 'Help ticket: ' }
  ];

  // What the "thinking" bubble says while a tool runs.
  const TOOL_STEPS = {
    get_party_details: 'Checking the party…', search_parties: 'Searching parties…', get_today_followups: "Checking today's follow-ups…",
    get_broken_ptps: 'Looking for broken promises…', get_collections: 'Adding up collections…', get_doer_performance: 'Scoring the team…',
    get_pending_work: 'Checking pending work…', find_tickets: 'Looking up tickets…', prepare_ticket_action: 'Preparing the ticket card…',
    prepare_followup_form: 'Matching bills and preparing the card…', prepare_fms_done: 'Preparing the FMS card…'
  };

  const THEME_KEY = 'collectiq_ai_theme';
  const SPEAK_KEY = 'collectiq_ai_speak';
  const MAX_RECORD_SECONDS = 60;
  const REDUCED_MOTION = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const state = {
    chats: [], currentId: null, status: 'idle', busy: false, mounted: false, showList: false,
    step: '', seen: {}, celebrate: null, counted: new Set(),
    theme: (function () { try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; } catch (e) { return 'light'; } })(),
    speak: (function () { try { return localStorage.getItem(SPEAK_KEY) === '1'; } catch (e) { return false; } })(),
    rec: null
  };

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

  function robot(cls) {
    return `<svg class="${cls}" viewBox="0 0 40 40" aria-hidden="true"><circle class="ai-bot-ant" cx="20" cy="5" r="3"/><rect x="19" y="7" width="2" height="5" class="ai-bot-neck"/>` +
      '<rect x="7" y="12" width="26" height="20" rx="7" class="ai-bot-head"/><g class="ai-bot-eyes"><circle cx="15" cy="21" r="3"/><circle cx="25" cy="21" r="3"/></g>' +
      '<rect x="15" y="26" width="10" height="2" rx="1" class="ai-bot-mouth"/></svg>';
  }

  function shell() {
    return `
      <div class="ai-shell ${state.showList ? 'show-list' : ''}" data-theme="${state.theme}">
        <aside class="ai-sidebar">
          <button type="button" class="ai-new-btn" data-new>＋ New chat</button>
          <div class="ai-chat-list" id="aiChatList"></div>
        </aside>
        <div class="ai-main">
          <div class="ai-header">
            <div class="ai-title">
              <button type="button" class="ai-list-toggle" data-toggle-list title="Past chats">☰</button>
              <span class="ai-logo">${robot('ai-bot')}</span>
              <div><b>CollectIQ AI Assistant</b><small>Your collection co-pilot</small></div>
            </div>
            <div class="ai-header-actions">
              <span id="aiStatus" class="ai-status"></span>
              <button type="button" class="ai-theme-btn ai-speak-btn${state.speak ? ' on' : ''}" data-speak-toggle title="Read replies aloud" aria-label="Read replies aloud" aria-pressed="${state.speak}">${state.speak ? '🔊' : '🔇'}</button>
              <button type="button" class="ai-theme-btn" data-theme-toggle title="Day / night look" aria-label="Switch day or night look">${state.theme === 'dark' ? '☀️' : '🌙'}</button>
              <button type="button" class="ai-summary-btn" data-summary>☀️ <span>Morning summary</span></button>
            </div>
          </div>
          <div class="ai-messages" id="aiMessages"></div>
          <form class="ai-input" id="aiForm">
            <button type="button" class="ai-mic" id="aiMic" data-mic title="Speak your message" aria-label="Speak your message">🎤</button>
            <div class="ai-rec" id="aiRec" hidden><span class="ai-rec-dot"></span><span class="ai-rec-wave"><i></i><i></i><i></i><i></i><i></i></span><b id="aiRecTime">0:00</b><small id="aiRecHint">Listening… tap 🎤 to stop</small></div>
            <textarea id="aiInput" rows="1" placeholder="Type or tap 🎤 and speak… (e.g. RKC se 30,000 ka cheque aaya)"></textarea>
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

  function greeting() {
    const h = new Date().getHours();
    const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const name = user().followperName && user().followperName !== 'all' ? user().followperName : '';
    return `${part}${name ? ', ' + name : ''} 👋`;
  }

  function welcomeHtml() {
    let s = null;
    try { s = CollectIQAITools.computeMorningSummary(buildCtx()); } catch (e) { /* numbers are optional */ }
    const stats = s ? `
      <div class="ai-stats">
        <div class="ai-stat" style="--d:.35s"><small>Due today</small><b data-count="${s.followupsToday}">${s.followupsToday}</b></div>
        <div class="ai-stat" style="--d:.45s"><small>Collected today</small><b data-count="${s.collectedToday}" data-money="1">${escapeHtml(money(s.collectedToday))}</b></div>
        <div class="ai-stat warn" style="--d:.55s"><small>Broken PTPs</small><b data-count="${s.brokenPtps}">${s.brokenPtps}</b></div>
      </div>` : '';
    return `
      <div class="ai-welcome">
        <div class="ai-welcome-bot">${robot('ai-bot big')}</div>
        <h3><span class="ai-typed" style="--chars:${greeting().length + 2}">${escapeHtml(greeting())}</span></h3>
        <p>Ask about parties, bills and payments, or tell me what happened. I prepare follow-ups, payments, FMS and tickets for you to confirm.</p>
        ${stats}
        <div class="ai-tiles">${TILES.map((t, i) => `
          <button type="button" class="ai-tile tint-${t.tint}" style="--d:${(0.65 + i * 0.08).toFixed(2)}s" data-chip="${escapeHtml(t.chip)}">
            <span class="ai-tile-icon">${t.icon}</span><b>${escapeHtml(t.title)}</b><small>${escapeHtml(t.sub)}</small>
          </button>`).join('')}</div>
        <div class="ai-chips">${CHIPS.filter(c => !TILES.some(t => t.chip === c)).map(c => `<button type="button" class="ai-chip" data-chip="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}</div>
      </div>`;
  }

  // Numbers roll up from zero once, when they first appear.
  function countUp(el, to, asMoney) {
    if (REDUCED_MOTION || !to) return;
    const start = performance.now();
    const ms = 900;
    (function step(t) {
      const k = Math.min(1, (t - start) / ms);
      const v = Math.round(to * (1 - Math.pow(1 - k, 3)));
      el.textContent = asMoney ? money(v) : String(v);
      if (k < 1) requestAnimationFrame(step);
    })(start);
  }

  function confetti(card) {
    if (REDUCED_MOTION || !card) return;
    const colors = ['#5b4bc4', '#12a37a', '#f59e0b', '#ec4899', '#7c6cf0'];
    for (let i = 0; i < 24; i++) {
      const c = document.createElement('i');
      c.className = 'ai-confetti';
      c.style.background = colors[i % colors.length];
      c.style.setProperty('--x', Math.round(Math.random() * 280 - 140) + 'px');
      c.style.setProperty('--y', Math.round(-Math.random() * 160 - 40) + 'px');
      c.style.animationDelay = (Math.random() * 0.15).toFixed(2) + 's';
      card.appendChild(c);
      setTimeout(() => c.remove(), 1400);
    }
  }

  function thinkingHtml() {
    return `<div class="ai-msg bot ai-enter"><div class="ai-bubble ai-thinking"><span class="ai-orb"><i></i><i></i></span><span id="aiStep">${escapeHtml(state.step || 'Thinking…')}</span></div></div>`;
  }

  function setStep(text) {
    state.step = text;
    const el = document.getElementById('aiStep');
    if (el) el.textContent = text;
  }

  function renderMessages() {
    const el = document.getElementById('aiMessages');
    if (!el) return;
    const chat = currentChat();
    if (!chat || !chat.display.length) {
      el.innerHTML = welcomeHtml();
      el.querySelectorAll('.ai-stat b[data-count]').forEach(b => countUp(b, Number(b.dataset.count), !!b.dataset.money));
      if (chat) state.seen[chat.id] = 0;
      return;
    }
    // Only messages added since the last render slide in.
    if (state.seen[chat.id] === undefined) state.seen[chat.id] = chat.display.length;
    const firstNew = state.seen[chat.id];
    state.seen[chat.id] = chat.display.length;
    el.innerHTML = chat.display.map((d, i) => {
      const enter = i >= firstNew ? ' ai-enter' : '';
      if (d.role === 'user') return `<div class="ai-msg user${enter}"><div class="ai-bubble">${escapeHtml(d.text).replace(/\n/g, '<br>')}</div></div>`;
      const actions = (d.actions || []).map((a, j) =>
        `<button type="button" class="ai-action-btn" data-action="${i}:${j}">📝 Open form: ${escapeHtml(a.marka)}</button>`).join('');
      const cards = (d.cards || []).map((c, j) => renderTicketCard(c.action, c.status, `${i}:${j}`, escapeHtml, c.error, pickerFor(c))).join('');
      return `
        <div class="ai-msg bot ${d.error ? 'error' : ''}${enter}">
          <div class="ai-bubble">${renderMessageHtml(d.text, escapeHtml)}${actions ? `<div class="ai-actions">${actions}</div>` : ''}${cards}</div>
          ${d.error ? '' : `<div class="ai-meta"><button type="button" class="ai-copy-msg" data-copy-msg="${i}">📋 Copy</button>${d.provider ? `<span>${d.provider === 'glm' ? 'GLM' : 'Groq'}</span>` : ''}</div>`}
        </div>`;
    }).join('') + (state.busy ? thinkingHtml() : '');
    el.querySelectorAll('.ai-msg.ai-enter .ai-card-amount[data-amount]').forEach(a => {
      const ref = a.closest('.ai-ticket-card').dataset.cardRef;
      if (state.counted.has(chat.id + ref)) return;
      state.counted.add(chat.id + ref);
      countUp(a, Number(a.dataset.amount), true);
    });
    if (state.celebrate) {
      const card = el.querySelector(`.ai-ticket-card[data-card-ref="${state.celebrate}"]`);
      if (card) { card.classList.add('celebrate'); confetti(card); }
      state.celebrate = null;
    }
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
  function partyOf(action) {
    const id = (action.payload || {}).markaId;
    return (markas || []).find(x => String(x.id) === String(id)) || null;
  }

  function openBillsOf(m) {
    return (m.bills || []).filter(b => b.balance > 0)
      .sort((a, b) => String(a.firstDate).localeCompare(String(b.firstDate)))
      .map(b => ({ id: b.id, label: `Bill ${b.firstDate}${(b.billNos || []).length ? ' (' + b.billNos.join(', ') + ')' : ''}`, due: b.balance }));
  }

  // Ticked invoices: the user's ticks, else the bills the AI picked, else
  // (payments) the oldest bills the amount covers.
  function selectionOf(card, bills) {
    if (Array.isArray(card.selected)) return card.selected;
    const p = card.action.payload || {};
    if (Array.isArray(p.billIds)) return p.billIds.map(String);
    if (card.action.op !== 'payment') return [];
    const all = bills.map(b => String(b.id));
    return Object.keys(allocate(bills, all, p.payRupees).perBill);
  }

  function pickerFor(card) {
    const kind = cardKind(card.action);
    if (kind !== 'payment' && kind !== 'complaint') return null;
    const m = partyOf(card.action);
    if (!m) return null;
    const bills = openBillsOf(m);
    return { bills, selected: selectionOf(card, bills) };
  }

  function realBillId(m, id) {
    const b = (m.bills || []).find(x => String(x.id) === String(id));
    return b ? b.id : id;
  }

  function executeFollowup(action, card) {
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
        payRef: p.payRef, payMode: p.payMode, payAmount: p.payRupees, visit: p.visit,
        allocations: (() => {
          const bills = openBillsOf(m);
          const per = allocate(bills, selectionOf(card || { action }, bills), p.payRupees).perBill;
          return Object.keys(per).map(id => ({ billId: realBillId(m, id), amount: per[id] }));
        })(),
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
        escalateTo: p.escalateTo, visit: p.visit, minNext: plus(5), requireDetail: true,
        billIds: selectionOf(card || { action }, openBillsOf(m)).map(id => realBillId(m, id)),
        newEscId: () => 'e_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4)
      });
      if (r.error) return r;
      persistFollowupChange({ marka: m, payload: r.payload }).catch(e => console.warn('Follow-up sync error:', e));
      return {};
    }
    if (p.promiseDate < todayIso || p.nextDate < todayIso) return { error: 'The promise date has passed. Please ask again.' };
    const r = FollowupActions.applyPtpFollowup(m, {
      date: todayIso, followper: p.followper, contactPerson: p.contactPerson, contactMode: p.contactMode,
      expected: p.expectedRupees, promiseDate: p.promiseDate, nextDate: p.nextDate, remark: p.remark, visit: p.visit,
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

  function editAction(action, card) {
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
        const m = partyOf(action);
        if (m) {
          const bills = openBillsOf(m);
          const per = allocate(bills, selectionOf(card || { action }, bills), p.payRupees).perBill;
          document.querySelectorAll('.follow-pay-check').forEach(chk => {
            const inp = document.querySelector(`.follow-pay-amt[data-bill-id="${chk.dataset.billId}"]`);
            const amt = per[String(chk.dataset.billId)] || 0;
            chk.checked = amt > 0;
            if (inp) inp.value = amt;
          });
          updateFollowPayAllocations('custom');
        }
      } else if (action.op === 'complaint') {
        set('actionStatus', 'WhatsApp Complaint / Claim Matter');
        toggleConditionalFields();
        set('claimNumber', p.claimNumber);
        const m = partyOf(action);
        const ticked = m ? selectionOf(card || { action }, openBillsOf(m)) : [];
        document.querySelectorAll('.claim-bill-check').forEach(chk => { chk.checked = ticked.includes(String(chk.dataset.billId)); });
        set('escalateTo', p.escalateTo);
      } else {
        set('actionStatus', 'Promise to Pay');
        toggleConditionalFields();
        set('expected', p.expectedRupees);
        set('promiseDate', p.promiseDate);
      }
      if (p.visit) {
        set('visitPurpose', p.visit.purpose);
        set('visitPersonMet', p.visit.personMet);
        set('visitNotes', p.visit.notes);
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

  // Re-draws one card after its ticks change, keeping the list scroll and search.
  function refreshCard(ref, card) {
    const el = document.querySelector(`.ai-ticket-card[data-card-ref="${ref}"]`);
    if (!el) return;
    const list = el.querySelector('.ai-bill-list');
    const scroll = list ? list.scrollTop : 0;
    const search = el.querySelector('.ai-bill-search');
    const query = search ? search.value : '';
    el.outerHTML = renderTicketCard(card.action, card.status, ref, escapeHtml, card.error, pickerFor(card));
    const fresh = document.querySelector(`.ai-ticket-card[data-card-ref="${ref}"]`);
    if (!fresh) return;
    const freshSearch = fresh.querySelector('.ai-bill-search');
    if (freshSearch && query) { freshSearch.value = query; filterBills(freshSearch); }
    const freshList = fresh.querySelector('.ai-bill-list');
    if (freshList) freshList.scrollTop = scroll;
  }

  function filterBills(input) {
    const q = input.value.trim().toLowerCase();
    const list = input.closest('.ai-bill-pick').querySelector('.ai-bill-list');
    list.querySelectorAll('.ai-bill').forEach(row => { row.hidden = !!q && !row.dataset.text.includes(q); });
  }

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
      Object.assign(card, runCardAction(card, a => execute(a, card)));
      if (card.status === 'saved') {
        state.celebrate = t.dataset.card;
        const note = card.action.op === 'payment' ? '✓ Payment saved.' : (SAVED_TEXT[card.action.type] || '✓ Saved.');
        chat.display.push({ role: 'bot', text: note });
        chat.messages.push({ role: 'assistant', content: note });
        try { renderAll(); } catch (e) { /* page views refresh on next visit */ }
      }
    } else if (t.hasAttribute('data-ticket-edit')) {
      if (editAction(card.action, card)) card.status = 'edited';
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

  // ---------- Voice ----------

  const VOICE_ERRORS = {
    no_speech: "Couldn't hear anything. Please try again closer to the mic.",
    too_large: 'That recording was too long. Please keep it under a minute.',
    bad_audio: "This browser's recording format isn't supported. Please type instead.",
    not_configured: ERRORS.not_configured, rate_limited: ERRORS.rate_limited, busy: ERRORS.busy, offline: ERRORS.offline, no_server: ERRORS.no_server
  };

  function setRecordingUi(mode, seconds) {
    const mic = document.getElementById('aiMic');
    const rec = document.getElementById('aiRec');
    const input = document.getElementById('aiInput');
    if (mic) {
      mic.classList.toggle('rec', mode === 'recording');
      mic.classList.toggle('busy', mode === 'working');
      mic.textContent = mode === 'recording' ? '⏹' : mode === 'working' ? '⏳' : '🎤';
    }
    if (rec) rec.hidden = mode === 'idle';
    if (input) input.hidden = mode !== 'idle';
    const time = document.getElementById('aiRecTime');
    if (time) time.textContent = formatClock(seconds || 0);
    const hint = document.getElementById('aiRecHint');
    if (hint) hint.textContent = mode === 'working' ? 'Converting your voice to text…' : 'Listening… tap ⏹ to stop';
  }

  async function startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast('Voice is not supported in this browser. Please type instead.');
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      toast('Microphone permission is blocked. Allow the mic for this site in browser settings.');
      return;
    }
    stopSpeaking();
    const type = pickAudioType(t => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : { audioBitsPerSecond: 32000 });
    const rec = { recorder, stream, chunks: [], started: Date.now(), timer: null };
    recorder.ondataavailable = e => { if (e.data && e.data.size) rec.chunks.push(e.data); };
    recorder.onstop = () => {
      clearInterval(rec.timer);
      stream.getTracks().forEach(tr => tr.stop());
      const blob = new Blob(rec.chunks, { type: recorder.mimeType || type || 'audio/webm' });
      state.rec = null;
      sendAudio(blob);
    };
    state.rec = rec;
    recorder.start();
    setRecordingUi('recording', 0);
    rec.timer = setInterval(() => {
      const secs = (Date.now() - rec.started) / 1000;
      setRecordingUi('recording', secs);
      if (secs >= MAX_RECORD_SECONDS) stopRecording();
    }, 250);
  }

  function stopRecording() {
    if (state.rec && state.rec.recorder.state !== 'inactive') state.rec.recorder.stop();
  }

  function toggleRecording() {
    if (state.busy) return;
    if (state.rec) stopRecording();
    else if (!state.transcribing) startRecording();
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function sendAudio(blob) {
    if (!blob || blob.size < 1200) {
      setRecordingUi('idle');
      toast(VOICE_ERRORS.no_speech);
      return;
    }
    state.transcribing = true;
    setRecordingUi('working');
    try {
      const audio = await blobToBase64(blob);
      const { text } = await request('/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio, mime: blob.type })
      });
      const input = document.getElementById('aiInput');
      if (input) {
        input.value = input.value.trim() ? input.value.trim() + ' ' + text : text;
        setRecordingUi('idle');
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
      toast('Check the text, then press ➤ to send.');
    } catch (e) {
      setRecordingUi('idle');
      toast(VOICE_ERRORS[e.code] || ERRORS.busy);
    } finally {
      state.transcribing = false;
      setRecordingUi('idle');
    }
  }

  function pickVoice() {
    const voices = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
    return voices.find(v => /en-IN/i.test(v.lang)) || voices.find(v => /hi-IN/i.test(v.lang)) || voices.find(v => /^en/i.test(v.lang)) || null;
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    const words = speakableText(text);
    if (!words) return;
    stopSpeaking();
    const u = new SpeechSynthesisUtterance(words);
    const v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'en-IN'; }
    u.rate = 1;
    speechSynthesis.speak(u);
  }

  function stopSpeaking() {
    if ('speechSynthesis' in window && (speechSynthesis.speaking || speechSynthesis.pending)) speechSynthesis.cancel();
  }

  async function ask(displayText, apiText, opts = {}) {
    if (state.busy) return;
    const chat = currentChat() || newChat();
    if (!chat.display.length) chat.title = displayText.slice(0, 40);
    chat.display.push({ role: 'user', text: displayText });
    chat.updatedAt = Date.now();
    state.busy = true;
    stopSpeaking();
    state.step = opts.noTools ? 'Writing your summary…' : 'Reading your message…';
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
          runTool: (name, args) => {
            setStep(TOOL_STEPS[name] || 'Checking your data…');
            return CollectIQAITools.runTool(ctx, name, args);
          }
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
      if (state.speak) speak(result.finalText);
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
      if (t.hasAttribute('data-mic')) { toggleRecording(); return; }
      if (t.hasAttribute('data-speak-toggle')) {
        state.speak = !state.speak;
        try { localStorage.setItem(SPEAK_KEY, state.speak ? '1' : '0'); } catch (err) { /* per-browser preference only */ }
        t.textContent = state.speak ? '🔊' : '🔇';
        t.classList.toggle('on', state.speak);
        t.setAttribute('aria-pressed', String(state.speak));
        if (!state.speak) stopSpeaking();
        toast(state.speak ? 'Replies will be read aloud' : 'Reading aloud is off');
        return;
      }
      if (t.hasAttribute('data-theme-toggle')) {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem(THEME_KEY, state.theme); } catch (err) { /* per-browser preference only */ }
        container.querySelector('.ai-shell').dataset.theme = state.theme;
        t.textContent = state.theme === 'dark' ? '☀️' : '🌙';
        return;
      }
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
    container.addEventListener('change', e => {
      const box = e.target.closest('[data-bill-pick]');
      if (!box) return;
      const ref = box.dataset.billPick;
      const card = cardAt(ref);
      if (!card || card.status !== 'pending') return;
      card.selected = Array.from(container.querySelectorAll(`[data-bill-pick="${ref}"]`)).filter(x => x.checked).map(x => x.value);
      saveChats();
      refreshCard(ref, card);
    });
    container.addEventListener('input', e => {
      const box = e.target.closest('[data-bill-search]');
      if (box) filterBills(box);
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
