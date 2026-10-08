// CollectIQ AI proxy: keeps the API keys, adds the system prompt and tool
// definitions, and forwards chat requests to GLM (fallback Groq).
// Zero npm dependencies; run with `node server.js`.

const http = require('http');
const { buildSystemPrompt, TOOL_SCHEMAS } = require('./prompt.js');
const { callWithFallback, isConfigured } = require('./providers.js');
const { transcribe } = require('./transcribe.js');

const DEFAULT_ORIGINS = 'https://devlopevishal-hue.github.io,http://localhost:3000';
const MAX_BODY = 200 * 1024;
const MAX_VOICE_BODY = 2200 * 1024; // base64 of ~1.5 MB audio
const VOICE_LIMIT = 20;
const MAX_MESSAGES = 12;
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const ROLES = new Set(['user', 'assistant', 'tool']);

function send(res, status, body, origin) {
  const headers = { 'Content-Type': 'application/json' };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  res.writeHead(status, headers);
  res.end(body === undefined ? '' : JSON.stringify(body));
}

// Last MAX_MESSAGES chat messages, never starting with an orphan
// assistant/tool message (providers reject tool results without their call).
function trimHistory(messages) {
  const clean = messages.filter(m => m && ROLES.has(m.role)).map(m => {
    const out = { role: m.role, content: m.content == null ? null : String(m.content) };
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) out.tool_calls = m.tool_calls;
    if (m.role === 'tool') out.tool_call_id = String(m.tool_call_id || '');
    return out;
  });
  let recent = clean.slice(-MAX_MESSAGES);
  while (recent.length && recent[0].role !== 'user') recent = recent.slice(1);
  return recent;
}

function readBody(req, maxBody = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    // Keep draining an oversized body instead of destroying the socket, so the
    // client still receives the 413 response.
    req.on('data', chunk => {
      size += chunk.length;
      if (size <= maxBody) chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > maxBody) reject(Object.assign(new Error('too large'), { status: 413 }));
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

function createServer({ env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  const allowed = new Set(String(env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(',').map(s => s.trim()).filter(Boolean));
  const hits = new Map();

  function rateLimited(ip, limit = RATE_LIMIT, bucket = 'chat') {
    const t = now();
    const key = bucket + ':' + ip;
    const recent = (hits.get(key) || []).filter(x => t - x < RATE_WINDOW_MS);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return true;
    }
    recent.push(t);
    hits.set(key, recent);
    return false;
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const origin = req.headers.origin;
    const okOrigin = origin && allowed.has(origin) ? origin : null;

    if (url.pathname === '/health' && req.method === 'GET') {
      return send(res, 200, { ok: true, configured: isConfigured(env) }, okOrigin);
    }

    if (url.pathname !== '/chat' && url.pathname !== '/transcribe') return send(res, 404, { error: 'not_found' }, okOrigin);

    if (req.method === 'OPTIONS') {
      if (!okOrigin) return send(res, 403, { error: 'origin' });
      res.writeHead(204, {
        'Access-Control-Allow-Origin': okOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin'
      });
      return res.end();
    }

    if (req.method !== 'POST') return send(res, 405, { error: 'method' }, okOrigin);
    if (!okOrigin) return send(res, 403, { error: 'origin' });

    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    if (url.pathname === '/transcribe') {
      if (rateLimited(ip, VOICE_LIMIT, 'voice')) return send(res, 429, { error: 'rate_limited' }, okOrigin);
      let body;
      try {
        body = JSON.parse(await readBody(req, MAX_VOICE_BODY));
      } catch (e) {
        return send(res, e && e.status === 413 ? 413 : 400, { error: e && e.status === 413 ? 'too_large' : 'bad_request' }, okOrigin);
      }
      try {
        const result = await transcribe({ audioBase64: body && body.audio, mime: body && body.mime, env, fetchImpl });
        return send(res, 200, result, okOrigin);
      } catch (e) {
        const map = { NOT_CONFIGURED: [503, 'not_configured'], BAD_AUDIO: [400, 'bad_audio'], TOO_LARGE: [413, 'too_large'], EMPTY: [422, 'no_speech'] };
        const [status, error] = map[e && e.code] || [503, 'busy'];
        if (status === 503 && error === 'busy') console.warn('Voice failed:', e && e.message);
        return send(res, status, { error }, okOrigin);
      }
    }

    if (rateLimited(ip)) return send(res, 429, { error: 'rate_limited' }, okOrigin);

    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch (e) {
      return send(res, e && e.status === 413 ? 413 : 400, { error: e && e.status === 413 ? 'too_large' : 'bad_request' }, okOrigin);
    }
    if (!payload || !Array.isArray(payload.messages)) return send(res, 400, { error: 'bad_request' }, okOrigin);

    const history = trimHistory(payload.messages);
    if (!history.length) return send(res, 400, { error: 'bad_request' }, okOrigin);
    if (!isConfigured(env)) return send(res, 503, { error: 'not_configured' }, okOrigin);

    const user = payload.user || {};
    const messages = [
      { role: 'system', content: buildSystemPrompt({ name: user.name, role: user.role, today: payload.today }) },
      ...history
    ];
    try {
      const result = await callWithFallback({ messages, tools: payload.allowTools === false ? [] : TOOL_SCHEMAS, env, fetchImpl });
      return send(res, 200, result, okOrigin);
    } catch (e) {
      if (e && e.code === 'NOT_CONFIGURED') return send(res, 503, { error: 'not_configured' }, okOrigin);
      console.warn('AI providers failed:', e && e.details ? e.details.join(' | ') : e);
      return send(res, 503, { error: 'busy' }, okOrigin);
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 8080;
  createServer().listen(port, () => console.log(`CollectIQ AI server listening on ${port}`));
}

module.exports = { createServer, trimHistory };
