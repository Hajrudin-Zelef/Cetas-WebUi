import { test } from 'node:test';
import assert from 'node:assert';
import { AGENT_ROLES, resolveAgent, getToolsForRole } from '../agents.js';
import { classifyTask } from '../task-classifier.js';
import { buildProjectIndex, checkCompaction, estimateTokens, COMPACTION_THRESHOLD } from '../context-store.js';
import { composePrompt } from '../prompt-composer.js';
import { runAutoMode, AUTO_PHASES } from '../runtime.js';
import { getAutoModelConfig, setAutoModel, getEffectiveModel, getEffectiveMaxTokens, MODEL_CONTEXT_LIMITS, getAutoRoleConfig, setAutoRoleConfig } from '../auto-mode-config.js';

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
  assert.deepEqual(getAutoModelConfig(), { plan: { model: 'glm-9' } });
  setAutoModel('audit', 'deepseek-x');
  assert.deepEqual(getAutoModelConfig(), { plan: { model: 'glm-9' }, audit: { model: 'deepseek-x' } });
  setAutoModel('code', 'kimi-y');
  assert.deepEqual(getAutoModelConfig(), { plan: { model: 'glm-9' }, audit: { model: 'deepseek-x' }, code: { model: 'kimi-y' } });
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



const EMPTY_ROLE = { model: null, provider: null, temperature: null, maxTokens: null, systemPrompt: null, tools: null };

test('getAutoRoleConfig: ancien format string lu comme {model}, rétrocompatibilité silencieuse', () => {
  delete lsStore['marexcode_auto_models'];
  lsStore['marexcode_auto_models'] = JSON.stringify({ plan: 'glm-9' });
  assert.deepEqual(getAutoRoleConfig('plan'), Object.assign({ model: 'glm-9' }, EMPTY_ROLE, { model: 'glm-9' }));
  delete lsStore['marexcode_auto_models'];
});

test('getAutoRoleConfig: nouveau format objet, champs manquants remplis à null', () => {
  delete lsStore['marexcode_auto_models'];
  lsStore['marexcode_auto_models'] = JSON.stringify({ code: { model: 'kimi', temperature: 0.2 } });
  assert.deepEqual(getAutoRoleConfig('code'), { model: 'kimi', provider: null, temperature: 0.2, maxTokens: null, systemPrompt: null, tools: null });
  delete lsStore['marexcode_auto_models'];
});

test('getAutoRoleConfig: rôle jamais configuré ou valeur invalide → défauts sûrs, sans exception', () => {
  delete lsStore['marexcode_auto_models'];
  assert.deepEqual(getAutoRoleConfig('plan'), EMPTY_ROLE);
  lsStore['marexcode_auto_models'] = JSON.stringify({ audit: 42 });
  assert.deepEqual(getAutoRoleConfig('audit'), EMPTY_ROLE);
  lsStore['marexcode_auto_models'] = JSON.stringify({ audit: ['x'] });
  assert.deepEqual(getAutoRoleConfig('audit'), EMPTY_ROLE);
  delete lsStore['marexcode_auto_models'];
});

test('setAutoRoleConfig: merge superficiel, autres champs préservés, autres rôles intacts', () => {
  delete lsStore['marexcode_auto_models'];
  setAutoRoleConfig('code', { model: 'glm-test', temperature: 0.5 });
  setAutoRoleConfig('code', { temperature: 0.8 });
  assert.equal(getAutoModelConfig().code.model, 'glm-test', 'model préservé');
  assert.equal(getAutoModelConfig().code.temperature, 0.8, 'seul le champ fourni est écrasé');
  setAutoRoleConfig('plan', { model: 'plan-m' });
  assert.equal(getAutoModelConfig().plan.model, 'plan-m');
  assert.equal(getAutoModelConfig().code.temperature, 0.8, 'rôle code intact');
  delete lsStore['marexcode_auto_models'];
});

test('setAutoRoleConfig: config invalide ignorée sans exception ni écriture', () => {
  delete lsStore['marexcode_auto_models'];
  setAutoRoleConfig('code', null);
  setAutoRoleConfig('code', 'oops');
  setAutoRoleConfig('code', [1]);
  assert.deepEqual(getAutoModelConfig(), {}, 'rien ne doit être écrit');
  delete lsStore['marexcode_auto_models'];
});

