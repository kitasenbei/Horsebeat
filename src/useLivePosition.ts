import { useEffect, useState, type RefObject } from 'react'

const POLL_MS = 250

// The playhead for a component that shows it in the DOM rather than on a
// canvas. Playing, it is read off the ref a few times a second and held here,
// so only this component re-renders for it; paused, it is the app's own
// position, which moves on a seek and nothing else.
export function useLivePosition(
  position: number,
  positionRef: RefObject<number>,
  playing: boolean,
): number {
  const [live, setLive] = useState(position)

  useEffect(() => {
    if (!playing) return
    setLive(positionRef.current)
    const timer = window.setInterval(() => {
      setLive((current) => (current === positionRef.current ? current : positionRef.current))
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [playing, positionRef])

  return playing ? live : position
}
