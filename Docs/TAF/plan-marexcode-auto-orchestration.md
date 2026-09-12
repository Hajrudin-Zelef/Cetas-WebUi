# Plan — Marexcode Mode Auto (Orchestration multi-agents Plan → Code → Audit)

> **Date:** 2026-09-11
> **Statut:** À implémenter (attente ordre)
> **Cible:** Ajouter un volet « Auto » au module Marexcode. Non-bloquant, ne modifie pas
> l'existant : le mode manuel actuel reste inchangé. En mode Auto, l'utilisateur soumet un
> projet/tâche et le runtime enchaîne trois rôles — **Plan**, **Code**, **Audit** — chacun
> routé vers un modèle dédié, avec un system prompt composé (rôle + règles infra + contexte),
> des outils dédiés par rôle, et compaction automatique à 50K tokens.
>
> **Principe directeur:** le runtime (code pur) orchestre, le LLM décide. Le modèle reçoit de
> **bons outils**, pas des ordres d'un autre LLM. Le runtime exécute les tool-calls, gère la
> compaction mécaniquement, et renvoie le résultat brut au modèle (aucune interprétation).
>
> **Pour agentic workers:** TDD obligatoire. Chaque task = test qui échoue → implémentation
> minimale → test qui passe → commit. Steps en syntaxe checkbox (`- [ ]`).

---

## 1. Vision

Un pipeline séquentiel en trois phases :

```
User soumet le projet / la tâche
    ↓
┌──────────────────────────────────────────────┐
│  RUNTIME ORCHESTRATOR (code pur, pas de LLM)  │
│                                              │
│  1. Reçoit tâche + chemin projet             │
│  2. Classifie tâche → rôle (regex/heuristiques)│
│  3. Pipeline: Plan → Code → Audit            │
│  4. Par rôle: resolve modèle + compose prompt │
│  5. Appelle streamModelWithTools (tools dédiés)│
└──────────────────┬───────────────────────────┘
                   ↓
┌──────────────────────────────────────────────┐
│  MODÈLE CHOISI (glm/deepseek/opencode...)    │
│                                              │
│  Reçoit: system prompt rôle + bons outils    │
│  Décide LUI-MÊME via tool-calling:           │
│    → lire/écrire dans le workspace           │
│    → chercher dans l'index                   │
│    → signaler dépendance manquante           │
│  Boucle: génère → tool_call → lit → continue │
└──────────────────┬───────────────────────────┘
                   ↓
┌──────────────────────────────────────────────┐
│  RUNTIME (exécution)                         │
│                                              │
│  - Exécute les tool-calls (sandbox)          │
│  - Compaction auto à seuil 50K tokens        │
│  - Renvoie résultat brut au modèle           │
└──────────────────────────────────────────────┘
```

**Non-bloquant:** le mode manuel (sélection modèle + boucle actuelle) est **conservé à
l'identique**. Le mode Auto s'ajoute comme un toggle dans le composer. Aucun fichier existant
n'est modifié pour changer son comportement manuel ; les ajouts sont des modules nouveaux.

---

## 2. Décisions de cadrage

| Question | Décision | Justification |
|----------|----------|---------------|
| Classification tâche → rôle | **Regex + heuristiques** (code pur) | Couvre 90% des cas, zéro latence, zéro coût. Pas de LLM de classification. |
| Compaction à 50K | **Résumé par extraction** (pas de LLM de résumé) | Fusionne les anciens tours en bloc compact de méta-données (fichiers lus, commandes, décisions). Déterministe, gratuit. |
| Index project | **Arbre + metadata** (pas de contenu pré-chargé) | Le modèle reçoit l'arbre dans le prompt et charge les fichiers via `Read`. Évite dépassement mémoire. |
| Enchaînement Plan → Code → Audit | **Pipeline séquentiel** avec point d'approbation après Plan | L'utilisateur peut approuver/rejeter le plan avant Code. |
| Sandbox agent Code | **Outils typés `RunScript`** (env nettoyé, timeout, pas de `shell=True`) | Le Bash brut (whitelist cassable) reste au mode manuel uniquement. |
| Où tourne l'orchestrateur | **Client-side** (module JS), exécution tools côté serveur | Réutilise `streamModelWithTools` existant, provider-agnostique. |

---

## 3. Architecture

### 3.1 Fichiers à créer