test('setAutoModel: équivaut à setAutoRoleConfig(role, {model})', () => {
  delete lsStore['marexcode_auto_models'];
  setAutoModel('audit', 'ds-x');
  assert.deepEqual(getAutoRoleConfig('audit'), Object.assign({}, EMPTY_ROLE, { model: 'ds-x' }));
  assert.deepEqual(getAutoModelConfig(), { audit: { model: 'ds-x' } });
  delete lsStore['marexcode_auto_models'];
});

test('getEffectiveModel: fonctionne sur ancien et nouveau format', () => {
  delete lsStore['marexcode_auto_models'];
  const agent = { id: 'code', model: 'model-code', maxTokens: 32000 };
  lsStore['marexcode_auto_models'] = JSON.stringify({ code: 'legacy-str' });
  assert.equal(getEffectiveModel('code', agent), 'legacy-str', 'ancien format string');
  lsStore['marexcode_auto_models'] = JSON.stringify({ code: { model: 'obj-model' } });
  assert.equal(getEffectiveModel('code', agent), 'obj-model', 'nouveau format objet');
  lsStore['marexcode_auto_models'] = JSON.stringify({ code: { model: '   ' } });
  assert.equal(getEffectiveModel('code', agent), 'model-code', 'objet avec model vide → placeholder');
  lsStore['marexcode_auto_models'] = JSON.stringify({ code: {} });
  assert.equal(getEffectiveModel('code', agent), 'model-code', 'objet sans model → placeholder');
  delete lsStore['marexcode_auto_models'];
});

test('getEffectiveMaxTokens: fonctionne sur les deux formats', () => {
  delete lsStore['marexcode_auto_models'];
  MODEL_CONTEXT_LIMITS['tbl-model'] = 150000;
  try {
    const agent = { id: 'code', model: 'model-code', maxTokens: 32000 };
    lsStore['marexcode_auto_models'] = JSON.stringify({ code: { model: 'tbl-model' } });
    assert.equal(getEffectiveMaxTokens('code', agent), 150000, 'nouveau format');
    lsStore['marexcode_auto_models'] = JSON.stringify({ code: 'tbl-model' });
    assert.equal(getEffectiveMaxTokens('code', agent), 150000, 'ancien format');
  } finally {
    delete MODEL_CONTEXT_LIMITS['tbl-model'];
    delete lsStore['marexcode_auto_models'];
  }
});

test('resolveAgent: sans config custom, comportement identique (défauts, pas de temperature)', () => {
  delete lsStore['marexcode_auto_models'];
  const a = resolveAgent('code');
  assert.equal(a.systemPrompt, AGENT_ROLES.code.systemPrompt, 'prompt par défaut');
  assert.equal(a.provider, null, 'provider par défaut null');
  assert.ok(!('temperature' in a), 'temperature absent si non configuré');
  assert.ok(a.tools === AGENT_ROLES.code.tools, 'tools par défaut (même référence, copie de surface)');
});

test('resolveAgent: systemPrompt custom écrase, AGENT_ROLES intact', () => {
  delete lsStore['marexcode_auto_models'];
  setAutoRoleConfig('code', { systemPrompt: 'CUSTOM SYS PROMPT' });
  assert.equal(resolveAgent('code').systemPrompt, 'CUSTOM SYS PROMPT');
  assert.notEqual(AGENT_ROLES.code.systemPrompt, 'CUSTOM SYS PROMPT', 'AGENT_ROLES.code.systemPrompt intact');
  setAutoRoleConfig('code', { systemPrompt: '   ' });
  assert.equal(resolveAgent('code').systemPrompt, AGENT_ROLES.code.systemPrompt, 'prompt blanc → défaut');
  delete lsStore['marexcode_auto_models'];
});

test('resolveAgent: tools custom remplace sans validation de noms, AGENT_ROLES intact', () => {
  delete lsStore['marexcode_auto_models'];
  setAutoRoleConfig('audit', { tools: ['Read', 'Outil-Inconnu-XYZ'] });
  const a = resolveAgent('audit');
  assert.deepEqual(a.tools, ['Read', 'Outil-Inconnu-XYZ'], 'liste custom passée telle quelle (validation déléguée à la sélection)');
  assert.deepEqual(AGENT_ROLES.audit.tools, ['Ls', 'Glob', 'Read', 'Grep'], 'AGENT_ROLES.audit.tools intact');
  setAutoRoleConfig('audit', { tools: [] });
  assert.ok(resolveAgent('audit').tools === AGENT_ROLES.audit.tools, 'tools vide → défaut');
  setAutoRoleConfig('audit', { tools: 'not-array' });
  assert.ok(resolveAgent('audit').tools === AGENT_ROLES.audit.tools, 'tools non-array → défaut');
  delete lsStore['marexcode_auto_models'];
});

