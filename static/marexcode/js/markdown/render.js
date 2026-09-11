import morphdom from "../../../js/vendor/morphdom.esm.min.js"
import { project } from "./stream.js"
import { sanitizeMarkdown, getCachedMarkdown, touchCachedMarkdown, checksum } from "./cache.js"
import { inlineCodeKind } from "./inline-code-kind.js"
import { highlightCode, disposeStreamingCode } from "./worker-client.js"

const marked = () => globalThis.marked

const COPY_ICON =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'

let seq = 0
const states = new WeakMap()

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function fallback(text) {
  return escapeHtml(text).replace(/\r\n?/g, "\n").replace(/\n/g, "<br>")
}

function parseMarkdown(text) {
  const m = marked()
  if (!m) return fallback(text)
  const parse = typeof m === "function" ? m : m.parse
  try {
    return parse(text, { breaks: true, gfm: true })
  } catch {
    return fallback(text)
  }
}

function codeShell(block) {
  const lang = block.language || "text"
  return (
    '<div data-component="markdown-code" data-language="' +
    escapeHtml(lang) +
    '"><pre><code class="language-' +
    escapeHtml(lang) +
    '"></code></pre><button type="button" data-slot="markdown-copy-button" class="markdown-copy-button" aria-label="Copier">' +
    COPY_ICON +
    "</button></div>"
  )
}

function decorate(root) {
  const codes = root.querySelectorAll(":not(pre) > code")
  for (const code of codes) {
    delete code.dataset.inlineCodeKind
    const kind = inlineCodeKind(code.textContent || "")
    if (kind) code.dataset.inlineCodeKind = kind
  }
}

function selectionIntersects(node) {
  const selection = typeof window !== "undefined" && typeof window.getSelection === "function" ? window.getSelection() : null
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false
  for (let i = 0; i < selection.rangeCount; i++) {
    try {
      if (selection.getRangeAt(i).intersectsNode(node)) return true
    } catch {
      return false
    }
  }
  return false
}

function getState(container) {
  let st = states.get(container)
  if (!st) {
    st = {
      projection: undefined,
      text: "",
      owner: "md" + ++seq,
      copyCleanup: null,
      copyTimers: new Map(),
      codeHtml: new Map(),
      codeReq: new Map(),
      codeKeys: new Set(),
    }
    states.set(container, st)
  }
  return st
}

function buildBlock(st, block, index) {
  const key = st.owner + ":" + index + ":" + block.mode
  if (block.mode === "code") {
    return {
      key,
      mode: "code",
      raw: block.raw,
      src: block.src,
      language: block.language,
      complete: !!block.complete,
      hash: checksum(block.src) + ":" + block.raw.length,
    }
  }
  const hash = checksum(block.src)
  if (block.mode !== "live") {
    const cacheKey = "b:" + index + ":" + block.mode + ":" + hash
    const cached = getCachedMarkdown(cacheKey)
    if (cached && cached.raw === block.raw) {
      touchCachedMarkdown(cacheKey, cached)
      return { key, mode: block.mode, raw: cached.raw, hash: cached.hash, html: cached.html }
    }
    const cachedHtml = sanitizeMarkdown(parseMarkdown(block.src))
    touchCachedMarkdown(cacheKey, { raw: block.raw, hash, html: cachedHtml })
    return { key, mode: block.mode, raw: block.raw, hash, html: cachedHtml }
  }
  const html = sanitizeMarkdown(parseMarkdown(block.src))
  return { key, mode: block.mode, raw: block.raw, hash, html }
}

function updateBlock(container, index, block, guardSelection) {
  const current = container.children[index]
  if (
    current instanceof HTMLElement &&
    current.dataset.markdownKey === block.key &&
    current.dataset.markdownHash === block.hash
  )
    return

  const next = document.createElement("div")
  next.dataset.markdownBlock = ""
  next.dataset.markdownKey = block.key
  next.dataset.markdownHash = block.hash
  next.style.display = "contents"
  next.innerHTML = block.html
  decorate(next)

  if (!(current instanceof HTMLElement)) {
    container.appendChild(next)
    return
  }

  morphdom(current, next, {
    onBeforeElUpdated: (fromEl, toEl) =>
      (!guardSelection || !selectionIntersects(fromEl)) && !fromEl.isEqualNode(toEl),
  })
}