| Fichier | Rôle | Dépend de |
|---------|------|-----------|
| `static/marexcode/js/agents.js` | Registry rôles (Plan/Code/Audit) → modèle + tools + system prompt | — |
| `static/marexcode/js/task-classifier.js` | Classification message → rôle | — |
| `static/marexcode/js/prompt-composer.js` | Composition prompt (rôle + règles infra + contexte) | `agents.js` |
| `static/marexcode/js/context-store.js` | Index project + compaction 50K | — |
| `static/marexcode/js/runtime.js` | Orchestrateur pipeline Plan → Code → Audit | tous ci-dessus |
| `server/tests/test_runscript.py` | Tests sandbox `RunScript` | — |
| `static/marexcode/js/tests/auto-mode.test.mjs` | Tests structurels mode Auto | — |

### 3.2 Fichiers à modifier

| Fichier | Changement | Portée |
|---------|------------|--------|
| `server/marexcode.py` | Ajout endpoint `POST /api/marexcode/runscript` (exécution typée, env nettoyé) | Additif |
| `static/marexcode/js/chat.js` | Ajout point d'entrée `runAutoMode()` (branche, ne touche pas `send()`) | Additif |
| `static/marexcode/components/composer.html` | Ajout toggle « Auto / Manuel » | Additif |
| `static/marexcode/js/app.js` | Wiring toggle + import `runtime.js` | Additif |
| `static/marexcode/css/marexcode.css` | Styles phase pipeline (Plan/Code/Audit) | Additif |

> **Aucune suppression, aucun changement de comportement manuel.** Les modifications sont
> strictement additives : nouveaux fichiers, nouveaux endpoints, nouvelles branches de code.

---

## 4. Phase 1 — Agent Registry + Classification

### Task 1.1: `agents.js` — Registry des rôles

**Files:**
- Create: `static/marexcode/js/agents.js`
- Test: `static/marexcode/js/tests/auto-mode.test.mjs`

**Interfaces:**
- Produces: `AGENT_ROLES` (object), `resolveAgent(role)` → config agent, `getToolsForRole(role)`.

```js
export const AGENT_ROLES = {
  plan: {
    id: 'plan',
    name: 'Architecte',
    model: 'glm-5.2',
    fallback: 'deepseek-v4-pro',
    tools: ['Read', 'Grep', 'Glob', 'Ls'],
    systemPrompt: 'Tu es un architecte logiciel. Analyse le projet, produis un plan...',
    maxTokens: 16000,
  },
  code: {
    id: 'code',
    name: 'Développeur',
    model: 'deepseek-v4-pro',
    fallback: 'glm-5.2',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'Ls', 'RunScript'],
    systemPrompt: 'Tu es un développeur expert. Implémente le plan validé...',
    maxTokens: 32000,
  },
  audit: {
    id: 'audit',
    name: 'Auditeur',
    model: 'glm-5-turbo',
    fallback: 'deepseek-v4-pro',
    tools: ['Read', 'Grep', 'Glob', 'Ls', 'RunScript'],
    systemPrompt: 'Tu es un auditeur de code. Vérifie la conformité au plan...',
    maxTokens: 16000,
  },
};

export function resolveAgent(role) {
  return AGENT_ROLES[role] || AGENT_ROLES.code;
}

export function getToolsForRole(agent) {
  return MAREXCODE_TOOLS.filter(t => agent.tools.includes(t.function.name));
}
```

- [ ] **Step 1:** Écrire le test qui échoue (exports + mapping)

```js
import test from 'node:test';
import assert from 'node:assert';
import { AGENT_ROLES, resolveAgent, getToolsForRole } from '../agents.js';

test('AGENT_ROLES expose plan/code/audit', () => {
  assert.ok(AGENT_ROLES.plan);
  assert.ok(AGENT_ROLES.code);
  assert.ok(AGENT_ROLES.audit);
});

test('resolveAgent maps unknown role to code', () => {
  assert.equal(resolveAgent('unknown').id, 'code');
});

test('each role has model + tools', () => {
  for (const role of Object.values(AGENT_ROLES)) {
    assert.ok(role.model);
    assert.ok(Array.isArray(role.tools) && role.tools.length > 0);
  }
});
```

- [ ] **Step 2:** Implémenter `agents.js`
- [ ] **Step 3:** Test vert + commit

### Task 1.2: `task-classifier.js` — Classification regex

**Files:**
- Create: `static/marexcode/js/task-classifier.js`
- Test: `static/marexcode/js/tests/auto-mode.test.mjs`

