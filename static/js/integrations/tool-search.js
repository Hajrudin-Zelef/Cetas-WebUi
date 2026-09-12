async function _executeToolCall(e){var t,r=e.function.name;try{t=JSON.parse(e.function.arguments)}catch(e){t={}}if("web_search"===r){window.dispatchEvent(new CustomEvent("websearch-start"));var a=await executeWebSearch(t.query||"");window.dispatchEvent(new CustomEvent("websearch-end",{detail:{success:a&&0!==a.length}}));return a&&0!==a.length?{id:e.id,name:r,result:a}:{id:e.id,name:r,result:{error:"Recherche web indisponible actuellement (tous les moteurs ont échoué). Ne pas affirmer qu il n y a aucun résultat sur ce sujet -- informe l utilisateur que la recherche web est temporairement indisponible."}}}if("web_fetch"===r){var o=await executeWebFetch(t.url||"");return{id:e.id,name:r,result:o}}if("Bash"===r||"Read"===r||"Write"===r||"Edit"===r||"Grep"===r||"Ls"===r||"Glob"===r)return _execMarexcodeTool(e);if("RunScript"===r)return _execRunscriptTool(e);if("LSP"===r)return _execLspTool(e);if(r&&r.indexOf("mcp_")===0)return _execMcpTool(e);if(r&&r.indexOf("custom_")===0)return _execCustomTool(e);if("TodoWrite"===r){window.dispatchEvent(new CustomEvent("marexcode-todo",{detail:{todos:t.todos||[]}}));return{id:e.id,name:r,result:{ok:!0}}}if("mem_search"===r||"mem_read"===r||"mem_add"===r||"mem_edit"===r||"mem_delete"===r)return _execMemTool(e);return{id:e.id,name:r,result:{error:"Unknown tool: "+r}}}
async function streamModelWithTools(model, history, onChunk, onDone, onError, tools, _continuing, onThinking, abortSignal, _webSearch, _opts, _fallback, iter) {
  iter || (iter = 0);
  var dedup = _opts && _opts._dedup ? _opts._dedup : {};
  var nudgeCount = _opts && _opts._nudgeCount != null ? _opts._nudgeCount : 0;
  var toolsDisabled = _opts && _opts._toolsDisabled ? true : false;
  var maxNudges = 2;
  var editor = getModelEditeur(model) || (typeof getSearchModelEditeur === 'function' ? getSearchModelEditeur(model) : null);
  var provider = PROVIDERS[editor];
  if (!provider) {
    if (_fallback && _fallback.model && _fallback.provider) {
      return streamModelWithTools(_fallback.model, history, onChunk, onDone, onError, tools, false, onThinking, abortSignal, _webSearch, _opts, _fallback._nextFallback || null, 0);
    }
    return onError(new Error('Editeur inconnu pour le modele ' + model));
  }
  var idleMs = typeof window._streamIdleTimeoutMs === 'number' ? window._streamIdleTimeoutMs : 120000;
  var idleTimer = null, idleFired = false;
  var ctl = new AbortController();
  if (abortSignal) {
    if (abortSignal.aborted) ctl.abort();
    else abortSignal.addEventListener('abort', function() { ctl.abort(); }, { once: true });
  }
  var armIdle = function() {
    idleTimer && clearTimeout(idleTimer);
    idleTimer = setTimeout(function() { idleFired = true; try { ctl.abort(); } catch(e) {} }, idleMs);
  };
  armIdle();
  try {
    var sysMsg = null;
    for (var k = 0; k < history.length; k++) {
      if (history[k] && 'system' === history[k].role) {
        sysMsg = typeof history[k].content === 'string' ? history[k].content : '';
        break;
      }
    }
    var effectiveTools = toolsDisabled ? [] : (Array.isArray(tools) && tools.length ? tools : (_opts && _opts.tools));
    var reqOpts = Object.assign({}, _opts || {}, { tools: effectiveTools });
    var fmtMsgs = provider.formatMessages(history);
    var body = provider.buildBody(model, fmtMsgs, sysMsg, !!(Array.isArray(tools) && tools.length) || !!(_opts && _opts.webSearch), reqOpts);
    body.tools && 0 !== body.tools.length || (body.tools = typeof WEB_SEARCH_TOOLS !== 'undefined' ? WEB_SEARCH_TOOLS : []);
    if (window.FORCE_WEB_SEARCH && body.tools && body.tools.some(function(t) { return t.function && 'web_search' === t.function.name; })) {
      body.tool_choice = { type: 'function', function: { name: 'web_search' } };
    }
    var resp;
    try {
      resp = await fetch(provider.getUrl(model, _continuing), {
        method: 'POST',
        headers: typeof proxyHeaders === 'function' ? proxyHeaders(editor, provider.getHeaders()) : provider.getHeaders(),
        body: JSON.stringify(body),
        signal: ctl.signal
      });
    } catch (e) {
      if (e && 'AbortError' === e.name) throw e;
      throw new Error('Connexion a ' + editor + ' impossible.');
    }
    if (!resp.ok) {
      var errText = await resp.text();
      var errMsg = (editor + ' API error ' + resp.status + ': ' + errText);
      if (!toolsDisabled && Array.isArray(effectiveTools) && effectiveTools.length > 0) {
        toolsDisabled = true;
        history = history.concat([{ role: 'system', content: "N'appelle plus d'outil. Reponds maintenant directement a partir des informations deja obtenues." }]);
        if (idleTimer) clearTimeout(idleTimer);
        return streamModelWithTools(model, history, onChunk, onDone, onError, tools, true, onThinking, abortSignal, _webSearch, Object.assign({}, _opts || {}, { _dedup: dedup, _nudgeCount: nudgeCount, _toolsDisabled: true }), _fallback, iter);
      }
      throw new Error(errMsg);
    }
    var parser = createChatCompletionsParser(!!onThinking, {
      extractCitations: function(chunk) {
        var ann = chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.annotations;
        return ann ? ann.filter(function(a) { return 'url_citation' === a.type && a.url; }).map(function(a) { return { url: a.url, title: a.title || '' }; }) : null;
      },
      extractReasoning: function(chunk) {
        return chunk.choices && chunk.choices[0] && chunk.choices[0].delta && (chunk.choices[0].delta.reasoning_content || chunk.choices[0].delta.reasoning) || null;
      },
      accumulateCitations: true,
      accumulateToolCalls: true
    });
    var rawContent = '';
    for await (var sseChunk of readSSE(resp, function() { armIdle(); })) {
      var events = parser(sseChunk);
      for (var i = 0; i < events.length; i++) {
        var ev = events[i];
        if ('chunk' === ev.type) { rawContent += ev.data; onChunk(ev.data); }
        else if ('thinking' === ev.type && onThinking && ev.data) onThinking(ev.data);
      }
    }
    var flushed = parser.flush();
    for (var i = 0; i < flushed.length; i++) {
      var ev = flushed[i];
      if ('chunk' === ev.type) { rawContent += ev.data; onChunk(ev.data); }
      else if ('thinking' === ev.type && onThinking && ev.data) onThinking(ev.data);
    }
    var result = parser.getResult();
    var usage = result.usage, citations = result.citations;
    if (parser.hasToolCalls && parser.hasToolCalls()) {
      var toolCalls = parser.getToolCalls();
      var toolResults = [];
      for (var i = 0; i < toolCalls.length; i++) {
        var tc = toolCalls[i];
        var tcName = tc.function && tc.function.name || '';
        var dedupKey = tcName + '\x00' + (tc.function && tc.function.arguments || '');
        if (tcName !== 'Bash' && dedup[dedupKey]) {
          var prevResult = dedup[dedupKey];
          var repeatCount = dedup[dedupKey + ':count'] || 0;
          repeatCount++;
          dedup[dedupKey + ':count'] = repeatCount;
          var skipResult;
          if (repeatCount >= 2) {
            skipResult = '[deja fait] Cet appel exact a deja ete execute ' + repeatCount + ' fois dans ce tour; son resultat est plus haut dans la conversation. Ne le redemande plus: reponds avec ce que tu as, ou change d\'approche.';
          } else {
            skipResult = '[deja fait] Appel identique deja execute dans ce tour -- non rejoue. Voici a nouveau son resultat; ne le redemande pas une troisieme fois.\n\n' + prevResult;
          }
          toolResults.push({ id: tc.id, name: tcName, result: skipResult });
          continue;
        }
        try {
          var execResult = await _withToolGuard(_executeToolCall(tc), tc);
          toolResults.push(execResult);
          if (tcName !== 'Bash') dedup[dedupKey] = typeof execResult.result === 'string' ? execResult.result : JSON.stringify(execResult.result);
        } catch (e) {
          toolResults.push({ id: tc.id, name: tcName, result: { error: e && e.message || String(e) } });
        }
      }
      var assistantMsg = { role: 'assistant', content: rawContent || null, tool_calls: toolCalls.map(function(tc) { return { id: tc.id, type: 'function', function: { name: tc.function.name, arguments: tc.function.arguments } }; }) };
      var toolMsgs = toolResults.map(function(r) { return { role: 'tool', tool_call_id: r.id, content: typeof r.result === 'string' ? r.result : JSON.stringify(r.result) }; });
      if (idleTimer) clearTimeout(idleTimer);
      return streamModelWithTools(model, history.concat([assistantMsg], toolMsgs), onChunk, onDone, onError, tools, true, onThinking, abortSignal, _webSearch, Object.assign({}, _opts || {}, { _dedup: dedup, _nudgeCount: nudgeCount, _toolsDisabled: toolsDisabled }), _fallback, iter + 1);
    }
    if (!rawContent && nudgeCount < maxNudges && Array.isArray(effectiveTools) && effectiveTools.length > 0) {
      nudgeCount++;
      var nudge = 'Tu as raisonne mais pas utilise d\'outil ni repondu. Agis MAINTENANT: appelle l\'outil approprie directement, ou donne ta reponse finale si tu as deja l\'info. N\'explique pas, agis.';
      if (nudgeCount > 1) {
        nudge = 'Tu es bloque a decrire le meme plan sans l\'executer. Arrete de raisonner. Dans ton PROCHAIN message, appelle UN outil maintenant, ou ecris ta reponse finale en texte brut avec ce que tu sais deja -- plus de plan, plus de reflexion, agis ou reponds instantanement.';
      }
      if (idleTimer) clearTimeout(idleTimer);
      return streamModelWithTools(model, history.concat([{ role: 'user', content: nudge }]), onChunk, onDone, onError, tools, true, onThinking, abortSignal, _webSearch, Object.assign({}, _opts || {}, { _dedup: dedup, _nudgeCount: nudgeCount, _toolsDisabled: toolsDisabled }), _fallback, iter);
    }
    onDone(usage, citations);
  } catch (err) {
    if (idleTimer) clearTimeout(idleTimer);
    if (err && 'AbortError' === err.name) return void (idleFired ? onError(new Error('Modele silencieux depuis ' + Math.round(idleMs / 1000) + 's: stream inactif, tentative interrompue. Reessayez ou changez de modele.')) : onDone(null, []));
    if (_fallback && _fallback.model && _fallback.provider) return streamModelWithTools(_fallback.model, history, onChunk, onDone, onError, tools, false, onThinking, abortSignal, _webSearch, _opts, _fallback._nextFallback || null, 0);
    onError(err);
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
  }
}

