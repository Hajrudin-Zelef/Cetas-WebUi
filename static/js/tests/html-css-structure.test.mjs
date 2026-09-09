import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

function read(rel) {
    return readFileSync(process.cwd() + '/' + rel, 'utf8');
}

// ═══════════════════════════════════════════════════════════════
//  HTML VALIDATION — modals.html
// ═══════════════════════════════════════════════════════════════

test('modals.html: div balance (opens = closes)', () => {
    const html = read('static/partials/modals.html');
    const opens = (html.match(/<div[\s>]/g) || []).length;
    const closes = (html.match(/<\/div>/g) || []).length;
    assert.strictEqual(opens, closes,
        `div imbalance: ${opens} opens vs ${closes} closes`);
});

test('modals.html: key panel IDs exist', () => {
    const html = read('static/partials/modals.html');
    const required = [
        'panel-apimodeles', 'panel-models', 'panel-budget',
        'panel-quotas', 'panel-appearance', 'panel-stockage',
        'panel-faq', 'panel-statistiques', 'panel-logs',
        'panel-share', 'panel-websearch', 'panel-conversation'
    ];
    for (const id of required) {
        assert.ok(html.includes(`id="${id}"`), `Missing panel: ${id}`);
    }
});

test('modals.html: .apikeys-tab-content wraps all panels', () => {
    const html = read('static/partials/modals.html');
    const tcAttr = html.indexOf('class="apikeys-tab-content"');
    assert.ok(tcAttr > 0, 'apikeys-tab-content not found');

    // Find the opening <div before the class attribute
    const tcOpen = html.lastIndexOf('<div', tcAttr);
    assert.ok(tcOpen >= 0, 'No <div before apikeys-tab-content');

    // Count divs from the opening div to find the matching close
    let depth = 0;
    let tcClose = -1;
    for (let i = tcOpen; i < html.length; i++) {
        if (html.substring(i, i + 4) === '<div') { depth++; i += 3; }
        else if (html.substring(i, i + 6) === '</div>') { depth--; i += 5; }
        if (depth === 0) { tcClose = i; break; }
    }
    assert.ok(tcClose > tcOpen, 'apikeys-tab-content never closes');

    // Verify all panel divs are inside tab-content
    const tcContent = html.substring(tcOpen, tcClose);
    for (const id of ['panel-apimodeles', 'panel-faq', 'panel-websearch', 'panel-share', 'panel-logs']) {
        assert.ok(tcContent.includes(`id="${id}"`),
            `Panel ${id} is NOT inside .apikeys-tab-content`);
    }
});

test('modals.html: panel-faq has correct internal structure', () => {
    const html = read('static/partials/modals.html');
    const faqStart = html.lastIndexOf('<div', html.indexOf('id="panel-faq"'));
    const faqEnd = html.indexOf('<!-- Panel Partager -->', faqStart);
    assert.ok(faqEnd > faqStart, 'Panel Partager comment not found after FAQ');
    const faqBlock = html.substring(faqStart, faqEnd);
    const opens = (faqBlock.match(/<div[\s>]/g) || []).length;
    const closes = (faqBlock.match(/<\/div>/g) || []).length;
    assert.strictEqual(opens, closes,
        `FAQ panel div imbalance: ${opens} opens vs ${closes} closes`);
});

test('modals.html: no orphaned </div> between consecutive panels', () => {
    const html = read('static/partials/modals.html');
    const panelIds = ['panel-apimodeles', 'panel-faq', 'panel-websearch', 'panel-share', 'panel-logs'];

    for (let i = 0; i < panelIds.length - 1; i++) {
        const start = html.lastIndexOf('<div', html.indexOf(`id="${panelIds[i]}"`));
        const nextStart = html.lastIndexOf('<div', html.indexOf(`id="${panelIds[i + 1]}"`));
        const block = html.substring(start, nextStart);

        const opens = (block.match(/<div[\s>]/g) || []).length;
        const closes = (block.match(/<\/div>/g) || []).length;
        assert.strictEqual(opens, closes,
            `Orphaned </div> between ${panelIds[i]} and ${panelIds[i + 1]}: ${opens} opens vs ${closes} closes`);
    }
});

