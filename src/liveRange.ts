import { useEffect, useState } from 'react'
import type { Range } from './range'
import { tick } from './trace'

// The window while it is being dragged or zoomed. A gesture writes it here
// frame by frame, and everything that shows the window reads it from here
// and repaints; the app hears about it once, when the gesture ends. Rendering
// the app for every frame of a pan was the cost of a pan: nothing on screen
// needed it, and the timing panel's cards paid it.

const listeners = new Set<() => void>()
let held: Range | null = null
// after a commit the value is kept until the app's own window has caught up
// with it, so no frame is drawn from the window as it was before the gesture
let committed: Range | null = null

function same(left: Range, right: Range) {
  return Math.abs(left.start - right.start) < 1e-9 && Math.abs(left.end - right.end) < 1e-9
}

// The window to draw: the gesture's while one is live, the app's otherwise.
export function liveRange(settled: Range): Range {
  if (held && committed && !same(settled, committed)) {
    // the app has moved on from where the gesture left it: clamped, or set
    // from elsewhere. Either way the app's word is now the one to draw
    held = null
    committed = null
  }
  if (held && committed && same(settled, committed)) {
    held = null
    committed = null
  }
  return held ?? settled
}

function announce() {
  for (const listener of listeners) listener()
}

export function subscribeLiveRange(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// The window for a component that draws it: renders when the gesture moves.
export function useLiveRangeValue(settled: Range): Range {
  const [, bump] = useState(0)
  useEffect(() => subscribeLiveRange(() => bump((count) => count + 1)), [])
  return liveRange(settled)
}

// A gesture that moves the window: the same shape as a live edit, with the
// frames going to the followers and one commit going to the app.
export function useLiveRangeEdit(settled: Range, onChange: (next: Range) => void) {
  const range = useLiveRangeValue(settled)

  const edit = (next: Range) => {
    tick('drag live edit')
    held = next
    committed = null
    announce()
  }

  const settle = () => {
    const pending = held
    if (!pending || committed) return
    tick('drag commit to app')
    committed = pending
    onChange(pending)
  }

  return [range, edit, settle] as const
}
