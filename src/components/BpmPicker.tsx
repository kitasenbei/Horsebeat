import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import ButtonGroup from '@mui/material/ButtonGroup'
import Divider from '@mui/material/Divider'
import InputBase from '@mui/material/InputBase'
import Popover from '@mui/material/Popover'
import Typography from '@mui/material/Typography'
import RulerSlider from './RulerSlider'
import { WELL } from '../theme'
import { MAX_BPM, MIN_BPM } from '../timing'

type BpmPickerProps = {
  value: number
  onChange: (value: number) => void
  onEditingChange?: (editing: boolean) => void
}

const BPM_COLOR = 'rgba(255, 255, 255, 0.06)'
const BPM_HOVER = 'rgba(255, 255, 255, 0.12)'
const BPM_INK = '#e8e8ec'
const BPM_LIVE = 'rgba(79, 209, 165, 0.22)'
const BPM_LIVE_HOVER = 'rgba(79, 209, 165, 0.34)'
const BPM_LIVE_INK = '#d9fff1'

const MULTIPLIERS = [
  { factor: 0.2, label: '1/5' },
  { factor: 0.25, label: '1/4' },
  { factor: 0.5, label: '1/2' },
  { factor: 2, label: 'x2' },
  { factor: 4, label: 'x4' },
  { factor: 5, label: 'x5' },
]

export default function BpmPicker({
  value,
  onChange,
  onEditingChange,
}: BpmPickerProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  // the tempo as typed, kept apart from the value until it is entered: a
  // half-typed number is not a tempo the song should jump to
  const [typed, setTyped] = useState('')

  const open = (element: HTMLElement) => {
    setTyped(value.toFixed(3))
    setAnchor(element)
  }

  const enter = () => {
    const parsed = Number(typed.trim())
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setTyped(value.toFixed(3))
      return
    }
    onChange(Math.min(MAX_BPM, Math.max(MIN_BPM, parsed)))
  }

  const whole = Math.floor(value)
  const fraction = Math.round((value - whole) * 100)

  const compose = (nextWhole: number, nextFraction: number) => {
    onChange(Math.min(MAX_BPM, Math.max(MIN_BPM, nextWhole + nextFraction / 100)))
  }

  return (
    <>
      <ButtonBase
        onClick={(event) => {
          open(event.currentTarget)
          onEditingChange?.(true)
        }}
        sx={{
          px: 1.25,
          py: 0.5,
          borderRadius: 0.75,
          border: 0,
          bgcolor: BPM_COLOR,
          color: BPM_INK,
          '&:hover': { bgcolor: BPM_HOVER },
          // the card under the playhead says so with an attribute, and the
          // look follows from the stylesheet rather than from a render
          '[data-live="true"] &': { bgcolor: BPM_LIVE, color: BPM_LIVE_INK },
          '[data-live="true"] &:hover': { bgcolor: BPM_LIVE_HOVER },
        }}
      >
        <Typography variant="body2" data-field="bpm" sx={{ fontWeight: 600, lineHeight: 1.4 }}>
          {value.toFixed(2)} BPM
        </Typography>
      </ButtonBase>
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={() => {
          setAnchor(null)
          onEditingChange?.(false)
        }}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        slotProps={{
          paper: {
            elevation: 6,
            sx: { width: 260, borderRadius: 0.75, overflow: 'hidden', mb: 1 },
          },
        }}
      >
        <Box sx={{ p: 1, display: 'flex', justifyContent: 'center' }}>
          <InputBase
            autoFocus
            value={typed}
            inputProps={{ inputMode: 'decimal', 'aria-label': 'Tempo in beats per minute' }}
            onFocus={(event) => event.target.select()}
            onChange={(event) => setTyped(event.target.value)}
            onBlur={enter}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                enter()
                event.currentTarget.blur()
              }
              if (event.key === 'Escape') {
                setTyped(value.toFixed(3))
                event.currentTarget.blur()
              }
            }}
            sx={{
              width: 140,
              px: 1.5,
              borderRadius: 0.75,
              bgcolor: WELL,
              fontWeight: 600,
              '& input': { textAlign: 'center', p: 0.5 },
            }}
          />
        </Box>
        <Divider />
        <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <RulerSlider
            value={fraction}
            min={0}
            max={99}
            step={1}
            pixelsPerStep={10}
            majorEvery={5}
            format={(current) => `.${String(current).padStart(2, '0')}`}
            onChange={(next) => compose(whole, next)}
          />
          <RulerSlider
            value={whole}
            min={Math.floor(MIN_BPM)}
            max={Math.floor(MAX_BPM)}
            step={1}
            pixelsPerStep={10}
            majorEvery={5}
            unit="BPM"
            onChange={(next) => compose(next, fraction)}
          />
        </Box>
        <Divider />
        <Box sx={{ p: 1, display: 'flex', justifyContent: 'center' }}>
          <ButtonGroup size="small" variant="outlined">
            {MULTIPLIERS.map((entry) => {
              const scaled = value * entry.factor
              return (
                <Button
                  key={entry.label}
                  disabled={scaled < MIN_BPM || scaled > MAX_BPM}
                  onClick={() => onChange(scaled)}
                  sx={{ textTransform: 'none', minWidth: 36, px: 0.5 }}
                >
                  {entry.label}
                </Button>
              )
            })}
          </ButtonGroup>
        </Box>
      </Popover>
    </>
  )
}
