export function createTextReveal(el) {
  let current = el ? el.textContent || "" : ""
  let timer = null
  if (el) el.classList.add("text-reveal")

  return {
    setText(next) {
      if (!el) return
      const value = next == null ? "" : String(next)
      if (value === current) return
      current = value
      if (timer) clearTimeout(timer)
      el.classList.add("is-swapping")
      timer = setTimeout(() => {
        el.textContent = value
        el.classList.remove("is-swapping")
        timer = null
      }, 180)
    },
  }
}
