import { useState, useRef, type RefObject } from 'react'
import Box from '@mui/material/Box'
import { useCanvas } from '../useCanvas'
import { curveSignature, laneColor, sectionSignature } from '../draw'
import { applyCurve, type Curve } from '../curve'
import { sectionSpans, type Section } from '../timing'
import { useLiveSectionsValue } from '../liveSections'

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

// a point every so many pixels along a wave: the curve between two is well
// under a stroke's width off a sine, and a frame strokes four waves
const WAVE_STEP = 3


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
  sections: givenSections,
  duration,
  position,
  positionRef,
  playing,
}: LiveWaveProps) {
  const sections = useLiveSectionsValue(givenSections)
  const [reading, setReading] = useState<Reading>('amplitude')
  const lutRef = useRef({ signature: '', lut: shapeLut(curve) })
  // a sine of each number of half turns, at unit height across the strip,
  // built once and placed each frame with a matrix: the geometry is the same
  // every frame, only how tall it stands changes
  const unitsRef = useRef(new Map<string, Path2D>())

  const canvasRef = useCanvas(
    (context, width, height) => {
      const plot = width
      const middle = height / 2

      const signature = curveSignature(curve)
      if (lutRef.current.signature !== signature) {
        lutRef.current = { signature, lut: shapeLut(curve) }
      }

      const unitWave = (halves: number) => {
        const name = `${halves}|${Math.round(plot)}`
        const held = unitsRef.current.get(name)
        if (held) return held

        const path = new Path2D()
        for (let x = 0; x <= plot; x += WAVE_STEP) {
          const y = -Math.sin((x / plot) * halves * Math.PI)
          if (x === 0) path.moveTo(x, y)
          else path.lineTo(x, y)
        }
        if (plot % WAVE_STEP !== 0) path.lineTo(plot, -Math.sin(halves * Math.PI))
        unitsRef.current.set(name, path)
        return path
      }

      const wave = (share: number) => {
        const full = middle - EDGE
        const reach = reading === 'period' ? full * STEADY_REACH : full * share
        const halves =
          reading === 'period'
            ? Math.round(HALVES_QUIET + (HALVES_LOUD - HALVES_QUIET) * share)
            : HALVES

        // the unit wave stretched to its height on the way into the path, so
        // the stroke itself stays a stroke and is not stretched with it
        const placed = new Path2D()
        placed.addPath(unitWave(halves), new DOMMatrix([1, 0, 0, reach, 0, middle]))
        context.stroke(placed)
      }

      const at = positionRef.current
      const spans = sectionSpans(sections, duration)
      const span = spans.find((item) => at >= item.start && at <= item.end) ?? spans[0]
      const beat = span && span.beat > 0 ? span.beat : 0
      const beats = beat > 0 ? Math.min(MOST_BEATS, Math.max(1, span.section.meter)) : 1

      const bar = beat * beats

      context.lineWidth = 1.5
      // the joins are between segments a few pixels long and nearly in line,
      // so a bevel is what a round join would look like without the arc the
      // rasteriser draws at every one of them
      context.lineJoin = 'bevel'

      // drawn back to front, so the bar the playhead is standing in is the one
      // on top rather than the one buried
      for (let back = BARS_BACK - 1; back >= 0; back -= 1) {
        const earlier = at - bar * back
        // before the section began there is no bar to compare with, and the
        // frame that sits there belongs to different music
        if (bar <= 0 ? back > 0 : earlier < span.start) continue
        const share = readAt(envelope, lutRef.current.lut, earlier)
        context.strokeStyle = laneColor(share, colormap)
        wave(share)
      }

    },
    playing,
    `${position}|${reading}|${colormap}|${envelope?.length}|${curveSignature(curve)}|${sectionSignature(sections)}`,
  )

  return (
    <Box
      component="canvas"
      ref={canvasRef}
      data-trace="LiveWave"
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
