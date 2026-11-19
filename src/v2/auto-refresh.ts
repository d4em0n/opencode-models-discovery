/** One timer per plugin location; refreshes cannot overlap and stop on disposal. */
export function createAutoRefresh(refresh: () => Promise<unknown>): {
  configure(intervalMs: number): void
  dispose(): void
} {
  let timer: ReturnType<typeof setInterval> | undefined
  let interval = 0
  let running = false
  let disposed = false

  return {
    configure(intervalMs) {
      if (disposed || interval === intervalMs) return
      if (timer) clearInterval(timer)
      interval = intervalMs
      if (intervalMs <= 0) return
      timer = setInterval(() => {
        if (running || disposed) return
        running = true
        void Promise.resolve().then(refresh).catch(() => {
          // Discovery failures retain the last good catalog; retry on the next tick.
        }).finally(() => { running = false })
      }, intervalMs)
      timer.unref?.()
    },
    dispose() {
      disposed = true
      if (timer) clearInterval(timer)
    },
  }
}
