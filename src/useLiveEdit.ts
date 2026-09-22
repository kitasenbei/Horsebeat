import { useRef, useState } from 'react'
import { tick } from './trace'

// How long the app can be left behind the surface being dragged. At nought the
// app hears about every edit as it happens, so the other views follow the
// gesture frame for frame; the surface still keeps its own copy so it repaints
// without waiting on the app, and says once more where it ended.
const COMMIT_MS = 0
export function useLiveEdit<T>(value: T, onChange: (next: T) => void) {
  const [preview, setPreview] = useState<T | null>(null)
  const stampRef = useRef(0)
  const pendingRef = useRef<T | null>(null)

  const edit = (next: T) => {
    tick('drag live edit')
    setPreview(next)
    pendingRef.current = next

    const now = performance.now()
    if (now - stampRef.current < COMMIT_MS) return

    stampRef.current = now
    pendingRef.current = null
    tick('drag commit to app')
    onChange(next)
  }

  const settle = () => {
    const pending = pendingRef.current
    pendingRef.current = null
    stampRef.current = 0
    if (pending) onChange(pending)
    setPreview(null)
  }

  return [preview ?? value, edit, settle] as const
}
