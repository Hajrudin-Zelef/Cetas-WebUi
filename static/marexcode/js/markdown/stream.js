import remend from "../../../js/vendor/remend.esm.min.js"

const marked = () => globalThis.marked

function refs(text) {
  if (!text.includes("]:")) return false
  return /^[ \t]{0,3}\[[^\]]+\]:[ \t]*(?:\S+|\r?\n[ \t]+\S+)/m.test(text)
}

function language(value) {
  return value?.trim().split(/\s+/, 1)[0] || undefined
}

function openCode(raw) {
  const newline = raw.indexOf("\n")
  return newline < 0 ? "" : raw.slice(newline + 1)
}

function open(raw) {
  const match = raw.match(/^[ \t]{0,3}(`{3,}|~{3,})/)
  if (!match) return false
  const mark = match[1]
  if (!mark) return false
  const char = mark[0]
  const size = mark.length
  const last = raw.trimEnd().split("\n").at(-1)?.trim() ?? ""
  return !new RegExp(`^[\\t ]{0,3}${char}{${size},}[\\t ]*$`).test(last)
}

function closesFence(raw, suffix) {
  const mark = raw.match(/^[ \t]{0,3}(`{3,}|~{3,})/)?.[1]
  if (!mark) return suffix.includes("```") || suffix.includes("~~~")
  return `${raw.slice(-(mark.length - 1))}${suffix}`.includes(mark)
}

function heal(text) {
  return remend(text, { linkMode: "text-only" })
}

export function completedProjection(text) {
  return { text, blocks: [{ raw: text, src: text, mode: "full" }] }
}

export function stream(text, live) {
  if (!live) return completedProjection(text).blocks
  if (refs(text)) return [{ raw: text, src: heal(text), mode: "live" }]
  const tokens = marked().lexer(text)
  let tail = -1
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].type !== "space") {
      tail = i
      break
    }
  }
  if (tail < 0) return [{ raw: text, src: heal(text), mode: "live" }]
  const last = tokens[tail]
  if (!last) return [{ raw: text, src: heal(text), mode: "live" }]

  const result = []
  for (let index = 0; index < tail; index++) {
    const token = tokens[index]
    if (!token || token.type === "space") continue
    let raw = token.raw
    while (tokens[index + 1]?.type === "space" && index + 1 < tail) raw += tokens[++index].raw
    if (token.type === "code") {
      result.push({ raw, src: token.text, mode: "code", language: language(token.lang), complete: true })
      continue
    }
    result.push({ raw, src: raw, mode: "full" })
  }

  const raw = tokens
    .slice(tail)
    .map((token) => token.raw)
    .join("")
  if (last.type !== "code") return [...result, { raw, src: heal(raw), mode: "live" }]

  if (!open(last.raw))
    return [...result, { raw, src: last.text, mode: "code", language: language(last.lang), complete: true }]
  return [...result, { raw, src: openCode(last.raw), mode: "code", language: language(last.lang) }]
}

export function project(previous, text, live) {
  if (!live) {
    const current =
      previous?.text === text
        ? previous
        : previous && text.startsWith(previous.text)
          ? project(previous, text, true)
          : undefined
    if (!current) return completedProjection(text)
    return {
      text,
      blocks: current.blocks.map((block) => {
        if (block.mode === "live") return { raw: block.raw, src: block.raw, mode: "full" }
        if (block.mode === "code" && !block.complete) return { ...block, complete: true }
        return block
      }),
    }
  }
  if (!previous || !text.startsWith(previous.text)) return { text, blocks: stream(text, live) }
  const tail = previous.blocks.at(-1)
  const suffix = text.slice(previous.text.length)
  if (!suffix || tail?.mode !== "code" || tail.complete || closesFence(tail.raw, suffix))
    return { text, blocks: stream(text, live) }
  return {
    text,
    blocks: [
      ...previous.blocks.slice(0, -1),
      {
        ...tail,
        raw: tail.raw + suffix,
        src: tail.src + suffix,
      },
    ],
  }
}
