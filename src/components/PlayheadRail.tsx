import { useEffect, useRef, type RefObject } from 'react'
import Box from '@mui/material/Box'
import { alpha, useTheme } from '@mui/material/styles'
import { drawPlayheadHandle } from '../draw'
import { useCanvas } from '../useCanvas'
import { useRafCallback } from '../useRafCallback'
import type { Range } from '../range'

type PlayheadRailProps = {
  position: number
  positionRef: RefObject<number>
  playing: boolean
  enabled: boolean
  onSeek: (position: number) => void
  range?: Range
}

export const RAIL_HEIGHT = 14
const WHEEL_STEP = 0.02

const FULL: Range = { start: 0, end: 1 }

export default function PlayheadRail({
  position,
  positionRef,
  playing,
  enabled,
  onSeek,
  range = FULL,
}: PlayheadRailProps) {
  const draggingRef = useRef(false)
  const applySeek = useRafCallback(onSeek)
  const theme = useTheme()

  const canvasRef = useCanvas((context, width, height) => {
    if (!enabled) return
    drawPlayheadHandle(context, positionRef.current, range, width, height, theme.palette.error.main)
  }, playing, `${range.start}|${range.end}|${position}|${enabled}`)

  const positionAt = (clientX: number) => {
    const canvas = canvasRef.current
    if (!canvas) return 0
    const bounds = canvas.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width))
    return range.start + ratio * (range.end - range.start)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !enabled) return

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const span = range.end - range.start
      const delta = event.deltaX !== 0 ? event.deltaX : event.deltaY
      onSeek(positionRef.current + (delta / 100) * span * WHEEL_STEP)
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [canvasRef, enabled, onSeek, positionRef, range.start, range.end])

  const begin = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!enabled || event.button !== 0) return
    draggingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    onSeek(positionAt(event.clientX))
  }

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return
    applySeek(positionAt(event.clientX))
  }

  const end = (event: React.PointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <Box
      component="canvas"
      ref={canvasRef}
      data-trace="PlayheadRail"
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
        bgcolor: alpha(theme.palette.text.primary, 0.07),
        borderRadius: 0.5,
        cursor: enabled ? 'ew-resize' : 'default',
      }}
    />
  )
}
