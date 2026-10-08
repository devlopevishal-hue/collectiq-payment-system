const test = require('node:test');
const assert = require('node:assert/strict');
const { transcribe, MAX_AUDIO_BYTES } = require('../transcribe.js');

const audio = Buffer.from('fake-opus-audio').toString('base64');
const ENV = { GROQ_API_KEY: 'k' };

function fakeFetch(reply = { text: '  RKC se 30,000 ka cheque aaya  ' }, status = 200) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: status === 200, status, json: async () => reply };
  };
  fn.calls = calls;
  return fn;
}

test('transcribe sends the audio to Groq Whisper with a Roman Hinglish hint', async () => {
  const fetchImpl = fakeFetch();
  const r = await transcribe({ audioBase64: audio, mime: 'audio/webm;codecs=opus', env: ENV, fetchImpl });
  assert.equal(r.text, 'RKC se 30,000 ka cheque aaya');
  const { url, opts } = fetchImpl.calls[0];
  assert.equal(url, 'https://api.groq.com/openai/v1/audio/transcriptions');
  assert.equal(opts.method, 'POST');
  assert.equal(opts.headers.Authorization, 'Bearer k');
  const form = opts.body;
  assert.equal(form.get('model'), 'whisper-large-v3-turbo');
  assert.match(form.get('prompt'), /Roman/);
  assert.equal(form.get('response_format'), 'json');
  const file = form.get('file');
  assert.equal(file.name, 'voice.webm');
  assert.equal(file.type, 'audio/webm');
  assert.equal(Buffer.from(await file.arrayBuffer()).toString(), 'fake-opus-audio');
});

test('transcribe honours WHISPER_MODEL and maps iPhone audio to m4a', async () => {
  const fetchImpl = fakeFetch();
  await transcribe({ audioBase64: audio, mime: 'audio/mp4', env: { ...ENV, WHISPER_MODEL: 'whisper-large-v3' }, fetchImpl });
  assert.equal(fetchImpl.calls[0].opts.body.get('model'), 'whisper-large-v3');
  assert.equal(fetchImpl.calls[0].opts.body.get('file').name, 'voice.m4a');
});

test('transcribe errors carry a code the server can map', async () => {
  const fetchImpl = fakeFetch();
  const code = async args => {
    try { await transcribe({ audioBase64: audio, mime: 'audio/webm', env: ENV, fetchImpl, ...args }); return 'ok'; } catch (e) { return e.code; }
  };
  assert.equal(await code({ env: {} }), 'NOT_CONFIGURED');
  assert.equal(await code({ audioBase64: '' }), 'BAD_AUDIO');
  assert.equal(await code({ mime: 'video/x-flv' }), 'BAD_AUDIO');
  assert.equal(await code({ audioBase64: Buffer.alloc(MAX_AUDIO_BYTES + 1).toString('base64') }), 'TOO_LARGE');
  assert.equal(await code({ fetchImpl: fakeFetch({}, 429) }), 'BUSY');
  assert.equal(await code({ fetchImpl: fakeFetch({ text: '   ' }) }), 'EMPTY');
  assert.equal(fetchImpl.calls.length, 0);
});