// ── Marexcode tools (assistant de codage) ─────────────────────────────
var MAREXCODE_TOOLS = [
  {type:"function",function:{name:"Bash",description:"Exécute une commande shell dans le sandbox projet (whitelist: ls, cat, grep, git, node, python3, npm, npx, head, tail, wc, find, sed, awk, echo, mkdir, touch, rm, cp, mv, pwd, date). Timeout configurable (défaut 10s, max 60s).",parameters:{type:"object",properties:{command:{type:"string",description:"La commande shell à exécuter"},timeout:{type:"integer",description:"Timeout en secondes (défaut 10, max 60)"}},required:["command"]}}},
  {type:"function",function:{name:"Read",description:"Lit le contenu d'un fichier du projet. Supporte la pagination avec offset (ligne de départ, 1-based) et limit (nombre max de lignes).",parameters:{type:"object",properties:{file_path:{type:"string",description:"Chemin relatif du fichier"},offset:{type:"integer",description:"Ligne de départ (1-based, optionnel)"},limit:{type:"integer",description:"Nombre max de lignes à lire (optionnel)"}},required:["file_path"]}}},
  {type:"function",function:{name:"Write",description:"Écrit (ou écrase) un fichier du projet. Retourne une indication si le fichier existait déjà.",parameters:{type:"object",properties:{file_path:{type:"string"},content:{type:"string"}},required:["file_path","content"]}}},
  {type:"function",function:{name:"Edit",description:"Remplace une occurrence d'un texte dans un fichier du projet. Retourne un diff unifié avec les statistiques (additions/deletions).",parameters:{type:"object",properties:{file_path:{type:"string"},old:{type:"string",description:"Texte exact à remplacer"},new:{type:"string",description:"Texte de remplacement"}},required:["file_path","old","new"]}}},
  {type:"function",function:{name:"Grep",description:"Recherche un motif dans les fichiers du projet. Limite optionnelle pour borner les résultats.",parameters:{type:"object",properties:{pattern:{type:"string"},path:{type:"string",description:"Chemin ou dossier (défaut: racine du projet)"},limit:{type:"integer",description:"Nombre max de résultats (optionnel)"}},required:["pattern"]}}},
  {type:"function",function:{name:"Glob",description:"Trouve des fichiers par pattern (ex: **/*.ts, src/**/*.js). Utilise les wildcards * et **. Utile pour découvrir quels fichiers existent avant de les lire.",parameters:{type:"object",properties:{pattern:{type:"string",description:"Glob pattern (ex: **/*.py, src/**/*.ts)"}},required:["pattern"]}}},
  {type:"function",function:{name:"Ls",description:"Liste l'arborescence complète des fichiers du workspace actif (chemins relatifs). Utilise cet outil EN PREMIER pour découvrir la structure avant de lire des fichiers.",parameters:{type:"object",properties:{},required:[]}}},
  {type:"function",function:{name:"TodoWrite",description:"Met à jour la liste de tâches pour suivre la progression. À utiliser pour toute tâche multi-étapes : appeler au début pour lister le plan, puis après chaque étape pour mettre à jour les statuts.",parameters:{type:"object",properties:{todos:{type:"array",items:{type:"object",properties:{content:{type:"string",description:"Description de la tâche"},status:{type:"string",enum:["pending","in_progress","completed"],description:"Statut de la tâche"}}},description:"Liste des tâches avec leurs statuts"}},required:["todos"]}}},
  {type:"function",function:{name:"LSP",description:"Intelligence code via Language Server Protocol : go-to-definition, find-references, hover (type/info), document symbols. Nécessite un LSP serveur installé (pyright, typescript-language-server, etc.).",parameters:{type:"object",properties:{operation:{type:"string",enum:["definition","references","hover","symbol"],description:"Opération LSP à exécuter"},file:{type:"string",description:"Chemin relatif du fichier"},line:{type:"integer",description:"Numéro de ligne (0-based)"},character:{type:"integer",description:"Position sur la ligne (0-based)"}},required:["operation","file","line","character"]}}},
  {type:"function",function:{name:"RunScript",description:"Exécute un script python ou node dans le sandbox projet (exécution typée, sans shell). Préférer cet outil à Bash pour lancer du code. Timeout défaut 30s, max 60s.",parameters:{type:"object",properties:{language:{type:"string",enum:["python","node"],description:"Langage du script"},code:{type:"string",description:"Contenu complet du script à exécuter"},timeout:{type:"integer",description:"Timeout en secondes (défaut 30, max 60)"}},required:["language","code"]}}},
];

