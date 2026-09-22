import { useEffect, useState, type RefObject } from 'react'
import { sectionSpans, type Section } from './timing'

const POLL_MS = 250

// The section under the playhead for a component that shows it in the DOM.
// Playing, the playhead is read off the ref a few times a second, and the
// component renders only when it has crossed into another section; paused,
// it is read from the app's own position, which moves on a seek and nothing
// else.
export function useLiveSection(
  sections: Section[],
  duration: number,
  position: number,
  positionRef: RefObject<number>,
  playing: boolean,
): Section | null {
  const at = (moment: number) =>
    sectionSpans(sections, duration).find((item) => moment >= item.start && moment <= item.end)
      ?.section ?? null

  const [live, setLive] = useState<Section | null>(null)

  useEffect(() => {
    if (!playing) return
    const look = () => setLive((current) => {
      const next = at(positionRef.current)
      return current?.id === next?.id ? current : next
    })
    look()
    const timer = window.setInterval(look, POLL_MS)
    return () => window.clearInterval(timer)
  })

  return playing ? live : at(position)
}
