// Câblé en Phase 2 (highlight.js) : utilisé pour reset les tokens stable/unstable
// d'un bloc code en streaming. Inutilisé en Phase 1 (code rendu en texte brut).
export function shouldResetCodeTokens(previous, next) {
  return (
    !previous ||
    previous.language !== next.language ||
    previous.generation !== next.generation ||
    next.stableCount < previous.stableCount ||
    !next.raw.startsWith(previous.raw)
  )
}
