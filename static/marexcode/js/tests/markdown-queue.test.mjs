import { test } from "node:test"
import assert from "node:assert/strict"

const { createLatestQueue, createTransport } = await import("../markdown/queue.js")

function setupQueue() {
  const run = []
  const superseded = []
  const disposed = []
  const queue = createLatestQueue({
    run: (request) => run.push(request.id),
    supersede: (request) => superseded.push(request.id),
    dispose: (key) => disposed.push(key),
  })
  return { queue, run, superseded, disposed }
}

test("queue: latest-wins, seule la dernière requête d'une clé s'exécute", async () => {
  const { queue, run, superseded } = setupQueue()
  queue.highlight({ id: 1, key: "a" })
  queue.highlight({ id: 2, key: "a" })
  queue.highlight({ id: 3, key: "a" })
  await queue.idle()
  assert.deepEqual(run, [3])
  assert.deepEqual(superseded, [1, 2])
})

test("queue: les clés distinctes s'exécutent séquentiellement", async () => {
  const { queue, run } = setupQueue()
  queue.highlight({ id: 1, key: "a" })
  queue.highlight({ id: 2, key: "b" })
  await queue.idle()
  assert.deepEqual(run, [1, 2])
})

test("queue: dispose annule la requête en attente", async () => {
  const { queue, run, superseded, disposed } = setupQueue()
  queue.highlight({ id: 1, key: "a" })
  queue.dispose("a")
  await queue.idle()
  assert.deepEqual(run, [])
  assert.deepEqual(superseded, [1])
  assert.deepEqual(disposed, ["a"])
})

test("queue: pending compte les clés actives puis retombe à zéro", async () => {
  const { queue } = setupQueue()
  queue.highlight({ id: 1, key: "a" })
  assert.equal(queue.pending(), 1)
  await queue.idle()
  assert.equal(queue.pending(), 0)
})

function setupTransport() {
  const posted = []
  const superseded = []
  const transport = createTransport({
    post: (request) => posted.push(request.id),
    supersede: (request) => superseded.push(request.id),
  })
  return { transport, posted, superseded }
}

test("transport: poste la première requête, met la suivante en file", () => {
  const { transport, posted } = setupTransport()
  transport.send({ id: 1, key: "a" })
  transport.send({ id: 2, key: "a" })
  assert.deepEqual(posted, [1])
  assert.equal(transport.queued(), 1)
})

test("transport: latest-wins sur la file d'attente", () => {
  const { transport, posted, superseded } = setupTransport()
  transport.send({ id: 1, key: "a" })
  transport.send({ id: 2, key: "a" })
  transport.send({ id: 3, key: "a" })
  assert.deepEqual(posted, [1])
  assert.deepEqual(superseded, [2])
  assert.equal(transport.queued(), 1)
})

test("transport: complete libère l'actif et poste la dernière en file", () => {
  const { transport, posted } = setupTransport()
  transport.send({ id: 1, key: "a" })
  transport.send({ id: 2, key: "a" })
  transport.send({ id: 3, key: "a" })
  transport.complete("a", 1)
  assert.deepEqual(posted, [1, 3])
  assert.equal(transport.queued(), 0)
})

test("transport: complete avec un id non actif est ignoré", () => {
  const { transport, posted } = setupTransport()
  transport.send({ id: 1, key: "a" })
  transport.send({ id: 2, key: "a" })
  transport.complete("a", 999)
  assert.deepEqual(posted, [1])
  assert.equal(transport.queued(), 1)
})

test("transport: dispose retire l'actif et supersede la file", () => {
  const { transport, superseded } = setupTransport()
  transport.send({ id: 1, key: "b" })
  transport.send({ id: 2, key: "b" })
  transport.dispose("b")
  assert.deepEqual(superseded, [2])
  assert.equal(transport.queued(), 0)
})

test("transport: reset supersede toute la file et vide l'état", () => {
  const { transport, superseded } = setupTransport()
  transport.send({ id: 1, key: "c" })
  transport.send({ id: 2, key: "c" })
  transport.send({ id: 3, key: "d" })
  transport.send({ id: 4, key: "d" })
  transport.reset()
  assert.deepEqual(superseded.sort((a, b) => a - b), [2, 4])
  assert.equal(transport.queued(), 0)
})
