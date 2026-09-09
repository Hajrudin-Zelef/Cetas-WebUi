import { test } from 'node:test';
import assert from 'node:assert';

const m = await import('../features/faq.js');

test('FAQ_CATEGORIES est un array avec ≥ 2 catégories', () => {
    assert.ok(Array.isArray(m.FAQ_CATEGORIES));
    assert.ok(m.FAQ_CATEGORIES.length >= 2);
});

test('chaque catégorie a un id et un label', () => {
    m.FAQ_CATEGORIES.forEach(c => {
        assert.ok(c.id, 'catégorie sans id: ' + JSON.stringify(c));
        assert.ok(c.label, 'catégorie sans label: ' + JSON.stringify(c));
    });
});

test('FAQ_DATA est un array non vide', () => {
    assert.ok(Array.isArray(m.FAQ_DATA));
    assert.ok(m.FAQ_DATA.length >= 2);
});

test('chaque item a category, question et answer', () => {
    const catIds = new Set(m.FAQ_CATEGORIES.map(c => c.id));
    m.FAQ_DATA.forEach((item, i) => {
        assert.ok(item.category, `item ${i} sans category`);
        assert.ok(item.question, `item ${i} sans question`);
        assert.ok(item.answer, `item ${i} sans answer`);
        assert.ok(catIds.has(item.category), `item ${i} a une catégorie inconnue: ${item.category}`);
    });
});

test('chaque catégorie a au moins 2 items', () => {
    const counts = {};
    m.FAQ_DATA.forEach(item => { counts[item.category] = (counts[item.category] || 0) + 1; });
    m.FAQ_CATEGORIES.forEach(cat => {
        assert.ok((counts[cat.id] || 0) >= 2, `catégorie "${cat.label}" a < 2 items`);
    });
});

test('aucune question n\'est vide', () => {
    m.FAQ_DATA.forEach((item, i) => {
        assert.ok(item.question.trim().length > 0, `item ${i} a une question vide`);
    });
});

test('les réponses contiennent du HTML (au moins 1 tag)', () => {
    m.FAQ_DATA.forEach((item, i) => {
        assert.ok(/<\w/.test(item.answer), `item ${i} ne contient pas de HTML dans la réponse`);
    });
});

test('aucun élément de contenu ne référence une IP ou un port interne', () => {
    const leaked = [];
    m.FAQ_DATA.forEach((item, i) => {
        const text = item.question + item.answer;
        if (/10\.\d+\.\d+\.\d+/.test(text)) leaked.push(`item ${i}: IP privée`);
        if (/127\.0\.0\.1/.test(text)) leaked.push(`item ${i}: localhost`);
        if (/\b:8\d{3}\b/.test(text) && /127\.0\.0\.1/.test(text)) leaked.push(`item ${i}: port interne`);
    });
    assert.deepEqual(leaked, [], 'fuites de confidentialité détectées');
});

test('le module exporte FAQ_CATEGORIES et FAQ_DATA', () => {
    assert.equal(typeof m.FAQ_CATEGORIES, 'object');
    assert.equal(typeof m.FAQ_DATA, 'object');
});
