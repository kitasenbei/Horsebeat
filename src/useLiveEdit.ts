import { useRef, useState } from 'react'

const COMMIT_MS = 50

// A drag that writes to app state on every frame re-renders the whole tree, and
// on a file with hundreds of sections that is the lag. The surface being
// dragged keeps its own copy and repaints at frame rate; the app hears about it
// at COMMIT_MS, and exactly once more when the drag ends.
export function useLiveEdit<T>(value: T, onChange: (next: T) => void) {
  const [preview, setPreview] = useState<T | null>(null)
  const stampRef = useRef(0)
  const pendingRef = useRef<T | null>(null)

  const edit = (next: T) => {
    setPreview(next)
    pendingRef.current = next

    const now = performance.now()
    if (now - stampRef.current < COMMIT_MS) return

    stampRef.current = now
    pendingRef.current = null
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
