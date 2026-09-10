"""
Web Search Provider Chain — Marexcode.

6 providers avec fallback en cascade (mode auto) :
  Tavily → Exa → Brave API → Jina → SearXNG → DuckDuckGo

Usage from server.py:
    results = websearch_search(query, allowed_domains, blocked_domains, max_results)
"""

import os
import json
import time
import http.client
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

log = logging.getLogger(__name__)

SEARXNG_URL = os.environ.get("SEARXNG_BASE_URL", "http://127.0.0.1:8904")
SEARXNG_TIMEOUT = 5
TAVILY_TIMEOUT = 8
EXA_TIMEOUT = 8
BRAVE_TIMEOUT = 8
JINA_TIMEOUT = 8
DDG_TIMEOUT = 15


# ── Shared types ─────────────────────────────────────────────────────

class SearchHit:
    def __init__(self, title, url, description=None, source=None):
        self.title = title
        self.url = url
        self.description = description or ""
        self.source = source or ""

    def to_dict(self):
        d = {"title": self.title, "url": self.url}
        if self.description:
            d["description"] = self.description
        if self.source:
            d["source"] = self.source
        return d


def normalize_hit(raw):
    if not raw or not isinstance(raw, dict):
        return None
    TITLE_KEYS = ["title", "headline", "name", "heading"]
    URL_KEYS = ["url", "link", "href", "uri", "permalink"]
    DESC_KEYS = ["description", "snippet", "content", "preview", "summary", "text", "body"]
    SOURCE_KEYS = ["source", "domain", "displayLink", "displayed_link", "engine"]

    title = next((raw[k] for k in TITLE_KEYS if isinstance(raw.get(k), str) and raw[k]), None)
    url = next((raw[k] for k in URL_KEYS if isinstance(raw.get(k), str) and raw[k]), None)
    if not title and not url:
        return None
    desc = next((raw[k] for k in DESC_KEYS if isinstance(raw.get(k), str) and raw[k]), None)
    source = next((raw[k] for k in SOURCE_KEYS if isinstance(raw.get(k), str) and raw[k]), None)
    return SearchHit(title=title or url, url=url or title, description=desc, source=source)


def apply_domain_filters(hits, allowed_domains=None, blocked_domains=None):
    def _hostname(url):
        try:
            from urllib.parse import urlparse
            return urlparse(url).hostname or ""
        except Exception:
            return ""

    def _matches(host, domain):
        h, d = host.lower(), domain.lower()
        return h == d or h.endswith("." + d)

    out = hits
    if blocked_domains:
        out = [h for h in out if not any(_matches(_hostname(h.url), d) for d in blocked_domains)]
    if allowed_domains:
        out = [h for h in out if any(_matches(_hostname(h.url), d) for d in allowed_domains)]
    return out


# ── Providers ────────────────────────────────────────────────────────

def _search_tavily(query, allowed_domains=None, blocked_domains=None, max_results=10):
    key = os.environ.get("TAVILY_API_KEY", "").strip()
    if not key:
        return None
    start = time.time()
    conn = http.client.HTTPSConnection("api.tavily.com", timeout=TAVILY_TIMEOUT)
    body = json.dumps({"query": query, "max_results": max_results, "include_answer": False})
    try:
        conn.request("POST", "/search", body=body,
                     headers={"Content-Type": "application/json", "Authorization": "Bearer " + key})
        resp = conn.getresponse()
        if resp.status != 200:
            log.warning("tavily %d", resp.status)
            return None
        data = json.loads(resp.read())
        hits = [h for r in data.get("results", []) if (h := normalize_hit(r))]
        return {"hits": apply_domain_filters(hits, allowed_domains, blocked_domains),
                "provider": "tavily", "duration": time.time() - start}
    except Exception as e:
        log.warning("tavily failed: %s", e)
        return None
    finally:
        conn.close()


def _search_exa(query, allowed_domains=None, blocked_domains=None, max_results=10):
    key = os.environ.get("EXA_API_KEY", "").strip()
    if not key:
        return None
    start = time.time()
    conn = http.client.HTTPSConnection("api.exa.ai", timeout=EXA_TIMEOUT)
    body = json.dumps({"query": query, "numResults": max_results, "type": "auto"})
    try:
        conn.request("POST", "/search", body=body,
                     headers={"Content-Type": "application/json", "x-api-key": key})
        resp = conn.getresponse()
        if resp.status != 200:
            log.warning("exa %d", resp.status)
            return None
        data = json.loads(resp.read())
        hits = [h for r in data.get("results", []) if (h := normalize_hit(r))]
        return {"hits": apply_domain_filters(hits, allowed_domains, blocked_domains),
                "provider": "exa", "duration": time.time() - start}
    except Exception as e:
        log.warning("exa failed: %s", e)
        return None
    finally:
        conn.close()


