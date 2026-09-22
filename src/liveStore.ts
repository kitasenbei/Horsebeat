import { useEffect, useState } from 'react'
import { tick } from './trace'

// A value while it is being dragged. A gesture writes it here frame by frame,
// and everything that shows it reads it from here and repaints; the app hears
// about it once, when the gesture ends. Rendering the app for every frame of
// a drag was the cost of a drag: nothing on screen needed it.
export type LiveStore<T> = {
  // the value to draw: the gesture's while one is live, the app's otherwise
  read: (settled: T) => T
  // the value for a component that draws it: renders when the gesture moves
  useValue: (settled: T) => T
  // a gesture that moves the value: the same shape as a live edit, with the
  // frames going to the followers and one commit going to the app
  useEdit: (settled: T, onChange: (next: T) => void) => readonly [T, (next: T) => void, () => void]
  // to be told when the gesture moves, for a follower that updates the page
  // by hand rather than by rendering
  subscribe: (listener: () => void) => () => void
}

export function makeLiveStore<T>(same: (left: T, right: T) => boolean): LiveStore<T> {
  const listeners = new Set<() => void>()
  let held: T | null = null
  // after a commit the value is kept until the app's own has caught up with
  // it, so no frame is drawn from the value as it was before the gesture
  let committed: T | null = null
  // what the app held when the gesture began, to tell a render that has not
  // caught up yet from one that has
  let committedBefore: T | null = null

  const read = (settled: T): T => {
    if (held !== null && committed !== null && !same(settled, committedBefore as T)) {
      // the app has rendered with something other than what it had before the
      // commit: it has caught up, or moved on (clamped, or set from elsewhere).
      // Either way the app's word is now the one to draw
      held = null
      committed = null
    }
    return held ?? settled
  }

  const announce = () => {
    for (const listener of listeners) listener()
  }

  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  const useValue = (settled: T): T => {
    const [, bump] = useState(0)
    useEffect(() => subscribe(() => bump((count) => count + 1)), [])
    return read(settled)
  }

  const useEdit = (settled: T, onChange: (next: T) => void) => {
    const value = useValue(settled)

    const edit = (next: T) => {
      tick('drag live edit')
      if (held === null) committedBefore = settled
      held = next
      committed = null
      announce()
    }

    const settle = () => {
      const pending = held
      if (pending === null || committed !== null) return
      tick('drag commit to app')
      committed = pending
      onChange(pending)
    }

    return [value, edit, settle] as const
  }

  return { read, useValue, useEdit, subscribe }
}
