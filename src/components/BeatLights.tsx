import { useEffect, useRef, type RefObject } from 'react'
import Box from '@mui/material/Box'
import { sectionSpans, type Section } from '../timing'

type BeatLightsProps = {
  sections: Section[]
  duration: number
  positionRef: RefObject<number>
  playing: boolean
  color: string
}

// a square stands this much of the row it sits in, and is as wide as it is tall
const SHARE = '90%'
const GAP = 5
const IDLE = 0.15
// how fast a lit square falls back, in beats
const FADE = 7
// how far a square swells as its beat lands, and how fast it settles: the same
// pulse the name beside it makes
const PULSE = 0.35
const DECAY = 7
const DEFAULT_BEATS = 4

export default function BeatLights({
  sections,
  duration,
  positionRef,
  playing,
  color,
}: BeatLightsProps) {
  const lightsRef = useRef<HTMLDivElement>(null)

  // enough squares for the longest bar in the track, so a section in five or
  // six has one each without the row being rebuilt as the playhead crosses into
  // it. The ones a shorter bar does not need are hidden while it plays.
  const most = sections.reduce(
    (count, section) => Math.max(count, Math.round(section.meter)),
    DEFAULT_BEATS,
  )

  useEffect(() => {
    const node = lightsRef.current
    if (!node) return

    const squares = Array.from(node.children) as HTMLElement[]
    const spans = sectionSpans(sections, duration)
    const beatsOf = (index: number) =>
      Math.max(1, Math.round(sections[index]?.meter ?? DEFAULT_BEATS))

    const rest = () => {
      const beats = spans.length > 0 ? beatsOf(0) : DEFAULT_BEATS
      for (let at = 0; at < squares.length; at += 1) {
        squares[at].style.display = at < beats ? 'block' : 'none'
        squares[at].style.opacity = String(IDLE)
        squares[at].style.transform = 'scale(1)'
      }
    }

    if (!playing || spans.length === 0) {
      rest()
      return
    }

    let frame = requestAnimationFrame(function tick() {
      const at = positionRef.current
      const span = spans.find((item) => at >= item.start && at <= item.end) ?? spans[0]
      const beats = Math.max(1, Math.round(span.section.meter))
      const counted = span.beat > 0 ? (at - span.start) / span.beat : 0
      const lit = ((Math.floor(counted) % beats) + beats) % beats
      const since = ((counted % 1) + 1) % 1

      for (let index = 0; index < squares.length; index += 1) {
        squares[index].style.display = index < beats ? 'block' : 'none'
        squares[index].style.opacity = String(
          index === lit ? IDLE + (1 - IDLE) * Math.exp(-since * FADE) : IDLE,
        )
        squares[index].style.transform =
          index === lit ? `scale(${1 + PULSE * Math.exp(-since * DECAY)})` : 'scale(1)'
      }

      frame = requestAnimationFrame(tick)
    })

    return () => {
      cancelAnimationFrame(frame)
      rest()
    }
  }, [playing, sections, duration, positionRef])

  return (
    <Box
      ref={lightsRef}
      sx={{ display: 'flex', alignItems: 'center', alignSelf: 'stretch', gap: `${GAP}px`, pr: 1.5 }}
    >
      {Array.from({ length: most }, (_, index) => (
        <Box
          key={index}
          sx={{
            height: SHARE,
            aspectRatio: '1 / 1',
            borderRadius: '3px',
            bgcolor: color,
            opacity: IDLE,
            willChange: 'opacity, transform',
          }}
        />
      ))}
    </Box>
  )
}