var MEM_TOOLS = [
  {type:"function",function:{name:"mem_search",description:"Recherche full-text dans les pages memoire de la session.",parameters:{type:"object",properties:{query:{type:"string",description:"Termes de recherche"},limit:{type:"integer",description:"Nombre max de resultats (defaut 8)"}},required:["query"]}}},
  {type:"function",function:{name:"mem_read",description:"Lit le contenu d'une page memoire avec numero de lignes.",parameters:{type:"object",properties:{name:{type:"string",description:"Nom de la page (sans .md)"},offset:{type:"integer",description:"Ligne de depart (1-based)"},limit:{type:"integer",description:"Nombre max de lignes (defaut 500)"}},required:["name"]}}},
  {type:"function",function:{name:"mem_add",description:"Cree une nouvelle page memoire. Refuse d'ecraser une page existante.",parameters:{type:"object",properties:{name:{type:"string",description:"Nom de la page (sans .md)"},content:{type:"string",description:"Contenu markdown de la page"}},required:["name","content"]}}},
  {type:"function",function:{name:"mem_edit",description:"Remplace un texte exact dans une page memoire.",parameters:{type:"object",properties:{name:{type:"string",description:"Nom de la page"},old:{type:"string",description:"Texte exact a remplacer"},new:{type:"string",description:"Texte de remplacement"}},required:["name","old","new"]}}},
  {type:"function",function:{name:"mem_delete",description:"Supprime une page memoire.",parameters:{type:"object",properties:{name:{type:"string",description:"Nom de la page a supprimer"}},required:["name"]}}},
];

