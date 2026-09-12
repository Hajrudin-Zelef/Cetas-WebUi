import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitBlocks } from '../markdown.js';

test('splitBlocks : blocs stables + tail live', () => {
    const { blocks, tail } = splitBlocks('a\n\nb');
    assert.deepEqual(blocks, ['a\n']);
    assert.equal(tail, 'b');
});

test('splitBlocks : aucun bloc tant que le premier paragraphe est ouvert', () => {
    const { blocks, tail } = splitBlocks('hello **world');
    assert.deepEqual(blocks, []);
    assert.equal(tail, 'hello **world');
});

test('splitBlocks : un fence n\'est pas coupé par une ligne vide interne', () => {
    const md = 'text\n\n```js\nconst a=1;\n\nconst b=2;\n```\n\nend';
    const { blocks, tail } = splitBlocks(md);
    assert.equal(blocks.length, 2);
    assert.match(blocks[1], /```js[\s\S]*const b=2;[\s\S]*```/);
    assert.equal(tail, 'end');
});

test('splitBlocks : ligne vide finale clôture le tail', () => {
    const { blocks, tail } = splitBlocks('a\n\n');
    assert.deepEqual(blocks, ['a\n']);
    assert.equal(tail, '');
});

test('splitBlocks : texte vide', () => {
    const { blocks, tail } = splitBlocks('');
    assert.deepEqual(blocks, []);
    assert.equal(tail, '');
});
