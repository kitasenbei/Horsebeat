import { useEffect, useRef, type RefObject } from 'react'
import Box from '@mui/material/Box'
import { sectionSpans, type Section } from '../timing'
import gallop from '../assets/gallop.png'

type GallopProps = {
  sections: Section[]
  duration: number
  positionRef: RefObject<number>
  playing: boolean
}

const FRAMES = 24
const WIDTH = 56
const HEIGHT = 38

// A horse at full gallop takes about two and a half strides a second. Tying one
// stride to one beat is right for most music and absurd for the fast end of it,
// so above this the stride is tied to every second beat instead, and then every
// fourth: the gait stays a gait while it stays in step with the music.
const MOST_A_MINUTE = 170

function beatsAStride(bpm: number): number {
  let beats = 1
  while (bpm / beats > MOST_A_MINUTE && beats < 8) beats *= 2
  return beats
}

export default function Gallop({ sections, duration, positionRef, playing }: GallopProps) {
  const horseRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = horseRef.current
    if (!node) return

    const spans = sectionSpans(sections, duration)
    const park = () => {
      node.style.backgroundPositionX = '0px'
    }

    if (!playing || spans.length === 0) {
      park()
      return
    }

    let frame = requestAnimationFrame(function tick() {
      const at = positionRef.current
      const span = spans.find((item) => at >= item.start && at <= item.end) ?? spans[0]
      const beats = span.beat > 0 ? (at - span.start) / span.beat : 0
      const stride = beats / beatsAStride(60000 / span.beat)
      const step = Math.floor((((stride % 1) + 1) % 1) * FRAMES)

      node.style.backgroundPositionX = `${-step * WIDTH}px`
      frame = requestAnimationFrame(tick)
    })

    return () => {
      cancelAnimationFrame(frame)
      park()
    }
  }, [playing, sections, duration, positionRef])

  return (
    <Box
      ref={horseRef}
      aria-hidden
      sx={{
        width: WIDTH,
        height: HEIGHT,
        mr: 1,
        flex: '0 0 auto',
        backgroundImage: `url(${gallop})`,
        backgroundSize: `${FRAMES * WIDTH}px ${HEIGHT}px`,
        backgroundRepeat: 'no-repeat',
        backgroundPositionX: '0px',
        willChange: 'background-position',
      }}
    />
  )
}
