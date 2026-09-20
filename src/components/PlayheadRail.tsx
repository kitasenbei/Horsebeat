import { useRef } from 'react'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import { drawPlayheadHandle } from '../draw'
import { useCanvas } from '../useCanvas'
import type { Range } from '../range'

type PlayheadRailProps = {
  position: number
  enabled: boolean
  onSeek: (position: number) => void
  range?: Range
}

export const RAIL_HEIGHT = 14

const FULL: Range = { start: 0, end: 1 }

export default function PlayheadRail({
  position,
  enabled,
  onSeek,
  range = FULL,
}: PlayheadRailProps) {
  const draggingRef = useRef(false)
  const theme = useTheme()

  const canvasRef = useCanvas((context, width, height) => {
    if (!enabled) return
    drawPlayheadHandle(context, position, range, width, height, theme.palette.error.main)
  })

  const positionAt = (clientX: number) => {
    const canvas = canvasRef.current
    if (!canvas) return 0
    const bounds = canvas.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width))
    return range.start + ratio * (range.end - range.start)
  }

  const begin = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!enabled) return
    draggingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    onSeek(positionAt(event.clientX))
  }

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return
    onSeek(positionAt(event.clientX))
  }

  const end = (event: React.PointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <Box
      component="canvas"
      ref={canvasRef}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      sx={{
        display: 'block',
        width: '100%',
        height: RAIL_HEIGHT,
        flex: '0 0 auto',
        touchAction: 'none',
        cursor: enabled ? 'ew-resize' : 'default',
      }}
    />
  )
}
