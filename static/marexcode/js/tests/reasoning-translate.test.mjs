import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translateReasoning, buildReasoningTranslationPrompt } from '../reasoning-translate.js';

const steps = [
  { label: 'openrouter/free', provider: 'openrouter', model: 'openrouter/free', timeoutMs: 40 },
  { label: 'deepseek-chat', provider: 'deepseek', model: 'deepseek-chat', timeoutMs: 40 },
];

function httpErr(status) {
  const e = new Error('boom');
  e.status = status;
  return e;
}

test('primaire OK → traduction retournée, aucun fallback', async () => {
  const calls = [];
  const out = await translateReasoning('some reasoning', (step) => { calls.push(step.provider); return Promise.resolve({ text: 'une traduction' }); }, null, steps);
  assert.equal(out, 'une traduction');
  assert.deepEqual(calls, ['openrouter']);
});

test('primaire timeout → bascule DeepSeek (1 seul appel par niveau)', async () => {
  const calls = [];
  const out = await translateReasoning('some reasoning text', (step) => {
    calls.push(step.provider);
    if (step.provider === 'openrouter') return new Promise(() => {});
    return Promise.resolve({ text: 'traduction de secours' });
  }, null, steps);
  assert.equal(out, 'traduction de secours');
  assert.deepEqual(calls, ['openrouter', 'deepseek']);
});

test('primaire 429 → bascule DeepSeek', async () => {
  const calls = [];
  const out = await translateReasoning('reasoning', (step) => {
    calls.push(step.provider);
    if (step.provider === 'openrouter') return Promise.reject(httpErr(429));
    return Promise.resolve({ text: 'secours' });
  }, null, steps);
  assert.equal(out, 'secours');
  assert.deepEqual(calls, ['openrouter', 'deepseek']);
});

test('primaire réponse pattern d erreur → bascule DeepSeek', async () => {
  const calls = [];
  const out = await translateReasoning('reasoning', (step) => {
    calls.push(step.provider);
    if (step.provider === 'openrouter') return Promise.resolve({ text: 'Error: rate limit exceeded' });
    return Promise.resolve({ text: 'secours' });
  }, null, steps);
  assert.equal(out, 'secours');
  assert.deepEqual(calls, ['openrouter', 'deepseek']);
});

test('primaire réponse vide → bascule DeepSeek', async () => {
  const calls = [];
  const out = await translateReasoning('reasoning', (step) => {
    calls.push(step.provider);
    if (step.provider === 'openrouter') return Promise.resolve({ text: '   ' });
    return Promise.resolve({ text: 'secours' });
  }, null, steps);
  assert.equal(out, 'secours');
  assert.deepEqual(calls, ['openrouter', 'deepseek']);
});

test('primaire réponse tronquée (entrée longue) → bascule DeepSeek', async () => {
  const calls = [];
  const longRaw = 'x'.repeat(400);
  const out = await translateReasoning(longRaw, (step) => {
    calls.push(step.provider);
    if (step.provider === 'openrouter') return Promise.resolve({ text: 'trop court' });
    return Promise.resolve({ text: 'traduction complète de secours ' + 'y'.repeat(120) });
  }, null, steps);
  assert.match(out, /secours/);
  assert.deepEqual(calls, ['openrouter', 'deepseek']);
});

test('primaire réponse en anglais non traduite → rejetée (not-french) → bascule DeepSeek', async () => {
  const calls = [];
  const out = await translateReasoning('some reasoning', (step) => {
    calls.push(step.provider);
    if (step.provider === 'openrouter') {
      return Promise.resolve({ text: "Here's a thinking process: The user is asking to add a feature. I should first search the codebase then find the answer." });
    }
    return Promise.resolve({ text: "Voici la traduction française du raisonnement demandé." });
  }, null, steps);
  assert.match(out, /traduction française/i);
  assert.deepEqual(calls, ['openrouter', 'deepseek']);
});

test('primaire réponse FR acceptée (accents + mots français)', async () => {
  const calls = [];
  const out = await translateReasoning('some reasoning', (step) => {
    calls.push(step.provider);
    return Promise.resolve({ text: "L'utilisateur demande d'ajouter un bouton ; je dois d'abord chercher dans le code puis implémenter la modification." });
  }, null, steps);
  assert.match(out, /bouton/);
  assert.deepEqual(calls, ['openrouter']);
});

test('language guard: sortie longue sans aucun signal FR → not-french', async () => {
  const logs = [];
  await translateReasoning('reasoning', (step) => {
    if (step.provider === 'openrouter') {
      return Promise.resolve({ text: 'The quick brown fox jumps over the lazy dog while evaluating several candidate strategies.' });
    }
    return Promise.resolve({ text: 'Le renard brun rapide saute par-dessus le chien paresseux pendant plusieurs stratégies.' });
  }, (i) => logs.push(i), steps);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].reason, 'not-french');
});

test('les deux providers échouent → null (anglais conservé, pas de blocage)', async () => {
  const calls = [];
  const out = await translateReasoning('reasoning', (step) => {
    calls.push(step.provider);
    return Promise.reject(httpErr(step.provider === 'openrouter' ? 500 : 429));
  }, null, steps);
  assert.equal(out, null);
  assert.deepEqual(calls, ['openrouter', 'deepseek']);
});

test('pas de retry sur le même provider : 1 appel max par niveau', async () => {
  const counts = {};
  await translateReasoning('reasoning', (step) => {
    counts[step.provider] = (counts[step.provider] || 0) + 1;
    return Promise.reject(httpErr(500));
  }, null, steps);
  assert.equal(counts.openrouter, 1);
  assert.equal(counts.deepseek, 1);
});

test('console.debug : chaque échec est tracé avec provider + raison', async () => {
  const logs = [];
  await translateReasoning('reasoning', (step) => {
    if (step.provider === 'openrouter') return Promise.resolve({ text: '' });
    return Promise.resolve({ text: 'ok secours' });
  }, (info) => logs.push(info), steps);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].provider, 'openrouter/free');
  assert.equal(logs[0].reason, 'empty');
});

test('raw vide → null sans aucun appel provider', async () => {
  let called = false;
  const out = await translateReasoning('   ', () => { called = true; return Promise.resolve({ text: 'x' }); }, null, steps);
  assert.equal(out, null);
  assert.equal(called, false);
});

test('prompt de traduction inclut le reasoning brut', () => {
  const p = buildReasoningTranslationPrompt('RAISONNEMENT');
  assert.match(p, /français/);
  assert.match(p, /RAISONNEMENT$/);
});
