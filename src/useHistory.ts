import { useCallback, useRef, useState } from 'react'

const COALESCE_MS = 400
const LIMIT = 100

export type History = {
  undo: () => void
  redo: () => void
  reset: () => void
  canUndo: boolean
  canRedo: boolean
}

export function useHistory<T>(initial: T) {
  const [state, setState] = useState(initial)
  const [counts, setCounts] = useState({ past: 0, future: 0 })
  const stateRef = useRef(initial)
  const pastRef = useRef<T[]>([])
  const futureRef = useRef<T[]>([])
  const stampRef = useRef(0)

  const commit = useCallback((next: T) => {
    stateRef.current = next
    setState(next)
    setCounts({ past: pastRef.current.length, future: futureRef.current.length })
  }, [])

  const apply = useCallback(
    (updater: T | ((current: T) => T)) => {
      const current = stateRef.current
      const next = typeof updater === 'function' ? (updater as (value: T) => T)(current) : updater
      if (Object.is(next, current)) return

      const now = performance.now()
      if (pastRef.current.length === 0 || now - stampRef.current > COALESCE_MS) {
        pastRef.current.push(current)
        if (pastRef.current.length > LIMIT) pastRef.current.shift()
      }

      stampRef.current = now
      futureRef.current = []
      commit(next)
    },
    [commit],
  )

  const undo = useCallback(() => {
    const previous = pastRef.current.pop()
    if (previous === undefined) return
    futureRef.current.push(stateRef.current)
    stampRef.current = 0
    commit(previous)
  }, [commit])

  const redo = useCallback(() => {
    const next = futureRef.current.pop()
    if (next === undefined) return
    pastRef.current.push(stateRef.current)
    stampRef.current = 0
    commit(next)
  }, [commit])

  const reset = useCallback(() => {
    pastRef.current = []
    futureRef.current = []
    stampRef.current = 0
    setCounts({ past: 0, future: 0 })
  }, [])

  const history: History = {
    undo,
    redo,
    reset,
    canUndo: counts.past > 0,
    canRedo: counts.future > 0,
  }

  return [state, apply, history] as const
}
