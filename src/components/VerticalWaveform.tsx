import type { RefObject } from 'react'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import { drawSamplesVertical, drawVerticalPlayhead } from '../draw'
import { useCanvas } from '../useCanvas'
import type { Curve } from '../curve'

type VerticalWaveformProps = {
  samples: Float32Array | null
  envelope: Float32Array | null
  positionRef: RefObject<number>
  playing: boolean
  duration: number
  curve: Curve
  seconds?: number
}

export default function VerticalWaveform({
  samples,
  envelope,
  positionRef,
  playing,
  duration,
  curve,
  seconds = 2,
}: VerticalWaveformProps) {
  const theme = useTheme()
  const span = duration > 0 ? Math.min(1, seconds / duration) : 0

  const canvasRef = useCanvas((context, width, height) => {
    if (!samples || !envelope || span <= 0) return
    drawSamplesVertical(
      context,
      envelope,
      positionRef.current,
      span,
      width,
      height,
      theme.palette.primary.main,
      curve,
      samples.length,
    )
    drawVerticalPlayhead(context, width, height, theme.palette.error.main)
  }, playing)

  return (
    <Box
      component="canvas"
      ref={canvasRef}
      sx={{
        display: 'block',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        borderLeft: 1,
        borderColor: 'divider',
      }}
    />
  )
}