test('resolveAgent: provider et temperature configurés apparaissent, valeurs invalides ignorées', () => {
  delete lsStore['marexcode_auto_models'];
  setAutoRoleConfig('plan', { provider: 'opencode-go', temperature: 0.4 });
  const a = resolveAgent('plan');
  assert.equal(a.provider, 'opencode-go');
  assert.equal(a.temperature, 0.4);
  setAutoRoleConfig('plan', { provider: 42, temperature: 'hot' });
  const b = resolveAgent('plan');
  assert.equal(b.provider, null, 'provider non-string → défaut null');
  assert.ok(!('temperature' in b), 'temperature non-number → absent');
  setAutoRoleConfig('plan', { temperature: NaN });
  assert.ok(!('temperature' in resolveAgent('plan')), 'temperature NaN → absent');
  delete lsStore['marexcode_auto_models'];
});

test('AGENT_ROLES: provider null ajouté, jamais muté par resolveAgent config', () => {
  delete lsStore['marexcode_auto_models'];
  assert.equal(AGENT_ROLES.plan.provider, null);
  assert.equal(AGENT_ROLES.code.provider, null);
  assert.equal(AGENT_ROLES.audit.provider, null);
  setAutoRoleConfig('code', { provider: 'prov-x', temperature: 1, systemPrompt: 's', tools: ['Read'] });
  resolveAgent('code');
  assert.equal(AGENT_ROLES.code.provider, null, 'pas de mutation');
  assert.notEqual(AGENT_ROLES.code.systemPrompt, 's');
  assert.deepEqual(AGENT_ROLES.code.tools.map(t => t), AGENT_ROLES.code.tools, 'tools intacts');
  delete lsStore['marexcode_auto_models'];
});

test('testModel: connexion réussie → ok + latence mesurée', async () => {
  const { testModel } = await import('../model-diagnostics.js');
  const fakeStream = (model, history, onChunk, onDone) => { onChunk('OK'); onDone({}); };
  const r = await testModel('code', { model: 'm-conn' }, { _stream: fakeStream });
  assert.equal(r.connection.ok, true);
  assert.equal(typeof r.connection.latencyMs, 'number');
  assert.equal(r.connection.error, null);
});

test('testModel: connexion échoue → error capturé, toolCalling sauté proprement', async () => {
  const { testModel } = await import('../model-diagnostics.js');
  let secondCall = false;
  const fakeStream = (model, history, onChunk, onDone, onError) => {
    if (history[1].content === 'Réponds OK') onError(new Error('boom 502'));
    else secondCall = true;
  };
  const r = await testModel('code', { model: 'm-conn' }, { _stream: fakeStream });
  assert.equal(r.connection.ok, false);
  assert.equal(r.connection.error, 'boom 502');
  assert.equal(secondCall, false, 'le check tool-calling ne doit pas tenter d\'appel sans connexion');
  assert.equal(r.toolCalling.ok, false);
  assert.equal(r.toolCalling.detail, 'Connexion requise');
});

test('testModel: tool-call détecté via le hook de permission', async () => {
  const { testModel } = await import('../model-diagnostics.js');
  globalThis.window = {};
  try {
    const fakeStream = (model, history, onChunk, onDone, onError, tools) => {
      if (Array.isArray(tools) && tools.length && tools[0].function.name === 'Ls') {
        if (typeof window._marexCheckPermission === 'function') window._marexCheckPermission('Ls', {});
      }
      onDone({});
    };
    const r = await testModel('code', { model: 'm-tool' }, { _stream: fakeStream });
    assert.equal(r.connection.ok, true);
    assert.equal(r.toolCalling.ok, true);
    assert.ok(r.toolCalling.detail.includes('Ls'), 'le tool vu doit être nommé dans le detail');
  } finally {
    delete globalThis.window;
  }
});

test('testModel: pas de tool-call (texte seul) → ok false', async () => {
  const { testModel } = await import('../model-diagnostics.js');
  globalThis.window = {};
  try {
    const fakeStream = (model, history, onChunk, onDone) => { onChunk('je vais lister les fichiers'); onDone({}); };
    const r = await testModel('code', { model: 'm-tool' }, { _stream: fakeStream });
    assert.equal(r.toolCalling.ok, false);
    assert.ok(r.toolCalling.detail.includes('Aucun tool-call'), 'detail explicite');
  } finally {
    delete globalThis.window;
  }
});

