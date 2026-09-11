export const AGENT_ROLES = {
  plan: {
    id: 'plan',
    name: 'Architecte',
    model: 'model-plan',
    fallback: null,
    tools: ['Ls', 'Glob', 'Read', 'Grep', 'TodoWrite'],
    systemPrompt: 'Tu es un architecte logiciel. Analyse le projet soumis, produis un plan dense (et non un long texte) detailing les fichiers à créer/modifier, les étapes ordonnées, les risques identifiés. Utilise Ls/Glob/Read/Grep pour inspecter le workspace avant de conclure. Ne modifie aucun fichier.',
    maxTokens: 16000,
  },
  code: {
    id: 'code',
    name: 'Développeur',
    model: 'model-code',
    fallback: null,
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'Ls', 'TodoWrite', 'LSP'],
    systemPrompt: 'Tu es un développeur expert. Implémente le plan validé, fichier par fichier. Lis le fichier avant de le modifier (Read), puis Edit ou Write pour appliquer le changement. Utilise Bash pour tester dans le sandbox. Décompose avec TodoWrite. Cite les chemins exacts et les lignes modifiées.',
    maxTokens: 32000,
  },
  audit: {
    id: 'audit',
    name: 'Auditeur',
    model: 'model-audit',
    fallback: null,
    tools: ['Ls', 'Glob', 'Read', 'Grep'],
    systemPrompt: 'Tu es un auditeur de code. Vérifie la conformité de l\'implémentation au plan, identifie bugs, régressions, dettes, et failles de sécurité. Ne modifie aucun fichier. Rapporte les anomalies avec fichier, ligne, sévérité, et correction suggérée.',
    maxTokens: 16000,
  },
};

export function resolveAgent(role) {
  return AGENT_ROLES[role] || AGENT_ROLES.code;
}

export function getToolsForRole(agent, tools) {
  const all = tools || (typeof MAREXCODE_TOOLS !== 'undefined' ? MAREXCODE_TOOLS : []);
  return all.filter(function (t) {
    return agent.tools.indexOf(t.function && t.function.name) !== -1;
  });
}
