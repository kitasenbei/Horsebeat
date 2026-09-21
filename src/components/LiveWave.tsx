import { useState, useRef, type RefObject } from 'react'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import { useCanvas } from '../useCanvas'
import { sectionSignature } from '../draw'
import { sectionSpans, type Section } from '../timing'

type LiveWaveProps = {
  envelope: Float32Array | null
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

// What the strip counts as full, taken from the track itself rather than fixed.
// The envelope is left unclamped where it is measured, and where it lands
// depends on the master: a loud one runs past one while a quiet one peaks near
// a third of it. Against a fixed ceiling the quiet one would be a flat line for
// its whole length. The loud end is read as a high quantile so a single stray
// frame cannot set the scale, and it is floored so silence stays silent.
const LOUD_QUANTILE = 0.98
const QUIETEST = 0.05
const SAMPLED = 4096

const EDGE = 3

// The band down the right edge and the gap that keeps it off the wave. One row
// of it is one frame, newest at the top, so it holds as many frames as the
// strip is tall.
const STRIPE = 10
const GAP = 4

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

function ceilingOf(envelope: Float32Array | null): number {
  if (!envelope || envelope.length === 0) return 1
  const stride = Math.max(1, Math.floor(envelope.length / SAMPLED))
  const taken: number[] = []
  for (let index = 0; index < envelope.length; index += stride) {
    const value = envelope[index]
    if (Number.isFinite(value)) taken.push(Math.max(0, value))
  }
  if (taken.length === 0) return 1
  taken.sort((left, right) => left - right)
  const loud = taken[Math.min(taken.length - 1, Math.floor(taken.length * LOUD_QUANTILE))]
  return Math.max(QUIETEST, loud)
}

function readAt(envelope: Float32Array | null, at: number): number {
  if (!envelope || envelope.length === 0) return 0
  const index = Math.min(envelope.length - 1, Math.max(0, Math.round(at * envelope.length)))
  const value = envelope[index]
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

export default function LiveWave({
  envelope,
  sections,
  duration,
  position,
  positionRef,
  playing,
}: LiveWaveProps) {
  const theme = useTheme()
  const [reading, setReading] = useState<Reading>('amplitude')
  const sourceRef = useRef<Float32Array | null>(null)
  const ceilingRef = useRef(1)
  const pastRef = useRef<number[]>([])

  const canvasRef = useCanvas(
    (context, width, height) => {
      // measured once a track, not once a frame
      if (sourceRef.current !== envelope) {
        sourceRef.current = envelope
        ceilingRef.current = ceilingOf(envelope)
        pastRef.current = []
      }

      const middle = height / 2
      const plot = Math.max(1, width - STRIPE - GAP)

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
      const offset = beat > 0 ? into - Math.floor(into / beat) * beat : 0

      context.lineWidth = 1.5
      context.lineJoin = 'round'

      // drawn back to front, so the quarter the playhead is standing in is the
      // one on top rather than the one buried
      const standing = beat > 0 ? Math.floor((at - opens) / beat) : 0
      const shares: number[] = []
      for (let step = beats - 1; step >= 0; step -= 1) {
        const index = (standing + step) % beats
        const quarter = opens + beat * index + offset
        // past the end there is nothing to read, and drawing it would repeat
        // the last frame of the track as though it were a beat
        if (quarter > 1) continue
        const value = readAt(envelope, quarter)
        const share = Math.min(1, value / ceilingRef.current)
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
      const kept = Math.max(1, Math.round(height))
      if (rows.length > kept) rows.length = kept

      for (let row = 0; row < rows.length; row += 1) {
        context.fillStyle = `hsl(${AGREED_HUE * rows[row]} 70% 45%)`
        context.fillRect(width - STRIPE, row, STRIPE, 1)
      }
    },
    playing,
    `${position}|${reading}|${envelope?.length}|${sectionSignature(sections)}`,
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
