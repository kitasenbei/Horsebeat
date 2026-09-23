import { useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import SsidChartIcon from '@mui/icons-material/SsidChart'
import CompressIcon from '@mui/icons-material/Compress'
import FilterAltIcon from '@mui/icons-material/FilterAlt'
import BoltIcon from '@mui/icons-material/Bolt'
import TonalityIcon from '@mui/icons-material/Tonality'
import ContrastIcon from '@mui/icons-material/Contrast'
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule'
import { useTheme } from '@mui/material/styles'
import { useCanvas } from '../useCanvas'
import { useRafCallback } from '../useRafCallback'
import { measure, tick } from '../trace'
import { FLOOR_DB } from '../audio'
import { curveSignature } from '../draw'
import {
  applyCurve,
  CURVE_PRESETS,
  DEFAULT_CURVE,
  MAX_POINTS,
  MIN_GAP,
  MIN_SPREAD,
  sortPoints,
  type Curve,
} from '../curve'

type CurvePanelProps = {
  curve: Curve
  // the track as levels, drawn behind the curve so the chart shows where the
  // music sits on the axis the points are placed on
  levels: Float32Array | null
  onCurveChange: (curve: Curve) => void
  onClose?: () => void
  embedded?: boolean
}

// a drag on a point: which one, and where the pointer was last, so a shift
// drag can be read as a sideways distance
type Drag = {
  index: number
  lastX: number
}

type Move = {
  pointerX: number
  pointerY: number
  left: number
  top: number
}

const PRESETS = [
  { curve: CURVE_PRESETS.linear, title: 'Linear', icon: <ShowChartIcon fontSize="small" /> },
  { curve: CURVE_PRESETS.lift, title: 'Lift quiet detail', icon: <TrendingUpIcon fontSize="small" /> },
  { curve: CURVE_PRESETS.contrast, title: 'Contrast', icon: <SsidChartIcon fontSize="small" /> },
  { curve: CURVE_PRESETS.tame, title: 'Tame loud parts', icon: <CompressIcon fontSize="small" /> },
  { curve: CURVE_PRESETS.gate, title: 'Gate the floor', icon: <FilterAltIcon fontSize="small" /> },
  { curve: CURVE_PRESETS.peaks, title: 'Peaks only', icon: <BoltIcon fontSize="small" /> },
  { curve: CURVE_PRESETS.flatten, title: 'Flatten', icon: <TonalityIcon fontSize="small" /> },
  { curve: CURVE_PRESETS.hard, title: 'Hard threshold', icon: <ContrastIcon fontSize="small" /> },
  { curve: CURVE_PRESETS.flat, title: 'Flat', icon: <HorizontalRuleIcon fontSize="small" /> },
]

const CHART_HEIGHT = 170
const PANEL_WIDTH = 280
const GRAB = 12
const POINT_RADIUS = 5
// pixels of shift drag from no spread to full
const SPREAD_DRAG = 120
// the x axis is marked every twenty decibels, the y axis every quarter
const DB_STEP = 20
const BUCKETS = 64
const LABEL_INSET = 4

// how much of the track sits at each level, tallest bucket at one
function histogram(levels: Float32Array | null): Float32Array {
  const counts = new Float32Array(BUCKETS)
  if (!levels) return counts
  for (let at = 0; at < levels.length; at += 1) {
    const bucket = Math.min(BUCKETS - 1, (levels[at] * BUCKETS) | 0)
    counts[bucket] += 1
  }
  let most = 0
  for (let bucket = 0; bucket < BUCKETS; bucket += 1) if (counts[bucket] > most) most = counts[bucket]
  if (most > 0) for (let bucket = 0; bucket < BUCKETS; bucket += 1) counts[bucket] /= most
  return counts
}

export default function CurvePanel({
  curve,
  levels,
  onCurveChange,
  onClose,
  embedded = false,
}: CurvePanelProps) {
  const theme = useTheme()
  const moveRef = useRef<Move | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const [spot, setSpot] = useState({ left: 32, top: 96 })
  const applyCurveChange = useRafCallback(onCurveChange)
  const applySpot = useRafCallback(setSpot)
  const spread = useMemo(() => histogram(levels), [levels])
  const signature = curveSignature(curve)

  const canvasRef = useCanvas((context, width, height) => {
    context.fillStyle = theme.palette.text.disabled
    context.globalAlpha = 0.35
    const bucketWidth = width / BUCKETS
    for (let bucket = 0; bucket < BUCKETS; bucket += 1) {
      const tall = spread[bucket] * height
      if (tall > 0) context.fillRect(bucket * bucketWidth, height - tall, bucketWidth, tall)
    }
    context.globalAlpha = 1

    const dbSteps = -FLOOR_DB / DB_STEP
    context.strokeStyle = theme.palette.divider
    context.lineWidth = 1
    for (let step = 1; step < dbSteps; step += 1) {
      const column = Math.round((step / dbSteps) * width) + 0.5
      context.beginPath()
      context.moveTo(column, 0)
      context.lineTo(column, height)
      context.stroke()
    }
    for (let step = 1; step < 4; step += 1) {
      const row = Math.round((step / 4) * height) + 0.5
      context.beginPath()
      context.moveTo(0, row)
      context.lineTo(width, row)
      context.stroke()
    }

    context.fillStyle = theme.palette.text.secondary
    context.font = `11px ${theme.typography.fontFamily}`
    context.textBaseline = 'bottom'
    for (let step = 0; step <= dbSteps; step += 1) {
      const db = FLOOR_DB + step * DB_STEP
      const label = step === 0 ? `${db} dB` : step === dbSteps ? '0 dB' : `${db}`
      context.textAlign = step === 0 ? 'left' : step === dbSteps ? 'right' : 'center'
      const x = step === 0 ? LABEL_INSET : step === dbSteps ? width - LABEL_INSET : (step / dbSteps) * width
      context.fillText(label, x, height - LABEL_INSET)
    }
    context.textAlign = 'left'
    context.textBaseline = 'top'
    context.fillText('100 % drawn', LABEL_INSET, LABEL_INSET)

    context.strokeStyle = theme.palette.text.disabled
    context.setLineDash([3, 3])
    context.beginPath()
    context.moveTo(0, height)
    context.lineTo(width, 0)
    context.stroke()
    context.setLineDash([])

    context.strokeStyle = theme.palette.primary.main
    context.lineWidth = 2
    context.beginPath()
    for (let x = 0; x <= width; x += 1) {
      const y = height - applyCurve(x / width, curve) * height
      if (x === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    }
    context.stroke()

    context.fillStyle = theme.palette.primary.main
    for (const point of curve.points) {
      context.beginPath()
      context.arc(point.x * width, height - point.y * height, POINT_RADIUS, 0, Math.PI * 2)
      context.fill()
    }
  }, false, `${signature}|${levels?.length ?? 0}`)

  const spotAt = (event: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      y: 1 - Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
      width: bounds.width,
      height: bounds.height,
    }
  }

  const nearest = (x: number, y: number, width: number, height: number) => {
    let found = -1
    let best = GRAB
    curve.points.forEach((point, index) => {
      const distance = Math.hypot((point.x - x) * width, (point.y - y) * height)
      if (distance <= best) {
        best = distance
        found = index
      }
    })
    return found
  }

  const spreadTo = (index: number, by: number) => {
    const point = curve.points[index]
    const spread = Math.min(1, Math.max(MIN_SPREAD, (point.spread ?? 1) + by))
    applyCurveChange({
      points: curve.points.map((held, current) => (current === index ? { ...held, spread } : held)),
    })
  }

  const shapeTo = (index: number, x: number, y: number) => {
    const points = curve.points
    const isFirst = index === 0
    const isLast = index === points.length - 1
    const lower = isFirst ? 0 : points[index - 1].x + MIN_GAP
    const upper = isLast ? 1 : points[index + 1].x - MIN_GAP
    const nextX = isFirst || isLast ? points[index].x : Math.min(upper, Math.max(lower, x))

    applyCurveChange({
      points: points.map((point, current) =>
        current === index ? { ...point, x: nextX, y: Math.min(1, Math.max(0, y)) } : point,
      ),
    })
  }

  const grab = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y, width, height } = spotAt(event)
    const index = nearest(x, y, width, height)
    event.currentTarget.setPointerCapture(event.pointerId)

    if (index >= 0) {
      dragRef.current = { index, lastX: event.clientX }
      return
    }

    if (curve.points.length >= MAX_POINTS) return
    if (curve.points.some((point) => Math.abs(point.x - x) < MIN_GAP)) return
    const points = sortPoints([...curve.points, { x, y }])
    dragRef.current = {
      index: points.findIndex((point) => point.x === x && point.y === y),
      lastX: event.clientX,
    }
    onCurveChange({ points })
  }

  const shape = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (!drag) return
    measure('drag CurvePanel point', () => {
      // with shift held the sideways motion is the width of the point's bump,
      // not its place
      if (event.shiftKey) {
        spreadTo(drag.index, (event.clientX - drag.lastX) / SPREAD_DRAG)
      } else {
        const { x, y } = spotAt(event)
        shapeTo(drag.index, x, y)
      }
      drag.lastX = event.clientX
    })
  }

  const release = (event: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const remove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y, width, height } = spotAt(event)
    const index = nearest(x, y, width, height)
    if (index <= 0 || index >= curve.points.length - 1) return
    onCurveChange({ points: curve.points.filter((_, current) => current !== index) })
  }

  const startMove = (event: React.PointerEvent<HTMLDivElement>) => {
    moveRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      left: spot.left,
      top: spot.top,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const movePanel = (event: React.PointerEvent<HTMLDivElement>) => {
    const move = moveRef.current
    if (!move) return
    tick('drag CurvePanel window')
    applySpot({
      left: Math.max(0, move.left + (event.clientX - move.pointerX)),
      top: Math.max(0, move.top + (event.clientY - move.pointerY)),
    })
  }

  const endMove = (event: React.PointerEvent<HTMLDivElement>) => {
    moveRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <Paper
      elevation={embedded ? 0 : 6}
      sx={
        embedded
          ? { width: '100%', overflow: 'hidden', border: 1, borderColor: 'divider' }
          : {
              position: 'fixed',
              left: spot.left,
              top: spot.top,
              width: PANEL_WIDTH,
              zIndex: (current) => current.zIndex.modal,
              overflow: 'hidden',
            }
      }
    >
      <Box
        onPointerDown={embedded ? undefined : startMove}
        onPointerMove={embedded ? undefined : movePanel}
        onPointerUp={embedded ? undefined : endMove}
        onPointerCancel={embedded ? undefined : endMove}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.5,
          bgcolor: 'action.hover',
          cursor: embedded ? 'default' : 'move',
          touchAction: 'none',
        }}
      >
        {embedded ? null : <DragIndicatorIcon fontSize="small" sx={{ color: 'text.disabled' }} />}
        <Typography variant="caption" sx={{ flex: 1 }}>
          Amplitude curve
        </Typography>
        <IconButton
          size="small"
          aria-label="Reset amplitude curve"
          title="Reset"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onCurveChange(DEFAULT_CURVE)}
        >
          <RestartAltIcon fontSize="small" />
        </IconButton>
        {onClose ? (
          <IconButton
            size="small"
            aria-label="Close amplitude curve"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClose}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        ) : null}
      </Box>
      <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Box
          component="canvas"
          ref={canvasRef}
      data-trace="CurvePanel"
          onPointerDown={grab}
          onPointerMove={shape}
          onPointerUp={release}
          onPointerCancel={release}
          onDoubleClick={remove}
          onContextMenu={(event) => {
            event.preventDefault()
            remove(event)
          }}
          sx={{
            display: 'block',
            width: '100%',
            height: CHART_HEIGHT,
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            touchAction: 'none',
            cursor: 'crosshair',
          }}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.25 }}>
            {PRESETS.map((preset) => {
              const active = curveSignature(preset.curve) === signature
              return (
                <IconButton
                  key={preset.title}
                  size="small"
                  title={preset.title}
                  aria-label={preset.title}
                  aria-pressed={active}
                  color={active ? 'primary' : 'default'}
                  onClick={() => onCurveChange(preset.curve)}
                  sx={active ? { bgcolor: 'action.selected' } : undefined}
                >
                  {preset.icon}
                </IconButton>
              )
            })}
          </Box>
        </Box>
      </Box>
    </Paper>
  )
}
