// Tests SamAgent — `node --test js/router.test.mjs` (aucune dépendance)
// © Marexsoft Corporation. Fondateur Kouassi Marius.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// ── Environnement minimal (localStorage + window) ──
const store = {};
globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
};
globalThis.window = globalThis;

const R = require(new URL('./router.js', import.meta.url).pathname);
const C = R.ROUTER_CONFIG;
const KNOWN_PROVIDERS = new Set(['groq', 'google', 'openrouter', 'deepseek', 'mistral', 'opencode', 'llamacpp', 'ollama', 'lmstudio']);

test('classifyIntent FR sans accents → coder', () => {
    assert.equal(R.classifyIntent('ecris moi une fonction qui trie un tableau'), 'coder');
});
test('classifyIntent FR accents → coder', () => {
    assert.equal(R.classifyIntent('écris une fonction récursive'), 'coder');
});
test('classifyIntent salutation → chat', () => {
    assert.equal(R.classifyIntent('salut ça va ?'), 'chat');
});
test('classifyIntent raisonnement FR sans accents', () => {
    assert.equal(R.classifyIntent('explique pourquoi cette reflexion est analysee'), 'raisonnement');
});
test('scoreComplexity reste dans 0-100', () => {
    for (let i = 0; i < 300; i++) {
        const s = R.scoreComplexity('x'.repeat(i) + (i % 2 ? '? function foo(a){' : ''));
        assert.ok(s >= 0 && s <= 100, `score ${s} hors bornes pour len=${i}`);
    }
});
test('ROUTER_CONFIG : intents non vides, providers connus, pas de nvidia', () => {
    for (const tier of Object.keys(C)) {
        for (const intent of ['chat', 'coder', 'raisonnement']) {
            assert.ok(Array.isArray(C[tier][intent]) && C[tier][intent].length > 0, `${tier}/${intent} vide`);
            for (const m of C[tier][intent]) {
                assert.ok(KNOWN_PROVIDERS.has(m.provider), `${tier}/${intent} provider inconnu: ${m.provider}`);
                assert.notEqual(m.provider, 'nvidia', 'nvidia ne doit plus être dans les pools');
            }
        }
    }
    const flat = Object.values(C).flatMap((t) => Object.values(t)).flat();
    assert.ok(flat.some((m) => m.provider === 'mistral'), 'mistral présent');
    assert.ok(flat.some((m) => m.provider === 'opencode'), 'opencode présent');
});
test('routeModel : jamais null (prompt vide, complexe, chaque tier)', async () => {
    const ok = (r, label) => { assert.ok(r && r.modelId && r.provider, label); };
    ok(await R.routeModel('', 'samagent-n4'), 'vide');
    const complex = 'Implement a distributed rate limiter in Go, async, redis, memory, security, deploy, benchmark, explain architecture, compare 3 approaches ?';
    ok(await R.routeModel(complex, 'samagent-n4'), 'complexe');
    for (const m of ['samagent-nano', 'samagent-n4-flash', 'samagent-n4', 'samagent-n8']) {
        ok(await R.routeModel('bonjour', m), m);
    }
});
test('routeModel : signal aborted ne jette jamais', async () => {
    const ac = new AbortController();
    ac.abort();
    const r = await R.routeModel('salut', 'samagent-n8', ac.signal);
    assert.ok(r && r.modelId);
});
test('fallback : maillons = providers distincts', async () => {
    const r = await R.routeModel('implémente une fonction python', 'samagent-n8');
    assert.ok(r && r._fallback, 'fallback présent');
    if (r._fallback._nextFallback) {
        assert.notEqual(r.provider, r._fallback.provider, 'fb1 ≠ primary');
        assert.notEqual(r._fallback.provider, r._fallback._nextFallback.provider, 'fb2 ≠ fb1');
    }
});
test('health : circuit-breaker exclut un modèle mort du tirage', () => {
    const pool = C['n4'].chat;
    const target = pool[0];
    for (let i = 0; i < 3; i++) R.recordRouteResult(target.model, false, 500);
    const seen = new Set();
    for (let i = 0; i < 60; i++) seen.add(R._pickFromPool(pool, 'n4:chat').model);
    assert.ok(!seen.has(target.model), 'modèle en circuit-breaker écarté');
});
test('télémétrie : ring buffer cap 50', () => {
    for (let i = 0; i < 80; i++) R.recordRouteResult('tel' + (i % 4), i % 2 === 0, 100 + i);
    assert.equal(R._loadTraces().length, 50);
});
test('registre local : moteur down → exclu, engine isolation', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = async (url) =>
        String(url).includes('/api/proxy/llamacpp/v1/models')
            ? { ok: true, json: async () => ({ data: [{ id: 'Qwen3.5-4B' }] }) }
            : { ok: false, json: async () => ({}) };
    R._localCache = null;
    const reg = await R.refreshLocalRegistry(true);
    assert.equal(reg.models.length, 1);
    assert.equal(reg.models[0].provider, 'llamacpp');
    globalThis.fetch = orig;
});
test('aucun modèle retiré upstream dans les pools ni les chaînes de fallback', async () => {
    // Modèles décommissionnés par leurs providers (ne doivent plus jamais être routés).
    const DEPRECATED = new Set(['llama-3.1-8b-instant', 'qwen/qwen3-32b', 'meta-llama/llama-4-scout-17b-16e-instruct', 'gemini-2.5-flash', 'gemini-2.5-flash-lite']);
    for (const tier of Object.keys(C)) {
        for (const intent of Object.keys(C[tier])) {
            for (const m of C[tier][intent]) {
                assert.ok(!DEPRECATED.has(m.model), `pool ${tier}/${intent} contient un modèle retiré: ${m.model}`);
            }
        }
    }
    // Chaîne de fallback (primary + maillons) via routeModel, tirages répétés (aléatoire).
    for (const sam of ['samagent-nano', 'samagent-n4-flash', 'samagent-n4', 'samagent-n8']) {
        for (let i = 0; i < 40; i++) {
            const r = await R.routeModel('salut', sam);
            for (const link of [r, r._fallback, r._fallback && r._fallback._nextFallback]) {
                if (!link) continue;
                const id = link.modelId || link.model;
                assert.ok(!DEPRECATED.has(id), `${sam} : fallback/route vers un modèle retiré: ${id}`);
            }
        }
    }
});
test('_routerAbort : timeout et cleanup', () => {
    const a = R._routerAbort(null, 5);
    return new Promise((res) => setTimeout(() => { assert.ok(a.signal.aborted, 'timeout aborted'); a.cleanup(); res(); }, 30));
});
