export function createLatestQueue(input) {
  const jobs = []
  const slots = new Map()
  let running
  let cursor = 0

  const schedule = () => {
    if (running) return
    running = Promise.resolve()
      .then(async () => {
        while (cursor < jobs.length) {
          const job = jobs[cursor++]
          if (job.type === "dispose") {
            input.dispose(job.key)
            continue
          }
          if (slots.get(job.key) === job) slots.delete(job.key)
          const request = job.request
          job.request = undefined
          if (request) await input.run(request)
        }
      })
      .finally(() => {
        jobs.splice(0, cursor)
        cursor = 0
        running = undefined
        if (jobs.length > 0) schedule()
      })
  }

  return {
    highlight(request) {
      const slot = slots.get(request.key)
      if (slot) {
        if (slot.request) input.supersede(slot.request)
        slot.request = request
        return
      }
      const next = { type: "highlight", key: request.key, request }
      slots.set(request.key, next)
      jobs.push(next)
      schedule()
    },
    dispose(key) {
      const slot = slots.get(key)
      if (slot && slot.request) input.supersede(slot.request)
      if (slot) {
        slot.request = undefined
        slots.delete(key)
      }
      jobs.push({ type: "dispose", key })
      schedule()
    },
    pending: () => slots.size,
    async idle() {
      while (running) await running
    },
  }
}

export function createTransport(input) {
  const active = new Map()
  const queued = new Map()

  return {
    send(request) {
      if (!active.has(request.key)) {
        active.set(request.key, request)
        input.post(request)
        return
      }
      const previous = queued.get(request.key)
      if (previous) input.supersede(previous)
      queued.set(request.key, request)
    },
    complete(key, id) {
      if (active.get(key)?.id !== id) return
      active.delete(key)
      const next = queued.get(key)
      if (!next) return
      queued.delete(key)
      active.set(key, next)
      input.post(next)
    },
    dispose(key) {
      active.delete(key)
      const request = queued.get(key)
      if (request) input.supersede(request)
      queued.delete(key)
    },
    reset() {
      queued.forEach(input.supersede)
      queued.clear()
      active.clear()
    },
    queued: () => queued.size,
  }
}