test('testModel: contexte connu → known true + limit', async () => {
  const { testModel } = await import('../model-diagnostics.js');
  const { MODEL_CONTEXT_LIMITS } = await import('../auto-mode-config.js');
  MODEL_CONTEXT_LIMITS['m-ctx'] = 128000;
  try {
    const r = await testModel('plan', { model: 'm-ctx' }, { _stream: (m, h, oc, od) => od({}) });
    assert.equal(r.context.known, true);
    assert.equal(r.context.limit, 128000);
  } finally {
    delete MODEL_CONTEXT_LIMITS['m-ctx'];
    assert.deepEqual(MODEL_CONTEXT_LIMITS, {}, 'table livrée intacte');
  }
});

test('testModel: contexte inconnu → known false + note', async () => {
  const { testModel } = await import('../model-diagnostics.js');
  const r = await testModel('plan', { model: 'm-unknown-ctx' }, { _stream: (m, h, oc, od) => od({}) });
  assert.equal(r.context.known, false);
  assert.equal(r.context.limit, null);
  assert.ok(r.context.note.length > 0);
});

test('testModel: modèle effectif = config.model sinon placeholder du rôle', async () => {
  const { testModel } = await import('../model-diagnostics.js');
  const seen = [];
  const fakeStream = (model, history, onChunk, onDone) => { seen.push(model); onDone({}); };
  await testModel('plan', {}, { _stream: fakeStream });
  assert.equal(seen[0], 'model-plan', 'placeholder du rôle si pas de config');
});

test('testModel: tool-call détecté SANS exécution réelle (hook toujours allowed:false)', async () => {
  const { testModel } = await import('../model-diagnostics.js');
  globalThis.window = {};
  try {
    const responses = [];
    const fakeStream = (model, history, onChunk, onDone, onError, tools) => {
      if (Array.isArray(tools) && tools.length && tools[0].function.name === 'Ls') {
        const check = window._marexCheckPermission('Ls', {});
        responses.push(check);
        if (check.allowed === true) throw new Error('EXECUTION REELLE TENTEE');
      }
      onDone({});
    };
    const r = await testModel('code', { model: 'm-tool-safe' }, { _stream: fakeStream });
    assert.equal(r.toolCalling.ok, true, 'l\'intention de tool-call reste détectée');
    assert.ok(r.toolCalling.detail.includes('Ls'));
    assert.equal(responses.length, 1);
    assert.equal(responses[0].allowed, false, 'le hook ne doit jamais autoriser pendant la sonde');
    assert.ok(responses[0].reason.includes('Diagnostic'), 'raison explicite de blocage');
  } finally {
    delete globalThis.window;
  }
});

test('runAutoMode: temperature/maxTokens configurés passés dans options du stream', async () => {
  delete lsStore['marexcode_auto_models'];
  setAutoRoleConfig('plan', { temperature: 0.3 });
  MODEL_CONTEXT_LIMITS['model-plan'] = 8000;
  try {
    const seenOptions = [];
    const fakeStream = (m, h, oc, od, oe, tools, htc, ot, sig, options) => { seenOptions.push(options); od({}); };
    await runAutoMode({ task: 't', tree: { files: [] }, _stream: fakeStream });
    assert.deepEqual(seenOptions[0], { temperature: 0.3, maxTokens: 8000 }, 'phase plan : options résolues (temperature config + maxTokens table)');
    assert.equal(seenOptions[1], null, 'phase code sans config → options null (pas d objet à clés undefined)');
    assert.equal(seenOptions[2], null);
  } finally {
    delete MODEL_CONTEXT_LIMITS['model-plan'];
    delete lsStore['marexcode_auto_models'];
  }
});

test('runAutoMode: requireApproval résout false → arrêt après plan, code/audit jamais lancés', async () => {
  const seen = [];
  const fakeStream = (m, h, oc, od) => { seen.push(h[0].content.slice(0, 30)); oc('PLANOUT'); od({}); };
  const approvals = [];
  const outputs = await runAutoMode({
    task: 't', tree: { files: [] }, _stream: fakeStream,
    requireApproval: true,
    onApprovalNeeded: (planContent) => { approvals.push(planContent); return Promise.resolve(false); },
  });
  assert.equal(seen.length, 1, 'seul plan exécuté');
  assert.equal(approvals.length, 1);
  assert.ok(approvals[0].includes('PLANOUT'), 'onApprovalNeeded reçoit le contenu du plan');
  assert.equal(outputs.length, 1);
});

