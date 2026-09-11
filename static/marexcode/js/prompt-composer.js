const INFRA_RULES = [
  "Règles d'infrastructure :",
  "- Tous les chemins sont relatifs à la racine du workspace ; ne sors jamais du sandbox.",
  "- Les outils s'appellent uniquement via tool-calling ; ne les décris pas en texte, exécute-les.",
  "- Les résultats d'outils reviennent bruts ; interprète-les toi-même.",
  "- Si une dépendance ou une information manque, signale-le explicitement au lieu d'inventer.",
].join('\n');

function renderIndexTree(index) {
  const dirs = new Map();
  for (const entry of index) {
    const idx = entry.path.lastIndexOf('/');
    const dir = idx === -1 ? '' : entry.path.slice(0, idx + 1);
    if (!dirs.has(dir)) dirs.set(dir, []);
    dirs.get(dir).push(entry.path);
  }
  const lines = ['## Arborescence du projet (' + index.length + ' fichiers)'];
  const dirNames = [...dirs.keys()].sort();
  for (const dir of dirNames) {
    if (dir === '') {
      for (const p of dirs.get(dir).sort()) lines.push(p);
      continue;
    }
    lines.push(dir);
    for (const p of dirs.get(dir).sort()) {
      lines.push('  ' + p);
    }
  }
  return lines.join('\n');
}

export function composePrompt(agent, contextStore) {
  const ctx = contextStore || {};
  const parts = [agent.systemPrompt, INFRA_RULES];
  if (Array.isArray(ctx.index) && ctx.index.length) {
    parts.push(renderIndexTree(ctx.index));
  }
  if (ctx.previousPhase) {
    parts.push('## Résultat de la phase précédente\n' + ctx.previousPhase);
  }
  return parts.join('\n\n');
}
