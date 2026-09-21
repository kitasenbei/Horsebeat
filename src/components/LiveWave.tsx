import { useState, useRef, type RefObject } from 'react'
import Box from '@mui/material/Box'
import { useCanvas } from '../useCanvas'
import { curveSignature, laneColor, sectionSignature } from '../draw'
import { applyCurve, type Curve } from '../curve'
import { sectionSpans, type Section } from '../timing'

type LiveWaveProps = {
  envelope: Float32Array | null
  curve: Curve
  colormap: number
  sections: Section[]
  duration: number
  position: number
  positionRef: RefObject<number>
  playing: boolean
}

const TALL = 64

// The wave is counted in half turns rather than whole ones, and in a whole
// number of them, which is what pins both ends to the middle: a half turn
// starts and finishes level whatever it does in between.
//
// Which of the two the value is allowed to move is a click on the strip. Read
// as height the waves are easy to rank at a glance; read as period they are
// easier to tell apart where several land on the same height, which is what a
// bar sitting square on the music looks like. The one not being read is held
// at a fixed figure so nothing else moves with it.
const READINGS = ['amplitude', 'period'] as const
type Reading = (typeof READINGS)[number]

const HALVES = 12
const HALVES_QUIET = 4
const HALVES_LOUD = 28
const STEADY_REACH = 0.7

const EDGE = 3

// The band under the wave and the gap that keeps it off it. One column of it is
// one frame, newest at the right, so it runs the way time does. A column is
// several pixels across, which is what makes a single bad frame among good ones
// something you can see rather than a hairline; the width of the strip divided
// by it is how many frames are held.
const STRIPE = 10
const GAP = 4
const POINT = 16

// What the band reads is not the waves. A handful of readings taken at one spot
// in each bar cannot tell a good grid from a bad one: measured against a wrong
// tempo they scatter by about a third more than against the right one, which is
// nothing beside how much the music itself differs from bar to bar.
//
// So the band reads the whole bar. The last few bars are each sampled at the
// same set of places across their length, and the question asked of those
// numbers is how much of their variation is the shape of a bar — loud here,
// quiet there, the same in every bar — rather than the same place in the bar
// disagreeing from one bar to the next. A grid that holds puts most of the
// variation in the shape; a grid sliding against the music smears the shape
// away and leaves the disagreement.
//
// Measured at a known tempo and then at deliberately wrong ones, the reading
// falls away in step with the error and roughly halves by ten beats a minute
// out, which is the separation the spread of single readings never had:
//
//   right   0.338      1 out   0.316      2 out   0.291
//   5 out   0.198     10 out   0.158
//
// The band is green from where a holding grid sits and red by where a slipping
// one does.
const PLACES = 64
const HOLDS = 0.34
const SLIPS = 0.1
const AGREED_HUE = 120

// One wave a bar: the place the playhead stands in its own bar, and the same
// place in the bars before it. Quarters of one bar were the first try and they
// cannot answer the question, because a grid whose tempo is wrong drags all
// four of a bar's quarters along with it by nearly the same amount — four beats
// is too short a lever for the error to show. Bar to bar is the long lever, and
// it is the one the compiled view already draws: a column standing straight
// against columns leaning over.
//
// So four alike means this place in the music arrives where the grid says it
// will, bar after bar, and a fan means the grid is sliding against the music.
//
// A wave is painted the colour the compiled view paints that same value, which
// is the whole point of reading it from there: a quarter that shows red in the
// canvas is a red wave here. Colour pulls apart around the middle of the ramp
// where height barely moves, so two quarters a few hundredths apart are told
// apart by colour and their true distance is still in the height.


// How far back to look, and the ceiling on it. More bars is a longer lever and
// a clearer answer, up to the point where the music itself has moved on and the
// oldest bar is a different passage rather than the same one mistimed.
const BARS_BACK = 4

// Beyond this the strip is a thicket rather than a reading.
const MOST_BEATS = 8

// The amplitude curve as a table of the same size the compiled view uses, so a
// quarter is read through exactly the steps its pixels are painted through.
const LEVELS = 256

function shapeLut(curve: Curve): Float32Array {
  const lut = new Float32Array(LEVELS)
  for (let step = 0; step < LEVELS; step += 1) lut[step] = applyCurve(step / (LEVELS - 1), curve)
  return lut
}

// One row of the compiled view, arrived at the way that view arrives at it: the
// frame the position lands on, held at one, levelled and looked up. What is
// read is a moment, not a stretch, and which moment is the playhead's own way
// into a beat carried across to the same way into each of the other quarters.
function readAt(envelope: Float32Array | null, lut: Float32Array, at: number): number {
  if (!envelope || envelope.length === 0) return 0
  const frame = Math.min(envelope.length - 1, Math.max(0, (at * envelope.length) | 0))
  const value = envelope[frame]
  if (!Number.isFinite(value)) return 0
  return lut[((value < 1 ? Math.max(0, value) : 1) * (LEVELS - 1) + 0.5) | 0]
}

