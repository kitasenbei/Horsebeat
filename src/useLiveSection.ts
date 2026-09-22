import { useEffect, useState, type RefObject } from 'react'
import { sectionSpans, type Section } from './timing'
import { subscribeLiveSections } from './liveSections'

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
    // the object itself, not its id: a drag replaces the section's object
    // with one holding the new tempo or offset, and a ruler showing the old
    // one under the same id is a ruler that stopped following
    const look = () => setLive((current) => {
      const next = at(positionRef.current)
      return current === next ? current : next
    })
    look()
    const timer = window.setInterval(look, POLL_MS)
    // and at once when a drag moves the sections, rather than at the next poll
    const unsubscribe = subscribeLiveSections(look)
    return () => {
      window.clearInterval(timer)
      unsubscribe()
    }
  })

  return playing ? live : at(position)
}
