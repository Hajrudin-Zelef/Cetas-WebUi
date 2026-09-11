import hljs from "../../../js/vendor/highlight.esm.min.js"
import { createLatestQueue } from "./queue.js"

const queue = createLatestQueue({
  run: (request) => highlight(request),
  supersede: (request) => self.postMessage({ type: "superseded", id: request.id, key: request.key }),
  dispose: () => {},
})

self.onmessage = (event) => {
  const request = event.data
  if (!request) return
  if (request.type === "dispose") {
    queue.dispose(request.key)
    return
  }
  if (request.type === "highlight") queue.highlight(request)
}

function highlight(request) {
  try {
    const known = request.language && hljs.getLanguage(request.language) ? request.language : null
    const result = known
      ? hljs.highlight(request.text, { language: known, ignoreIllegals: true })
      : hljs.highlightAuto(request.text)
    self.postMessage({
      type: "highlight",
      id: request.id,
      key: request.key,
      language: known || result.language || "text",
      html: result.value,
    })
  } catch (error) {
    self.postMessage({
      type: "error",
      id: request.id,
      key: request.key,
      message: error && error.message ? error.message : String(error),
    })
  }
}
