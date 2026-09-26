import { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import InputBase from '@mui/material/InputBase'
import Typography from '@mui/material/Typography'
import VolumeOffIcon from '@mui/icons-material/VolumeOff'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import { useRafCallback } from '../useRafCallback'
import { MINT_DIM, WELL } from '../theme'

type VolumeProps = {
  volume: number
  muted: boolean
  disabled: boolean
  onVolumeChange: (volume: number) => void
  onMutedChange: (muted: boolean) => void
}

// The volume as a pill like the tuner's: a well with a mint fill as far as
// the level, the speaker at its left end to mute, the figure in the middle to
// read or to type into. A drag across the pill sets the level to where the
// pointer is, a wheel over it nudges it
const HEIGHT = 26
const WIDTH = 168
const WHEEL_STEP = 0.02

export default function Volume({
  volume,
  muted,
  disabled,
  onVolumeChange,
  onMutedChange,
}: VolumeProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const level = muted ? 0 : volume
  const percent = Math.round(level * 100)
  const dragRef = useRef(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const applyVolume = useRafCallback(onVolumeChange)

  const apply = (value: number, live = false) => {
    onMutedChange(false)
    const next = Math.min(1, Math.max(0, value))
    if (live) applyVolume(next)
    else onVolumeChange(next)
  }

  const levelAt = (clientX: number) => {
    const track = trackRef.current
    if (!track) return level
    const bounds = track.getBoundingClientRect()
    return bounds.width > 0 ? (clientX - bounds.left) / bounds.width : level
  }

  const commit = () => {
    const parsed = Number.parseFloat(draft ?? '')
    if (Number.isFinite(parsed)) apply(parsed / 100)
    setDraft(null)
  }

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const onWheel = (event: WheelEvent) => {
      if (disabled) return
      event.preventDefault()
      apply(level - Math.sign(event.deltaY) * WHEEL_STEP)
    }
    track.addEventListener('wheel', onWheel, { passive: false })
    return () => track.removeEventListener('wheel', onWheel)
  })

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'stretch',
        height: HEIGHT,
        width: WIDTH,
        borderRadius: 999,
        bgcolor: WELL,
        overflow: 'hidden',
        userSelect: 'none',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <ButtonBase
        disabled={disabled}
        onClick={() => onMutedChange(!muted)}
        aria-label={muted ? 'Unmute' : 'Mute'}
        sx={{ px: 0.75, color: muted || volume === 0 ? 'text.secondary' : 'primary.main', borderRadius: 999 }}
      >
        {muted || volume === 0 ? <VolumeOffIcon fontSize="small" /> : <VolumeUpIcon fontSize="small" />}
      </ButtonBase>
      <Box
        ref={trackRef}
        role="slider"
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        onPointerDown={(event) => {
          if (disabled || event.button !== 0 || draft !== null) return
          dragRef.current = true
          event.currentTarget.setPointerCapture(event.pointerId)
          apply(levelAt(event.clientX), true)
        }}
        onPointerMove={(event) => {
          if (dragRef.current) apply(levelAt(event.clientX), true)
        }}
        onPointerUp={(event) => {
          dragRef.current = false
          event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onPointerCancel={(event) => {
          dragRef.current = false
          event.currentTarget.releasePointerCapture(event.pointerId)
        }}
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
        <Box
          sx={{
            position: 'absolute',
            left: 0,
            top: 3,
            bottom: 3,
            width: `${level * 100}%`,
            borderRadius: 999,
            bgcolor: MINT_DIM,
            pointerEvents: 'none',
          }}
        />
        {draft === null ? (
          <Typography
            variant="body2"
            onDoubleClick={() => {
              if (!disabled) setDraft(String(percent))
            }}
            sx={{
              position: 'relative',
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              color: 'text.primary',
              pr: 1,
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
            onPointerDown={(event) => event.stopPropagation()}
            sx={{
              position: 'relative',
              width: 48,
              fontSize: 12,
              fontWeight: 600,
              '& input': { p: 0, textAlign: 'center' },
            }}
          />
        )}
      </Box>
    </Box>
  )
}
