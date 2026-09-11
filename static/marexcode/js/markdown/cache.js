const MAX = 1000
const cache = new Map()

const config = {
  USE_PROFILES: { html: true, mathMl: true },
  SANITIZE_NAMED_PROPS: true,
  FORBID_TAGS: ["style"],
  FORBID_CONTENTS: ["style", "script"],
  ADD_TAGS: ["svg", "path"],
  ADD_ATTR: ["d", "viewBox", "preserveAspectRatio", "xmlns", "target"],
}

const purify = () => globalThis.DOMPurify

if (typeof window !== "undefined" && purify()?.isSupported) {
  purify().addHook("afterSanitizeAttributes", (node) => {
    if (!(node instanceof HTMLAnchorElement)) return
    if (node.target !== "_blank") return
    const rel = node.getAttribute("rel") ?? ""
    const set = new Set(rel.split(/\s+/).filter(Boolean))
    set.add("noopener")
    set.add("noreferrer")
    node.setAttribute("rel", Array.from(set).join(" "))
  })
}

export function checksum(text) {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  const value = String(text)
  for (let i = 0; i < value.length; i++) {
    const ch = value.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

export function sanitizeMarkdown(html) {
  const p = purify()
  if (!p || !p.isSupported) return html
  return p.sanitize(html, config)
}

export function getCachedMarkdown(key) {
  return cache.get(key)
}

export function touchCachedMarkdown(key, value) {
  cache.delete(key)
  cache.set(key, value)
  if (cache.size <= MAX) return
  const first = cache.keys().next().value
  if (!first) return
  cache.delete(first)
}
