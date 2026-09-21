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

// Which frame drives the hind legs into the ground — the moment with the weight
// behind it. Measured rather than guessed, by how low each half of the horse
// reaches in each frame: the hind quarters bottom out in the sixth while the
// forelegs are still six pixels clear, and it is the second frame that plants a
// front hoof. Putting the sixth under the beat is what gives the beat its
// shove.
const STRIKE = 5 / FRAMES
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

// How far a stride carries a horse. A shade under its own length, which is what
// stops the legs looking like they are sliding under a body going somewhere
// else.
const CARRIES = 44

// The horse runs to the left, so it leaves by the left and comes back at the
// right, and because it is the head that is furthest left it is the head that
// arrives first. A lap is the strip plus a whole horse, so it is fully gone
// before it is back.
const LAP = SPREAD + WIDTH

// One stride to the beat, and only ever that: each beat is the hind legs going
// into the ground and nothing comes between. Two strides to a beat smash twice
// as often and four smash four times, and a landing that happens on the beat
// and also everywhere else is a landing you cannot see.
const STRIDES_A_BEAT = 1

export default function Gallop({ sections, duration, positionRef, playing }: GallopProps) {
  const herdRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = herdRef.current
    if (!node) return

    const horses = Array.from(node.children) as HTMLElement[]
    const spans = sectionSpans(sections, duration)

    const place = (horse: HTMLElement, index: number, stride: number) => {
      const round = stride + HERD[index].lead + STRIKE
      const step = Math.floor((((round % 1) + 1) % 1) * FRAMES)
      horse.style.backgroundPositionX = `${-step * WIDTH}px`

      const gone = HERD[index].at - stride * CARRIES
      horse.style.transform = `translateX(${(((gone % LAP) + LAP) % LAP) - WIDTH}px)`
    }

    const park = () => horses.forEach((horse, index) => place(horse, index, 0))

    if (!playing || spans.length === 0) {
      park()
      return
    }

    let frame = requestAnimationFrame(function tick() {
      const at = positionRef.current
      const span = spans.find((item) => at >= item.start && at <= item.end) ?? spans[0]
      const beats = span.beat > 0 ? (at - span.start) / span.beat : 0
      const stride = beats * STRIDES_A_BEAT

      for (let index = 0; index < horses.length; index += 1) place(horses[index], index, stride)

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
      sx={{
        position: 'relative',
        overflow: 'hidden',
        width: SPREAD,
        height: TALL,
        mr: 1,
        flex: '0 0 auto',
      }}
    >
      {HERD.map((horse, index) => (
        <Box
          key={horse.at}
          sx={{
            position: 'absolute',
            left: 0,
            top: horse.high,
            zIndex: index,
            width: WIDTH,
            height: HEIGHT,
            opacity: horse.faded,
            backgroundImage: `url(${gallop})`,
            backgroundSize: `${FRAMES * WIDTH}px ${HEIGHT}px`,
            backgroundRepeat: 'no-repeat',
            backgroundPositionX: '0px',
            willChange: 'background-position, transform',
          }}
        />
      ))}
    </Box>
  )
}
