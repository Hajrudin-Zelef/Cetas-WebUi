import { test } from 'node:test';
import assert from 'node:assert';
const store = {};
globalThis.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
};
globalThis.window = { confirm: () => true };
const m = await import('../../marexcode/js/marex-permission.js');

test('defaut Espace Write : write allow', () => {
    assert.equal(m.getRule('write'), 'allow');
    assert.ok(m.decidePermission('write', 'allow').allowed);
});
test('setRule + decide deny', () => {
    m.setRule('bash', 'deny');
    assert.equal(m.decidePermission('bash', 'deny').allowed, false);
});
test('ask demande confirmation (confirm true => allowed)', () => {
    m.setRule('write', 'ask');
    assert.ok(m.checkToolPermission('Write', { file_path: 'x' }).allowed);
});
test('read toujours configurable', () => {
    m.setRule('read', 'deny');
    assert.equal(m.decidePermission('read', 'deny').allowed, false);
});