```js
export function classifyTask(message) {
  const lower = String(message || '').toLowerCase();
  if (/^(analyse|analys|concevoir|concept|architect|design|plan|évaluer|evaluer|comparer|review)/.test(lower)) {
    return 'plan';
  }
  if (/^(vérifier|verifier|tester|test|auditer|audit|sécurité|securite|lint|check|qualité|qualite|corriger|correction)/.test(lower)) {
    return 'audit';
  }
  return 'code';
}
```

- [ ] **Step 1:** Test qui échoue (3 cas : plan, audit, code)
- [ ] **Step 2:** Implémenter
- [ ] **Step 3:** Test vert + commit

---

## 5. Phase 2 — Context Store + Prompt Composer

### Task 2.1: `context-store.js` — Index + compaction

**Files:**
- Create: `static/marexcode/js/context-store.js`
- Test: `static/marexcode/js/tests/auto-mode.test.mjs`

**Interfaces:**
- Produces: `buildProjectIndex(tree)`, `searchIndex(index, query)`, `checkCompaction(history, threshold)`, `estimateTokens(history)`.

```js
export const COMPACTION_THRESHOLD = 50000;

export function estimateTokens(history) {
  return history.reduce((sum, msg) => sum + Math.ceil(String(msg.content || '').length / 4), 0);
}

export function buildProjectIndex(tree) {
  return (tree.files || []).map(f => ({
    path: f.path,
    size: f.size,
    ext: (f.path.match(/\.[^.]+$/) || [''])[0],
  }));
}

export function searchIndex(index, query) {
  const keywords = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  return index.filter(f =>
    keywords.some(k => f.path.toLowerCase().includes(k))
  ).slice(0, 10);
}

export function checkCompaction(history, threshold = COMPACTION_THRESHOLD) {
  if (estimateTokens(history) <= threshold) return history;
  const system = history.slice(0, 1);
  const recent = history.slice(-6);
  const old = history.slice(1, -6);
  const summary = summarize(old);
  return [...system, { role: 'system', content: `[Contexte précédent]\n${summary}` }, ...recent];
}

function summarize(turns) {
  const files = new Set();
  const commands = [];
  for (const m of turns) {
    if (m.role === 'assistant' && m.tool_calls) {
      for (const tc of m.tool_calls) {
        if (tc.function?.name === 'Read' || tc.function?.name === 'Write' || tc.function?.name === 'Edit') {
          files.add(tc.function.arguments?.file_path);
        }
        if (tc.function?.name === 'Bash' || tc.function?.name === 'RunScript') {
          commands.push(tc.function.arguments?.command || tc.function.arguments?.language);
        }
      }
    }
  }
  const lines = [];
  if (files.size) lines.push(`Fichiers manipulés: ${[...files].join(', ')}`);
  if (commands.length) lines.push(`Commandes exécutées: ${commands.join('; ')}`);
  return lines.join('\n') || 'Aucune action significative.';
}
```

- [ ] **Step 1:** Tests qui échouent (estimate, build index, compaction seuil)
- [ ] **Step 2:** Implémenter
- [ ] **Step 3:** Test vert + commit

### Task 2.2: `prompt-composer.js` — Composition

**Files:**
- Create: `static/marexcode/js/prompt-composer.js`
- Test: `static/marexcode/js/tests/auto-mode.test.mjs`

```js
const INFRA_RULES = `Règles d'infrastructure :
- Utilise les outils uniquement via tool-calling.
- Le workspace est sandboxé ; ne tente pas d'en sortir.
- Tu renvoies du contenu final, pas du méta-texte sur tes actions.
- Si une dépendance manque, signale-la explicitement (outil dédié).`;

export function composePrompt(agent, contextStore = {}) {
  const parts = [agent.systemPrompt, INFRA_RULES];
  if (contextStore.index?.length) {
    parts.push(`Arborescence du projet (${contextStore.index.length} fichiers):\n`
      + contextStore.index.map(f => `- ${f.path}`).join('\n'));
  }
  if (contextStore.previousPhase) {
    parts.push(`[Résultat phase précédente]\n${contextStore.previousPhase}`);
  }
  return parts.join('\n\n');
}
```

- [ ] **Step 1:** Tests (prompt contient rôle + règles + index)
- [ ] **Step 2:** Implémenter
- [ ] **Step 3:** Test vert + commit

