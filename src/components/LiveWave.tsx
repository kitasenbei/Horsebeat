import { useRef, type RefObject } from 'react'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import { useCanvas } from '../useCanvas'

type LiveWaveProps = {
  envelope: Float32Array | null
  position: number
  positionRef: RefObject<number>
  playing: boolean
}

const TALL = 64

// The wave is counted in half turns rather than whole ones, and in whole
// numbers of them, which is what pins both ends to the middle: a half turn
// starts and finishes level whatever else it does in between. The value picks
// how many, so a loud moment is a tall tight wave and a quiet one a low slack
// one, tied down at the left and the right either way.
const HALVES_QUIET = 4
const HALVES_LOUD = 28

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

// The frames just gone, oldest first, and how solid each is drawn. Written out
// rather than stepped evenly: the freshest ghost sits close under the live wave
// and the rest drop away quickly, so the trail reads as a direction of travel
// instead of five equal lines. The length of the list is the length of the
// trail.
const GHOST_FADES = [0.07, 0.13, 0.24, 0.44, 0.8]

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

export default function LiveWave({ envelope, position, positionRef, playing }: LiveWaveProps) {
  const theme = useTheme()
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

      const wave = (share: number) => {
        const reach = (middle - EDGE) * share
        const halves = Math.round(HALVES_QUIET + (HALVES_LOUD - HALVES_QUIET) * share)

        context.beginPath()
        for (let x = 0; x <= width; x += 1) {
          const turn = (x / width) * halves * Math.PI
          const y = middle - Math.sin(turn) * reach
          if (x === 0) context.moveTo(x, y)
          else context.lineTo(x, y)
        }
        context.stroke()
      }

      const value = readAt(envelope, positionRef.current)
      const share = Math.min(1, value / ceilingRef.current)
      const past = pastRef.current

      context.strokeStyle = theme.palette.primary.main
      context.lineWidth = 1.5
      context.lineJoin = 'round'

      // oldest first, so the live wave is drawn over its own trail rather than
      // under it
      const first = GHOST_FADES.length - past.length
      for (let index = 0; index < past.length; index += 1) {
        context.globalAlpha = GHOST_FADES[first + index]
        wave(past[index])
      }

      context.globalAlpha = 1
      wave(share)

      past.push(share)
      if (past.length > GHOST_FADES.length) past.shift()
    },
    playing,
    `${position}|${envelope?.length}`,
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
