export const COMPACTION_THRESHOLD = 50000;
export const CHARS_PER_TOKEN = 4;
const RECENT_KEEP = 6;

export function estimateTokens(history) {
  let chars = 0;
  for (const msg of history || []) {
    chars += String(msg.content || '').length;
    if (Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        chars += String((tc.function && tc.function.arguments) || '').length;
      }
    }
  }
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

export function buildProjectIndex(tree) {
  const files = Array.isArray(tree) ? tree : (tree && tree.files) || [];
  return files.map(function (f) {
    const path = String(f.path || '');
    const m = path.match(/\.[^.\\/]+$/);
    return { path: path, size: f.size, ext: m ? m[0] : '' };
  });
}

// Algorithme de compaction (déterministe, sans LLM) :
// 1. estimateTokens(history) <= threshold -> history inchangé (même référence).
// 2. Au-delà : on garde intacts (a) les messages "system" de tête consécutifs,
//    (b) les RECENT_KEEP derniers messages.
// 3. Les tours du milieu (les plus anciens) sont FUSIONNÉS en UN seul message
//    {role:"system", content:"[Contexte précédent]\n..."} construit par
//    extraction pure des tool_calls déjà présents dans l'historique :
//    - fichiers lus   : Read.file_path
//    - fichiers écrits/modifiés : Write.file_path, Edit.file_path
//    - commandes      : Bash.command, TodoWrite (statuts des todos = décisions)
// 4. Les contenu texte des tours anciens sont écartés (c'est ce qui rend la
//    compaction efficace : seuls les faits survivent, pas le verbatim).
export function checkCompaction(history, threshold) {
  const limit = threshold || COMPACTION_THRESHOLD;
  if (!Array.isArray(history) || estimateTokens(history) <= limit) return history;

  let head = 0;
  while (head < history.length && history[head].role === 'system') head++;
  const leadingSystem = history.slice(0, head);
  const middle = history.slice(head, history.length - RECENT_KEEP);
  const recent = history.slice(history.length - RECENT_KEEP);

  if (middle.length === 0) return history;

  return leadingSystem.concat(
    [{ role: 'system', content: '[Contexte précédent]\n' + summarize(middle) }],
    recent
  );
}

function summarize(turns) {
  const read = [];
  const written = [];
  const commands = [];
  const decisions = [];
  const seenRead = new Set();
  const seenWritten = new Set();
  const seenCmd = new Set();

  for (const msg of turns) {
    if (!Array.isArray(msg.tool_calls)) continue;
    for (const tc of msg.tool_calls) {
      const fn = tc.function || {};
      let args = {};
      try { args = JSON.parse(fn.arguments || '{}'); } catch (e) { args = {}; }
      const name = fn.name;
      if (name === 'Read' && args.file_path) {
        if (!seenRead.has(args.file_path)) {
          seenRead.add(args.file_path);
          read.push(args.file_path);
        }
      } else if ((name === 'Write' || name === 'Edit') && args.file_path) {
        if (!seenWritten.has(args.file_path)) {
          seenWritten.add(args.file_path);
          written.push(args.file_path);
        }
      } else if (name === 'Bash' && args.command) {
        if (!seenCmd.has(args.command)) {
          seenCmd.add(args.command);
          commands.push(args.command);
        }
      } else if (name === 'TodoWrite' && Array.isArray(args.todos)) {
        for (const t of args.todos) {
          if (t && t.status === 'completed' && t.content) decisions.push(t.content);
        }
      }
    }
  }

  const lines = [];
  if (read.length) lines.push('Fichiers lus: ' + read.join(', '));
  if (written.length) lines.push('Fichiers écrits/modifiés: ' + written.join(', '));
  if (commands.length) lines.push('Commandes exécutées: ' + commands.join('; '));
  if (decisions.length) lines.push('Étapes terminées: ' + decisions.join('; '));
  return lines.join('\n') || 'Aucune action outillée significative.';
}
