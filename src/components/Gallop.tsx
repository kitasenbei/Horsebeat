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

// How long each frame is held, in slots. The horse is off the ground for three
// of the six: the first has it at full stretch, the third reaching with all
// four feet clear, and the fourth with the hooves folded up under the belly,
// which is the other way a horse flies. Those three are held while the frames
// that carry weight go by in one slot each, so seven beats in ten the horse is
// in the air.
const HOLD = [3, 1, 2, 2, 1, 1]

// The stride written out slot by slot, beginning with the frame that drives the
// hind legs into the ground — the moment with the weight behind it. That frame
// was measured rather than guessed, by how low each half of the horse reaches:
// the hind quarters bottom out in the sixth while the forelegs are still six
// pixels clear, and it is the second frame that plants a front hoof. Starting
// the cycle there puts the sixth under the beat, which is what gives the beat
// its shove.
const CYCLE = [5, 0, 1, 2, 3, 4].flatMap((frame) => Array<number>(HOLD[frame]).fill(frame))
const WIDTH = 56
const HEIGHT = 38

// Four of them, each a little way into the stride the one in front of it is
// taking, so the group reads as a group rather than as one horse drawn four
// times. The last is the leader: it runs on the beat, sits furthest right and
// stands clearest, and the rest trail behind it.
const HERD = [
  { at: 0, lead: 0.31, high: 3, faded: 0.45 },
  { at: 21, lead: 0.62, high: 0, faded: 0.6 },
  { at: 43, lead: 0.17, high: 4, faded: 0.78 },
  { at: 66, lead: 0, high: 1, faded: 1 },
]
// How far they run, kept apart from how far apart they run. The two were one
// number, so giving them more ground to cover also pulled the herd apart into
// four horses on their own errands.
const RUN = 428
const TALL = HEIGHT + 5

// The horse runs to the left, so it leaves by the left and comes back at the
// right, and because it is the head that is furthest left it is the head that
// arrives first. A lap is the strip plus a whole horse, so it is fully gone
// before it is back.
const LAP = RUN + WIDTH

// The last of them is the one the bar is counted from: on the downbeat it sits
// flush against the right edge, and four beats later it has just cleared the
// left. The others are placed behind it and cross a little after.
const TRAILS = HERD[HERD.length - 1].at

// A lap to the bar. The herd crosses, leaves, and is back where it started on
// the next downbeat, so where a horse stands is as much a reading of the music
// as which frame it is showing.
const BEATS_A_LAP = 4

// What that leaves for a stride to carry: near enough its own length, which is
// what keeps the feet looking like they are driving the horse rather than
// sliding under it.
const CARRIES = LAP / BEATS_A_LAP

// How far in from each end a horse is faded out, so one leaving or arriving
// thins away instead of being cut off against a straight edge.
const HAZE = 18

// The tempo the herd stands at as it is drawn. Faster music opens the gaps and
// slower music closes them: a horse at speed leaves the one behind it further
// back, and a group running hard strings out. The spacing is read off the
// section the playhead is in, so it changes with the music rather than once.
const EVEN_BPM = 150
const SPREAD_LEAST = 0.45
const SPREAD_MOST = 2.6

// Bent rather than straight, so the gaps answer the tempo by more than the
// tempo moved: a tenth over is a sixth wider, and the far ends of the range
// read as a different herd rather than the same one shifted a little.
const SPREAD_BEND = 1.6

function spreadOf(bpm: number): number {
  if (!(bpm > 0)) return 1
  const opened = (bpm / EVEN_BPM) ** SPREAD_BEND
  return Math.min(SPREAD_MOST, Math.max(SPREAD_LEAST, opened))
}

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

    const place = (horse: HTMLElement, index: number, stride: number, spread: number) => {
      const round = (((stride + HERD[index].lead) % 1) + 1) % 1
      const step = CYCLE[Math.floor(round * CYCLE.length)]
      horse.style.backgroundPositionX = `${-step * WIDTH}px`

      const gone = RUN - (TRAILS - HERD[index].at) * spread - stride * CARRIES
      horse.style.transform = `translateX(${(((gone % LAP) + LAP) % LAP) - WIDTH}px)`
    }

    const resting = spreadOf(spans[0]?.section.bpm ?? 0)
    const park = () => horses.forEach((horse, index) => place(horse, index, 0, resting))

    if (!playing || spans.length === 0) {
      park()
      return
    }

    let frame = requestAnimationFrame(function tick() {
      const at = positionRef.current
      const span = spans.find((item) => at >= item.start && at <= item.end) ?? spans[0]
      const beats = span.beat > 0 ? (at - span.start) / span.beat : 0
      const stride = beats * STRIDES_A_BEAT

      const spread = spreadOf(span.section.bpm)

      for (let index = 0; index < horses.length; index += 1) {
        place(horses[index], index, stride, spread)
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
      sx={{
        position: 'relative',
        overflow: 'hidden',
        width: RUN,
        height: TALL,
        mr: 1,
        flex: '0 0 auto',
        // the horse itself is faded rather than covered by something white, so
        // the ends read the same whatever the bar behind them is painted
        maskImage: `linear-gradient(to right, transparent, #000 ${HAZE}px, #000 calc(100% - ${HAZE}px), transparent)`,
        WebkitMaskImage: `linear-gradient(to right, transparent, #000 ${HAZE}px, #000 calc(100% - ${HAZE}px), transparent)`,
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
