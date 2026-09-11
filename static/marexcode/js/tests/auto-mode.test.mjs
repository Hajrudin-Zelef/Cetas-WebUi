import { test } from 'node:test';
import assert from 'node:assert';
import { AGENT_ROLES, resolveAgent, getToolsForRole } from '../agents.js';
import { classifyTask } from '../task-classifier.js';
import { buildProjectIndex, checkCompaction, estimateTokens, COMPACTION_THRESHOLD } from '../context-store.js';
import { composePrompt } from '../prompt-composer.js';
import { runAutoMode, AUTO_PHASES } from '../runtime.js';
import { getAutoModelConfig, setAutoModel, getEffectiveModel, getEffectiveMaxTokens, MODEL_CONTEXT_LIMITS } from '../auto-mode-config.js';

const lsStore = {};
globalThis.localStorage = {
  getItem: (k) => (k in lsStore ? lsStore[k] : null),
  setItem: (k, v) => { lsStore[k] = String(v); },
  removeItem: (k) => { delete lsStore[k]; },
};

const VALID_TOOL_NAMES = ['Bash', 'Read', 'Write', 'Edit', 'Grep', 'Glob', 'Ls', 'TodoWrite', 'LSP', 'RunScript'];

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

test('getToolsForRole: RunScript filtré pour code, absent pour plan/audit', () => {
  const globalTools = VALID_TOOL_NAMES.map(n => ({ type: 'function', function: { name: n, description: 'd', parameters: {} } }));
  const codeTools = getToolsForRole(AGENT_ROLES.code, globalTools).map(t => t.function.name);
  const planTools = getToolsForRole(AGENT_ROLES.plan, globalTools).map(t => t.function.name);
  const auditTools = getToolsForRole(AGENT_ROLES.audit, globalTools).map(t => t.function.name);
  assert.ok(codeTools.includes('RunScript'), 'code doit avoir RunScript');
  assert.ok(!planTools.includes('RunScript'), 'plan (lecture seule) ne doit pas avoir RunScript');
  assert.ok(!auditTools.includes('RunScript'), 'audit (lecture seule) ne doit pas avoir RunScript');
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

test('AUTO_PHASES = plan, code, audit dans cet ordre', () => {
  assert.deepEqual(AUTO_PHASES, ['plan', 'code', 'audit']);
});

test('runAutoMode: enchaîne les 3 phases, onPhase appelé avant chacune, onDone à la fin', async () => {
  const phaseCalls = [];
  const chunks = [];
  let doneOutputs = null;
  let streamCalls = 0;

  const fakeStream = (model, history, onChunk, onDone, onError, tools, hasToolCalls, onThinking, signal) => {
    streamCalls++;
    const phase = history[0].content;
    const label = phase.includes('architecte') ? 'plan' : phase.includes('développeur') ? 'code' : 'audit';
    onChunk('[' + label + '-res]');
    onDone({ input_tokens: 1, output_tokens: 2 });
  };

  await runAutoMode({
    task: 'construis un module',
    tree: { files: [{ path: 'a.js', size: 10, type: 'file' }] },
    signal: undefined,
    onPhase: (p) => phaseCalls.push(p),
    onChunk: (c) => chunks.push(c),
    onDone: (o) => { doneOutputs = o; },
    onError: (e) => { throw e; },
    _stream: fakeStream,
  });

  assert.equal(streamCalls, 3, 'streamModelWithTools appelé une fois par phase');
  assert.deepEqual(phaseCalls.map(p => p.phase), ['plan', 'code', 'audit']);
  assert.ok(phaseCalls.every(p => p.agent && p.model), 'onPhase fournit agent + model');
  assert.ok(doneOutputs && doneOutputs.length === 3, 'onDone reçoit un output par phase');
  assert.ok(chunks.includes('[plan-res]') && chunks.includes('[code-res]') && chunks.includes('[audit-res]'));
});

test('runAutoMode: chaque phase reçoit le résultat de la précédente (contextStore.previousPhase)', async () => {
  const seenPrompts = [];
  const fakeStream = (model, history, onChunk, onDone) => {
    seenPrompts.push(history[0].content);
    onChunk('PLAN-DETAIL');
    onDone({});
  };
  await runAutoMode({
    task: 't',
    tree: { files: [] },
    onPhase: () => {},
    _stream: fakeStream,
  });
  assert.equal(seenPrompts.length, 3);
  assert.ok(seenPrompts[0].includes('architecte'), 'phase plan: prompt architecte, sans previousPhase');
  assert.ok(!seenPrompts[0].includes('phase précédente'), 'phase 1 n\'a pas de section phase précédente');
  assert.ok(seenPrompts[1].includes('PLAN-DETAIL'), 'phase code: contient le résultat du plan');
  assert.ok(seenPrompts[2].includes('PLAN-DETAIL'), 'phase audit: contient le résultat cumulé');
});

test('runAutoMode: limitation documentée - le contexte inter-phases est du texte final uniquement, pas de tool_calls reconstitués', async () => {
  const historiesSeen = [];
  const fakeStream = (model, history, onChunk, onDone) => {
    historiesSeen.push(history.map(m => m.role).join(','));
    onChunk('phase-output');
    onDone({});
  };
  await runAutoMode({
    task: 't',
    tree: { files: [] },
    _stream: fakeStream,
  });
  for (const shape of historiesSeen) {
    assert.equal(shape, 'system,user', 'streamModelWithTools ne rend pas l\'historique enrichi de tool_calls : aucune reconstitution ne doit être injectée entre les phases');
  }
});

test('runAutoMode: onError propage une erreur du stream et interrompt la chaîne', async () => {
  let captured = null;
  let calls = 0;
  const fakeStream = (model, history, onChunk, onDone, onError) => {
    calls++;
    onError(new Error('boom'));
  };
  await runAutoMode({
    task: 't',
    tree: { files: [] },
    onError: (e) => { captured = e; },
    _stream: fakeStream,
  });
  assert.ok(captured instanceof Error, 'la phase d\'erreur doit appeler onError');
  assert.equal(captured.message, 'boom');
  assert.equal(calls, 1, 'la chaîne s\'arrête après la première erreur');
});

test('getAutoModelConfig: localStorage vide ou JSON invalide → {} sans exception', () => {
  delete lsStore['marexcode_auto_models'];
  assert.deepEqual(getAutoModelConfig(), {});
  lsStore['marexcode_auto_models'] = '{pas du json';
  assert.deepEqual(getAutoModelConfig(), {});
  lsStore['marexcode_auto_models'] = '[1,2]';
  assert.deepEqual(getAutoModelConfig(), {});
  delete lsStore['marexcode_auto_models'];
});

test('setAutoModel: écrit puis fusionne sans écraser les autres rôles', () => {
  delete lsStore['marexcode_auto_models'];
  setAutoModel('plan', 'glm-9');
  assert.deepEqual(getAutoModelConfig(), { plan: 'glm-9' });
  setAutoModel('audit', 'deepseek-x');
  assert.deepEqual(getAutoModelConfig(), { plan: 'glm-9', audit: 'deepseek-x' });
  setAutoModel('code', 'kimi-y');
  assert.deepEqual(getAutoModelConfig(), { plan: 'glm-9', audit: 'deepseek-x', code: 'kimi-y' });
  delete lsStore['marexcode_auto_models'];
});

test('getEffectiveModel: modèle configuré si présent, sinon placeholder agent.model', () => {
  delete lsStore['marexcode_auto_models'];
  const agent = { id: 'code', model: 'model-code' };
  assert.equal(getEffectiveModel('code', agent), 'model-code', 'placeholder quand non configuré');
  setAutoModel('code', 'glm-5.2');
  assert.equal(getEffectiveModel('code', agent), 'glm-5.2', 'configuré prioritaire');
  setAutoModel('code', '   ');
  assert.equal(getEffectiveModel('code', agent), 'model-code', 'chaîne vide = fallback placeholder');
  delete lsStore['marexcode_auto_models'];
});

test('resolveAgent: .model résolu depuis la config, placeholder comme fallback, AGENT_ROLES non muté', () => {
  delete lsStore['marexcode_auto_models'];
  setAutoModel('code', 'kimi-k2.6');
  assert.equal(resolveAgent('code').model, 'kimi-k2.6', 'rôle configuré → modèle effectif');
  assert.equal(resolveAgent('plan').model, 'model-plan', 'rôle non configuré → placeholder');
  assert.equal(AGENT_ROLES.code.model, 'model-code', 'AGENT_ROLES garde le placeholder intact (pas de mutation)');
  assert.equal(resolveAgent('inconnu').model, 'kimi-k2.6', 'rôle inconnu → code, donc config code');
  delete lsStore['marexcode_auto_models'];
});

test('getEffectiveMaxTokens: placeholder quand le modèle effectif est absent de MODEL_CONTEXT_LIMITS', () => {
  delete lsStore['marexcode_auto_models'];
  const agent = { id: 'code', model: 'model-code', maxTokens: 32000 };
  assert.equal(getEffectiveMaxTokens('code', agent), 32000, 'modèle placeholder non borné → agent.maxTokens');
  setAutoModel('code', 'modele-hors-table');
  assert.equal(getEffectiveMaxTokens('code', agent), 32000, 'modèle configuré mais absent de la table → fallback');
  delete lsStore['marexcode_auto_models'];
});

test('getEffectiveMaxTokens: valeur de la table quand le modèle effectif y figure', () => {
  delete lsStore['marexcode_auto_models'];
  MODEL_CONTEXT_LIMITS['glm-test'] = 128000;
  try {
    const agent = { id: 'code', model: 'model-code', maxTokens: 32000 };
    setAutoModel('code', 'glm-test');
    assert.equal(getEffectiveMaxTokens('code', agent), 128000);
  } finally {
    delete MODEL_CONTEXT_LIMITS['glm-test'];
    assert.deepEqual(MODEL_CONTEXT_LIMITS, {}, 'la table livrée doit rester vide');
    delete lsStore['marexcode_auto_models'];
  }
});

test('resolveAgent: maxTokens résolu en plus de model, AGENT_ROLES non muté', () => {
  delete lsStore['marexcode_auto_models'];
  MODEL_CONTEXT_LIMITS['kimi-max'] = 200000;
  try {
    setAutoModel('code', 'kimi-max');
    const agent = resolveAgent('code');
    assert.equal(agent.model, 'kimi-max');
    assert.equal(agent.maxTokens, 200000, 'maxTokens suivi depuis la table');
    assert.equal(AGENT_ROLES.code.maxTokens, 32000, 'AGENT_ROLES.code.maxTokens intact');
    const plan = resolveAgent('plan');
    assert.equal(plan.maxTokens, 16000, 'plan non configuré → son placeholder maxTokens');
  } finally {
    delete MODEL_CONTEXT_LIMITS['kimi-max'];
    delete lsStore['marexcode_auto_models'];
  }
});

test('runAutoMode: signal déjà aborted → aucune phase lancée, sortie propre', async () => {
  let calls = 0;
  let doneCalled = false;
  const fakeStream = () => { calls++; };
  const outputs = await runAutoMode({
    task: 't',
    tree: { files: [] },
    signal: { aborted: true },
    _stream: fakeStream,
    onDone: () => { doneCalled = true; },
  });
  assert.equal(calls, 0, 'aucun stream ne doit être appelé après abort');
  assert.deepEqual(outputs, [], 'aucune sortie');
  assert.equal(doneCalled, false, 'onDone (succès complet) ne doit pas être appelé sur abort');
});

test('runAutoMode: abort pendant la phase 1 → phase 2 et 3 NON lancées, outputs partiels conservés', async () => {
  const sig = { aborted: false };
  let calls = 0;
  const fakeStream = (model, history, onChunk, onDone) => {
    calls++;
    if (calls === 1) {
      onChunk('partial-plan');
      sig.aborted = true;
    }
    onDone(null, []);
  };
  const outputs = await runAutoMode({
    task: 't',
    tree: { files: [] },
    signal: sig,
    _stream: fakeStream,
  });
  assert.equal(calls, 1, 'la chaîne doit s\'arrêter après l\'abort, sans rappeler le stream');
  assert.equal(outputs.length, 1, 'la phase 1 déjà terminée reste dans les sorties');
  assert.equal(outputs[0].phase, 'plan');
});



