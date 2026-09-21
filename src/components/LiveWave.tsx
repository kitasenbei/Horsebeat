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

// How many readings the trace holds. One is taken per frame, so on a sixty
// hertz screen this is the last six seconds; on a faster screen it is the same
// number of frames over less time, which is what a trace read against the
// playhead wants — it is a record of what was played, not a clock.
const KEPT = 360

const TALL = 64

// The envelope is deliberately left unclamped where it is measured, so a loud
// master runs past one. The trace is drawn against a ceiling a little above
// that instead of against one, which keeps the loudest moments inside the strip
// rather than flattened along its edge.
const CEILING = 1.4

const FILL = 0.18
const EDGE = 2

function readAt(envelope: Float32Array | null, at: number): number {
  if (!envelope || envelope.length === 0) return 0
  const index = Math.min(envelope.length - 1, Math.max(0, Math.round(at * envelope.length)))
  const value = envelope[index]
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

export default function LiveWave({ envelope, position, positionRef, playing }: LiveWaveProps) {
  const theme = useTheme()
  const traceRef = useRef(new Float32Array(KEPT))
  const writeRef = useRef(0)
  const sourceRef = useRef<Float32Array | null>(null)

  const canvasRef = useCanvas(
    (context, width, height) => {
      // a new track is a new trace: what the last one was doing says nothing
      // about this one, and left in place it draws as a cliff
      if (sourceRef.current !== envelope) {
        sourceRef.current = envelope
        traceRef.current.fill(0)
        writeRef.current = 0
      }

      const trace = traceRef.current
      trace[writeRef.current] = readAt(envelope, positionRef.current)
      writeRef.current = (writeRef.current + 1) % KEPT

      const middle = height / 2
      const reach = middle - EDGE

      context.strokeStyle = theme.palette.divider
      context.lineWidth = 1
      context.beginPath()
      context.moveTo(0, Math.round(middle) + 0.5)
      context.lineTo(width, Math.round(middle) + 0.5)
      context.stroke()

      // oldest reading at the left, the one under the playhead at the right, so
      // the trace runs the way the music does
      const above: number[] = []
      for (let step = 0; step < KEPT; step += 1) {
        const value = trace[(writeRef.current + step) % KEPT]
        above.push(Math.min(1, value / CEILING) * reach)
      }

      const xOf = (step: number) => (step / (KEPT - 1)) * width

      context.beginPath()
      context.moveTo(0, middle - above[0])
      for (let step = 1; step < KEPT; step += 1) context.lineTo(xOf(step), middle - above[step])
      for (let step = KEPT - 1; step >= 0; step -= 1) context.lineTo(xOf(step), middle + above[step])
      context.closePath()
      context.globalAlpha = FILL
      context.fillStyle = theme.palette.primary.main
      context.fill()
      context.globalAlpha = 1

      context.strokeStyle = theme.palette.primary.main
      context.lineWidth = 1.5
      context.lineJoin = 'round'
      for (const side of [-1, 1]) {
        context.beginPath()
        context.moveTo(0, middle + side * above[0])
        for (let step = 1; step < KEPT; step += 1) {
          context.lineTo(xOf(step), middle + side * above[step])
        }
        context.stroke()
      }

      // the newest reading marked in the colour the playhead is drawn in below,
      // so the dot and the line it came from read as the same place
      const newest = above[KEPT - 1]
      context.fillStyle = theme.palette.error.main
      context.beginPath()
      context.arc(width - EDGE, middle - newest, 2.5, 0, Math.PI * 2)
      context.fill()
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