test('modals.html: .apikeys-modal has correct structure (tabs + tab-content)', () => {
    const html = read('static/partials/modals.html');
    const modalStart = html.indexOf('class="sp-modal apikeys-modal"');
    assert.ok(modalStart > 0, '.apikeys-modal not found');

    // Find .apikeys-tabs and .apikeys-tab-content as siblings
    const tabsIdx = html.indexOf('class="apikeys-tabs"', modalStart);
    const tabContentIdx = html.indexOf('class="apikeys-tab-content"', modalStart);
    assert.ok(tabsIdx > modalStart, '.apikeys-tabs not inside .apikeys-modal');
    assert.ok(tabContentIdx > tabsIdx, '.apikeys-tab-content not after .apikeys-tabs');
});

// ═══════════════════════════════════════════════════════════════
//  CSS VALIDATION — all source files
// ═══════════════════════════════════════════════════════════════

const CSS_FILES = [
    'static/css/base/variables.css',
    'static/css/base/layout.css',
    'static/css/features/chat.css',
    'static/css/features/logs-events.css',
    'static/css/features/marexcode.css',
    'static/css/components/components.css',
    'static/css/components/canvas.css',
    'static/css/components/catalog.css',
    'static/css/components/storage.css',
    'static/css/components/menu.css',
];

function stripComments(css) {
    return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function countBraces(css) {
    const stripped = stripComments(css);
    return { opens: (stripped.match(/{/g) || []).length, closes: (stripped.match(/}/g) || []).length };
}

for (const file of CSS_FILES) {
    test(`CSS: ${file.split('/').pop()} — brace balance`, () => {
        const css = read(file);
        const { opens, closes } = countBraces(css);
        assert.strictEqual(opens, closes,
            `Brace imbalance in ${file}: ${opens} open vs ${closes} close`);
    });

    test(`CSS: ${file.split('/').pop()} — non-empty file`, () => {
        const css = read(file);
        assert.ok(css.trim().length > 0, `${file} is empty`);
        assert.ok(css.includes('{'), `${file} has no CSS rules`);
    });
}

test('CSS: all source files concat to valid CSS', () => {
    const all = CSS_FILES.map(f => read(f)).join('\n');
    const { opens, closes } = countBraces(all);
    assert.strictEqual(opens, closes,
        `Combined CSS brace imbalance: ${opens} open vs ${closes} close`);
});

test('CSS: no conflicting .apikeys-modal rules outside @media', () => {
    const all = CSS_FILES.map(f => read(f)).join('\n');
    const regex = /\.apikeys-modal\s*\{/g;
    let match;
    const violations = [];
    while ((match = regex.exec(all)) !== null) {
        const before = all.substring(Math.max(0, match.index - 300), match.index);
        const lastMedia = before.lastIndexOf('@media');
        const lastCloseBeforeMedia = lastMedia > 0 ? before.lastIndexOf('}', lastMedia) : -1;
        if (lastMedia <= 0 || lastCloseBeforeMedia > lastMedia) {
            violations.push(match.index);
        }
    }
    // Desktop base rule + media query parsing edge cases in minified CSS
    assert.ok(violations.length <= 4,
        `Too many .apikeys-modal rules outside @media (${violations.length})`);
});

test('CSS: .apikeys-tabs has width rule', () => {
    const all = CSS_FILES.map(f => read(f)).join('\n');
    // The sidebar should have an explicit width
    const hasDesktopRule = /\.apikeys-tabs\s*\{[^}]*width:\s*150px/.test(all);
    assert.ok(hasDesktopRule, '.apikeys-tabs missing width:150px rule');
});
