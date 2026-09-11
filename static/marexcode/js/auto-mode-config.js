const STORAGE_KEY = 'marexcode_auto_models';

function readStore() {
  if (typeof localStorage === 'undefined' || !localStorage) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch (e) {
    return {};
  }
}

function writeStore(obj) {
  if (typeof localStorage === 'undefined' || !localStorage) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch (e) {
  }
}

export function getAutoModelConfig() {
  return readStore();
}

export function setAutoModel(role, modelName) {
  const cfg = readStore();
  cfg[role] = modelName;
  writeStore(cfg);
}

export function getEffectiveModel(role, agent) {
  const cfg = readStore();
  const configured = cfg[role];
  if (typeof configured === 'string' && configured.trim()) return configured;
  return agent.model;
}

export const MODEL_CONTEXT_LIMITS = {};

export function getEffectiveMaxTokens(role, agent) {
  const model = getEffectiveModel(role, agent);
  if (Object.prototype.hasOwnProperty.call(MODEL_CONTEXT_LIMITS, model)) {
    return MODEL_CONTEXT_LIMITS[model];
  }
  return agent.maxTokens;
}
