import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const toolSrc = readFileSync(join(here, '..', 'integrations', 'tool-search.js'), 'utf8');
const apiSrc = readFileSync(join(here, '..', 'core', 'api.js'), 'utf8');

const sseStart = apiSrc.indexOf('async function*readSSE');
const sseEnd = apiSrc.indexOf('function createOpenAIResponsesParser');
assert.ok(sseStart > -1 && sseEnd > sseStart, 'readSSE/parser introuvables dans api.js');
const apiFns = apiSrc.slice(sseStart, sseEnd);

function abortErr() {
  const e = new Error('This operation was aborted');
  e.name = 'AbortError';
  return e;
}

function sseBytes(obj) {
  return new TextEncoder().encode('data: ' + JSON.stringify(obj) + '\n\n');
}
function doneBytes() {
  return new TextEncoder().encode('data: [DONE]\n\n');
}

function streamResponse(chunks) {
  let i = 0;
  let pendingReject = null;
  const reader = {
    read() {
      if (i < chunks.length) return Promise.resolve({ done: false, value: chunks[i++] });
      return new Promise((_, rej) => { pendingReject = rej; });
    }
  };
  return {
    ok: true,
    status: 200,
    body: { getReader: () => reader },
    stall: true,
    abort() { if (pendingReject) pendingReject(abortErr()); }
  };
}

function loadToolSearch(opts = {}) {
  const { readSSE, createChatCompletionsParser } =
    new Function('TextDecoder', apiFns + ';return {readSSE, createChatCompletionsParser, createThinkTagParser};')(TextDecoder);

  const streams = [];
  const calls = { done: 0, error: 0, errors: [], chunks: 0 };

  const win = {
    dispatchEvent() {},
    FORCE_WEB_SEARCH: false,
    _streamIdleTimeoutMs: opts.idleMs ?? 40,
    _toolMaxIterations: 15
  };

  async function fetchStub(url, fopts) {
    if (typeof url === 'string' && url.indexOf('/api/exec') === 0) {
      return { ok: true, status: 200, json: async () => ({ text: 'tool-result-ok' }) };
    }
    const resp = streamResponse(opts.makeChunks ? opts.makeChunks(streams.length) : [sseBytes({ choices: [{ delta: { content: 'x' } }] })]);
    streams.push(resp);
    if (fopts && fopts.signal) {
      if (fopts.signal.aborted) { resp.abort(); }
      else fopts.signal.addEventListener('abort', () => resp.abort());
    }
    return resp;
  }

  const PROVIDERS = {
    openai: {
      getHeaders: () => ({}),
      getUrl: () => 'http://fake.local/v1/chat/completions',
      formatMessages: (m) => m,
      buildBody: (model, msgs) => ({ model, messages: msgs, stream: true })
    }
  };

  const factory = new Function(
    'window', 'fetch', 'getModelEditeur', 'PROVIDERS',
    'createChatCompletionsParser', 'readSSE', 'AbortController', 'AbortSignal', 'CustomEvent',
    toolSrc + ';return {streamModelWithTools};'
  );
  const { streamModelWithTools } = factory(
    win, fetchStub, () => 'openai', PROVIDERS,
    createChatCompletionsParser, readSSE, AbortController, AbortSignal,
    class CustomEvent { constructor(t, o) { this.type = t; this.detail = o && o.detail; } }
  );

  return { streamModelWithTools, calls, streams, win };
}

function settle(env, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('timeout'), ms);
    env.calls.doneFired = () => { clearTimeout(timer); resolve('done'); };
    env.calls.errorFired = (err) => { clearTimeout(timer); resolve('error'); };
  });
}

function run(env, { signal, history } = {}) {
  const h = history || [{ role: 'user', content: 'implémente X' }];
  const p = settle(env, 1500);
  env.streamModelWithTools(
    'test-model', h,
    () => { env.calls.chunks++; },
    () => { env.calls.done++; if (env.calls.doneFired) env.calls.doneFired(); },
    (err) => { env.calls.error++; env.calls.errors.push(err); if (env.calls.errorFired) env.calls.errorFired(err); },
    null, false, null, signal ?? null, null, null, 0
  ).catch(() => { /* rejection hors fix = pas un gel, ignorée ici */ });
  return p;
}

test('stream SSE stallé en pleine implémentation → onError (garde-fou inactivité)', async () => {
  const env = loadToolSearch();
  const verdict = await run(env);
  assert.equal(verdict, 'error', 'onError doit être déclenché par le watchdog, onDone/onError jamais appelés = gel');
  assert.equal(env.calls.done, 0, 'onDone ne doit pas être appelé sur stall');
  assert.match(String(env.calls.errors[0] && env.calls.errors[0].message), /silenc|inactif|inactivity/i);
});

test('complétion normale ([DONE]) → onDone, pas onError', async () => {
  const env = loadToolSearch({
    makeChunks: () => [
      sseBytes({ choices: [{ delta: { content: 'hello' } }] }),
      sseBytes({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
      doneBytes()
    ]
  });
  const verdict = await run(env);
  assert.equal(verdict, 'done');
  assert.equal(env.calls.error, 0);
});

test('stop utilisateur (abort caller) en plein stream → onDone, jamais onError', async () => {
  const env = loadToolSearch({ idleMs: 5000 });
  const ctl = new AbortController();
  const p = run(env, { signal: ctl.signal });
  setTimeout(() => ctl.abort(), 30);
  const verdict = await p;
  assert.equal(verdict, 'done', 'un abort explicit doit rester traité comme une fin, pas une erreur');
  assert.equal(env.calls.error, 0);
});

test('boucle d outils puis stall itération 2 → onError (gel mid-implementation)', async () => {
  const env = loadToolSearch({
    makeChunks: (n) => n === 0 ? [
      sseBytes({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'tc1', type: 'function', function: { name: 'Read', arguments: '{"file_path":"a.py","limit":50}' } }] } }] }),
      sseBytes({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
      doneBytes()
    ] : [sseBytes({ choices: [{ delta: { content: 'y' } }] })]
  });
  const verdict = await run(env);
  assert.equal(verdict, 'error', "stall après exécution d'outil = le gel rapporté ; le watchdog doit lever onError");
  assert.ok(env.streams.length >= 2, 'la boucle outils doit avoir rappelé le modèle au moins une fois');
});
