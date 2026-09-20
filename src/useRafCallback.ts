import { useCallback, useEffect, useRef } from 'react'

export function useRafCallback<T extends unknown[]>(callback: (...args: T) => void) {
  const callbackRef = useRef(callback)
  const argsRef = useRef<T | null>(null)
  const frameRef = useRef(0)

  useEffect(() => {
    callbackRef.current = callback
  })

  useEffect(() => () => cancelAnimationFrame(frameRef.current), [])

  return useCallback((...args: T) => {
    argsRef.current = args
    if (frameRef.current) return

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0
      const pending = argsRef.current
      if (pending) callbackRef.current(...pending)
    })
  }, [])
}