function _withToolGuard(p, tc) {
  var ms = "number" == typeof window._toolExecTimeoutMs ? window._toolExecTimeoutMs : 130000;
  var name = (tc && tc.function && tc.function.name) || "unknown";
  var args = {};
  try { args = JSON.parse(tc && tc.function && tc.function.arguments) || {}; } catch (_) { args = {}; }
  var timer = null;
  var guard = new Promise(function (_, rej) {
    timer = setTimeout(function () {
      var msg = "Tool " + name + " sans réponse (" + Math.round(ms / 1000) + "s)";
      window.dispatchEvent(new CustomEvent("marexcode-tool", {
        detail: { name: name, args: args, result: { error: msg }, phase: "end" },
      }));
      rej(new Error(msg));
    }, ms);
  });
  guard.catch(function () {});
  return Promise.race([p, guard]).then(function (r) { clearTimeout(timer); return r; }, function (e) { clearTimeout(timer); throw e; });
}

async function _execMarexcodeTool(e){
  var name = e.function.name, args = {};
  try { args = JSON.parse(e.function.arguments); } catch (_) { args = {}; }
  var tool = name.toLowerCase();

  // ── Point d'interception unique : permission active (Read only /
  // Espace Write / Ask permission) avant toute action mutante. ──────────
  if (typeof window._marexCheckPermission === "function") {
    var check = window._marexCheckPermission(tool, args);
    if (check && check.allowed === false) {
      window.dispatchEvent(new CustomEvent("marexcode-tool", {
        detail: { name: name, args: args, result: { error: check.reason }, phase: "end", blocked: true },
      }));
      return { id: e.id, name: name, result: { error: check.reason } };
    }
  }

  var payload;
  if (tool === "bash") payload = { tool: "Bash", args: { command: String(args.command || ""), timeout: args.timeout || null } };
  else if (tool === "read") payload = { tool: "Read", args: { file_path: String(args.file_path || ""), offset: args.offset || null, limit: args.limit || null } };
  else if (tool === "write") payload = { tool: "Write", args: { file_path: String(args.file_path || ""), content: String(args.content || "") } };
  else if (tool === "edit") payload = { tool: "Edit", args: { file_path: String(args.file_path || ""), old: String(args.old || ""), new: String(args.new || "") } };
  else if (tool === "grep") payload = { tool: "Grep", args: { pattern: String(args.pattern || ""), path: String(args.path || ""), limit: args.limit || null } };
  else if (tool === "ls") payload = { tool: "Ls", args: {} };
  else if (tool === "glob") payload = { tool: "Glob", args: { pattern: String(args.pattern || "") } };
  else return { id: e.id, name: name, result: { error: "Unknown tool: " + name } };
  var clientMs = tool === "bash" ? Math.max(20000, ((Number(args.timeout) || 10) + 5) * 1000) : 20000;
  try {
    var headers = { "Content-Type": "application/json" };
    if (typeof Auth !== "undefined" && Auth.getToken) { var tk = Auth.getToken(); if (tk) headers.Authorization = "Bearer " + tk; }
    window.dispatchEvent(new CustomEvent("marexcode-tool", {
      detail: { name: name, args: args, result: null, phase: "start" },
    }));
    var resp = await fetch("/api/exec", { method: "POST", headers: headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(clientMs) });
    var data = await resp.json().catch(function(){ return {}; });
    window.dispatchEvent(new CustomEvent("marexcode-tool", {
      detail: { name: name, args: args, result: data, phase: "end" },
    }));
    if (!resp.ok) return { id: e.id, name: name, result: { error: data.error || ("Erreur exec " + resp.status) } };
    return { id: e.id, name: name, result: (data && data.text) ? data.text : data };
  } catch (err) {
    var msg = (err && (err.name === "AbortError" || err.name === "TimeoutError")) ? ("Timeout exécution (" + Math.round(clientMs / 1000) + "s)") : (err && err.message ? err.message : "Erreur réseau exec");
    window.dispatchEvent(new CustomEvent("marexcode-tool", {
      detail: { name: name, args: args, result: { error: msg }, phase: "end" },
    }));
    return { id: e.id, name: name, result: { error: msg } };
  }
}

