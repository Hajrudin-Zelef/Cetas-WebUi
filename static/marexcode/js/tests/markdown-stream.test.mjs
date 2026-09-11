import { test } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
globalThis.marked = require("../../../js/vendor/marked.umd.min.js")

const { stream, project, completedProjection } = await import("../markdown/stream.js")

test("completedProjection renvoie un bloc full unique", () => {
  const projection = completedProjection("a\n\nb")
  assert.equal(projection.text, "a\n\nb")
  assert.equal(projection.blocks.length, 1)
  assert.deepEqual(projection.blocks[0], { raw: "a\n\nb", src: "a\n\nb", mode: "full" })
})

test("stream non-live équivaut à une projection complète", () => {
  assert.deepEqual(stream("a\n\nb", false), completedProjection("a\n\nb").blocks)
})

test("stream live heal le markdown partiel (gras non fermé)", () => {
  const blocks = stream("hello **world", true)
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].mode, "live")
  assert.equal(blocks[0].raw, "hello **world")
  assert.equal(blocks[0].src, "hello **world**")
})

test("stream avec fence fermée produit un bloc code complet", () => {
  const blocks = stream("```js\nconst a=1\n```\n", true)
  assert.equal(blocks.length, 1)
  assert.deepEqual(blocks[0], {
    raw: "```js\nconst a=1\n```\n",
    src: "const a=1",
    mode: "code",
    language: "js",
    complete: true,
  })
})

test("stream avec fence ouverte produit un bloc code incomplet", () => {
  const blocks = stream("```js\nconst a=1", true)
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].mode, "code")
  assert.equal(blocks[0].language, "js")
  assert.equal(blocks[0].src, "const a=1")
  assert.ok(!blocks[0].complete)
})

test("stream avec fence sans langage", () => {
  const blocks = stream("```\nfoo", true)
  assert.equal(blocks[0].mode, "code")
  assert.equal(blocks[0].language, undefined)
  assert.equal(blocks[0].src, "foo")
})

test("project conserve un unique bloc live sur append de texte", () => {
  const p1 = project(undefined, "hello", true)
  assert.deepEqual(p1.blocks, [{ raw: "hello", src: "hello", mode: "live" }])
  const p2 = project(p1, "hello world", true)
  assert.equal(p2.blocks.length, 1)
  assert.deepEqual(p2.blocks[0], { raw: "hello world", src: "hello world", mode: "live" })
})

test("project étend le src d'un bloc code encore ouvert", () => {
  const p1 = project(undefined, "```js\nconst a", true)
  const p2 = project(p1, "```js\nconst a=1", true)
  assert.equal(p2.blocks.length, 1)
  assert.equal(p2.blocks[0].mode, "code")
  assert.equal(p2.blocks[0].src, "const a=1")
  assert.ok(!p2.blocks[0].complete)
})

test("project marque le bloc code complet à la fermeture de la fence", () => {
  const p1 = project(undefined, "```js\nconst a=1", true)
  const p2 = project(p1, "```js\nconst a=1\n```", true)
  assert.equal(p2.blocks.length, 1)
  assert.equal(p2.blocks[0].mode, "code")
  assert.equal(p2.blocks[0].complete, true)
  assert.equal(p2.blocks[0].src, "const a=1")
})

test("project finalise les blocs live en full", () => {
  const p1 = project(undefined, "hello **world", true)
  const p2 = project(p1, "hello **world**", false)
  assert.equal(p2.blocks.length, 1)
  assert.equal(p2.blocks[0].mode, "full")
})

test("project réinitialise quand le texte ne préfixe plus l'ancien", () => {
  const p1 = project(undefined, "hello", true)
  const p2 = project(p1, "autre", true)
  assert.equal(p2.text, "autre")
  assert.equal(p2.blocks.length, 1)
  assert.equal(p2.blocks[0].mode, "live")
  assert.equal(p2.blocks[0].raw, "autre")
})