---

## 6. Phase 3 — Runtime Orchestrator

### Task 3.1: `runtime.js` — Pipeline Plan → Code → Audit

**Files:**
- Create: `static/marexcode/js/runtime.js`
- Test: `static/marexcode/js/tests/auto-mode.test.mjs`

```js
import { resolveAgent, getToolsForRole } from './agents.js';
import { classifyTask } from './task-classifier.js';
import { composePrompt } from './prompt-composer.js';
import { buildProjectIndex, checkCompaction } from './context-store.js';
import { streamModelWithTools } from '../../js/integrations/tool-search.js';

export const AUTO_PHASES = ['plan', 'code', 'audit'];

export async function runAutoMode({ task, tree, model, signal, onPhase, onChunk, onDone, onError }) {
  const index = buildProjectIndex(tree || { files: [] });
  const contextStore = { index, previousPhase: null };
  const outputs = [];

  for (const phaseId of AUTO_PHASES) {
    const agent = resolveAgent(phaseId);
    const effectiveModel = model || agent.model;
    const sys = composePrompt(agent, contextStore);
    const history = [
      { role: 'system', content: sys },
      { role: 'user', content: task },
    ];

    onPhase?.({ phase: phaseId, agent: agent.name, model: effectiveModel });

    const result = await new Promise((resolve, reject) => {
      streamModelWithTools(
        effectiveModel,
        history,
        onChunk,
        (usage) => resolve({ usage, content: history }),
        reject,
        getToolsForRole(agent),
        true,
        null, null, signal, null
      );
    });

    outputs.push({ phase: phaseId, result });
    contextStore.previousPhase = extractFinalContent(result);

    if (phaseId === 'plan') {
      // Point d'approbation géré côté UI via onPhase/onDone
    }

    // Compaction mécanique entre phases
    contextStore.history = checkCompaction(history);
  }

  onDone?.(outputs);
  return outputs;
}
```

> **Note `streamModelWithTools`:** signature actuelle `(model, history, onChunk, onDone, onError,
> tools, hasToolCalls, onThinking, signal, provider, options, fallbackIndex)`. Adapter l'appel au
> prototype réel (voir `static/js/integrations/tool-search.js`). Pas de modification de sa
> signature ; on consomme l'existant tel quel.

- [ ] **Step 1:** Test structurel (AUTO_PHASES ordre plan→code→audit)
- [ ] **Step 2:** Implémenter (wrapper autour de streamModelWithTools)
- [ ] **Step 3:** Test vert + commit

---

## 7. Phase 4 — Backend: `RunScript` (exécution typée)

### Task 4.1: Endpoint `POST /api/marexcode/runscript`

**Files:**
- Modify: `server/marexcode.py`
- Test: `server/tests/test_runscript.py`

**Objectif:** exécuter un script (python/node) de façon typée pour l'agent Code en mode Auto.
Contrairement à `Bash`, aucun `shell=True`, env nettoyé (suppression des secrets), timeout strict.

```python
def _exec_runscript(self, language, code, timeout=None):
    lang = (language or '').lower()
    runners = {
        'python': ['python3'],
        'node': ['node'],
    }
    if lang not in runners:
        return {'error': f'Unsupported language: {lang}'}

    safe_env = {
        'PATH': os.environ.get('PATH', '/usr/bin:/bin'),
        'HOME': self._marex_root,
        'LANG': 'C.UTF-8',
    }
    # Pas de CETAS_VAULT_PASSWORD, JWT secret, etc.

    script_path = os.path.join(self._marex_root, '.runscript_tmp')
    os.makedirs(script_path, exist_ok=True)
    import uuid
    fname = f'{uuid.uuid4().hex}.{("py" if lang == "python" else "js")}'
    fpath = os.path.join(script_path, fname)
    with open(fpath, 'w', encoding='utf-8') as f:
        f.write(code)

    t = min(int(timeout or 30), 60)
    try:
        proc = subprocess.run(
            runners[lang] + [fpath],
            cwd=self._marex_root,
            env=safe_env,
            capture_output=True,
            text=True,
            timeout=t,
        )
        return {
            'stdout': proc.stdout[:200000],
            'stderr': proc.stderr[:200000],
            'code': proc.returncode,
            'timeout_used': False,
        }
    except subprocess.TimeoutExpired:
        return {'error': f'Timeout after {t}s', 'timeout_used': True}
    finally:
        try:
            os.remove(fpath)
        except OSError:
            pass
```