test('runAutoMode: requireApproval résout true → chaîne complète', async () => {
  const seen = [];
  const fakeStream = (m, h, oc, od) => { seen.push(1); od({}); };
  const outputs = await runAutoMode({
    task: 't', tree: { files: [] }, _stream: fakeStream,
    requireApproval: true,
    onApprovalNeeded: () => Promise.resolve(true),
  });
  assert.equal(seen.length, 3);
  assert.equal(outputs.length, 3);
});

test('runAutoMode: requireApproval sans onApprovalNeeded → arrêt propre', async () => {
  const seen = [];
  const fakeStream = (m, h, oc, od) => { seen.push(1); od({}); };
  const outputs = await runAutoMode({ task: 't', tree: { files: [] }, _stream: fakeStream, requireApproval: true });
  assert.equal(seen.length, 1);
  assert.equal(outputs.length, 1);
});

test('runAutoMode: maxRetries relance la phase échouée puis abandonne', async () => {
  const attempts = [];
  const fakeStream = (m, h, oc, od, oe) => { attempts.push(1); oe(new Error('fail-phase')); };
  const errs = [];
  const outputs = await runAutoMode({
    task: 't', tree: { files: [] }, _stream: fakeStream,
    maxRetries: 2, onError: (e) => errs.push(e),
  });
  assert.equal(attempts.length, 3, '1 tentative + 2 retries, puis abandon');
  assert.equal(errs.length, 1, 'onError une seule fois après épuisement');
  assert.equal(outputs.length, 0);
});

test('runAutoMode: retry réussit à la tentative 2 → chaîne continue, attempt signalé', async () => {
  const attempts = [];
  const fakeStream = (m, h, oc, od, oe) => {
    attempts.push(h[0].content.includes('architecte') ? 'plan' : 'autre');
    if (attempts.length === 1) oe(new Error('transient'));
    else od({});
  };
  const phases = [];
  const outputs = await runAutoMode({
    task: 't', tree: { files: [] }, _stream: fakeStream,
    maxRetries: 2, onPhase: (p) => phases.push(p),
  });
  assert.equal(attempts.length, 4, 'plan x2 puis code + audit');
  assert.equal(outputs.length, 3);
  const planAttempts = phases.filter(p => p.phase === 'plan').map(p => p.attempt);
  assert.deepEqual(planAttempts, [1, 2], 'attempt exposé dans onPhase');
});

test('runAutoMode: continueOnError=true → la chaîne continue avec entrée failed', async () => {
  const seen = [];
  const fakeStream = (m, h, oc, od, oe) => {
    seen.push(h[0].content.includes('architecte') ? 'plan' : 'autre');
    if (h[0].content.includes('architecte')) oe(new Error('plan-ko'));
    else od({});
  };
  const errs = [];
  const outputs = await runAutoMode({
    task: 't', tree: { files: [] }, _stream: fakeStream,
    continueOnError: true, onError: (e) => errs.push(e),
  });
  assert.equal(seen.length, 3, 'code et audit lancés malgré l échec du plan');
  assert.equal(errs.length, 1);
  assert.equal(outputs[0].failed, true);
  assert.equal(outputs[0].error, 'plan-ko');
  assert.equal(outputs.length, 3);
  assert.ok(outputs[1].content !== undefined, 'la suite produit du contenu');
});

test('runAutoMode: maxBudgetTokens dépassé → phase suivante non lancée', async () => {
  const seen = [];
  const fakeStream = (m, h, oc, od) => { seen.push(1); od({ input_tokens: 30000, output_tokens: 10000 }); };
  const outputs = await runAutoMode({
    task: 't', tree: { files: [] }, _stream: fakeStream,
    maxBudgetTokens: 50000,
  });
  assert.equal(seen.length, 2, 'plan (40k) + code (80k cumulé) lancés, audit bloqué');
  assert.equal(outputs.length, 2);
});

test('runAutoMode: défauts préservent le comportement (pas de pause/retry/continue/budget)', async () => {
  const seen = [];
  const fakeStream = (m, h, oc, od, oe, tools, htc, ot, sig, options) => {
    seen.push(options);
    if (seen.length === 1) oe(new Error('x'));
    else od({});
  };
  const outputs = await runAutoMode({ task: 't', tree: { files: [] }, _stream: fakeStream });
  assert.equal(seen.length, 1, 'arrêt immédiat sur erreur, défauts inchangés');
  assert.equal(outputs.length, 0);
});