async function _execRunscriptTool(e){
  var name = e.function.name, args = {};
  try { args = JSON.parse(e.function.arguments); } catch (_) { args = {}; }

  if (typeof window._marexCheckPermission === "function") {
    var check = window._marexCheckPermission("runscript", args);
    if (check && check.allowed === false) {
      window.dispatchEvent(new CustomEvent("marexcode-tool", {
        detail: { name: name, args: args, result: { error: check.reason }, phase: "end", blocked: true },
      }));
      return { id: e.id, name: name, result: { error: check.reason } };
    }
  }

  var timeout = args.timeout ? Math.min(Number(args.timeout) || 30, 60) : 30;
  var clientMs = Math.max(20000, (timeout + 2) * 1000);
  var payload = { language: String(args.language || ""), code: String(args.code || ""), timeout: timeout };
  try {
    var headers = { "Content-Type": "application/json" };
    if (typeof Auth !== "undefined" && Auth.getToken) { var tk = Auth.getToken(); if (tk) headers.Authorization = "Bearer " + tk; }
    window.dispatchEvent(new CustomEvent("marexcode-tool", {
      detail: { name: name, args: { language: payload.language, code: payload.code.slice(0, 200) }, result: null, phase: "start" },
    }));
    var resp = await fetch("/api/marexcode/runscript", { method: "POST", headers: headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(clientMs) });
    var data = await resp.json().catch(function(){ return {}; });
    window.dispatchEvent(new CustomEvent("marexcode-tool", {
      detail: { name: name, args: payload, result: data, phase: "end" },
    }));
    if (!resp.ok) return { id: e.id, name: name, result: { error: data.error || ("Erreur runscript " + resp.status) } };
    return { id: e.id, name: name, result: (data && data.text) ? data.text : data };
  } catch (err) {
    var msg = (err && (err.name === "AbortError" || err.name === "TimeoutError")) ? ("Timeout client (" + Math.round(clientMs / 1000) + "s)") : (err && err.message ? err.message : "Erreur réseau runscript");
    window.dispatchEvent(new CustomEvent("marexcode-tool", {
      detail: { name: name, args: payload, result: { error: msg }, phase: "end" },
    }));
    return { id: e.id, name: name, result: { error: msg } };
  }
}

