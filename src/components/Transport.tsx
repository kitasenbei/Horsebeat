import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import ToggleButton from '@mui/material/ToggleButton'
import Tooltip from '@mui/material/Tooltip'
import PauseIcon from '@mui/icons-material/Pause'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'

// every rate one press away: a menu asked for two, and a change of pace is
// made often while a grid is being placed. Full speed is the one gone back
// to, so it is the big square; the rest sit in two rows of four beside it
const RATES = [0.25, 0.5, 0.75, 1.25, 1.5, 2, 3, 4]

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
    // three columns, the middle as wide as what it holds: the sides can never
    // lie over the play button however wide the rates grow
    <Box
      sx={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        minHeight: left ? 60 : 48,
      }}
    >
      <Box sx={{ justifySelf: 'start' }}>{left}</Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
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
      <Tooltip title="Playback rate">
        <Box
          role="group"
          aria-label="Playback rate"
          sx={{
            ml: 0.5,
            display: 'grid',
            gridTemplateColumns: 'repeat(6, auto)',
            gridAutoRows: 'auto',
            gap: '2px',
            '& .MuiToggleButton-root': {
              px: 0.75,
              py: 0,
              minWidth: 34,
              fontSize: 12,
              lineHeight: '20px',
              textTransform: 'none',
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
            },
          }}
        >
          <ToggleButton
            value={1}
            selected={rate === 1}
            disabled={disabled}
            onChange={() => onRateChange(1)}
            aria-label="1 times"
            sx={{ gridColumn: '1 / span 2', gridRow: '1 / span 2', fontSize: 14 }}
          >
            1×
          </ToggleButton>
          {RATES.map((entry) => (
            <ToggleButton
              key={entry}
              value={entry}
              selected={rate === entry}
              disabled={disabled}
              onChange={() => onRateChange(entry)}
              aria-label={`${entry} times`}
            >
              {entry}×
            </ToggleButton>
          ))}
        </Box>
      </Tooltip>
      </Box>
      <Box sx={{ justifySelf: 'end' }}>{right}</Box>
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
    </Box>
  )
}