export default function LiveWave({
  envelope,
  curve,
  colormap,
  sections,
  duration,
  position,
  positionRef,
  playing,
}: LiveWaveProps) {
  const [reading, setReading] = useState<Reading>('amplitude')
  const sourceRef = useRef<Float32Array | null>(null)
  const pastRef = useRef<number[]>([])
  const lutRef = useRef({ signature: '', lut: shapeLut(curve) })

  const canvasRef = useCanvas(
    (context, width, height) => {
      // a new track is a new band: what the last one was doing says nothing
      // about this one
      if (sourceRef.current !== envelope) {
        sourceRef.current = envelope
        pastRef.current = []
      }

      const plot = width
      const middle = Math.max(1, height - STRIPE - GAP) / 2

      const signature = curveSignature(curve)
      if (lutRef.current.signature !== signature) {
        lutRef.current = { signature, lut: shapeLut(curve) }
      }

      const wave = (share: number) => {
        const full = middle - EDGE
        const reach = reading === 'period' ? full * STEADY_REACH : full * share
        const halves =
          reading === 'period'
            ? Math.round(HALVES_QUIET + (HALVES_LOUD - HALVES_QUIET) * share)
            : HALVES

        context.beginPath()
        for (let x = 0; x <= plot; x += 1) {
          const turn = (x / plot) * halves * Math.PI
          const y = middle - Math.sin(turn) * reach
          if (x === 0) context.moveTo(x, y)
          else context.lineTo(x, y)
        }
        context.stroke()
      }

      const at = positionRef.current
      const spans = sectionSpans(sections, duration)
      const span = spans.find((item) => at >= item.start && at <= item.end) ?? spans[0]
      const beat = span && span.beat > 0 ? span.beat : 0
      const beats = beat > 0 ? Math.min(MOST_BEATS, Math.max(1, span.section.meter)) : 1

      const bar = beat * beats
      const opens = bar > 0 ? span.start + Math.floor((at - span.start) / bar) * bar : at

      context.lineWidth = 1.5
      context.lineJoin = 'round'

      // drawn back to front, so the bar the playhead is standing in is the one
      // on top rather than the one buried
      const shares: number[] = []
      for (let back = BARS_BACK - 1; back >= 0; back -= 1) {
        const earlier = at - bar * back
        // before the section began there is no bar to compare with, and the
        // frame that sits there belongs to different music
        if (bar <= 0 ? back > 0 : earlier < span.start) continue
        const share = readAt(envelope, lutRef.current.lut, earlier)
        shares.push(share)
        context.strokeStyle = laneColor(share, colormap)
        wave(share)
      }

      const rows = pastRef.current
      if (bar > 0 && opens - bar * (BARS_BACK - 1) >= span.start && shares.length > 1) {
        const shape = new Float64Array(PLACES)
        let total = 0
        let squares = 0
        let counted = 0

        for (let place = 0; place < PLACES; place += 1) {
          const inside = (place / PLACES) * bar
          let sum = 0
          for (let back = 0; back < BARS_BACK; back += 1) {
            const value = readAt(envelope, lutRef.current.lut, opens - bar * back + inside)
            sum += value
            total += value
            squares += value * value
            counted += 1
          }
          shape[place] = sum / BARS_BACK
        }

        const grand = total / counted
        const spread = squares / counted - grand * grand
        let held = 0
        for (const value of shape) held += (value - grand) * (value - grand)
        const holding = spread > 0 ? held / PLACES / spread : 0
        rows.unshift(Math.min(1, Math.max(0, (holding - SLIPS) / (HOLDS - SLIPS))))
      }
      const kept = Math.max(1, Math.ceil(width / POINT))
      if (rows.length > kept) rows.length = kept

      for (let row = 0; row < rows.length; row += 1) {
        context.fillStyle = `hsl(${AGREED_HUE * rows[row]} 70% 45%)`
        context.fillRect(width - (row + 1) * POINT, height - STRIPE, POINT, STRIPE)
      }
    },
    playing,
    `${position}|${reading}|${colormap}|${envelope?.length}|${curveSignature(curve)}|${sectionSignature(sections)}`,
  )

  return (
    <Box
      component="canvas"
      ref={canvasRef}
      title={`Reading the value as ${reading}`}
      onClick={() =>
        setReading((current) => READINGS[(READINGS.indexOf(current) + 1) % READINGS.length])
      }
      sx={{
        display: 'block',
        width: '100%',
        height: TALL,
        flex: '0 0 auto',
        cursor: 'pointer',
        borderLeft: 1,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    />
  )
}
