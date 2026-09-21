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

// One stride, six frames. The gif holds the same stride four times over, which
// is worth knowing: read as twenty-four it runs at a quarter the rate and never
// lands anywhere in particular.
const FRAMES = 6

// Which frame plants the leading hoof. Measured rather than guessed: the
// silhouette reaches lowest in this one, and rises eight pixels clear of the
// ground two frames later. Putting it under the beat is what makes a footfall
// and a beat the same moment.
const STRIKE = 1 / FRAMES
const WIDTH = 56
const HEIGHT = 38

// Four of them, each a little way into the stride the one in front of it is
// taking, so the group reads as a group rather than as one horse drawn four
// times. The last is the leader: it runs on the beat, sits furthest right and
// stands clearest, and the rest trail behind it.
const HERD = [
  { at: 0, lead: 0.31, high: 3, faded: 0.45 },
  { at: 20, lead: 0.62, high: 0, faded: 0.6 },
  { at: 40, lead: 0.17, high: 4, faded: 0.78 },
  { at: 62, lead: 0, high: 1, faded: 1 },
]
const SPREAD = HERD[HERD.length - 1].at + WIDTH
const TALL = HEIGHT + 5

// A stride to the beat, so every beat is a hoof landing.
const STRIDES_A_BEAT = 1

// Above this beat rate the stride is tied to every second beat instead, and
// then every fourth: the gait stays a gait at the fast end of the music while
// staying in step with it.
const MOST_A_MINUTE = 170

function beatsAStride(bpm: number): number {
  let beats = 1
  while (bpm / beats > MOST_A_MINUTE && beats < 8) beats *= 2
  return beats
}

export default function Gallop({ sections, duration, positionRef, playing }: GallopProps) {
  const herdRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = herdRef.current
    if (!node) return

    const horses = Array.from(node.children) as HTMLElement[]
    const spans = sectionSpans(sections, duration)
    const park = () => {
      horses.forEach((horse, index) => {
        const step = Math.floor((HERD[index].lead + STRIKE) * FRAMES) % FRAMES
        horse.style.backgroundPositionX = `${-step * WIDTH}px`
      })
    }

    if (!playing || spans.length === 0) {
      park()
      return
    }

    let frame = requestAnimationFrame(function tick() {
      const at = positionRef.current
      const span = spans.find((item) => at >= item.start && at <= item.end) ?? spans[0]
      const beats = span.beat > 0 ? (at - span.start) / span.beat : 0
      const stride = (beats / beatsAStride(60000 / span.beat)) * STRIDES_A_BEAT

      for (let index = 0; index < horses.length; index += 1) {
        const round = stride + HERD[index].lead + STRIKE
        const step = Math.floor((((round % 1) + 1) % 1) * FRAMES)
        horses[index].style.backgroundPositionX = `${-step * WIDTH}px`
      }

      frame = requestAnimationFrame(tick)
    })

    return () => {
      cancelAnimationFrame(frame)
      park()
    }
  }, [playing, sections, duration, positionRef])

  return (
    <Box
      ref={herdRef}
      aria-hidden
      sx={{ position: 'relative', width: SPREAD, height: TALL, mr: 1, flex: '0 0 auto' }}
    >
      {HERD.map((horse, index) => (
        <Box
          key={horse.at}
          sx={{
            position: 'absolute',
            left: horse.at,
            top: horse.high,
            zIndex: index,
            width: WIDTH,
            height: HEIGHT,
            opacity: horse.faded,
            backgroundImage: `url(${gallop})`,
            backgroundSize: `${FRAMES * WIDTH}px ${HEIGHT}px`,
            backgroundRepeat: 'no-repeat',
            backgroundPositionX: '0px',
            willChange: 'background-position',
          }}
        />
      ))}
    </Box>
  )
}
