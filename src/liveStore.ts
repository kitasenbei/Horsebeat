import { useEffect, useRef, useState } from 'react'
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
  // the gesture's value, kept after it ends until the app has caught up, so
  // no frame is drawn from the value as it was before the gesture
  let held: T | null = null
  // whether a gesture is under way: only then is the held value the truth
  // whatever the app says
  let active = false
  // what the app held when the gesture began, to tell a render that has not
  // caught up yet from one that has
  let before: T | null = null
  // what the gesture handed the app when it ended
  let committed: T | null = null

  const release = () => {
    held = null
    before = null
    committed = null
  }

  const read = (settled: T): T => {
    // Once the gesture is over, the app's word is the one to draw as soon as
    // it shows any sign of having heard: a value other than the one it held
    // before, or the very value it was handed. Held any longer, a gesture
    // whose commit changed nothing, or that ended without one, would leave
    // its value on screen while the app moved on underneath it
    if (held !== null && !active && before !== null) {
      const moved = !same(settled, before)
      const arrived = committed !== null && same(settled, committed)
      if (moved || arrived) release()
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
    const changeRef = useRef(onChange)
    changeRef.current = onChange

    const edit = (next: T) => {
      tick('drag live edit')
      if (!active) {
        before = settled
        active = true
      }
      held = next
      committed = null
      announce()
    }

    const settle = () => {
      if (!active) return
      active = false
      const pending = held
      if (pending === null) return
      tick('drag commit to app')
      committed = pending
      changeRef.current(pending)
    }

    // a gesture cut short by its component going away still reaches the app,
    // rather than leaving its last frame on screen for good
    useEffect(
      () => () => {
        if (active) settle()
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    )

    return [value, edit, settle] as const
  }

  return { read, useValue, useEdit, subscribe }
}
