import { resolveAgent, getToolsForRole, AGENT_ROLES } from './agents.js';
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
function runPhase(stream, model, history, tools, signal, onChunk, options) {
  let finalContent = '';
  return new Promise((resolve, reject) => {
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
      options || null,
      null,
      0
    );
  });
}

// usage réel retourné par streamModelWithTools : {input_tokens, output_tokens,
// cost_real?} — pas de champ total_tokens, le cumul fait la somme des deux.
function usageTokens(usage) {
  if (!usage || typeof usage !== 'object') return 0;
  return (Number(usage.input_tokens) || 0) + (Number(usage.output_tokens) || 0);
}

// Options de stream construites champ par champ : temperature n'existe sur
// l'agent résolu que si configuré (A2) ; maxTokens résolu inclut toujours le
// placeholder de AGENT_ROLES — il n'est transmis que s'il en diffère (table ou
// config), sinon options reste null pour préserver EXACTEMENT le comportement
// par défaut (le provider choisit son max_tokens natif). Aucune clé undefined.
function streamOptionsFor(agent) {
  const out = {};
  if (typeof agent.temperature === 'number' && isFinite(agent.temperature)) {
    out.temperature = agent.temperature;
  }
  const placeholder = AGENT_ROLES[agent.id] ? AGENT_ROLES[agent.id].maxTokens : undefined;
  if (typeof agent.maxTokens === 'number' && agent.maxTokens > 0 && agent.maxTokens !== placeholder) {
    out.maxTokens = agent.maxTokens;
  }
  return Object.keys(out).length ? out : null;
}

export async function runAutoMode(opts) {
  const {
    task, tree, model, signal, onPhase, onChunk, onDone, onError, _stream,
    requireApproval, onApprovalNeeded, maxRetries, continueOnError, maxBudgetTokens,
  } = opts || {};
  const stream = _stream
    || (typeof streamModelWithTools !== 'undefined' ? streamModelWithTools : null);
  if (!stream) {
    const err = new Error('streamModelWithTools indisponible (script global non chargé)');
    if (onError) onError(err);
    throw err;
  }

  const contextStore = { index: buildProjectIndex(tree), previousPhase: null };
  const outputs = [];
  const retries = (typeof maxRetries === 'number' && maxRetries > 0) ? Math.floor(maxRetries) : 0;
  let tokensUsed = 0;

  for (const phase of AUTO_PHASES) {
    // Stop (abort du signal) vérifié AVANT chaque phase : après un AbortError en
    // cours de phase, streamModelWithTools résout via onDone(null, []) — sans ce
    // garde, la chaîne enchaînerait les phases suivantes avec du contenu vide.
    if (signal && signal.aborted) return outputs;

    // Budget : cumul des tokens consommés vérifié avant de lancer une phase.
    if (typeof maxBudgetTokens === 'number' && maxBudgetTokens > 0 && tokensUsed >= maxBudgetTokens) {
      return outputs;
    }

    // Pause d'approbation : après la phase plan terminée, avant de lancer code.
    // Une promise qui résout false, rejette, ou l'absence de callback arrête
    // proprement la chaîne (outputs partiels conservés, pas d'erreur levée).
    if (requireApproval && phase === 'code') {
      let approved = false;
      try {
        approved = onApprovalNeeded ? !!(await onApprovalNeeded(contextStore.previousPhase)) : false;
      } catch (e) {
        approved = false;
      }
      if (!approved) return outputs;
    }

    const agent = resolveAgent(phase);
    const effectiveModel = model || agent.model;
    const sys = composePrompt(agent, contextStore);
    const history = [{ role: 'system', content: sys }, { role: 'user', content: task }];
    const streamOptions = streamOptionsFor(agent);

    const maxAttempts = 1 + retries;
    let res = null;
    let lastErr = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (onPhase) onPhase({ phase: phase, agent: agent.name, model: effectiveModel, attempt: attempt });
      try {
        res = await runPhase(stream, effectiveModel, history, getToolsForRole(agent), signal, onChunk, streamOptions);
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
      }
    }

    if (lastErr) {
      if (onError) onError(lastErr);
      if (continueOnError) {
        // previousPhase inchangé : aucun contenu vide n'est propagé à la suite.
        outputs.push({
          phase: phase,
          model: effectiveModel,
          error: (lastErr && lastErr.message) ? lastErr.message : String(lastErr),
          failed: true,
        });
        continue;
      }
      return outputs;
    }

    outputs.push({ phase: phase, model: effectiveModel, usage: res.usage, content: res.finalContent });
    tokensUsed += usageTokens(res.usage);
    contextStore.previousPhase = res.finalContent;
  }

  if (onDone) onDone(outputs);
  return outputs;
}
