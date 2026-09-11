import { MODEL_CONTEXT_LIMITS } from './auto-mode-config.js';
import { resolveAgent } from './agents.js';

// Tool trivial pour le check tool-calling. MAREXCODE_TOOLS est un global de
// script classique (non importable en Node) : on définit Ls localement, même
// nom que l'outil réel du sandbox (lecture seule, sans effet de bord).
const LS_TOOL = {
  type: 'function',
  function: { name: 'Ls', description: 'Diagnostic tool-calling', parameters: { type: 'object', properties: {}, required: [] } },
};

function resolveModelName(role, config) {
  if (config && typeof config.model === 'string' && config.model.trim()) return config.model.trim();
  return resolveAgent(role).model;
}

function runStreamProbe(stream, model, prompt, tools, signal) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    try {
      stream(
        model,
        [
          { role: 'system', content: 'Tu es un assistant de diagnostic. Réponds en un mot.' },
          { role: 'user', content: prompt },
        ],
        function () {},
        function (usage) { resolve({ ok: true, latencyMs: Date.now() - t0, usage: usage || null }); },
        function (err) { resolve({ ok: false, latencyMs: Date.now() - t0, error: (err && err.message) ? err.message : String(err) }); },
        tools,
        true,
        null,
        signal,
        null,
        null,
        0
      );
    } catch (e) {
      resolve({ ok: false, latencyMs: Date.now() - t0, error: (e && e.message) ? e.message : String(e) });
    }
  });
}

// Installe un capteur sur le hook de permission (appelé par _execMarexcodeTool
// avant chaque exécution de tool) le temps de la sonde, puis restaure l'état
// initial. Le capteur répond TOUJOURS allowed:false avec une raison explicite :
// le diagnostic mesure l'INTENTION de tool-call du modèle, pas son effet —
// aucun outil ne s'exécute réellement pendant la sonde (pas même Ls, lecture
// seule ; comportement assumé, pas un oubli). Cela bloque aussi tout autre
// tool que le modèle tenterait pendant la sonde, et ne contourne jamais une
// décision deny de l'utilisateur : le hook est remplacé, pas délégué.
function withToolSensor(fn) {
  const hadWindow = typeof window !== 'undefined';
  const original = hadWindow ? window._marexCheckPermission : undefined;
  const seen = [];
  if (hadWindow) {
    window._marexCheckPermission = function (tool, args) {
      seen.push(String(tool || ''));
      return { allowed: false, reason: 'Diagnostic — exécution réelle non nécessaire' };
    };
  }
  return Promise.resolve(fn()).then(
    (value) => {
      restore();
      return { value: value, seen: seen };
    },
    (err) => {
      restore();
      throw err;
    }
  );

  function restore() {
    if (!hadWindow) return;
    if (typeof original === 'function') window._marexCheckPermission = original;
    else delete window._marexCheckPermission;
  }
}

export async function testModel(role, config, opts) {
  const options = opts || {};
  const stream = options._stream
    || (typeof streamModelWithTools !== 'undefined' ? streamModelWithTools : null);
  const signal = options.signal;
  const model = resolveModelName(role, config);

  const result = {
    connection: { ok: false, latencyMs: null, error: null },
    toolCalling: { ok: false, detail: 'Connexion requise' },
    context: { known: false, limit: null, note: '' },
  };
  if (!stream) {
    result.connection.error = 'streamModelWithTools indisponible';
    return result;
  }

  const conn = await runStreamProbe(stream, model, 'Réponds OK', [], signal);
  result.connection.ok = conn.ok;
  result.connection.latencyMs = conn.latencyMs;
  result.connection.error = conn.ok ? null : (conn.error || 'Échec de connexion');

  if (conn.ok) {
    const probe = await withToolSensor(() => runStreamProbe(stream, model, 'Appelle l\'outil Ls pour lister le workspace.', [LS_TOOL], signal));
    if (probe.seen.length > 0) {
      result.toolCalling = { ok: true, detail: 'Tool-call reçu : ' + probe.seen[0] };
    } else if (!probe.value.ok) {
      result.toolCalling = { ok: false, detail: 'Appel échoué : ' + (probe.value.error || '?') };
    } else {
      result.toolCalling = { ok: false, detail: 'Aucun tool-call détecté (réponse texte uniquement)' };
    }
  }

  if (Object.prototype.hasOwnProperty.call(MODEL_CONTEXT_LIMITS, model)) {
    const limit = MODEL_CONTEXT_LIMITS[model];
    result.context = { known: true, limit: limit, note: 'Contexte déclaré : ' + limit + ' tokens' };
  } else {
    result.context = { known: false, limit: null, note: 'Contexte non déclaré pour ce modèle (plafond par défaut appliqué)' };
  }

  return result;
}
