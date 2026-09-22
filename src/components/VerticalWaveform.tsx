import { useRef, type RefObject } from 'react'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import {
  drawGridVertical,
  drawSamplesVertical,
  drawVerticalPlayhead,
  sectionSignature,
} from '../draw'
import { useCanvas } from '../useCanvas'
import { useRafCallback } from '../useRafCallback'
import { measure } from '../trace'
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
  onSeek: (position: number) => void
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
  onSeek,
}: VerticalWaveformProps) {
  const sections = useLiveSectionsValue(givenSections)
  const theme = useTheme()
  const span = duration > 0 ? Math.min(1, seconds / duration) : 0

  // Dragging the picture drags the song: the audio falls towards the line, so
  // pulling it down by a share of the height moves the playhead forward by
  // that share of what the height shows
  const dragRef = useRef<{ clientY: number; position: number } | null>(null)
  const applySeek = useRafCallback(onSeek)

  const begin = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || !samples) return
    dragRef.current = { clientY: event.clientY, position: positionRef.current }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (!drag) return
    measure('drag VerticalWaveform scrub', () => {
      const height = event.currentTarget.clientHeight
      if (height <= 0) return
      const moved = ((event.clientY - drag.clientY) / height) * span
      applySeek(Math.min(1, Math.max(0, drag.position + moved)))
    })
  }

  const end = (event: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

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
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      sx={{
        display: 'block',
        width: '100%',
        height: '100%',
        touchAction: 'none',
        cursor: samples ? 'ns-resize' : 'default',
        borderLeft: 1,
        borderColor: 'divider',
      }}
    />
  )
}
