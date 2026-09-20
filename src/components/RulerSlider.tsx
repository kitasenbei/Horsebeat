import { useRef } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'
import { useCanvas } from '../useCanvas'

type RulerSliderProps = {
  value: number
  min?: number
  max?: number
  step?: number
  pixelsPerStep?: number
  majorEvery?: number
  unit?: string
  format?: (value: number) => string
  onChange: (value: number) => void
}

const HEIGHT = 56

export default function RulerSlider({
  value,
  min = 20,
  max = 400,
  step = 1,
  pixelsPerStep = 8,
  majorEvery = 5,
  unit,
  format,
  onChange,
}: RulerSliderProps) {
  const theme = useTheme()
  const dragRef = useRef<{ clientX: number; value: number } | null>(null)

  const canvasRef = useCanvas((context, width, height) => {
    const middle = width / 2
    const baseline = height - 14

    context.strokeStyle = theme.palette.divider
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(0, Math.round(baseline) + 0.5)
    context.lineTo(width, Math.round(baseline) + 0.5)
    context.stroke()

    const firstStep = Math.ceil((value - middle / pixelsPerStep) / step) * step
    const lastStep = value + middle / pixelsPerStep

    context.textAlign = 'center'
    context.textBaseline = 'top'
    context.font = `10px ${theme.typography.fontFamily}`

    for (let tick = firstStep; tick <= lastStep; tick += step) {
      if (tick < min || tick > max) continue

      const x = Math.round(middle + (tick - value) * pixelsPerStep) + 0.5
      const major = Math.round(tick / step) % majorEvery === 0
      const length = major ? 14 : 7

      context.strokeStyle = major ? theme.palette.text.secondary : theme.palette.text.disabled
      context.beginPath()
      context.moveTo(x, baseline - length)
      context.lineTo(x, baseline)
      context.stroke()

      if (major) {
        context.fillStyle = theme.palette.text.secondary
        context.fillText(String(Math.round(tick)), x, baseline + 2)
      }
    }

    context.strokeStyle = theme.palette.error.main
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(Math.round(middle) + 0.5, 0)
    context.lineTo(Math.round(middle) + 0.5, baseline)
    context.stroke()
  })

  const begin = (event: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { clientX: event.clientX, value }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const shift = (drag.clientX - event.clientX) / pixelsPerStep
    const next = Math.round((drag.value + shift) / step) * step
    onChange(Math.min(max, Math.max(min, next)))
  }

  const end = (event: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <Box sx={{ position: 'relative', width: '100%' }}>
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
          height: HEIGHT,
          touchAction: 'none',
          cursor: 'ew-resize',
        }}
      />
      <Typography
        variant="caption"
        sx={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          px: 0.5,
          bgcolor: 'background.paper',
          color: 'text.primary',
        }}
      >
        {format ? format(value) : unit ? `${value} ${unit}` : value}
      </Typography>
    </Box>
  )
}
