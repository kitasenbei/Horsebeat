import { useEffect, useRef, type RefObject } from 'react'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import BeatLights from './BeatLights'
import Gallop from './Gallop'
import { sectionSpans, type Section } from '../timing'

// the mark in the corner, beating with the song: the one place the shell is
// allowed to be playful, kept small and at the edge
const BRAND_FONT = "'Outfit', system-ui, sans-serif"
const BRAND_INK = '#e6e6ea'
const BRAND_GREEN = '#3fbf5a'
const PULSE = 0.14
const DECAY = 7

type StatusBarProps = {
  fileName: string | null
  loadingName: string | null
  sections: Section[]
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
  sections,
  positionRef,
  position,
  duration,
  playing,
}: StatusBarProps) {
  const clockRef = useRef<HTMLSpanElement>(null)
  const brandRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const node = brandRef.current
    if (!node) return
    const spans = sectionSpans(sections, duration)
    if (!playing || spans.length === 0) {
      node.style.transform = 'scale(1)'
      return
    }
    let frame = requestAnimationFrame(function tick() {
      const at = positionRef.current
      const item = spans.find((span) => at >= span.start && at <= span.end) ?? spans[0]
      const phase = item.beat > 0 ? ((((at - item.start) / item.beat) % 1) + 1) % 1 : 0
      node.style.transform = `scale(${1 + PULSE * Math.exp(-phase * DECAY)})`
      frame = requestAnimationFrame(tick)
    })
    return () => {
      cancelAnimationFrame(frame)
      node.style.transform = 'scale(1)'
    }
  }, [playing, sections, duration, positionRef])

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
        minHeight: 28,
        px: 1.5,
        bgcolor: 'background.default',
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

      <Box sx={{ display: 'flex', alignItems: 'center', ml: 2, transform: 'scale(0.6)', transformOrigin: 'center right' }}>
        <Gallop sections={sections} duration={duration} positionRef={positionRef} playing={playing} />
        <BeatLights
          sections={sections}
          duration={duration}
          positionRef={positionRef}
          playing={playing}
          color={BRAND_GREEN}
        />
        <Typography
          component="span"
          ref={brandRef}
          sx={{
            transformOrigin: 'center right',
            willChange: 'transform',
            fontFamily: BRAND_FONT,
            fontWeight: 800,
            fontSize: 22,
            lineHeight: 1,
            letterSpacing: 0.2,
            pr: 0.5,
            color: BRAND_INK,
          }}
        >
          Horse
          <Box component="span" sx={{ color: BRAND_GREEN, fontWeight: 800 }}>
            Beat
          </Box>
        </Typography>
      </Box>
    </Box>
  )
}
