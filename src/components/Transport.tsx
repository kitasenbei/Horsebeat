import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import PauseIcon from '@mui/icons-material/Pause'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'

const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

type TransportProps = {
  playing: boolean
  disabled: boolean
  onToggle: () => void
  onReset: () => void
  rate: number
  onRateChange: (rate: number) => void
  above?: ReactNode
  left?: ReactNode
  right?: ReactNode
}

export default function Transport({
  playing,
  disabled,
  onToggle,
  onReset,
  rate,
  onRateChange,
  above,
  left,
  right,
}: TransportProps) {
  return (
    <Box
      sx={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0.5,
        minHeight: left ? 60 : 34,
      }}
    >
      <IconButton
        size="small"
        disabled={disabled}
        onClick={onToggle}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
      </IconButton>
      <IconButton size="small" disabled={disabled} onClick={onReset} aria-label="Reset">
        <StopIcon fontSize="small" />
      </IconButton>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={rate}
        disabled={disabled}
        onChange={(_, next) => {
          if (next !== null) onRateChange(next as number)
        }}
        sx={{ ml: 0.5 }}
      >
        {RATES.map((entry) => (
          <ToggleButton key={entry} value={entry} sx={{ px: 0.5, py: 0.25, textTransform: 'none' }}>
            {entry}x
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      {left ? (
        <Box
          sx={{
            position: 'absolute',
            left: 0,
            top: '50%',
            transform: 'translateY(-50%)',
          }}
        >
          {left}
        </Box>
      ) : null}
      {above ? (
        <Box
          sx={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            mb: 1,
            zIndex: 1,
          }}
        >
          {above}
        </Box>
      ) : null}
      {right ? (
        <Box
          sx={{
            position: 'absolute',
            right: 0,
            top: '50%',
            transform: 'translateY(-50%)',
          }}
        >
          {right}
        </Box>
      ) : null}
    </Box>
  )
}
