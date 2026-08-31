# CETAS — Correctifs à appliquer

Deux bugs distincts et indépendants, diagnostiqués et confirmés par des tests directs
(curl, lecture de code, logs navigateur). Chaque correctif est isolé — les appliquer
séparément, valider chacun avant de passer au suivant.

---

## FIX 1 — Timeouts trop longs sur le WebSearch Agent (lenteur)

**Fichier :** `/home/sam/Cetas-WebUi/js/search-engine.js`
**Cause confirmée :** `WEBSEARCH_AGENT_TIMEOUT` à 20000ms (20s), avec 3 retries,
sur 2 endpoints (primary + fallback). Pire cas : ~2min02 avant de basculer sur
SearXNG quand l'agent est down ou dégradé.

**Changement 1 :**
```js
// AVANT
var WEBSEARCH_AGENT_TIMEOUT=20e3;
// APRÈS
var WEBSEARCH_AGENT_TIMEOUT=8e3;
```

**Changement 2 :** dans `_searchWebSearchAgent`, supprimer la boucle de 3 retries
(garder 1 seule tentative par endpoint) :
```js
// AVANT
for(var _i=0;_i<3;_i++){
  try{
    var r=await fetch(t,{signal:AbortSignal.timeout(WEBSEARCH_AGENT_TIMEOUT),headers:{"X-API-Key":_ep[_e2].k}});
    if(!r.ok)throw new Error("WebSearch Agent returned "+r.status);
    var a=await r.json();
    return a.sources&&Array.isArray(a.sources)?a.sources.slice(0,10).map((function(e){return{title:_sanitize(e.title),url:_sanitize(e.url),snippet:_sanitize(e.snippet)}})):[];
  }catch(_er){_last=_er;await new Promise((function(_r){setTimeout(_r,400*(_i+1))}))}
}

// APRÈS
try{
  var r=await fetch(t,{signal:AbortSignal.timeout(WEBSEARCH_AGENT_TIMEOUT),headers:{"X-API-Key":_ep[_e2].k}});
  if(!r.ok)throw new Error("WebSearch Agent returned "+r.status);
  var a=await r.json();
  return a.sources&&Array.isArray(a.sources)?a.sources.slice(0,10).map((function(e){return{title:_sanitize(e.title),url:_sanitize(e.url),snippet:_sanitize(e.snippet)}})):[];
}catch(_er){_last=_er}
```

**Résultat attendu :** pire cas ramené de ~2min02 à ~16s (8s × 2 endpoints) avant
bascule sur SearXNG.

**Fichier corrigé déjà prêt :** `search-engine.js` (fourni à côté de ce document).
Un simple remplacement du fichier suffit — aucune autre partie n'a été modifiée
(diff vérifié).

---

## FIX 2 — Mauvais port nginx pour le serveur llama.cpp (réponses dégradées/hallucinées)

**Fichier :** `/etc/nginx/sites-available/websearch.conf`
(et son lien `/etc/nginx/sites-enabled/websearch.conf`)

**Cause confirmée par test direct (`curl` depuis le serveur nginx) :**
- Le serveur llama.cpp réel écoute sur `10.10.10.102:8080` (confirmé : réponse
  applicative `401 Invalid API Key`, donc le service tourne et répond bien)
- Le bloc nginx pour `nsweb.neva-ci.pro` route actuellement vers `10.10.10.102:80`
  (port 80, pas 8080) — un mauvais port
- Conséquence : les requêtes de CETAS vers llama.cpp (via `https://nsweb.neva-ci.pro`)
  échouent au niveau réseau/protocole (`ERR_HTTP2_PROTOCOL_ERROR` observé côté
  navigateur), ce qui dégrade ou bloque les réponses du modèle local, incluant
  des réponses incohérentes/halluciné­es quand un mécanisme de secours prend le relais

**Changement, dans le bloc `server_name nsweb.neva-ci.pro;` (bloc HTTPS, port 443) :**

```nginx
# AVANT
    location / {
        proxy_pass http://10.10.10.102:80;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

# APRÈS
    location / {
        proxy_pass http://10.10.10.102:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
```

Un seul token à changer : `:80;` → `:8080;` dans ce bloc précis
(NE PAS toucher aux autres blocs `server` du même fichier — `nws.neva-ci.pro`,
`cetas.neva-ci.pro` pointent vers d'autres ports, corrects et non concernés).

Mettre aussi à jour le commentaire juste au-dessus pour rester cohérent :
```nginx
# AVANT
# --- nsweb.neva-ci.pro → IALocal (10.10.10.102:80) ---
# APRÈS
# --- nsweb.neva-ci.pro → IALocal (10.10.10.102:8080) ---
```

**Application et vérification (à exécuter dans cet ordre, s'arrêter si une étape échoue) :**

```bash
sudo nginx -t
# doit afficher : syntax is ok / test is successful
# si erreur : NE PAS recharger, corriger d'abord

sudo systemctl reload nginx

curl https://nsweb.neva-ci.pro/v1/models
# doit renvoyer : {"error":{"message":"Invalid API Key",...}}
# (c'est la réponse ATTENDUE de llama.cpp sans clé — la présence de cette
# réponse JSON, et non un timeout/erreur réseau, est la preuve que ça marche)
```

**Test final dans CETAS :** poser une question à l'IA locale (llama.cpp) avec
la recherche web activée, vérifier dans la console navigateur (F12) l'absence
de `ERR_HTTP2_PROTOCOL_ERROR`.

---

## Point NON résolu — à ne PAS corriger sans investigation supplémentaire

`app.js` lève `Uncaught ReferenceError: showWebSearchIndicator is not defined`
dans la console. La fonction existe bien dans `app.js` (déclaration présente,
correctement branchée sur les events `websearch-start`/`websearch-end`), donc
ce n'est probablement pas un problème d'appel manquant mais un souci de scope/
chargement (le fichier commence par `import {...} from "./state.js"`, ce qui
en fait un ES module — comportement de portée différent d'un script classique).

**Ne pas toucher à ce fichier sans avoir vu `index.html`** (comment le script
est inclus — `type="module"` ou non, ordre de chargement) : une correction à
l'aveugle ici risque de casser d'autres fonctionnalités qui dépendent du même
mécanisme d'import.

Impact estimé : probablement cosmétique (l'indicateur visuel "recherche en
cours" ne s'affiche pas), sans bloquer le pipeline de recherche lui-même
(qui passe par des `window.dispatchEvent`, indépendants du scope module).
À reprioriser seulement si le problème persiste après les FIX 1 et 2.
