export function createTextShimmer(el) {
  return {
    start() {
      if (el) el.classList.add("text-shimmer")
    },
    stop() {
      if (el) el.classList.remove("text-shimmer")
    },
  }
}
