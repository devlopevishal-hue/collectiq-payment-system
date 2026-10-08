// Voice to text for the AI Assistant: sends a short recording to Groq
// Whisper and returns the text. The audio is not stored anywhere.

const WHISPER_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const DEFAULT_MODEL = 'whisper-large-v3-turbo';
const MAX_AUDIO_BYTES = 1500 * 1024; // about a minute of compressed speech

// Nudges Whisper towards Roman-script Hinglish and our business words.
const HINT = 'Hinglish in Roman script, not Devanagari. Example: RKC se 30,000 ka cheque aaya, number 777. ' +
  'Pappu ji se phone pe baat hui, 10 tareekh ko payment denge. Follow-up, PTP, UTR, NEFT, UPI, Master, Marka.';

const EXTENSIONS = {
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'm4a',
  'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav'
};

function failure(code, message) {
  return Object.assign(new Error(message), { code });
}

async function transcribe({ audioBase64, mime, env = process.env, fetchImpl = fetch, timeoutMs = 30000 }) {
  if (!env.GROQ_API_KEY) throw failure('NOT_CONFIGURED', 'GROQ_API_KEY is not set');
  const type = String(mime || '').split(';')[0].trim().toLowerCase();
  const ext = EXTENSIONS[type];
  if (!ext) throw failure('BAD_AUDIO', 'Unsupported audio type');
  const bytes = Buffer.from(String(audioBase64 || ''), 'base64');
  if (!bytes.length) throw failure('BAD_AUDIO', 'No audio');
  if (bytes.length > MAX_AUDIO_BYTES) throw failure('TOO_LARGE', 'Recording is too long');

  const form = new FormData();
  form.append('file', new Blob([bytes], { type }), `voice.${ext}`);
  form.append('model', env.WHISPER_MODEL || DEFAULT_MODEL);
  form.append('prompt', HINT);
  form.append('response_format', 'json');
  form.append('temperature', '0');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(WHISPER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: form,
      signal: controller.signal
    });
  } catch (e) {
    throw failure('BUSY', 'Voice service unreachable');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw failure('BUSY', `Voice service HTTP ${res.status}`);
  const data = await res.json().catch(() => ({}));
  const text = String((data && data.text) || '').trim();
  if (!text) throw failure('EMPTY', 'No speech heard');
  return { text };
}

module.exports = { transcribe, MAX_AUDIO_BYTES };
