import type { RefObject } from 'react'
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

// The envelope is deliberately left unclamped where it is measured, so a loud
// master runs past one. The wave is drawn against a ceiling a little above that
// instead of against one, which keeps the loudest moments inside the strip
// rather than flattened along its edge.
const CEILING = 1.4

const EDGE = 3

function readAt(envelope: Float32Array | null, at: number): number {
  if (!envelope || envelope.length === 0) return 0
  const index = Math.min(envelope.length - 1, Math.max(0, Math.round(at * envelope.length)))
  const value = envelope[index]
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

export default function LiveWave({ envelope, position, positionRef, playing }: LiveWaveProps) {
  const theme = useTheme()

  const canvasRef = useCanvas(
    (context, width, height) => {
      const value = readAt(envelope, positionRef.current)
      const share = Math.min(1, value / CEILING)
      const middle = height / 2
      const reach = (middle - EDGE) * share
      const halves = Math.round(HALVES_QUIET + (HALVES_LOUD - HALVES_QUIET) * share)

      context.strokeStyle = theme.palette.primary.main
      context.lineWidth = 1.5
      context.lineJoin = 'round'
      context.beginPath()

      for (let x = 0; x <= width; x += 1) {
        const turn = (x / width) * halves * Math.PI
        const y = middle - Math.sin(turn) * reach
        if (x === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      }

      context.stroke()
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
