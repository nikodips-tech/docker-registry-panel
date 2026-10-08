/** Minimal concurrency limiter: `const run = pLimit(4); await Promise.all(items.map(i => run(() => work(i))))`. */
export function pLimit(max: number) {
  let active = 0
  const queue: (() => void)[] = []
  const next = () => {
    active--
    queue.shift()?.()
  }
  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const start = () => {
        active++
        fn().then(resolve, reject).finally(next)
      }
      if (active < max) start()
      else queue.push(start)
    })
}
