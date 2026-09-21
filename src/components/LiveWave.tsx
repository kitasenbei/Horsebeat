import { useRef, type RefObject } from 'react'
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
// starts and finishes level whatever it does in between. The count is fixed, so
// the value shows in the height and nowhere else.
const HALVES = 12

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

// One wave a beat, each in its own colour, the first being the beat the
// playhead is standing in and the rest the beats after it in the bar. A bar of
// four draws four. The grid says where those beats are, so the four heights are
// what the music is doing at the four places the grid claims a beat: four alike
// means the bar is sitting on the music, and one tall among three flat means it
// is not.
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
  const sourceRef = useRef<Float32Array | null>(null)
  const ceilingRef = useRef(1)

  const canvasRef = useCanvas(
    (context, width, height) => {
      // measured once a track, not once a frame
      if (sourceRef.current !== envelope) {
        sourceRef.current = envelope
        ceilingRef.current = ceilingOf(envelope)
      }

      const middle = height / 2

      const wave = (share: number) => {
        const reach = (middle - EDGE) * share

        context.beginPath()
        for (let x = 0; x <= width; x += 1) {
          const turn = (x / width) * HALVES * Math.PI
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

      context.lineWidth = 1.5
      context.lineJoin = 'round'

      // drawn back to front, so the beat the playhead is standing in is the one
      // on top rather than the one buried
      for (let index = beats - 1; index >= 0; index -= 1) {
        const ahead = at + beat * index
        // past the end there is nothing to read, and drawing it would repeat
        // the last frame of the track as though it were a beat
        if (ahead > 1) continue
        const value = readAt(envelope, ahead)
        const colour = BEAT_COLOURS[index % BEAT_COLOURS.length]
        context.strokeStyle = theme.palette[colour].main
        wave(Math.min(1, value / ceilingRef.current))
      }
    },
    playing,
    `${position}|${envelope?.length}|${sectionSignature(sections)}`,
  )

  return (
    <Box
      component="canvas"
      ref={canvasRef}
      sx={{
        display: 'block',
        width: '100%',
        height: TALL,
        flex: '0 0 auto',
        pointerEvents: 'none',
        borderLeft: 1,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    />
  )
}
