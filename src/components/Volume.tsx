import { useState } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import InputBase from '@mui/material/InputBase'
import Slider from '@mui/material/Slider'
import Typography from '@mui/material/Typography'
import VolumeOffIcon from '@mui/icons-material/VolumeOff'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'

type VolumeProps = {
  volume: number
  muted: boolean
  disabled: boolean
  onVolumeChange: (volume: number) => void
  onMutedChange: (muted: boolean) => void
}

const FIELD_WIDTH = 40

export default function Volume({
  volume,
  muted,
  disabled,
  onVolumeChange,
  onMutedChange,
}: VolumeProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const percent = Math.round((muted ? 0 : volume) * 100)

  const apply = (value: number) => {
    onMutedChange(false)
    onVolumeChange(Math.min(1, Math.max(0, value)))
  }

  const commit = () => {
    const parsed = Number.parseFloat(draft ?? '')
    if (Number.isFinite(parsed)) apply(parsed / 100)
    setDraft(null)
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: 200 }}>
      <IconButton
        size="small"
        disabled={disabled}
        onClick={() => onMutedChange(!muted)}
        aria-label={muted ? 'Unmute' : 'Mute'}
      >
        {muted || volume === 0 ? (
          <VolumeOffIcon fontSize="small" />
        ) : (
          <VolumeUpIcon fontSize="small" />
        )}
      </IconButton>
      <Slider
        size="small"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        disabled={disabled}
        onChange={(_, value) => apply(value as number)}
        aria-label="Volume"
        sx={{ flex: 1, mx: 0.5 }}
      />
      {draft === null ? (
        <Typography
          variant="caption"
          color={disabled ? 'text.disabled' : 'text.secondary'}
          onClick={() => {
            if (!disabled) setDraft(String(percent))
          }}
          sx={{
            width: FIELD_WIDTH,
            textAlign: 'right',
            cursor: disabled ? 'default' : 'text',
            userSelect: 'none',
          }}
        >
          {percent}%
        </Typography>
      ) : (
        <InputBase
          autoFocus
          value={draft}
          inputProps={{ 'aria-label': 'Volume percentage', inputMode: 'numeric' }}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
            if (event.key === 'Escape') setDraft(null)
          }}
          sx={{
            width: FIELD_WIDTH,
            fontSize: (theme) => theme.typography.caption.fontSize,
            '& input': { p: 0, textAlign: 'right' },
          }}
        />
      )}
    </Box>
  )
}
