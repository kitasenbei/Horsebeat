import { useEffect, useRef, type RefObject } from 'react'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'

type StatusBarProps = {
  fileName: string | null
  loadingName: string | null
  positionRef: RefObject<number>
  position: number
  duration: number
  playing: boolean
}

// Minutes, seconds and thousandths. A chart is written to the millisecond, so
// the clock that reads back to the charter is written to it too.
function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00.000'

  const whole = Math.floor(seconds)
  const minutes = Math.floor(whole / 60)
  const rest = whole % 60
  const parts = Math.floor((seconds - whole) * 1000)
  return `${minutes}:${String(rest).padStart(2, '0')}.${String(parts).padStart(3, '0')}`
}

export default function StatusBar({
  fileName,
  loadingName,
  positionRef,
  position,
  duration,
  playing,
}: StatusBarProps) {
  const clockRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const node = clockRef.current
    if (!node || duration <= 0) return

    // written straight to the node rather than held as state: the playhead
    // moves every frame, and the rest of the bar has no reason to hear about it
    const show = () => {
      node.textContent = `${clock(positionRef.current * duration)} / ${clock(duration)}`
    }

    show()
    if (!playing) return

    let frame = requestAnimationFrame(function tick() {
      show()
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing, position, duration, positionRef])

  return (
    <Box
      component="footer"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        flex: '0 0 auto',
        minHeight: 24,
        px: 1.5,
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      {loadingName ? <CircularProgress size={12} /> : null}
      <Typography variant="caption" color="text.secondary" noWrap>
        {loadingName ?? fileName ?? ''}
      </Typography>

      <Box sx={{ flex: 1 }} />

      <Typography
        component="span"
        ref={clockRef}
        variant="caption"
        color="text.secondary"
        sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
      >
        {duration > 0 ? `${clock(position * duration)} / ${clock(duration)}` : ''}
      </Typography>
    </Box>
  )
}
