import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
const css = readFileSync(resolve(ROOT, 'css/style.css'), 'utf8');

function extractPaths(htmlContent) {
  const paths = [];
  const attrRe = /(?:src|href)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = attrRe.exec(htmlContent)) !== null) {
    const val = m[1];
    if (!val || val.startsWith('http://') || val.startsWith('https://') || val.startsWith('data:')) continue;
    paths.push(val.split('?')[0]);
  }
  return [...new Set(paths)];
}

function extractImports(cssContent) {
  const paths = [];
  const importRe = /@import\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = importRe.exec(cssContent)) !== null) {
    const val = m[1];
    if (val.startsWith('http://') || val.startsWith('https://')) continue;
    paths.push(val.split('?')[0]);
  }
  return [...new Set(paths)];
}

const CSS_DIR = resolve(ROOT, 'css');

const htmlPaths = extractPaths(html);
const cssPaths = extractImports(css);
const allPaths = [...htmlPaths.map(p => ({ source: 'index.html', path: p, base: ROOT })),
                  ...cssPaths.map(p => ({ source: 'css/style.css', path: p, base: CSS_DIR }))];

for (const { source, path, base } of allPaths) {
  test(`static path exists: ${path} (from ${source})`, () => {
    const resolved = resolve(base, path);
    assert.ok(existsSync(resolved), `File not found: ${resolved} (referenced in ${source})`);
  });
}
