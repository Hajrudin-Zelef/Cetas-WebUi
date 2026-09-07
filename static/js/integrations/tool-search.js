var TOOL_SEARCH_MAX_ITERATIONS = 15;async function _executeToolCall(e){var t,r=e.function.name;try{t=JSON.parse(e.function.arguments)}catch(e){t={}}if("web_search"===r){window.dispatchEvent(new CustomEvent("websearch-start"));var a=await executeWebSearch(t.query||"");window.dispatchEvent(new CustomEvent("websearch-end",{detail:{success:a&&0!==a.length}}));return a&&0!==a.length?{id:e.id,name:r,result:a}:{id:e.id,name:r,result:{error:"Recherche web indisponible actuellement (tous les moteurs ont échoué). Ne pas affirmer qu il n y a aucun résultat sur ce sujet -- informe l utilisateur que la recherche web est temporairement indisponible."}}}if("web_fetch"===r){var o=await executeWebFetch(t.url||"");return{id:e.id,name:r,result:o}}if("Bash"===r||"Read"===r||"Write"===r||"Edit"===r||"Grep"===r||"Ls"===r)return _execMarexcodeTool(e);if("TodoWrite"===r){window.dispatchEvent(new CustomEvent("marexcode-todo",{detail:{todos:t.todos||[]}}));return{id:e.id,name:r,result:{ok:!0}}}return{id:e.id,name:r,result:{error:"Unknown tool: "+r}}}async function streamModelWithTools(e,t,r,a,o,n,l,i,u,s,c,d){d||(d=0);var h=getModelEditeur(e)||("function"==typeof getSearchModelEditeur?getSearchModelEditeur(e):null),f=PROVIDERS[h];if(!f)return c&&c.model&&c.provider?(console.warn("[tool-search] éditeur inconnu pour "+e+" → fallback "+c.model),streamModelWithTools(c.model,t,r,a,o,n,!1,i,u,s,c._nextFallback||null,0)):void o(new Error("Éditeur inconnu pour le modèle "+e));try{var m,_sys=null;for(var _k=0;_k<t.length;_k++){if(t[_k]&&"system"===t[_k].role){_sys=typeof t[_k].content==="string"?t[_k].content:"";break}}var _opts=Object.assign({},s||{},{tools:Array.isArray(n)&&n.length?n:(s&&s.tools)});var g=f.formatMessages(t),p=f.buildBody(e,g,_sys,!!(Array.isArray(n)&&n.length)||!!(s&&s.webSearch),_opts);p.tools&&0!==p.tools.length||(p.tools="undefined"!=typeof WEB_SEARCH_TOOLS?WEB_SEARCH_TOOLS:[]);if(window.FORCE_WEB_SEARCH&&p.tools&&p.tools.some(function(t){return t.function&&"web_search"===t.function.name})){p.tool_choice={type:"function",function:{name:"web_search"}}}try{m=await fetch(f.getUrl(e,l),{method:"POST",headers:"function"==typeof proxyHeaders?proxyHeaders(h,f.getHeaders()):f.getHeaders(),body:JSON.stringify(p),signal:u})}catch(e){if(e&&"AbortError"===e.name)throw e;throw new Error("Connexion à "+h+" impossible.")}if(!m.ok){var v=await m.text();throw new Error(h+" API error "+m.status+": "+v)}var y=createChatCompletionsParser(!!i,{extractCitations:function(e){var t=e.choices&&e.choices[0]&&e.choices[0].delta&&e.choices[0].delta.annotations;return t?t.filter((function(e){return"url_citation"===e.type&&e.url})).map((function(e){return{url:e.url,title:e.title||""}})):null},extractReasoning:function(e){return e.choices&&e.choices[0]&&e.choices[0].delta&&e.choices[0].delta.reasoning_content||null},accumulateCitations:!0,accumulateToolCalls:!0}),_="";for await(var w of readSSE(m))for(var T=y(w),b=0;b<T.length;b++){var E=T[b];"chunk"===E.type?(_+=E.data,r(E.data)):"thinking"===E.type&&i&&E.data&&i(E.data)}for(var S=y.flush(),C=0;C<S.length;C++){var O=S[C];"chunk"===O.type?(_+=O.data,r(O.data)):"thinking"===O.type&&i&&O.data&&i(O.data)}var A=y.getResult(),x=A.usage,R=A.citations;if(y.hasToolCalls&&y.hasToolCalls()&&d<(window._toolMaxIterations||TOOL_SEARCH_MAX_ITERATIONS)){for(var k=y.getToolCalls(),M=[],H=0;H<k.length;H++)try{var W=await _executeToolCall(k[H]);M.push(W)}catch(e){M.push({id:k[H].id,name:k[H].function.name,result:{error:e.message}})}for(var I=[],N=0;N<M.length;N++)if("web_search"===M[N].name&&Array.isArray(M[N].result))for(var L=0;L<M[N].result.length;L++)I.push({url:M[N].result[L].url,title:M[N].result[L].title});var P={role:"assistant"};P.content=_||null,P.tool_calls=k.map((function(e){return{id:e.id,type:"function",function:{name:e.function.name,arguments:e.function.arguments}}}));var q=M.map((function(e){var t="string"==typeof e.result?e.result:JSON.stringify(e.result);return{role:"tool",tool_call_id:e.id,content:t}}));return streamModelWithTools(e,t.concat([P],q),r,a,o,n,!0,i,u,s,c,d+1)}if(!_&&d>=(window._toolMaxIterations||TOOL_SEARCH_MAX_ITERATIONS)){r("⚠️ Limite d'étapes atteinte, réessayez ou reformulez.");}a(x,R)}catch(l){if(l&&"AbortError"===l.name)return void a(null,[]);if(c&&c.model&&c.provider)return console.warn("[tool-search] échec "+e+" → fallback "+c.model),streamModelWithTools(c.model,t,r,a,o,n,!1,i,u,s,c._nextFallback||null,0);o(l)}}