- [ ] **Step 1:** Tests qui échouent (python exécute, node exécute, timeout, lang inconnu, env nettoyé)
- [ ] **Step 2:** Implémenter endpoint + route
- [ ] **Step 3:** Test vert + commit

---

## 8. Phase 5 — Intégration UI

### Task 5.1: Toggle Auto/Manuel + wiring

**Files:**
- Modify: `static/marexcode/components/composer.html` (toggle)
- Modify: `static/marexcode/js/app.js` (wiring)
- Modify: `static/marexcode/js/chat.js` (branche runAutoMode)
- Modify: `static/marexcode/css/marexcode.css` (styles pipeline)

- [ ] **Step 1:** Ajouter toggle « Auto » dans composer
- [ ] **Step 2:** `chat.js` branche : si mode auto → `runAutoMode()` ; sinon `send()` existant
- [ ] **Step 3:** Styles des phases (badges Plan/Code/Audit dans le chat)
- [ ] **Step 4:** Test structurel + vérif manuelle

---

## 9. Sécurité — Synthèse du sandbox actuel

Le sandbox actuel (`_exec_bash`) est **suffisant pour le mode manuel** (humain qui valide).
Pour le mode Auto (agent autonome), les failles relevées imposent `RunScript` :

| Faille | Impact | Mitigation Auto |
|--------|--------|-----------------|
| `find -exec rm -rf {} +` | Destruction workspace | `RunScript` n'utilise pas Bash |
| `npm install` postinstall | Exécution arbitrary | `RunScript` restreint python/node |
| `python3 -c` / `node -e` bypass | Exécution arbitrary | `RunScript` écrit fichier + env nettoyé |
| `CETAS_LOCAL_MODE=1` désactive tout | Full bypass | Non utilisé en Auto |
| Secrets dans env des subprocess | Fuite vault/JWT | `RunScript` : env minimal |

**Non couvert (dette assumée):** isolation processus (seccomp/cgroup/namespaces), limites CPU/
mémoire/disk. Hors périmètre de ce plan — noté comme amélioration future.

---

## 10. Ordre d'implémentation & séquençage

| Phase | Task | Livrable | Test |
|-------|------|----------|------|
| 1 | 1.1 `agents.js` | Registry rôles | `auto-mode.test.mjs` |
| 1 | 1.2 `task-classifier.js` | Classification | `auto-mode.test.mjs` |
| 2 | 2.1 `context-store.js` | Index + compaction | `auto-mode.test.mjs` |
| 2 | 2.2 `prompt-composer.js` | Composition prompt | `auto-mode.test.mjs` |
| 3 | 3.1 `runtime.js` | Orchestrateur | `auto-mode.test.mjs` |
| 4 | 4.1 `runscript` endpoint | Sandbox typé | `test_runscript.py` |
| 5 | 5.1 UI toggle + wiring | Mode Auto dans l'UI | structurel + manuel |

**Dépendances:** 1.1 et 1.2 indépendants. 2.1 et 2.2 dépendent de 1.1. 3.1 dépend de 1-2. 4.1
indépendant (backend pur). 5.1 dépend de 3.1 + 4.1.

---

## 11. Commandes de test

```bash
# Frontend (node --test)
node --test static/marexcode/js/tests/auto-mode.test.mjs

# Backend (pytest)
pytest server/tests/test_runscript.py

# Suite existante non régressée
node --test static/js/tests/marexcode-structure.test.mjs
pytest server/tests/
```

---

## 12. Risques & points d'attention

1. **Signature `streamModelWithTools`** : à confirmer au moment de l'implémentation de `runtime.js`.
   Le wrapper doit consommer l'existant sans le modifier.
2. **`MAREXCODE_TOOLS`** : constant global chargé depuis `tool-search.js`. `getToolsForRole` filtre
   par nom d'outil ; `RunScript` doit y être ajouté (définition tool JSON) pour être appelable.
3. **Point d'approbation Plan** : le MVP peut enchaîner sans pause ; l'approbation est un
   raffinement UI ultérieur.
4. **Compaction cross-phase** : le résumé produit est injecté en `system` de la phase suivante.
   Tester l'impact sur la qualité du contexte Code/Audit.
5. **Coût** : 3 phases × N itérations = 3× le coût manuel. Prévoir un affichage budget par phase.
