import { test } from 'node:test';
import assert from 'node:assert';
import { AGENT_ROLES, resolveAgent, getToolsForRole } from '../agents.js';
import { classifyTask } from '../task-classifier.js';
import { buildProjectIndex, checkCompaction, estimateTokens, COMPACTION_THRESHOLD } from '../context-store.js';
import { composePrompt } from '../prompt-composer.js';

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

test('classifyTask: plan pour demande d\'analyse/architecture', () => {
  assert.equal(classifyTask('Analyse ce projet et propose une architecture'), 'plan');
  assert.equal(classifyTask('conçois le module de paiement'), 'plan');
  assert.equal(classifyTask('Plan de refonte du frontend'), 'plan');
});

test('classifyTask: audit pour vérification/test/sécurité', () => {
  assert.equal(classifyTask('Vérifie les tests du backend'), 'audit');
  assert.equal(classifyTask('audite la sécurité de auth.js'), 'audit');
  assert.equal(classifyTask('corriger le bug de login'), 'audit');
});

test('classifyTask: rapport de bug à corriger = code (fix direct), pas audit', () => {
  assert.equal(classifyTask('Bug: le login casse, corrige-le'), 'code');
  assert.equal(classifyTask('bug: la sidebar ne charge plus'), 'code');
  assert.equal(classifyTask("vérifie s'il y a un bug dans auth.js"), 'audit');
});

test('classifyTask: code par défaut', () => {
  assert.equal(classifyTask('crée un composant sidebar'), 'code');
  assert.equal(classifyTask('implemente la fonction de recherche'), 'code');
  assert.equal(classifyTask(''), 'code');
  assert.equal(classifyTask(null), 'code');
  assert.equal(classifyTask(undefined), 'code');
});

test('buildProjectIndex: entries {path, size, ext}, jamais de contenu', () => {
  const tree = { files: [
    { path: 'src/app.js', type: 'file', size: 1200, content: 'var x = 1;' },
    { path: 'README.md', type: 'file', size: 40 },
    { path: 'noext', type: 'file', size: 5 },
  ] };
  const index = buildProjectIndex(tree);
  assert.equal(index.length, 3);
  assert.deepEqual(index[0], { path: 'src/app.js', size: 1200, ext: '.js' });
  assert.equal(index[1].ext, '.md');
  assert.equal(index[2].ext, '');
  assert.ok(!('content' in index[0]), 'le contenu ne doit pas être dans l\'index');
  assert.ok(!('type' in index[0]), 'seuls path/size/ext sont exposés');
});

test('buildProjectIndex: accepte aussi une liste brute', () => {
  const index = buildProjectIndex([{ path: 'a.py', size: 10 }]);
  assert.equal(index.length, 1);
  assert.equal(index[0].ext, '.py');
});

test('checkCompaction: history sous le seuil = inchangé', () => {
  const history = [
    { role: 'system', content: 'SYS' },
    { role: 'user', content: 'petite question' },
    { role: 'assistant', content: 'petite réponse' },
  ];
  const out = checkCompaction(history);
  assert.equal(out, history);
});

test('checkCompaction: seuil dépassé → system + derniers tours intacts, anciens fusionnés en UN résumé', () => {
  const big = 'x'.repeat(COMPACTION_THRESHOLD * 4 + 100);
  const history = [
    { role: 'system', content: 'SYS_PROMPT' },
    { role: 'user', content: big },
    { role: 'assistant', content: 'lecture', tool_calls: [
      { id: '1', type: 'function', function: { name: 'Read', arguments: JSON.stringify({ file_path: 'src/app.js' }) } },
      { id: '2', type: 'function', function: { name: 'Bash', arguments: JSON.stringify({ command: 'npm test' }) } },
    ] },
    { role: 'tool', tool_call_id: '1', content: 'ok' },
    { role: 'tool', tool_call_id: '2', content: 'ok' },
  ];
  for (let i = 0; i < 6; i++) {
    history.push({ role: i % 2 ? 'assistant' : 'user', content: `recent-${i}` });
  }
  assert.ok(estimateTokens(history) > COMPACTION_THRESHOLD, 'précondition: history au-dessus du seuil');

  const out = checkCompaction(history);
  assert.ok(out.length < history.length, 'la version compactée doit être plus courte');
  assert.equal(out[0], history[0], 'le system prompt de tête est conservé intact');
  assert.deepEqual(out.slice(-6), history.slice(-6), 'les 6 derniers tours sont conservés intacts');
  const summaries = out.filter(m => m !== history[0] && String(m.content || '').includes('[Contexte précédent]'));
  assert.equal(summaries.length, 1, 'exactement UN message résumé');
  assert.ok(summaries[0].content.includes('src/app.js'), 'le résumé liste les fichiers lus');
  assert.ok(summaries[0].content.includes('npm test'), 'le résumé liste les commandes exécutées');
});

test('estimateTokens: ~4 caractères par token', () => {
  assert.equal(estimateTokens([{ role: 'user', content: 'x'.repeat(400) }]), 100);
});

test('composePrompt: inclut le systemPrompt du rôle', () => {
  const agent = { systemPrompt: 'PROMPT_DU_ROLE_XYZ' };
  const out = composePrompt(agent, {});
  assert.ok(out.includes('PROMPT_DU_ROLE_XYZ'));
  assert.ok(out.indexOf('PROMPT_DU_ROLE_XYZ') < out.length / 2, 'le prompt du rôle doit être en tête');
});

test('composePrompt: index projet formaté en arbre lisible (paths groupés, pas de dump JSON)', () => {
  const agent = { systemPrompt: 'S' };
  const contextStore = { index: [
    { path: 'src/app.js', size: 100, ext: '.js' },
    { path: 'src/utils.js', size: 50, ext: '.js' },
    { path: 'index.html', size: 10, ext: '.html' },
  ] };
  const out = composePrompt(agent, contextStore);
  assert.ok(out.includes('src/app.js'), 'les chemins doivent apparaître');
  assert.ok(out.includes('src/utils.js'));
  assert.ok(out.includes('index.html'));
  assert.ok(!out.includes('"path"'), 'pas de dump JSON brut');
  assert.ok(!out.includes('{'), 'pas de syntaxe JSON dans le bloc index');
});

test('composePrompt: previousPhase inclus, clairement délimité', () => {
  const agent = { systemPrompt: 'S' };
  const out = composePrompt(agent, { previousPhase: '1. Créer utils.js' });
  assert.ok(out.includes('1. Créer utils.js'));
  assert.ok(/##\s+.*phase précédente/i.test(out), 'doit être délimité par un titre de section');
});

test('composePrompt: previousPhase absent/null ne plante pas', () => {
  const agent = { systemPrompt: 'S' };
  composePrompt(agent, {});
  composePrompt(agent, { previousPhase: null });
  composePrompt(agent);
  const out = composePrompt(agent, { previousPhase: null });
  assert.ok(!/##\s+.*phase précédente/i.test(out), 'pas de section vide si pas de phase précédente');
});