async function _execLspTool(e){
  var name = e.function.name, args = {};
  try { args = JSON.parse(e.function.arguments); } catch (_) { args = {}; }
  var operation = String(args.operation || "definition");
  var file = String(args.file || "");
  var line = typeof args.line === "number" ? args.line : 0;
  var character = typeof args.character === "number" ? args.character : 0;
  if (!file) return { id: e.id, name: name, result: { error: "file parameter required for LSP" } };
  try {
    var headers = { "Content-Type": "application/json" };
    if (typeof Auth !== "undefined" && Auth.getToken) { var tk = Auth.getToken(); if (tk) headers.Authorization = "Bearer " + tk; }
    window.dispatchEvent(new CustomEvent("marexcode-tool", {
      detail: { name: name, args: args, result: null, phase: "start" },
    }));
    var resp = await fetch("/api/lsp/" + encodeURIComponent(operation), {
      method: "POST", headers: headers,
      body: JSON.stringify({ file: file, line: line, character: character }),
      signal: AbortSignal.timeout(15000)
    });
    var data = await resp.json().catch(function(){ return {}; });
    window.dispatchEvent(new CustomEvent("marexcode-tool", {
      detail: { name: name, args: args, result: data, phase: "end" },
    }));
    if (!resp.ok) return { id: e.id, name: name, result: { error: data.error || ("Erreur LSP " + resp.status) } };
    var text = "";
    if (Array.isArray(data)) {
      text = data.map(function(d) {
        if (d.uri) {
          var path = d.uri.replace("file://", "");
          var line = d.range ? d.range.start.line : "";
          return path + ":" + line;
        }
        if (d.name) return (d.location ? d.location.uri.replace("file://", "") + ":" + (d.location.range ? d.location.range.start.line : "") : "") + " " + d.name + " (" + (d.kind || "") + ")";
        if (d.contents) return typeof d.contents === "string" ? d.contents : (d.contents.value || JSON.stringify(d.contents));
        return JSON.stringify(d);
      }).join("\n");
    } else if (data && data.contents) {
      text = typeof data.contents === "string" ? data.contents : (data.contents.value || JSON.stringify(data.contents));
    } else if (data && data.uri) {
      text = data.uri.replace("file://", "") + ":" + (data.range ? data.range.start.line : "");
    } else {
      text = JSON.stringify(data);
    }
    return { id: e.id, name: name, result: text || "No result" };
  } catch (err) {
    var msg = (err && (err.name === "AbortError" || err.name === "TimeoutError")) ? "Timeout LSP (15s)" : (err && err.message ? err.message : "Erreur réseau LSP");
    window.dispatchEvent(new CustomEvent("marexcode-tool", {
      detail: { name: name, args: args, result: { error: msg }, phase: "end" },
    }));
    return { id: e.id, name: name, result: { error: msg } };
  }
}

// ── MCP tools (Model Context Protocol) ─────────────────────────────
var MCP_TOOLS_LOADED = false;

