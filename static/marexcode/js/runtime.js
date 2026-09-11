import { resolveAgent, getToolsForRole } from './agents.js';
import { composePrompt } from './prompt-composer.js';
import { buildProjectIndex } from './context-store.js';

export const AUTO_PHASES = ['plan', 'code', 'audit'];

// Limitation (vérifiée sur le flux réel de streamModelWithTools, tool-search.js) :
// streamModelWithTools enrichit l'historique des tool-calls en interne
// (t.concat([P], q) dans sa récursion) et ne rend à l'appelant QUE usage/citations
// via onDone. L'historique passé en argument n'est jamais muté : le runtime ne peut
// donc PAS récupérer les tool_calls/results d'une phase.
// Le hook CustomEvent "marexcode-tool" existe (start/end) mais ne porte pas de
// tool_call_id : impossible d'y reconstituer des paires assistant/tool_call +
// tool/tool_call_id valides pour les providers.
// Conséquence assumée : le contexte inter-phases est limité au TEXTE FINAL
// (finalContent) de la phase précédente, injecté via contextStore.previousPhase.
// checkCompaction (context-store.js) ne s'applique qu'aux boucles qui possèdent
// un historique complet (chat manuel), pas à ce pipeline.
async function runPhase(stream, model, history, tools, signal, onChunk) {
  let finalContent = '';
  const res = await new Promise((resolve, reject) => {
    stream(
      model,
      history,
      (chunk) => { finalContent += chunk; if (onChunk) onChunk(chunk); },
      (usage) => resolve({ finalContent: finalContent, usage: usage }),
      (err) => reject(err),
      tools,
      true,
      null,
      signal,
      null,
      null,
      0
    );
  });
  return res;
}

export async function runAutoMode(opts) {
  const { task, tree, model, signal, onPhase, onChunk, onDone, onError, _stream } = opts || {};
  const stream = _stream
    || (typeof streamModelWithTools !== 'undefined' ? streamModelWithTools : null);
  if (!stream) {
    const err = new Error('streamModelWithTools indisponible (script global non chargé)');
    if (onError) onError(err);
    throw err;
  }

  const contextStore = { index: buildProjectIndex(tree), previousPhase: null };
  const outputs = [];

  for (const phase of AUTO_PHASES) {
    const agent = resolveAgent(phase);
    const effectiveModel = model || agent.model;
    const sys = composePrompt(agent, contextStore);
    const history = [{ role: 'system', content: sys }, { role: 'user', content: task }];

    if (onPhase) onPhase({ phase: phase, agent: agent.name, model: effectiveModel });

    let res;
    try {
      res = await runPhase(stream, effectiveModel, history, getToolsForRole(agent), signal, onChunk);
    } catch (err) {
      if (onError) onError(err);
      return outputs;
    }

    outputs.push({ phase: phase, model: effectiveModel, usage: res.usage, content: res.finalContent });
    contextStore.previousPhase = res.finalContent;
  }

  if (onDone) onDone(outputs);
  return outputs;
}
