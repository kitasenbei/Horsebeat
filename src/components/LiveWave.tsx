import { useState, useRef, type RefObject } from 'react'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import { useCanvas } from '../useCanvas'
import { curveSignature, sectionSignature } from '../draw'
import { applyCurve, type Curve } from '../curve'
import { sectionSpans, type Section } from '../timing'

type LiveWaveProps = {
  envelope: Float32Array | null
  curve: Curve
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

// How together the quarters were, drawn as a colour: the spread between the
// tallest and the shortest of them, which is nought when they land on one
// another and one when a beat is full while another is empty. Green where they
// agree, red where they do not, by way of the hues between.
const AGREED_HUE = 120

// One wave a quarter of the bar, each in its own colour, and always the bar the
// playhead is standing in: the first is its first beat, the last its last. What
// is read in each is the playhead's own offset into a beat, carried across to
// the other three, so the four are the same place in four beats of one bar
// rather than four places. Four alike means the bar is sitting on the music,
// and one tall among three flat means it is not. The colour of a quarter never
// changes, so the first beat is red wherever the playhead stands.
const BEAT_COLOURS = ['error', 'warning', 'info', 'success'] as const

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

// A quarter is a stretch of the bar, not an instant in it: the block of rows
// the compiled view paints between one beat and the next. Read as the average
// of that stretch, so what the wave stands for is the same thing the eye reads
// off those rows, and moving the playhead within a quarter leaves it alone.
function readSpan(
  envelope: Float32Array | null,
  lut: Float32Array,
  from: number,
  to: number,
): number {
  if (!envelope || envelope.length === 0) return 0
  const last = envelope.length - 1
  const first = Math.min(last, Math.max(0, (from * envelope.length) | 0))
  const after = Math.min(envelope.length, Math.max(first + 1, (to * envelope.length) | 0))

  let total = 0
  for (let frame = first; frame < after; frame += 1) {
    const value = envelope[frame]
    if (!Number.isFinite(value)) continue
    total += lut[((value < 1 ? Math.max(0, value) : 1) * (LEVELS - 1) + 0.5) | 0]
  }

  return total / Math.max(1, after - first)
}

export default function LiveWave({
  envelope,
  curve,
  sections,
  duration,
  position,
  positionRef,
  playing,
}: LiveWaveProps) {
  const theme = useTheme()
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

      const into = beat > 0 ? at - span.start : 0
      const bar = beat * beats
      const opens = beat > 0 ? span.start + Math.floor(into / bar) * bar : at

      context.lineWidth = 1.5
      context.lineJoin = 'round'

      // drawn back to front, so the quarter the playhead is standing in is the
      // one on top rather than the one buried
      const standing = beat > 0 ? Math.floor((at - opens) / beat) : 0
      const shares: number[] = []
      for (let step = beats - 1; step >= 0; step -= 1) {
        const index = (standing + step) % beats
        const from = opens + beat * index
        // past the end there is nothing to read, and drawing it would repeat
        // the last frames of the track as though they were a beat
        if (from > 1) continue
        const share = readSpan(envelope, lutRef.current.lut, from, Math.min(1, from + beat))
        shares.push(share)
        const colour = BEAT_COLOURS[index % BEAT_COLOURS.length]
        context.strokeStyle = theme.palette[colour].main
        wave(share)
      }

      const rows = pastRef.current
      if (shares.length > 1) {
        const spread = Math.max(...shares) - Math.min(...shares)
        rows.unshift(Math.max(0, 1 - spread))
      }
      const kept = Math.max(1, Math.ceil(width / POINT))
      if (rows.length > kept) rows.length = kept

      for (let row = 0; row < rows.length; row += 1) {
        context.fillStyle = `hsl(${AGREED_HUE * rows[row]} 70% 45%)`
        context.fillRect(width - (row + 1) * POINT, height - STRIPE, POINT, STRIPE)
      }
    },
    playing,
    `${position}|${reading}|${envelope?.length}|${curveSignature(curve)}|${sectionSignature(sections)}`,
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
