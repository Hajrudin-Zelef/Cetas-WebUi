const PLAN_PATTERN = /^(analyse|analys|concevo|conçois|concoi|concept|architect|design|plan|évalu|evalu|compar|review)/;
const AUDIT_PATTERN = /^(vérifi|verifi|test|audit|sécurit|securit|lint|check|qualit|corriger|correction|bug)/;

export function classifyTask(message) {
  const lower = String(message || '').toLowerCase();
  if (PLAN_PATTERN.test(lower)) return 'plan';
  if (AUDIT_PATTERN.test(lower)) return 'audit';
  return 'code';
}
