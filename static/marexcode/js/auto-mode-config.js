const STORAGE_KEY = 'marexcode_auto_models';
const ROLE_CONFIG_KEYS = ['model', 'provider', 'temperature', 'maxTokens', 'systemPrompt', 'tools'];

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

// Ancien format : valeur de rôle = string ("{model}"). Nouveau : objet complet.
function normalizeRoleValue(value) {
  if (typeof value === 'string') return { model: value };
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return null;
}

function emptyRoleConfig() {
  const out = {};
  for (const k of ROLE_CONFIG_KEYS) out[k] = null;
  return out;
}

export function getAutoModelConfig() {
  return readStore();
}

export function setAutoModel(role, modelName) {
  setAutoRoleConfig(role, { model: modelName });
}

export function getAutoRoleConfig(role) {
  const value = normalizeRoleValue(readStore()[role]);
  if (!value) return emptyRoleConfig();
  return Object.assign(emptyRoleConfig(), value);
}

export function setAutoRoleConfig(role, partialConfig) {
  if (!partialConfig || typeof partialConfig !== 'object' || Array.isArray(partialConfig)) return;
  const cfg = readStore();
  const existing = normalizeRoleValue(cfg[role]) || {};
  cfg[role] = Object.assign({}, existing, partialConfig);
  writeStore(cfg);
}

export function getEffectiveModel(role, agent) {
  const value = normalizeRoleValue(readStore()[role]);
  const configured = value ? value.model : null;
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
