// Calls GLM (Z.ai) first and falls back to Groq. Both speak the OpenAI
// chat-completions format.

const PROVIDERS = [
  { name: 'glm', url: 'https://api.z.ai/api/paas/v4/chat/completions', keyVar: 'ZAI_API_KEY', modelVar: 'GLM_MODEL', defaultModel: 'glm-4.7-flash' },
  { name: 'groq', url: 'https://api.groq.com/openai/v1/chat/completions', keyVar: 'GROQ_API_KEY', modelVar: 'GROQ_MODEL', defaultModel: 'openai/gpt-oss-120b' }
];

function failure(code, message, details) {
  const err = new Error(message);
  err.code = code;
  if (details) err.details = details;
  return err;
}

function isConfigured(env) {
  return PROVIDERS.some(p => env[p.keyVar]);
}

// Returns a clean assistant message, or null when the reply is unusable.
function cleanMessage(msg) {
  if (!msg || typeof msg !== 'object') return null;
  const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
  if (toolCalls.length) {
    for (const call of toolCalls) {
      if (!call || !call.function || !call.function.name) return null;
      const args = call.function.arguments;
      if (args && String(args).trim()) {
        try { JSON.parse(args); } catch (e) { return null; }
      }
    }
    return { role: 'assistant', content: msg.content || null, tool_calls: toolCalls };
  }
  if (typeof msg.content === 'string' && msg.content.trim()) return { role: 'assistant', content: msg.content };
  return null;
}

async function callOne(p, { messages, tools, env, fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body = { model: env[p.modelVar] || p.defaultModel, messages, temperature: 0.3 };
    if (Array.isArray(tools) && tools.length) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }
    const res = await fetchImpl(p.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env[p.keyVar]}` },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const message = cleanMessage(data && data.choices && data.choices[0] && data.choices[0].message);
    if (!message) throw new Error('unusable reply');
    return message;
  } finally {
    clearTimeout(timer);
  }
}

async function callWithFallback({ messages, tools, env = process.env, fetchImpl = fetch, timeoutMs = 25000 }) {
  const usable = PROVIDERS.filter(p => env[p.keyVar]);
  if (!usable.length) throw failure('NOT_CONFIGURED', 'No AI provider keys configured');
  const errors = [];
  for (const p of usable) {
    try {
      const message = await callOne(p, { messages, tools, env, fetchImpl, timeoutMs });
      return { message, provider: p.name };
    } catch (e) {
      errors.push(`${p.name}: ${e && e.message ? e.message : e}`);
    }
  }
  throw failure('ALL_FAILED', 'All AI providers failed', errors);
}

module.exports = { callWithFallback, isConfigured, PROVIDERS };
