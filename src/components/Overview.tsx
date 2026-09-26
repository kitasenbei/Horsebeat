import { useEffect, useRef, useState, type RefObject } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import { useTheme } from '@mui/material/styles'
import { curveSignature, drawPeaksAmplitude, drawPlayhead, drawWindow } from '../draw'
import { useCanvas } from '../useCanvas'
import { useRafCallback } from '../useRafCallback'
import { clampRange, MIN_SPAN, type Range } from '../range'
import type { Curve } from '../curve'
import { measure } from '../trace'
import { useLiveRangeEdit } from '../liveRange'

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
const ZOOM_RATE = 0.002
const GESTURE_END_MS = 140

export default function Overview({
  peaks,
  position,
  positionRef,
  playing,
  curve,
  range: givenRange,
  onRangeChange,
}: OverviewProps) {
  const dragRef = useRef<Drag | null>(null)
  // the window moves through the live store while it is dragged, and reaches
  // the app once the drag is over
  const [range, editRange, settleRange] = useLiveRangeEdit(givenRange, onRangeChange)
  const applyRange = useRafCallback(editRange)
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const settleTimer = useRef(0)
  const zoomRef = useRef({ range, editRange, settleRange })
  useEffect(() => {
    zoomRef.current = { range, editRange, settleRange }
  })

  // the wheel zooms the window about the moment under the pointer: over the
  // whole song, that moment is where the pointer is along the strip
  useEffect(() => {
    const node = wrapRef.current
    if (!node) return
    const onWheel = (event: WheelEvent) => {
      const { range: current, editRange: edit } = zoomRef.current
      const bounds = node.getBoundingClientRect()
      if (bounds.width === 0) return
      event.preventDefault()
      const anchor = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
      const span = current.end - current.start
      const ratio = Math.min(1, Math.max(0, (anchor - current.start) / Math.max(1e-9, span)))
      const next = Math.min(1, span * Math.exp(event.deltaY * ZOOM_RATE))
      edit(clampRange({ start: anchor - ratio * next, end: anchor + (1 - ratio) * next }))
      window.clearTimeout(settleTimer.current)
      settleTimer.current = window.setTimeout(() => zoomRef.current.settleRange(), GESTURE_END_MS)
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [])

  // the song and the window on one canvas, painted when either changes; the
  // playhead on another over it, painted every frame while playing
  const stillRef = useCanvas((context, width, height) => {
    if (!peaks) return
    drawPeaksAmplitude(context, peaks, FULL, width, height, theme.palette.primary.main, curve)
    drawWindow(context, range, width, height, theme.palette.primary.main)
  }, false, `${range.start}|${range.end}|${peaks?.length}|${curveSignature(curve)}`)

  const canvasRef = useCanvas((context, width, height) => {
    if (!peaks) return
    drawPlayhead(context, positionRef.current, FULL, width, height, theme.palette.error.main)
  }, playing, `${peaks?.length}|${position}`)

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
    measure('drag Overview window', () => {
      const at = positionAt(event.clientX)

      if (drag.mode === 'move') {
        const span = range.end - range.start
        applyRange(clampRange({ start: at - drag.grab, end: at - drag.grab + span }))
      } else if (drag.mode === 'start') {
        applyRange(clampRange({ start: Math.min(at, range.end - MIN_SPAN), end: range.end }))
      } else {
        applyRange(clampRange({ start: range.start, end: Math.max(at, range.start + MIN_SPAN) }))
      }
    })
  }

  const end = (event: React.PointerEvent<HTMLElement>) => {
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
    settleRange()
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
        bgcolor: theme.palette.primary.main,
        color: theme.palette.primary.contrastText,
        cursor: 'ew-resize',
        touchAction: 'none',
        '&:hover': { bgcolor: theme.palette.primary.dark },
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
        ref={stillRef}
        data-trace="Overview"
        sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
      <Box
        component="canvas"
        ref={canvasRef}
        data-trace="Overview playhead"
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        sx={{
          position: 'absolute',
          inset: 0,
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
