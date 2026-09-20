export type Tempo = {
  bpm: number
  anchor: number
}

export function resolveTempo(markers: number[], duration: number): Tempo | null {
  if (markers.length < 2 || duration <= 0) return null

  const sorted = [...markers].sort((left, right) => left - right)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const seconds = (last - first) * duration
  if (seconds <= 0) return null

  const bpm = (60 * (sorted.length - 1)) / seconds
  return { bpm, anchor: first }
}