async function loadMcpTools() {
  if (MCP_TOOLS_LOADED) return;
  try {
    var headers = {};
    if (typeof Auth !== "undefined" && Auth.getToken) { var tk = Auth.getToken(); if (tk) headers.Authorization = "Bearer " + tk; }
    var resp = await fetch("/api/mcp/servers", { headers: headers, signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return;
    var servers = await resp.json().catch(function(){ return []; });
    for (var i = 0; i < servers.length; i++) {
      var srv = servers[i];
      var tResp = await fetch("/api/mcp/" + encodeURIComponent(srv.name) + "/tools", { headers: headers, signal: AbortSignal.timeout(15000) });
      if (!tResp.ok) continue;
      var tools = await tResp.json().catch(function(){ return []; });
      for (var j = 0; j < tools.length; j++) {
        var tool = tools[j];
        var fnName = "mcp_" + srv.name + "_" + tool.name;
        var desc = (tool.description || tool.name);
        if (srv.name === "context7" && tool.name === "resolve-library-id") {
          desc = "Resolve a library name to a Context7 library ID. ALWAYS call this first before query-docs. Args: libraryName (string), query (string).";
        } else if (srv.name === "context7" && tool.name === "query-docs") {
          desc = "Query up-to-date documentation for a library. Requires libraryId from resolve-library-id. Args: libraryId (string like '/org/project'), query (string).";
        } else if (srv.name === "fetch" && tool.name === "fetch") {
          desc = "Fetch web page content and convert to markdown. Use for documentation, articles, URLs. Args: url (string).";
        } else if (srv.name === "memory") {
          desc = "[Memory:" + tool.name + "] " + desc;
        } else if (srv.name === "filesystem") {
          desc = "[FS:" + tool.name + "] " + desc;
        }
        MAREXCODE_TOOLS.push({
          type: "function",
          function: {
            name: fnName,
            description: desc,
            parameters: tool.inputSchema || { type: "object", properties: {} }
          }
        });
      }
    }
    MCP_TOOLS_LOADED = true;
  } catch (e) { /* ignore MCP load errors */ }
}

async function _execMcpTool(e) {
  var name = e.function.name, args = {};
  try { args = JSON.parse(e.function.arguments); } catch (_) { args = {}; }
  var parts = name.split("_");
  if (parts.length < 3) return { id: e.id, name: name, result: { error: "Invalid MCP tool name" } };
  var serverName = parts[1];
  var toolName = parts.slice(2).join("_");
  try {
    var headers = { "Content-Type": "application/json" };
    if (typeof Auth !== "undefined" && Auth.getToken) { var tk = Auth.getToken(); if (tk) headers.Authorization = "Bearer " + tk; }
    window.dispatchEvent(new CustomEvent("marexcode-tool", {
      detail: { name: name, args: args, result: null, phase: "start" },
    }));
    var resp = await fetch("/api/mcp/" + encodeURIComponent(serverName) + "/" + encodeURIComponent(toolName), {
      method: "POST", headers: headers,
      body: JSON.stringify({ args: args }),
      signal: AbortSignal.timeout(30000)
    });
    var data = await resp.json().catch(function(){ return {}; });
    window.dispatchEvent(new CustomEvent("marexcode-tool", {
      detail: { name: name, args: args, result: data, phase: "end" },
    }));
    if (!resp.ok) return { id: e.id, name: name, result: { error: data.error || ("Erreur MCP " + resp.status) } };
    var text = "";
    if (data.content && Array.isArray(data.content)) {
      text = data.content.map(function(c) { return c.text || JSON.stringify(c); }).join("\n");
    } else {
      text = JSON.stringify(data);
    }
    return { id: e.id, name: name, result: text || "No result" };
  } catch (err) {
    var msg = (err && (err.name === "AbortError" || err.name === "TimeoutError")) ? "Timeout MCP (30s)" : (err && err.message ? err.message : "Erreur réseau MCP");
    window.dispatchEvent(new CustomEvent("marexcode-tool", {
      detail: { name: name, args: args, result: { error: msg }, phase: "end" },
    }));
    return { id: e.id, name: name, result: { error: msg } };
  }
}

// ── Custom Tools (user-defined via tools.json) ──────────────────────
var CUSTOM_TOOLS_LOADED = false;

async function loadCustomTools() {
  if (CUSTOM_TOOLS_LOADED) return;
  try {
    var headers = {};
    if (typeof Auth !== "undefined" && Auth.getToken) { var tk = Auth.getToken(); if (tk) headers.Authorization = "Bearer " + tk; }
    var resp = await fetch("/api/marexcode/custom-tools", { headers: headers, signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return;
    var tools = await resp.json().catch(function(){ return {}; });
    var keys = Object.keys(tools);
    for (var i = 0; i < keys.length; i++) {
      var name = keys[i];
      var cfg = tools[name];
      var fnName = "custom_" + name;
      var params = { type: "object", properties: {}, required: [] };
      var cmd = cfg.command || "";
      var re = /\{(\w+)\}/g;
      var m;
      while ((m = re.exec(cmd)) !== null) {
        if (!params.properties[m[1]]) {
          params.properties[m[1]] = { type: "string", description: "Parameter for " + m[1] };
          params.required.push(m[1]);
        }
      }
      MAREXCODE_TOOLS.push({
        type: "function",
        function: {
          name: fnName,
          description: "[Custom] " + (cfg.description || name) + " (command: " + cmd.substring(0, 60) + ")",
          parameters: params
        }
      });
    }
    CUSTOM_TOOLS_LOADED = true;
  } catch (e) { /* ignore */ }
}

async function _execCustomTool(e) {
  var name = e.function.name, args = {};
  try { args = JSON.parse(e.function.arguments); } catch (_) { args = {}; }
  var toolName = name.replace(/^custom_/, "");
  try {
    var headers = { "Content-Type": "application/json" };
    if (typeof Auth !== "undefined" && Auth.getToken) { var tk = Auth.getToken(); if (tk) headers.Authorization = "Bearer " + tk; }
    window.dispatchEvent(new CustomEvent("marexcode-tool", {
      detail: { name: name, args: args, result: null, phase: "start" },
    }));
    var resp = await fetch("/api/marexcode/custom-tools/" + encodeURIComponent(toolName), {
      method: "POST", headers: headers,
      body: JSON.stringify({ args: args }),
      signal: AbortSignal.timeout(120000)
    });
    var data = await resp.json().catch(function(){ return {}; });
    window.dispatchEvent(new CustomEvent("marexcode-tool", {
      detail: { name: name, args: args, result: data, phase: "end" },
    }));
    if (!resp.ok) return { id: e.id, name: name, result: { error: data.error || ("Erreur custom tool " + resp.status) } };
    return { id: e.id, name: name, result: data.text || JSON.stringify(data) };
  } catch (err) {
    var msg = (err && (err.name === "AbortError" || err.name === "TimeoutError")) ? "Timeout custom tool (120s)" : (err && err.message ? err.message : "Erreur réseau");
    window.dispatchEvent(new CustomEvent("marexcode-tool", {
      detail: { name: name, args: args, result: { error: msg }, phase: "end" },
    }));
    return { id: e.id, name: name, result: { error: msg } };
  }
}

async function _execMemTool(e) {
  var name = e.function.name, args = {};
  try { args = JSON.parse(e.function.arguments); } catch (_) { args = {}; }
  var sessionId = window._marexSessionId || '';
  if (!sessionId) return { id: e.id, name: name, result: { error: 'Aucune session active pour la memoire.' } };
  var headers = { "Content-Type": "application/json" };
  if (typeof Auth !== "undefined" && Auth.getToken) { var tk = Auth.getToken(); if (tk) headers.Authorization = "Bearer " + tk; }
  window.dispatchEvent(new CustomEvent("marexcode-tool", { detail: { name: name, args: args, result: null, phase: "start" } }));
  try {
    var resp, data;
    if (name === "mem_search") {
      resp = await fetch("/api/marexcode/memory/" + encodeURIComponent(sessionId) + "/search", { method: "POST", headers: headers, body: JSON.stringify({ query: args.query || "", limit: args.limit || 8 }), signal: AbortSignal.timeout(10000) });
      data = await resp.json().catch(function() { return {}; });
      window.dispatchEvent(new CustomEvent("marexcode-tool", { detail: { name: name, args: args, result: data, phase: "end" } }));
      if (!resp.ok) return { id: e.id, name: name, result: { error: data.error || "Erreur search " + resp.status } };
      var hits = data.hits || [];
      if (!hits.length) return { id: e.id, name: name, result: "[aucun resultat]" };
      var out = hits.map(function(h) { return "- " + h.file + " -- " + h.title + "\n  " + h.snippet; }).join("\n");
      return { id: e.id, name: name, result: out };
    }
    if (name === "mem_read") {
      var url = "/api/marexcode/memory/" + encodeURIComponent(sessionId) + "/page/" + encodeURIComponent(args.name || "");
      var sep = "?";
      if (args.offset) { url += sep + "offset=" + args.offset; sep = "&"; }
      if (args.limit) { url += sep + "limit=" + args.limit; }
      resp = await fetch(url, { method: "GET", headers: headers, signal: AbortSignal.timeout(10000) });
      data = await resp.json().catch(function() { return {}; });
      window.dispatchEvent(new CustomEvent("marexcode-tool", { detail: { name: name, args: args, result: data, phase: "end" } }));
      if (!resp.ok) return { id: e.id, name: name, result: { error: data.error || "Erreur read " + resp.status } };
      return { id: e.id, name: name, result: data.content || "" };
    }
    if (name === "mem_add") {
      resp = await fetch("/api/marexcode/memory/" + encodeURIComponent(sessionId) + "/page", { method: "POST", headers: headers, body: JSON.stringify({ name: args.name || "", content: args.content || "" }), signal: AbortSignal.timeout(10000) });
      data = await resp.json().catch(function() { return {}; });
      window.dispatchEvent(new CustomEvent("marexcode-tool", { detail: { name: name, args: { name: args.name }, result: data, phase: "end" } }));
      if (!resp.ok) return { id: e.id, name: name, result: { error: data.error || "Erreur add " + resp.status } };
      return { id: e.id, name: name, result: data.message || "[ok] page creee" };
    }
    if (name === "mem_edit") {
      resp = await fetch("/api/marexcode/memory/" + encodeURIComponent(sessionId) + "/page/" + encodeURIComponent(args.name || ""), { method: "PUT", headers: headers, body: JSON.stringify({ old: args.old || "", new: args.new || "" }), signal: AbortSignal.timeout(10000) });
      data = await resp.json().catch(function() { return {}; });
      window.dispatchEvent(new CustomEvent("marexcode-tool", { detail: { name: name, args: args, result: data, phase: "end" } }));
      if (!resp.ok) return { id: e.id, name: name, result: { error: data.error || "Erreur edit " + resp.status } };
      return { id: e.id, name: name, result: data.message || "[ok] page modifiee" };
    }
    if (name === "mem_delete") {
      resp = await fetch("/api/marexcode/memory/" + encodeURIComponent(sessionId) + "/page/" + encodeURIComponent(args.name || ""), { method: "DELETE", headers: headers, signal: AbortSignal.timeout(10000) });
      data = await resp.json().catch(function() { return {}; });
      window.dispatchEvent(new CustomEvent("marexcode-tool", { detail: { name: name, args: args, result: data, phase: "end" } }));
      if (!resp.ok) return { id: e.id, name: name, result: { error: data.error || "Erreur delete " + resp.status } };
      return { id: e.id, name: name, result: "[ok] page supprimee" };
    }
  } catch (err) {
    var msg = (err && (err.name === "AbortError" || err.name === "TimeoutError")) ? "Timeout memoire (10s)" : (err && err.message ? err.message : "Erreur reseau memoire");
    window.dispatchEvent(new CustomEvent("marexcode-tool", { detail: { name: name, args: args, result: { error: msg }, phase: "end" } }));
    return { id: e.id, name: name, result: { error: msg } };
  }
  return { id: e.id, name: name, result: { error: "Unknown mem tool: " + name } };
}