function requestHighlight(container, index, block, st) {
  const requestKey = block.src + "\u0000" + (block.complete ? "1" : "0")
  if (st.codeReq.get(block.key) === requestKey) return
  st.codeReq.set(block.key, requestKey)
  highlightCode(block.key, block.src, block.language, block.complete)
    .then((result) => {
      st.codeHtml.set(block.key, { src: block.src, html: result.html })
      const current = container.children[index]
      if (!(current instanceof HTMLElement) || current.dataset.markdownKey !== block.key) return
      const code = current.querySelector("code")
      if (!code) return
      code.classList.add("hljs")
      code.innerHTML = result.html
    })
    .catch(() => {})
}

function updateCodeBlock(container, index, block, st) {
  const current = container.children[index]
  const existing = current instanceof HTMLElement && current.dataset.markdownKey === block.key ? current : null
  const next = existing || document.createElement("div")
  if (!existing) {
    next.dataset.markdownBlock = ""
    next.dataset.markdownKey = block.key
    next.style.display = "contents"
    next.innerHTML = codeShell(block)
  }
  next.dataset.markdownHash = block.hash
  next.dataset.markdownComplete = block.complete ? "true" : "false"

  const code = next.querySelector("code")
  if (code) {
    const highlighted = st.codeHtml.get(block.key)
    if (highlighted && highlighted.src === block.src) {
      code.classList.add("hljs")
      if (code.innerHTML !== highlighted.html) code.innerHTML = highlighted.html
    } else {
      code.classList.remove("hljs")
      if (code.textContent !== block.src) code.textContent = block.src
    }
  }

  if (!existing) container.appendChild(next)
  st.codeKeys.add(block.key)
  requestHighlight(container, index, block, st)
}

function setupCodeCopy(container, st) {
  const handleClick = async (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const button = target.closest('[data-slot="markdown-copy-button"]')
    if (!(button instanceof HTMLElement)) return
    const code = button.closest('[data-component="markdown-code"]')?.querySelector("code")
    const content = code?.textContent ?? ""
    if (!content) return
    const clipboard = navigator?.clipboard
    if (!clipboard) return
    await clipboard.writeText(content)
    button.setAttribute("data-copied", "true")
    button.setAttribute("aria-label", "Copié")
    const existing = st.copyTimers.get(button)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      button.removeAttribute("data-copied")
      button.setAttribute("aria-label", "Copier")
      st.copyTimers.delete(button)
    }, 2000)
    st.copyTimers.set(button, timer)
  }

  container.addEventListener("click", handleClick)
  return () => {
    container.removeEventListener("click", handleClick)
    for (const timer of st.copyTimers.values()) clearTimeout(timer)
    st.copyTimers.clear()
  }
}

export function createMarkdownRenderer() {
  function render(container, text, streaming) {
    const st = getState(container)
    const value = text || ""
    const projection = project(st.projection, value, !!streaming)
    st.projection = projection
    st.text = value
    const blocks = projection.blocks.map((block, index) => buildBlock(st, block, index))
    const seen = new Set()
    blocks.forEach((block, index) => {
      if (block.mode === "code") {
        seen.add(block.key)
        updateCodeBlock(container, index, block, st)
      } else {
        updateBlock(container, index, block, !!streaming)
      }
    })
    while (container.children.length > blocks.length) {
      const child = container.lastElementChild
      if (!child) break
      child.remove()
    }
    for (const key of st.codeKeys) {
      if (seen.has(key)) continue
      st.codeKeys.delete(key)
      st.codeHtml.delete(key)
      st.codeReq.delete(key)
      disposeStreamingCode(key)
    }
    if (!st.copyCleanup) st.copyCleanup = setupCodeCopy(container, st)
  }

  return {
    render(container, text) {
      render(container, text, false)
    },
    update(container, text) {
      render(container, text, true)
    },
    finalize(container, text) {
      render(container, text, false)
    },
  }
}