// ── Marexcode tools (assistant de codage) ─────────────────────────────
var MAREXCODE_TOOLS = [
  {type:"function",function:{name:"Bash",description:"Exécute une commande shell dans le sandbox projet (whitelist: ls, cat, grep, git, node, python3, npm, npx, head, tail, wc, find, sed, awk, echo, mkdir, touch, rm, cp, mv, pwd, date). Timeout configurable (défaut 10s, max 60s).",parameters:{type:"object",properties:{command:{type:"string",description:"La commande shell à exécuter"},timeout:{type:"integer",description:"Timeout en secondes (défaut 10, max 60)"}},required:["command"]}}},
  {type:"function",function:{name:"Read",description:"Lit le contenu d'un fichier du projet. Supporte la pagination avec offset (ligne de départ, 1-based) et limit (nombre max de lignes).",parameters:{type:"object",properties:{file_path:{type:"string",description:"Chemin relatif du fichier"},offset:{type:"integer",description:"Ligne de départ (1-based, optionnel)"},limit:{type:"integer",description:"Nombre max de lignes à lire (optionnel)"}},required:["file_path"]}}},
  {type:"function",function:{name:"Write",description:"Écrit (ou écrase) un fichier du projet. Retourne une indication si le fichier existait déjà.",parameters:{type:"object",properties:{file_path:{type:"string"},content:{type:"string"}},required:["file_path","content"]}}},
  {type:"function",function:{name:"Edit",description:"Remplace une occurrence d'un texte dans un fichier du projet. Retourne un diff unifié avec les statistiques (additions/deletions).",parameters:{type:"object",properties:{file_path:{type:"string"},old:{type:"string",description:"Texte exact à remplacer"},new:{type:"string",description:"Texte de remplacement"}},required:["file_path","old","new"]}}},
  {type:"function",function:{name:"Grep",description:"Recherche un motif dans les fichiers du projet. Limite optionnelle pour borner les résultats.",parameters:{type:"object",properties:{pattern:{type:"string"},path:{type:"string",description:"Chemin ou dossier (défaut: racine du projet)"},limit:{type:"integer",description:"Nombre max de résultats (optionnel)"}},required:["pattern"]}}},
  {type:"function",function:{name:"Ls",description:"Liste l'arborescence complète des fichiers du workspace actif (chemins relatifs). Utilise cet outil EN PREMIER pour découvrir la structure avant de lire des fichiers.",parameters:{type:"object",properties:{},required:[]}}},
  {type:"function",function:{name:"TodoWrite",description:"Met à jour la liste de tâches pour suivre la progression. À utiliser pour toute tâche multi-étapes : appeler au début pour lister le plan, puis après chaque étape pour mettre à jour les statuts.",parameters:{type:"object",properties:{todos:{type:"array",items:{type:"object",properties:{content:{type:"string",description:"Description de la tâche"},status:{type:"string",enum:["pending","in_progress","completed"],description:"Statut de la tâche"}}},description:"Liste des tâches avec leurs statuts"}},required:["todos"]}}},
];

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
  else return { id: e.id, name: name, result: { error: "Unknown tool: " + name } };
  try {
    var headers = { "Content-Type": "application/json" };
    if (typeof Auth !== "undefined" && Auth.getToken) { var tk = Auth.getToken(); if (tk) headers.Authorization = "Bearer " + tk; }
    window.dispatchEvent(new CustomEvent("marexcode-tool", {
      detail: { name: name, args: args, result: null, phase: "start" },
    }));
    var resp = await fetch("/api/exec", { method: "POST", headers: headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(20000) });
    var data = await resp.json().catch(function(){ return {}; });
    window.dispatchEvent(new CustomEvent("marexcode-tool", {
      detail: { name: name, args: args, result: data, phase: "end" },
    }));
    if (!resp.ok) return { id: e.id, name: name, result: { error: data.error || ("Erreur exec " + resp.status) } };
    return { id: e.id, name: name, result: (data && data.text) ? data.text : data };
  } catch (err) {
    if (err && err.name === "AbortError") return { id: e.id, name: name, result: { error: "Timeout exécution (20s)" } };
    return { id: e.id, name: name, result: { error: err && err.message ? err.message : "Erreur réseau exec" } };
  }
}
