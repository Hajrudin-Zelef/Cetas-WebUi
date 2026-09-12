import { test } from 'node:test';
import assert from 'node:assert';

const elements = {};
globalThis.document = {
    getElementById: id => (elements[id] ??= { style: {}, innerHTML: '', textContent: '' }),
};

const m = await import('../features/logs-events.js');

test('parsePeriod renvoie un ISO dans la fenêtre demandée', () => {
    const since = m.parsePeriod('1h');
    const diff = Date.now() - new Date(since).getTime();
    assert.ok(diff >= 0, 'since doit être dans le passé');
    assert.ok(diff < 75 * 60_000, `doit être ~1h (got ${diff}ms)`);
});

test('parsePeriod fallback sur 1h pour une valeur inconnue', () => {
    const since = m.parsePeriod('bogus');
    const diff = Date.now() - new Date(since).getTime();
    assert.ok(diff >= 0 && diff < 75 * 60_000);
});

test('filterByLevel filtre par niveau', () => {
    const events = [{ level: 'error' }, { level: 'warning' }, { level: 'info' }];
    assert.equal(m.filterByLevel(events, 'error').length, 1);
    assert.equal(m.filterByLevel(events, 'all').length, 3);
    assert.equal(m.filterByLevel(events, '').length, 3);
});

test('formatTimestamp formate en YYYY-MM-DD HH:MM:SS', () => {
    const out = m.formatTimestamp('2026-09-03T20:05:09Z');
    assert.equal(out, '2026-09-03 20:05:09');
});

test('levelBadge retourne la classe attendue', () => {
    assert.ok(m.levelBadge('error').includes('logs-badge-error'));
    assert.ok(m.levelBadge('warning').includes('logs-badge-warning'));
    assert.ok(m.levelBadge('unknown').includes('logs-badge-info'));
});

test('renderReport échappe le contenu non fiable (XSS-safe)', () => {
    const report = {
        analysis: {
            severity: 'high',
            summary: '<script>alert(1)</script>',
            recommendation: '<img src=x onerror=alert(2)>',
        },
        model: 'mimo-test',
    };
    m.renderReport(report);
    const html = elements['logs-report-content'].innerHTML;
    assert.ok(!html.includes('<script>'), 'summary ne doit pas contenir de balise script brute');
    assert.ok(!html.includes('<img'), 'recommendation ne doit pas contenir de balise img brute');
    assert.ok(html.includes('&lt;script&gt;'), 'summary doit être échappé');
    assert.ok(html.includes('mimo-test'), 'le modèle doit être affiché');
});