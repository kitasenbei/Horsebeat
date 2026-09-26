import { useRef } from 'react'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Typography from '@mui/material/Typography'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { useRafCallback } from '../useRafCallback'
import { measure } from '../trace'
import { MINT_DIM, WELL } from '../theme'

type RulerSliderProps = {
  value: number
  min?: number
  max?: number
  step?: number
  pixelsPerStep?: number
  // kept for callers that still pass it: a pill has no ticks to space
  majorEvery?: number
  unit?: string
  disabled?: boolean
  format?: (value: number) => string
  // a mint fill from the left edge to where the value stands in its range,
  // for a value whose range means something
  fill?: boolean
  onChange: (value: number) => void
}

// A value in a pill, edged in the house green: a chevron either end steps it,
// and a drag across the middle scrolls it, so many steps are one gesture and
// one step is one press. Dragging right raises the value, the way a slider
// would
const HEIGHT = 28

export default function RulerSlider({
  value,
  min = 20,
  max = 400,
  step = 1,
  pixelsPerStep = 8,
  unit,
  disabled = false,
  format,
  fill = false,
  onChange,
}: RulerSliderProps) {
  const dragRef = useRef<{ clientX: number; value: number; moved: boolean } | null>(null)
  const applyValue = useRafCallback(onChange)
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next / step) * step))
  const shown = format ? format(value) : unit ? `${value} ${unit}` : String(value)

  const begin = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return
    dragRef.current = { clientX: event.clientX, value, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    measure('drag RulerSlider', () => {
      const shift = ((event.clientX - drag.clientX) / pixelsPerStep) * step
      if (Math.abs(event.clientX - drag.clientX) > 2) drag.moved = true
      applyValue(clamp(drag.value + shift))
    })
  }

  const end = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const chevron = (direction: -1 | 1, label: string) => (
    <ButtonBase
      disabled={disabled || (direction < 0 ? value <= min : value >= max)}
      aria-label={label}
      onClick={() => onChange(clamp(value + direction * step))}
      sx={{
        height: '100%',
        px: 0.25,
        color: 'primary.main',
        borderRadius: 999,
        '&.Mui-disabled': { color: 'text.disabled' },
      }}
    >
      {direction < 0 ? <ChevronLeftIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
    </ButtonBase>
  )

  return (
    <Box
      data-trace="RulerSlider"
      sx={{
        display: 'flex',
        alignItems: 'stretch',
        height: HEIGHT,
        width: '100%',
        borderRadius: 999,
        bgcolor: WELL,
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {chevron(-1, 'Lower')}
      <Box
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        sx={{
          position: 'relative',
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          touchAction: 'none',
          cursor: disabled ? 'default' : 'ew-resize',
        }}
      >
        {fill && !disabled ? (
          <Box
            sx={{
              position: 'absolute',
              left: 0,
              top: 3,
              bottom: 3,
              width: `${Math.max(0, Math.min(1, (value - min) / Math.max(1e-9, max - min))) * 100}%`,
              borderRadius: 999,
              bgcolor: MINT_DIM,
              pointerEvents: 'none',
            }}
          />
        ) : null}
        <Typography
          variant="body2"
          noWrap
          sx={{
            position: 'relative',
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            color: disabled ? 'text.disabled' : 'text.primary',
            pointerEvents: 'none',
          }}
        >
          {shown}
        </Typography>
      </Box>
      {chevron(1, 'Raise')}
    </Box>
  )
}
