export function createAutoScroll(scrollEl) {
  const threshold = 50
  let userScrolled = false
  let frame = null
  const observed = new WeakSet()

  const canScroll = () => scrollEl.scrollHeight - scrollEl.clientHeight > 1
  const distanceFromBottom = () => scrollEl.scrollHeight - scrollEl.clientHeight - scrollEl.scrollTop
  const atBottom = () => distanceFromBottom() <= threshold

  const applyOverflowAnchor = () => {
    scrollEl.style.overflowAnchor = userScrolled ? "none" : "auto"
  }

  const setUserScrolled = (value) => {
    if (userScrolled === value) return
    userScrolled = value
    applyOverflowAnchor()
  }

  const scrollToBottom = () => {
    scrollEl.scrollTop = scrollEl.scrollHeight
  }

  const resizeObserver =
    typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => schedule()) : null

  const observe = (node) => {
    if (!resizeObserver || !(node instanceof Element) || observed.has(node)) return
    observed.add(node)
    resizeObserver.observe(node)
  }

  const syncChildren = () => {
    if (!resizeObserver) return
    for (const child of scrollEl.children) observe(child)
  }

  // Coalesce toutes les demandes de scroll sur une seule frame : évite de lire
  // scrollHeight (reflow) à chaque delta de streaming.
  function schedule() {
    if (frame !== null) return
    frame = requestAnimationFrame(() => {
      frame = null
      apply()
    })
  }

  function apply() {
    syncChildren()
    if (!canScroll()) {
      setUserScrolled(false)
      return
    }
    if (userScrolled && !atBottom()) return
    setUserScrolled(false)
    scrollToBottom()
  }

  const handleScroll = () => {
    if (!canScroll() || atBottom()) {
      setUserScrolled(false)
      return
    }
    setUserScrolled(true)
  }

  const handleWheel = (event) => {
    if (event.deltaY >= 0) return
    const target = event.target instanceof Element ? event.target : null
    const nested = target ? target.closest("[data-scrollable]") : null
    if (nested && nested !== scrollEl) return
    setUserScrolled(true)
  }

  scrollEl.addEventListener("scroll", handleScroll, { passive: true })
  scrollEl.addEventListener("wheel", handleWheel, { passive: true })
  applyOverflowAnchor()
  syncChildren()

  return {
    onContentChange: schedule,
    dispose() {
      if (frame !== null) { cancelAnimationFrame(frame); frame = null }
      scrollEl.removeEventListener("scroll", handleScroll)
      scrollEl.removeEventListener("wheel", handleWheel)
      if (resizeObserver) resizeObserver.disconnect()
    },
  }
}
