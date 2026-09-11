import { resolveAgent, getToolsForRole } from './agents.js';
import { composePrompt } from './prompt-composer.js';
import { buildProjectIndex, checkCompaction } from './context-store.js';

export const AUTO_PHASES = ['plan', 'code', 'audit'];

async function runPhase(stream, model, history, tools, signal, onChunk) {
  let finalContent = '';
  const res = await new Promise((resolve, reject) => {
    stream(
      model,
      history,
      (chunk) => { finalContent += chunk; if (onChunk) onChunk(chunk); },
      (usage) => resolve({ history: history.slice(), finalContent: finalContent, usage: usage }),
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
  let priorHistory = [];

  for (const phase of AUTO_PHASES) {
    const agent = resolveAgent(phase);
    const effectiveModel = model || agent.model;
    const sys = composePrompt(agent, contextStore);
    const history = [{ role: 'system', content: sys }]
      .concat(priorHistory, [{ role: 'user', content: task }]);

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
    priorHistory = checkCompaction(res.history.slice(1));
  }

  if (onDone) onDone(outputs);
  return outputs;
}
