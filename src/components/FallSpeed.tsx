import { useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import RulerSlider from './RulerSlider'
import { clampFall, FALL_MAX, FALL_MIN, FALL_SETTLE_MS, secondsOf, useLiveFallEdit } from '../liveFall'

type FallSpeedProps = {
  fallSpeed: number
  onFallSpeedChange: (fallSpeed: number) => void
}

// The seconds pill in the approach view's header: every step of a drag or a
// press goes to the live store, and the app hears once the pill has been
// still for a moment
export default function FallSpeed({ fallSpeed, onFallSpeedChange }: FallSpeedProps) {
  const [live, edit, settle] = useLiveFallEdit(fallSpeed, onFallSpeedChange)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  return (
    <Box sx={{ width: 132 }}>
      <RulerSlider
        value={live}
        min={FALL_MIN}
        max={FALL_MAX}
        step={0.1}
        pixelsPerStep={6}
        format={(value) => `${secondsOf(value).toFixed(1)}s`}
        fill
        onChange={(next) => {
          edit(clampFall(next))
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(settle, FALL_SETTLE_MS)
        }}
      />
    </Box>
  )
}
