import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import PauseIcon from '@mui/icons-material/Pause'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'

type TransportProps = {
  playing: boolean
  disabled: boolean
  onToggle: () => void
  onReset: () => void
  above?: ReactNode
  right?: ReactNode
}

export default function Transport({
  playing,
  disabled,
  onToggle,
  onReset,
  above,
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
        minHeight: 34,
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
