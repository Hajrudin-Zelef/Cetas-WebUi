import morphdom from "../../../js/vendor/morphdom.esm.min.js"
import { project } from "./stream.js"
import { sanitizeMarkdown, getCachedMarkdown, touchCachedMarkdown, checksum } from "./cache.js"
import { inlineCodeKind } from "./inline-code-kind.js"

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

function codeHtml(block) {
  const lang = block.language || "text"
  return (
    '<div data-component="markdown-code" data-language="' +
    escapeHtml(lang) +
    '"><pre><code class="language-' +
    escapeHtml(lang) +
    '">' +
    escapeHtml(block.src) +
    '</code></pre><button type="button" data-slot="markdown-copy-button" class="markdown-copy-button" aria-label="Copier">' +
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

function getState(container) {
  let st = states.get(container)
  if (!st) {
    st = { projection: undefined, text: "", owner: "md" + ++seq, copyCleanup: null, copyTimers: new Map() }
    states.set(container, st)
  }
  return st
}

function buildBlock(st, block, index) {
  const key = st.owner + ":" + index + ":" + block.mode
  if (block.mode === "code") {
    return { key, mode: "code", raw: block.raw, hash: checksum(block.src) + ":" + block.raw.length, html: codeHtml(block) }
  }
  const cacheKey = "b:" + index + ":" + block.mode + ":" + checksum(block.src)
  const cached = getCachedMarkdown(cacheKey)
  if (cached && cached.raw === block.raw) {
    touchCachedMarkdown(cacheKey, cached)
    return { key, mode: block.mode, raw: cached.raw, hash: cached.hash, html: cached.html }
  }
  const hash = checksum(block.src)
  const html = sanitizeMarkdown(parseMarkdown(block.src))
  touchCachedMarkdown(cacheKey, { raw: block.raw, hash, html })
  return { key, mode: block.mode, raw: block.raw, hash, html }
}

function updateBlock(container, index, block) {
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
    onBeforeElUpdated: (fromEl, toEl) => !fromEl.isEqualNode(toEl),
  })
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
    blocks.forEach((block, index) => updateBlock(container, index, block))
    while (container.children.length > blocks.length) {
      const child = container.lastElementChild
      if (!child) break
      child.remove()
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
