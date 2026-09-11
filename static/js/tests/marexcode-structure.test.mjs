import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MX = resolve(ROOT, 'marexcode');

function read(p) {
    return readFileSync(resolve(MX, p), 'utf8');
}

test('marexcode/index.html existe', () => {
    assert.ok(existsSync(resolve(MX, 'index.html')), 'marexcode/index.html manquant');
});

test('marexcode/index.html : aucun script inline', () => {
    const html = read('index.html');
    const inline = html.match(/<script(?!\s+[^>]*src)[^>]*>[\s\S]*?<\/script>/gi);
    assert.ok(!inline || inline.length === 0, 'script inline détecté dans index.html');
});

test('marexcode/index.html : CSS externe', () => {
    const html = read('index.html');
    assert.match(html, /<link[^>]*rel="stylesheet"[^>]*marexcode\.css/);
    assert.ok(!/<style>[\s\S]*?<\/style>/i.test(html), '<style> inline présent dans index.html');
});

test('marexcode/index.html : includes SSI components', () => {
    const html = read('index.html');
    assert.match(html, /#include\s+file="components\/sidebar\.html"/);
    assert.match(html, /#include\s+file="components\/composer\.html"/);
    assert.match(html, /#include\s+file="components\/settings\.html"/);
});

test('marexcode/index.html : module app.js chargé', () => {
    const html = read('index.html');
    assert.match(html, /<script[^>]*type="module"[^>]*src="\/marexcode\/js\/app\.js/);
});

test('fichiers du dossier marexcode présents', () => {
    const expected = [
        'css/marexcode.css',
        'js/app.js',
        'js/api.js',
        'js/chat.js',
        'js/model-select.js',
        'js/router.js',
        'js/skills.js',
        'components/sidebar.html',
        'components/composer.html',
        'components/settings.html'
    ];
    for (const p of expected) {
        assert.ok(existsSync(resolve(MX, p)), p + ' manquant');
    }
});

test('JS modules exportent leurs API', async () => {
    const api = await import(resolve(MX, 'js/api.js'));
    for (const name of ['getToken', 'authHeaders', 'listSessions', 'loadSession', 'saveSession', 'deleteSession', 'listTree', 'readFile', 'execTool']) {
        assert.strictEqual(typeof api[name], 'function', 'api.js devrait exporter ' + name);
    }
    const msel = await import(resolve(MX, 'js/model-select.js'));
    assert.strictEqual(typeof msel.initModelSelect, 'function', 'initModelSelect non exporté');
    const chat = await import(resolve(MX, 'js/chat.js'));
    assert.strictEqual(typeof chat.createChat, 'function', 'createChat non exporté');
    const router = await import(resolve(MX, 'js/router.js'));
    assert.strictEqual(typeof router.initRouter, 'function', 'initRouter non exporté');
});

test('index.html charge les globals CETAS (api.js + tool-search.js)', () => {
    const html = read('index.html');
    assert.match(html, /src="\/js\/core\/api\.js/);
    assert.match(html, /src="\/js\/integrations\/tool-search\.js/);
    assert.match(html, /src="\/js\/services\/auth\.js/);
    assert.match(html, /src="\/js\/data\/models\.js/);
});

test('CSS exporte les classes critiques', () => {
    const css = read('css/marexcode.css');
    for (const sel of ['.app', '.sidebar', '.composer', '.chat-panel', '.cdrop-menu', '.sb-hist-item', '.auth-gate', '.file-viewer']) {
        assert.ok(css.includes(sel), 'CSS manque ' + sel);
    }
});

test('sidebar contient les ancres attendues', () => {
    const html = read('components/sidebar.html');
    for (const id of ['new-session-btn', 'panel-workspace', 'workspace-tree', 'panel-history', 'sessions-list', 'user-btn', 'user-menu', 'logout-btn', 'open-settings']) {
        assert.ok(html.includes('id="' + id + '"'), 'sidebar manque #' + id);
    }
});

test('composer contient les ancres attendues', () => {
    const html = read('components/composer.html');
    for (const id of ['btn-model', 'menu-model', 'label-model', 'marex-input', 'marex-send-btn', 'stop-btn', 'marex-chat-panel', 'marex-chat-log', 'plus-btn', 'menu-plus', 'skill-chip']) {
        assert.ok(html.includes('id="' + id + '"'), 'composer manque #' + id);
    }
});

test('skills.js exporte les compétences CETAS', async () => {
    const m = await import(resolve(MX, 'js/skills.js'));
    assert.ok(Array.isArray(m.COMPETENCES), 'COMPETENCES non exporté');
    assert.ok(m.COMPETENCES.length >= 5, 'au moins 5 compétences attendues');
    for (const sk of m.COMPETENCES) {
        assert.ok(sk.id && sk.name && sk.prompt, 'compétence incomplète: ' + (sk.id || '?'));
    }
});

test('tool-search.js : contenu modèle = data.text (format concis)', () => {
    const src = readFileSync(resolve(ROOT, 'js/integrations/tool-search.js'), 'utf8');
    assert.match(src, /result:\s*\(data\s*&&\s*data\.text\)/);
});

test('chat.js : traduction FR du reasoning (OpenRouter free → DeepSeek → anglais)', () => {
    const src = readFileSync(resolve(MX, 'js/chat.js'), 'utf8');
    assert.match(src, /thinkText \+= t/, 'le reasoning brut doit être accumulé pour traduction');
    assert.match(src, /translateReasoning\(raw\)\.then/, 'la traduction doit remplacer le texte affiché en fin de tour');
    assert.match(src, /reasoning-translate\.js/, 'le module de traduction doit être importé');
    const mod = readFileSync(resolve(MX, 'js/reasoning-translate.js'), 'utf8');
    assert.match(mod, /provider:\s*'openrouter'[\s\S]{0,140}model:\s*'openrouter\/free'/, 'OpenRouter free en primaire');
    assert.match(mod, /provider:\s*'deepseek'[\s\S]{0,140}model:\s*'deepseek-chat'/, 'DeepSeek en second recours');
});

test('composer.html : sélecteurs par outil (6)', () => {
    const html = read('components/composer.html');
    for (const t of ['read', 'grep', 'ls', 'write', 'edit', 'bash']) {
        assert.match(html, new RegExp('data-tool="' + t + '"'));
    }
});
test('app.js : câblage setRule par outil', () => {
    const src = readFileSync(resolve(MX, 'js/app.js'), 'utf8');
    assert.match(src, /setRule\(sel\.getAttribute\('data-tool'\)/);
});
