// © Marexsoft Corporation. Fondateur Kouassi Marius.
/**
 * Cetas Backup Proxy — Cloudflare Worker
 *
 * Forwarde les requêtes API vers les providers en injectant les clés.
 * Ne gère PAS l'authentification ni les conversations — c'est un backup.
 *
 * Déploiement :
 *   1. Crée un compte sur cloudflare.com
 *   2. Workers & Pages → Create → "Cetas Backup"
 *   3. Copie ce script dans l'éditeur
 *   4. Onglet "Settings" → "Variables" → "Secrets" → ajoute les clés
 *   5. Deploy → URL: cetas-backup.<ton-user>.workers.dev
 */

export default {
  async fetch(request, env) {
    // ── Auth token partagé ──────────────────────────────────────
    const SHARED_TOKEN = env.CETAS_TOKEN || '';
    if (SHARED_TOKEN) {
      const sent = request.headers.get('x-cetas-token') || '';
      if (sent !== SHARED_TOKEN) {
        return new Response('Unauthorized', { status: 401, headers: { 'Access-Control-Allow-Origin': '*' } });
      }
    }

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    const url = new URL(request.url);

    // Health check — utilisé par Kiro pour détecter si le worker est up
    if (url.pathname === '/api/health' || url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', provider: 'cloudflare-worker' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Proxy API : /api/proxy/<provider>/<path>
    const match = url.pathname.match(/^\/api\/proxy\/([^/]+)(\/.*)$/);
    if (!match) {
      return new Response('Not Found', { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    const provider = match[1].toLowerCase();
    const upstreamPath = match[2];

    // ── Configuration providers ──────────────────────────────────
    // Même structure que proxy/server.py — ProviderConfig
    const PROVIDERS = {
      deepseek: {
        base: 'https://api.deepseek.com',
        auth: { type: 'header', header: 'Authorization', prefix: 'Bearer ' },
      },
      openrouter: {
        base: 'https://openrouter.ai',
        auth: { type: 'header', header: 'Authorization', prefix: 'Bearer ' },
        extraHeaders: { 'HTTP-Referer': 'https://cetas.local/', 'X-Title': 'Cetas' },
      },
      google: {
        base: 'https://generativelanguage.googleapis.com',
        auth: { type: 'query', param: 'key' },
      },
      groq: {
        base: 'https://api.groq.com',
        auth: { type: 'header', header: 'Authorization', prefix: 'Bearer ' },
      },
      nvidia: {
        base: 'https://integrate.api.nvidia.com',
        auth: { type: 'header', header: 'Authorization', prefix: 'Bearer ' },
      },
      openai: {
        base: 'https://api.openai.com',
        auth: { type: 'header', header: 'Authorization', prefix: 'Bearer ' },
      },
      anthropic: {
        base: 'https://api.anthropic.com',
        auth: { type: 'header', header: 'x-api-key' },
        extraHeaders: { 'anthropic-version': '2023-06-01' },
      },
      mistral: {
        base: 'https://api.mistral.ai',
        auth: { type: 'header', header: 'Authorization', prefix: 'Bearer ' },
      },
      grok: {
        base: 'https://api.x.ai',
        auth: { type: 'header', header: 'Authorization', prefix: 'Bearer ' },
      },
      zai: {
        base: 'https://api.z.ai',
        auth: { type: 'header', header: 'Authorization', prefix: 'Bearer ' },
      },
      cabreras: {
        base: 'https://api.cabreras.ai',
        auth: { type: 'header', header: 'Authorization', prefix: 'Bearer ' },
      },
      perplexity: {
        base: 'https://api.perplexity.ai',
        auth: { type: 'header', header: 'Authorization', prefix: 'Bearer ' },
      },
    };

    const config = PROVIDERS[provider];
    if (!config) {
      return new Response(JSON.stringify({ error: `Provider inconnu: ${provider}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Récupère la clé API depuis les Secrets Cloudflare
    // Les secrets sont stockés dans l'onglet Settings → Variables → Secrets
    // Nom du secret : DEEPSEEK_API_KEY, OPENROUTER_API_KEY, etc.
    const secretName = provider.toUpperCase() + '_API_KEY';
    const apiKey = env[secretName];
    if (!apiKey) {
      return new Response(JSON.stringify({ error: `Pas de clé API pour ${provider} (secret: ${secretName})` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // ── Build upstream URL ──────────────────────────────────────
    let finalPath = upstreamPath;
    if (config.auth.type === 'query') {
      // Google : remplace key= vide par key=REAL_KEY, ou append
      const param = config.auth.param + '=';
      if (finalPath.includes(param)) {
        finalPath = finalPath.replace(param, param + apiKey);
      } else {
        const sep = finalPath.includes('?') ? '&' : '?';
        finalPath += sep + param + apiKey;
      }
    }

    const upstreamUrl = config.base + finalPath;

    // ── Build headers ───────────────────────────────────────────
    const headers = new Headers();
    const ct = request.headers.get('Content-Type');
    if (ct) headers.set('Content-Type', ct);

    if (config.auth.type === 'header') {
      headers.set(config.auth.header, (config.auth.prefix || '') + apiKey);
    }
    if (config.extraHeaders) {
      for (const [k, v] of Object.entries(config.extraHeaders)) {
        headers.set(k, v);
      }
    }

    // ── Forward ─────────────────────────────────────────────────
    try {
      const upstreamResponse = await fetch(upstreamUrl, {
        method: request.method,
        headers: headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      });

      // Stream la réponse (SSE ou JSON)
      const responseHeaders = new Headers();
      const ctUpstream = upstreamResponse.headers.get('Content-Type');
      if (ctUpstream) responseHeaders.set('Content-Type', ctUpstream);
      responseHeaders.set('Cache-Control', 'no-cache');
      responseHeaders.set('Access-Control-Allow-Origin', '*');

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: `Erreur upstream: ${err.message}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
};