def _search_brave(query, allowed_domains=None, blocked_domains=None, max_results=10):
    key = os.environ.get("BRAVE_API_KEY", "").strip()
    if not key:
        return None
    start = time.time()
    conn = http.client.HTTPSConnection("api.search.brave.com", timeout=BRAVE_TIMEOUT)
    path = "/res/v1/web/search?q=" + query.replace(" ", "+") + "&count=" + str(max_results)
    try:
        conn.request("GET", path,
                     headers={"Accept": "application/json", "X-Subscription-Token": key})
        resp = conn.getresponse()
        if resp.status != 200:
            log.warning("brave %d", resp.status)
            return None
        data = json.loads(resp.read())
        hits = [h for r in data.get("web", {}).get("results", []) if (h := normalize_hit(r))]
        return {"hits": apply_domain_filters(hits, allowed_domains, blocked_domains),
                "provider": "brave", "duration": time.time() - start}
    except Exception as e:
        log.warning("brave failed: %s", e)
        return None
    finally:
        conn.close()


def _search_jina(query, allowed_domains=None, blocked_domains=None, max_results=10):
    key = os.environ.get("JINA_API_KEY", "").strip()
    if not key:
        return None
    start = time.time()
    conn = http.client.HTTPSConnection("s.jina.ai", timeout=JINA_TIMEOUT)
    path = "/?q=" + query.replace(" ", "+")
    try:
        conn.request("GET", path,
                     headers={"Accept": "application/json", "Authorization": "Bearer " + key})
        resp = conn.getresponse()
        if resp.status != 200:
            log.warning("jina %d", resp.status)
            return None
        data = json.loads(resp.read())
        hits = [h for r in data.get("data", []) if (h := normalize_hit(r))]
        return {"hits": apply_domain_filters(hits[:max_results], allowed_domains, blocked_domains),
                "provider": "jina", "duration": time.time() - start}
    except Exception as e:
        log.warning("jina failed: %s", e)
        return None
    finally:
        conn.close()


def _search_searxng(query, allowed_domains=None, blocked_domains=None, max_results=10):
    start = time.time()
    conn = http.client.HTTPConnection("127.0.0.1", 8904, timeout=SEARXNG_TIMEOUT)
    path = "/search?format=json&q=" + query.replace(" ", "+") + "&language=en"
    try:
        conn.request("GET", path)
        resp = conn.getresponse()
        if resp.status != 200:
            return None
        data = json.loads(resp.read())
        hits = [h for r in data.get("results", [])[:max_results] if (h := normalize_hit(r))]
        return {"hits": apply_domain_filters(hits, allowed_domains, blocked_domains),
                "provider": "searxng", "duration": time.time() - start}
    except Exception as e:
        log.warning("searxng failed: %s", e)
        return None
    finally:
        conn.close()


def _search_ddg(query, allowed_domains=None, blocked_domains=None, max_results=10):
    try:
        from duckduckgo_search import DDGS
    except ImportError:
        return None
    start = time.time()
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
        hits = [h for r in results if (h := normalize_hit(r))]
        return {"hits": apply_domain_filters(hits, allowed_domains, blocked_domains),
                "provider": "duckduckgo", "duration": time.time() - start}
    except Exception as e:
        log.warning("ddg failed: %s", e)
        return None


# ── Chain runner ─────────────────────────────────────────────────────

ALL_PROVIDERS = [
    _search_tavily,
    _search_exa,
    _search_brave,
    _search_jina,
    _search_searxng,
    _search_ddg,
]


PROVIDER_KEY_MAP = {
    "tavily": _search_tavily,
    "exa": _search_exa,
    "brave": _search_brave,
    "jina": _search_jina,
    "searxng": _search_searxng,
    "ddg": _search_ddg,
}


def search(query, allowed_domains=None, blocked_domains=None, max_results=10, providers=None):
    """Run providers in parallel (auto mode). Return first with results, preferring earlier providers on tie.
    providers: optional list of provider keys (tavily/exa/brave/jina/searxng/ddg) to restrict to.
    """
    if providers is None:
        active_providers = ALL_PROVIDERS
    else:
        active_providers = [PROVIDER_KEY_MAP[p] for p in providers if p in PROVIDER_KEY_MAP]

    if not active_providers:
        return {
            "hits": [],
            "provider": "none",
            "duration": 0,
            "error": "Aucun provider de recherche actif"
        }

    errors = []
    results_by_idx = {}

    with ThreadPoolExecutor(max_workers=len(active_providers)) as executor:
        future_to_idx = {
            executor.submit(fn, query, allowed_domains, blocked_domains, max_results): idx
            for idx, fn in enumerate(active_providers)
        }
        for future in as_completed(future_to_idx):
            idx = future_to_idx[future]
            try:
                result = future.result()
                if result is None:
                    continue
                if result["hits"]:
                    results_by_idx[idx] = result
                else:
                    errors.append("%s: 0 results" % result["provider"])
            except Exception as e:
                errors.append("%s: %s" % (active_providers[idx].__name__, e))

    if results_by_idx:
        best_idx = min(results_by_idx.keys())
        return results_by_idx[best_idx]

    return {
        "hits": [],
        "provider": "none",
        "duration": 0,
        "error": "All providers failed: " + "; ".join(errors) if errors else "No results from any provider"
    }
