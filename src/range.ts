export type Range = {
  start: number
  end: number
}

export const MIN_SPAN = 0.00001

export function clampRange(range: Range): Range {
  const span = Math.min(1, Math.max(MIN_SPAN, range.end - range.start))
  const start = Math.min(Math.max(0, range.start), 1 - span)
  return { start, end: start + span }
}
