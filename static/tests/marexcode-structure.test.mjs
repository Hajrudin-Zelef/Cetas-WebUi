import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const appSource = readFileSync(resolve(ROOT, 'js/core/app.js'), 'utf8');
const moduleSource = readFileSync(resolve(ROOT, 'js/features/marexcode.js'), 'utf8');

test('app.js imports createMarexcode', () => {
    assert.match(appSource, /import \{ createMarexcode \} from "\.\.\/features\/marexcode\.js"/);
});

test('marexcode.js exports createMarexcode factory', () => {
    assert.match(moduleSource, /export function createMarexcode\s*\(/);
});

test('partial marexcode.html present', () => {
    const html = readFileSync(resolve(ROOT, 'partials/marexcode.html'), 'utf8');
    assert.match(html, /id="marexcode-view"/);
});