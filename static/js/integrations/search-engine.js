var SEARXNG_URL="/search",SEARXNG_TIMEOUT=5e3;
var TAVILY_URL="/api/tavily/search",TAVILY_TIMEOUT=8e3;
function _sanitize(e){return e?e.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,"").replace(/\\x[0-9a-fA-F]?/g,"").replace(/\\u[0-9a-fA-F]{0,3}$/g,"").trim():""}

async function _searchTavily(e){
  var t=TAVILY_URL+"?q="+encodeURIComponent(e)+"&max_results=10";
  var h={};
  if(typeof Auth!=="undefined"&&Auth.getToken){var token=Auth.getToken();if(token)h["Authorization"]="Bearer "+token}
  var r=await fetch(t,{signal:AbortSignal.timeout(TAVILY_TIMEOUT),headers:h});
  if(!r.ok)throw new Error("Tavily returned "+r.status);
  var a=await r.json();
  return a.results&&Array.isArray(a.results)?a.results.slice(0,10).map(function(e){return{title:_sanitize(e.title),url:_sanitize(e.url),snippet:_sanitize(e.snippet)}}):[];
}

async function _searchSearXNG(e){
  var t=SEARXNG_URL+"?format=json&q="+encodeURIComponent(e);
  var r=await fetch(t,{signal:AbortSignal.timeout(SEARXNG_TIMEOUT)});
  if(!r.ok)throw new Error("SearXNG returned "+r.status);
  var a=await r.json();
  return a.results&&Array.isArray(a.results)?a.results.slice(0,10).map(function(e){return{title:_sanitize(e.title),url:_sanitize(e.url),snippet:_sanitize(e.content)}}):[];
}

async function executeWebSearch(e){
  try{
    var h={"Content-Type":"application/json"};
    if(typeof Auth!=="undefined"&&Auth.getToken){var token=Auth.getToken();if(token)h["Authorization"]="Bearer "+token}
    var r=await fetch("/api/websearch",{method:"POST",headers:h,body:JSON.stringify({query:e,max_results:10,providers:(window.STATE&&window.STATE.enabledProviders)||undefined}),signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw new Error("WebSearch returned "+r.status);
    var a=await r.json();
    if(a.warning)console.warn("[search-engine] "+a.warning);
    var results=(a.results||[]).map(function(x){return{title:_sanitize(x.title),url:_sanitize(x.url),snippet:_sanitize(x.description||x.snippet||"")}});
    return results;
  }catch(err){console.warn("[search-engine] /api/websearch failed:",err.message);return[]}
}

async function executeWebFetch(e){
  try{var t=await fetch(e,{signal:AbortSignal.timeout(1e4)});if(t.ok)return{title:"",content:_extractText(await t.text())}}catch(e){console.warn("[search-engine] Fetch direct échoué:",e.message)}
  return null;
}

function _extractText(e){
  try{
    var t=(new DOMParser).parseFromString(e,"text/html");
    t.querySelectorAll('script, style, nav, footer, header, [role="navigation"], .sidebar, #sidebar').forEach(function(n){n.remove()});
    var n=t.body;
    return n?(n.textContent||"").replace(/\n{3,}/g,"\n\n").trim().slice(0,8e3):"";
  }catch(t){return e.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim().slice(0,8e3)}
}

async function buildWebSearchContext(query){
  var results = await executeWebSearch(query);
  if(!results || results.length === 0) return null;
  var lines = results.map(function(r, i){
    return "["+(i+1)+"] "+r.title+"\n"+r.url+"\n"+(r.snippet||"")+"\n";
  });
  var contextText = "Résultats de recherche web pour la requête : \""+query+"\"\n\n"+lines.join("\n")+"\nUtilise ces informations pour répondre, et cite tes sources par leur numéro [1], [2], etc.";
  var citations = results.map(function(r){ return { url: r.url, title: r.title }; });
  return { contextText: contextText, citations: citations };
}
window.buildWebSearchContext = buildWebSearchContext;
