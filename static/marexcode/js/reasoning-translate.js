export const REASONING_TRANSLATE_STEPS = [
  { label: 'openrouter/free', provider: 'openrouter', model: 'openrouter/free', timeoutMs: 7000 },
  { label: 'deepseek-chat', provider: 'deepseek', model: 'deepseek-chat', timeoutMs: 15000 },
];

const PROMPT_PREFIX = "Traduis en français, de manière fidèle et naturelle, le raisonnement d'assistant ci-dessous. Conserve la structure, les listes et les retours à la ligne. Réponds UNIQUEMENT avec la traduction, sans préambule, sans commentaire, sans guillemets englobants.\n\n---\n\n";

export function buildReasoningTranslationPrompt(raw) {
  return PROMPT_PREFIX + (raw == null ? '' : String(raw));
}

function cleanTranslation(text) {
  let out = text == null ? '' : String(text).trim();
  out = out.replace(/^<think>[\s\S]*?<\/think>/i, '').replace(/<\/?think>/gi, '').trim();
  out = out.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
  return out;
}

function invalidReason(out, rawLen) {
  if (!out) return 'empty';
  if (/^(error|erreur|api error|rate limit|too many requests|unauthorized|forbidden|internal server error)\b/i.test(out)) return 'error-pattern';
  if (/^(4\d\d|5\d\d)\b/.test(out)) return 'error-code';
  if (rawLen > 200 && out.length < rawLen * 0.2) return 'truncated';
  return null;
}

function raceTimeout(promise, ms) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error('timeout ' + ms + 'ms');
      err.name = 'TimeoutError';
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => { if (timer) clearTimeout(timer); });
}

export async function translateReasoning(raw, callModel, onDebug, steps) {
  const source = raw == null ? '' : String(raw);
  if (!source.trim()) return null;
  const list = Array.isArray(steps) && steps.length ? steps : REASONING_TRANSLATE_STEPS;
  const prompt = buildReasoningTranslationPrompt(source);
  for (const step of list) {
    try {
      const result = await raceTimeout(Promise.resolve().then(() => callModel(step, prompt)), step.timeoutMs);
      const out = cleanTranslation(result && result.text);
      const bad = invalidReason(out, source.length);
      if (bad) {
        if (onDebug) onDebug({ provider: step.label || step.provider, reason: bad, sample: out.slice(0, 120) });
        continue;
      }
      return out;
    } catch (err) {
      const reason = err && err.name === 'TimeoutError'
        ? err.message
        : (err && err.status ? 'HTTP ' + err.status + (err.message ? ' ' + err.message : '') : (err && err.message ? err.message : String(err)));
      if (onDebug) onDebug({ provider: step.label || step.provider, reason: reason });
    }
  }
  return null;
}
