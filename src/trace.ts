// A running count of what the app does and how long it takes, kept in plain
// counters so measuring costs a subtraction and a map lookup. Every second the
// counters roll into a snapshot the trace panel reads; nothing here touches
// React, so the panel can be open during a drag without being part of it.

export type TraceRow = {
  name: string
  // per second of the last rolled window
  calls: number
  ms: number
  // per call over that window
  average: number
  worst: number
  // every call since the page opened
  total: number
}

type Entry = {
  calls: number
  ms: number
  worst: number
}

const WINDOW_MS = 1000

const live = new Map<string, Entry>()
const totals = new Map<string, number>()
let rolled: TraceRow[] = []
let rolledAt = performance.now()

function entry(name: string): Entry {
  let held = live.get(name)
  if (!held) {
    held = { calls: 0, ms: 0, worst: 0 }
    live.set(name, held)
  }
  return held
}

function add(name: string, ms: number) {
  const held = entry(name)
  held.calls += 1
  held.ms += ms
  if (ms > held.worst) held.worst = ms
  totals.set(name, (totals.get(name) ?? 0) + 1)
}

// A duration measured elsewhere, put under a name.
export function record(name: string, ms: number) {
  add(name, ms)
}

// A stretch of work timed by the caller, for work that has no one function
// to wrap: started here, recorded when the returned function is called.
export function stopwatch(name: string): () => void {
  const start = performance.now()
  return () => add(name, performance.now() - start)
}

// A function run and timed under a name.
export function measure<T>(name: string, run: () => T): T {
  const start = performance.now()
  try {
    return run()
  } finally {
    add(name, performance.now() - start)
  }
}

// A thing that happened, counted but not timed: a render, a commit.
export function tick(name: string) {
  add(name, 0)
}

// The last full second, rolled over when a second has passed. Names that fell
// silent stay listed at nought, so a graph does not vanish the moment it stops
// costing anything.
export function snapshot(): TraceRow[] {
  const now = performance.now()
  const elapsed = now - rolledAt
  if (elapsed < WINDOW_MS) return rolled

  const seconds = elapsed / 1000
  const names = new Set<string>([...rolled.map((row) => row.name), ...live.keys()])
  const next: TraceRow[] = []
  for (const name of names) {
    const held = live.get(name)
    const total = totals.get(name) ?? 0
    if (!held) {
      next.push({ name, calls: 0, ms: 0, average: 0, worst: 0, total })
      continue
    }
    next.push({
      name,
      calls: held.calls / seconds,
      ms: held.ms / seconds,
      average: held.calls > 0 ? held.ms / held.calls : 0,
      worst: held.worst,
      total,
    })
  }
  next.sort((left, right) => right.ms - left.ms || right.calls - left.calls)

  rolled = next
  rolledAt = now
  live.clear()
  return rolled
}
