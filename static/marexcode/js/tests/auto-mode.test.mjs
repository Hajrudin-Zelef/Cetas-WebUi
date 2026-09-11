import { test } from 'node:test';
import assert from 'node:assert';
import { AGENT_ROLES, resolveAgent, getToolsForRole } from '../agents.js';

const VALID_TOOL_NAMES = ['Bash', 'Read', 'Write', 'Edit', 'Grep', 'Glob', 'Ls', 'TodoWrite', 'LSP'];

test('AGENT_ROLES expose plan/code/audit', () => {
  assert.ok(AGENT_ROLES.plan, 'plan manquant');
  assert.ok(AGENT_ROLES.code, 'code manquant');
  assert.ok(AGENT_ROLES.audit, 'audit manquant');
  assert.deepEqual(Object.keys(AGENT_ROLES).sort(), ['audit', 'code', 'plan']);
});

test('resolveAgent mappe un rôle inconnu vers code', () => {
  assert.equal(resolveAgent('unknown').id, 'code');
  assert.equal(resolveAgent(undefined).id, 'code');
  assert.equal(resolveAgent('plan').id, 'plan');
  assert.equal(resolveAgent('audit').id, 'audit');
});

test('chaque rôle a model + tools non vides, noms d\'outils valides', () => {
  for (const role of Object.values(AGENT_ROLES)) {
    assert.ok(typeof role.model === 'string' && role.model.length > 0, `${role.id}: model requis`);
    assert.ok(Array.isArray(role.tools) && role.tools.length > 0, `${role.id}: tools non vide requis`);
    for (const t of role.tools) {
      assert.ok(VALID_TOOL_NAMES.includes(t), `${role.id}: outil inconnu dans MAREXCODE_TOOLS: ${t}`);
    }
  }
});
