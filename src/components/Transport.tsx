import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
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
        minHeight: left ? 60 : 48,
      }}
    >
      <IconButton
        disabled={disabled}
        onClick={onToggle}
        aria-label={playing ? 'Pause' : 'Play'}
        sx={{
          width: 44,
          height: 44,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          '&:hover': { bgcolor: 'primary.dark' },
          '&.Mui-disabled': { bgcolor: 'action.disabledBackground' },
        }}
      >
        {playing ? <PauseIcon fontSize="medium" /> : <PlayArrowIcon fontSize="medium" />}
      </IconButton>
      <IconButton size="small" disabled={disabled} onClick={onReset} aria-label="Reset">
        <StopIcon fontSize="small" />
      </IconButton>
      <Select
        size="small"
        value={rate}
        disabled={disabled}
        onChange={(event) => onRateChange(event.target.value as number)}
        inputProps={{ 'aria-label': 'Playback rate' }}
        sx={{
          ml: 0.5,
          fontSize: 13,
          '& .MuiSelect-select': { py: 0.25, pl: 1 },
        }}
      >
        {RATES.map((entry) => (
          <MenuItem key={entry} value={entry}>
            {entry}x
          </MenuItem>
        ))}
      </Select>
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
