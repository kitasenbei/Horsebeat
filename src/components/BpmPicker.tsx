import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import ButtonGroup from '@mui/material/ButtonGroup'
import Divider from '@mui/material/Divider'
import Popover from '@mui/material/Popover'
import Typography from '@mui/material/Typography'
import RulerSlider from './RulerSlider'
import { MAX_BPM, MIN_BPM } from '../timing'

type BpmPickerProps = {
  value: number
  onChange: (value: number) => void
  onEditingChange?: (editing: boolean) => void
}

const MULTIPLIERS = [
  { factor: 0.2, label: '1/5' },
  { factor: 0.25, label: '1/4' },
  { factor: 0.5, label: '1/2' },
  { factor: 2, label: 'x2' },
  { factor: 4, label: 'x4' },
  { factor: 5, label: 'x5' },
]

export default function BpmPicker({ value, onChange, onEditingChange }: BpmPickerProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  const whole = Math.floor(value)
  const fraction = Math.round((value - whole) * 100)

  const compose = (nextWhole: number, nextFraction: number) => {
    onChange(Math.min(MAX_BPM, Math.max(MIN_BPM, nextWhole + nextFraction / 100)))
  }

  return (
    <>
      <ButtonBase
        onClick={(event) => {
          setAnchor(event.currentTarget)
          onEditingChange?.(true)
        }}
        sx={{
          px: 1,
          py: 0.5,
          borderRadius: 999,
          border: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Typography variant="body2">{value.toFixed(2)} BPM</Typography>
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
            sx: { width: 260, borderRadius: 3, overflow: 'hidden', mb: 1 },
          },
        }}
      >
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
