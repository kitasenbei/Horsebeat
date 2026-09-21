import { useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import SsidChartIcon from '@mui/icons-material/SsidChart'
import CompressIcon from '@mui/icons-material/Compress'
import FilterAltIcon from '@mui/icons-material/FilterAlt'
import BoltIcon from '@mui/icons-material/Bolt'
import TonalityIcon from '@mui/icons-material/Tonality'
import ContrastIcon from '@mui/icons-material/Contrast'
import Tooltip from '@mui/material/Tooltip'
import { useTheme } from '@mui/material/styles'
import { useCanvas } from '../useCanvas'
import { useRafCallback } from '../useRafCallback'
import {
  applyCurve,
  CURVE_PRESETS,
  DEFAULT_CURVE,
  MAX_POINTS,
  MIN_GAP,
  sortPoints,
  type Curve,
} from '../curve'

type CurvePanelProps = {
  curve: Curve
  onCurveChange: (curve: Curve) => void
  onClose?: () => void
  embedded?: boolean
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
]

const CHART_HEIGHT = 170
const PANEL_WIDTH = 250
const GRAB = 12
const POINT_RADIUS = 5

export default function CurvePanel({
  curve,
  onCurveChange,
  onClose,
  embedded = false,
}: CurvePanelProps) {
  const theme = useTheme()
  const moveRef = useRef<Move | null>(null)
  const pointRef = useRef<number | null>(null)
  const [spot, setSpot] = useState({ left: 32, top: 96 })
  const applyCurveChange = useRafCallback(onCurveChange)
  const applySpot = useRafCallback(setSpot)

  const canvasRef = useCanvas((context, width, height) => {
    context.strokeStyle = theme.palette.divider
    context.lineWidth = 1
    for (let step = 1; step < 4; step += 1) {
      const column = Math.round((step / 4) * width) + 0.5
      const row = Math.round((step / 4) * height) + 0.5
      context.beginPath()
      context.moveTo(column, 0)
      context.lineTo(column, height)
      context.moveTo(0, row)
      context.lineTo(width, row)
      context.stroke()
    }

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
  }, false, curve.points.map((point) => `${point.x}:${point.y}`).join(','))

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

  const shapeTo = (index: number, x: number, y: number) => {
    const points = curve.points
    const isFirst = index === 0
    const isLast = index === points.length - 1
    const lower = isFirst ? 0 : points[index - 1].x + MIN_GAP
    const upper = isLast ? 1 : points[index + 1].x - MIN_GAP
    const nextX = isFirst || isLast ? points[index].x : Math.min(upper, Math.max(lower, x))

    applyCurveChange({
      points: points.map((point, current) =>
        current === index ? { x: nextX, y: Math.min(1, Math.max(0, y)) } : point,
      ),
    })
  }

  const grab = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y, width, height } = spotAt(event)
    const index = nearest(x, y, width, height)
    event.currentTarget.setPointerCapture(event.pointerId)

    if (index >= 0) {
      pointRef.current = index
      return
    }

    if (curve.points.length >= MAX_POINTS) return
    if (curve.points.some((point) => Math.abs(point.x - x) < MIN_GAP)) return
    const points = sortPoints([...curve.points, { x, y }])
    pointRef.current = points.findIndex((point) => point.x === x && point.y === y)
    onCurveChange({ points })
  }

  const shape = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const index = pointRef.current
    if (index === null) return
    const { x, y } = spotAt(event)
    shapeTo(index, x, y)
  }

  const release = (event: React.PointerEvent<HTMLCanvasElement>) => {
    pointRef.current = null
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
            {PRESETS.map((preset) => (
              <Tooltip key={preset.title} title={preset.title}>
                <IconButton size="small" onClick={() => onCurveChange(preset.curve)}>
                  {preset.icon}
                </IconButton>
              </Tooltip>
            ))}
          </Box>
          <Button
            size="small"
            onClick={() => onCurveChange(DEFAULT_CURVE)}
            sx={{ textTransform: 'none' }}
          >
            Reset
          </Button>
        </Box>
      </Box>
    </Paper>
  )
}
