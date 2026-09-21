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

// What a gallop wants to look like, in strides a minute. A horse at full pelt
// is nearer 150, but a sprite reads slow at its true rate, and this is the
// speed the gait looks like it means.
const WANTS_A_MINUTE = 200

// Strides to the beat, always a doubling or a halving so that a hoof lands on
// the beat whichever way it goes: at two, one lands on the beat and one
// between; at a half, every other beat. The one chosen is whichever puts the
// gallop nearest the speed it wants to run at.
const RATIOS = [0.5, 1, 2, 4]

function stridesABeat(bpm: number): number {
  let best = RATIOS[0]
  let closest = Infinity
  for (const ratio of RATIOS) {
    const off = Math.abs(Math.log((bpm * ratio) / WANTS_A_MINUTE))
    if (off < closest) {
      closest = off
      best = ratio
    }
  }
  return best
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
      const stride = beats * stridesABeat(60000 / span.beat)

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
