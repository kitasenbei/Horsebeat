import { useRef, useState, type RefObject } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import { yellow } from '@mui/material/colors'
import { useTheme } from '@mui/material/styles'
import { curveSignature, drawPeaksAmplitude, drawPlayhead, drawWindow } from '../draw'
import { useCanvas } from '../useCanvas'
import { useRafCallback } from '../useRafCallback'
import { clampRange, MIN_SPAN, type Range } from '../range'
import type { Curve } from '../curve'

type OverviewProps = {
  peaks: Float32Array | null
  position: number
  positionRef: RefObject<number>
  playing: boolean
  curve: Curve
  range: Range
  onRangeChange: (range: Range) => void
}

type Drag =
  | { mode: 'move'; grab: number }
  | { mode: 'start' }
  | { mode: 'end' }

const EDGE = 8
const FULL: Range = { start: 0, end: 1 }
const HANDLE = 22

export default function Overview({
  peaks,
  position,
  positionRef,
  playing,
  curve,
  range,
  onRangeChange,
}: OverviewProps) {
  const dragRef = useRef<Drag | null>(null)
  const applyRange = useRafCallback(onRangeChange)
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)

  const canvasRef = useCanvas((context, width, height) => {
    if (!peaks) return
    drawPeaksAmplitude(context, peaks, FULL, width, height, theme.palette.primary.main, curve)
    drawPlayhead(context, positionRef.current, FULL, width, height, theme.palette.error.main)
    drawWindow(context, range, width, height, yellow[700])
  }, playing, `${range.start}|${range.end}|${peaks?.length}|${hovered}|${position}|${curveSignature(curve)}`)

  const positionAt = (clientX: number) => {
    const canvas = canvasRef.current
    if (!canvas) return 0
    const bounds = canvas.getBoundingClientRect()
    return Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width))
  }

  const edgeSpan = () => EDGE / (canvasRef.current?.clientWidth ?? 1)

  const startDrag = (event: React.PointerEvent<HTMLElement>, drag: Drag) => {
    dragRef.current = drag
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const begin = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!peaks || event.button !== 0) return
    const at = positionAt(event.clientX)
    const span = range.end - range.start

    if (at >= range.start && at <= range.end) {
      startDrag(event, { mode: 'move', grab: at - range.start })
    } else {
      startDrag(event, { mode: 'move', grab: span / 2 })
      applyRange(clampRange({ start: at - span / 2, end: at + span / 2 }))
    }
  }

  const move = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const at = positionAt(event.clientX)

    if (drag.mode === 'move') {
      const span = range.end - range.start
      applyRange(clampRange({ start: at - drag.grab, end: at - drag.grab + span }))
    } else if (drag.mode === 'start') {
      applyRange(clampRange({ start: Math.min(at, range.end - MIN_SPAN), end: range.end }))
    } else {
      applyRange(clampRange({ start: range.start, end: Math.max(at, range.start + MIN_SPAN) }))
    }
  }

  const end = (event: React.PointerEvent<HTMLElement>) => {
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const track = (event: React.PointerEvent<HTMLElement>) => {
    if (!peaks || dragRef.current) return
    const at = positionAt(event.clientX)
    const edge = edgeSpan()
    setHovered(at >= range.start - edge && at <= range.end + edge)
  }

  const handle = (mode: 'start' | 'end', at: number) => (
    <IconButton
      key={mode}
      size="small"
      aria-label={mode === 'start' ? 'Resize window start' : 'Resize window end'}
      onPointerDown={(event) => {
        event.stopPropagation()
        startDrag(event, { mode })
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      sx={{
        position: 'absolute',
        top: '50%',
        left: `${at * 100}%`,
        transform: 'translate(-50%, -50%)',
        width: HANDLE,
        height: HANDLE,
        bgcolor: yellow[700],
        color: theme.palette.common.white,
        cursor: 'ew-resize',
        touchAction: 'none',
        '&:hover': { bgcolor: yellow[800] },
      }}
    >
      {mode === 'start' ? (
        <ArrowBackIcon sx={{ fontSize: 16 }} />
      ) : (
        <ArrowForwardIcon sx={{ fontSize: 16 }} />
      )}
    </IconButton>
  )

  return (
    <Box
      sx={{ position: 'relative', height: '100%' }}
      onPointerMove={track}
      onPointerLeave={() => {
        if (!dragRef.current) setHovered(false)
      }}
    >
      <Box
        component="canvas"
        ref={canvasRef}
      data-trace="Overview"
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        sx={{
          display: 'block',
          width: '100%',
          height: '100%',
          touchAction: 'none',
          cursor: peaks ? 'grab' : 'default',
        }}
      />
      {peaks && hovered ? [handle('start', range.start), handle('end', range.end)] : null}
    </Box>
  )
}
