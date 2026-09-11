import { createTransport } from "./queue.js"

export class MarkdownWorkerDisposedError extends Error {}
export class MarkdownWorkerSupersededError extends Error {}
export class MarkdownWorkerUnavailableError extends Error {}

let worker
let disabled
let nextId = 0
const pending = new Map()
const keys = new Set()

const transport = createTransport({
  post: (request) => worker.postMessage(request),
  supersede: (request) => {
    const result = pending.get(request.id)
    if (!result) return
    pending.delete(request.id)
    result.reject(new MarkdownWorkerSupersededError())
  },
})

function fail(message) {
  const error = new MarkdownWorkerUnavailableError(message)
  disabled = error
  transport.reset()
  pending.forEach((request) => request.reject(error))
  pending.clear()
  keys.clear()
  worker?.terminate()
  worker = undefined
}

function getWorker() {
  if (worker) return worker
  if (disabled) throw new MarkdownWorkerUnavailableError(disabled.message)
  try {
    worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" })
  } catch (error) {
    disabled = error instanceof Error ? error : new Error(String(error))
    throw new MarkdownWorkerUnavailableError(disabled.message)
  }
  worker.onmessage = (event) => {
    const data = event.data
    if (!data || !data.key) return
    const result = pending.get(data.id)
    if (!result) {
      transport.complete(data.key, data.id)
      return
    }
    pending.delete(data.id)
    if (!keys.has(data.key)) {
      result.reject(new MarkdownWorkerDisposedError())
      transport.complete(data.key, data.id)
      return
    }
    if (data.type === "superseded") {
      result.reject(new MarkdownWorkerSupersededError())
      transport.complete(data.key, data.id)
      return
    }
    if (data.type === "error") {
      result.reject(new Error(data.message))
      transport.complete(data.key, data.id)
      return
    }
    result.resolve({ html: data.html, language: data.language })
    transport.complete(data.key, data.id)
  }
  worker.onerror = (event) => fail(event.message || "Markdown highlighting worker failed")
  worker.onmessageerror = () => fail("Markdown worker response failed")
  return worker
}

export async function highlightCode(key, text, language, complete = false) {
  const instance = getWorker()
  const id = ++nextId
  keys.delete(key)
  keys.add(key)
  if (keys.size > 200) disposeStreamingCode(keys.values().next().value)
  return new Promise((resolve, reject) => {
    pending.set(id, { key, resolve, reject })
    transport.send({ type: "highlight", id, key, text, language, complete })
  })
}

export function disposeStreamingCode(key) {
  keys.delete(key)
  transport.dispose(key)
  pending.forEach((request, id) => {
    if (request.key !== key) return
    pending.delete(id)
    request.reject(new MarkdownWorkerDisposedError())
  })
  worker?.postMessage({ type: "dispose", key })
}
