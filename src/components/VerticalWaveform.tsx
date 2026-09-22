import type { RefObject } from 'react'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import {
  drawGridVertical,
  drawSamplesVertical,
  drawVerticalPlayhead,
  sectionSignature,
} from '../draw'
import { useCanvas } from '../useCanvas'
import { DEFAULT_CURVE } from '../curve'
import type { Section } from '../timing'
import { GRID_PURPLE } from '../theme'
import { useLiveSectionsValue } from '../liveSections'

type VerticalWaveformProps = {
  samples: Float32Array | null
  envelope: Float32Array | null
  sections: Section[]
  position: number
  positionRef: RefObject<number>
  playing: boolean
  duration: number
  seconds?: number
}

export default function VerticalWaveform({
  samples,
  envelope,
  sections: givenSections,
  position,
  positionRef,
  playing,
  duration,
  seconds = 2,
}: VerticalWaveformProps) {
  const sections = useLiveSectionsValue(givenSections)
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
      // the falling view stays linear: it is read against the playhead rather
      // than shaped like the compiled picture
      DEFAULT_CURVE,
      samples.length,
    )
    drawGridVertical(
      context,
      sections,
      duration,
      positionRef.current,
      span,
      width,
      height,
      GRID_PURPLE,
      GRID_PURPLE,
    )
    drawVerticalPlayhead(context, width, height, theme.palette.error.main)
  }, playing, `${span}|${position}|${envelope?.length}|${sectionSignature(sections)}`)

  return (
    <Box
      component="canvas"
      ref={canvasRef}
      data-trace="VerticalWaveform"
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
