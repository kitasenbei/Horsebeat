import { useRef, type RefObject } from 'react'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import {
  curveSignature,
  drawEnvelopeAmplitude,
  drawGrid,
  drawPlayhead,
  sectionSignature,
} from '../draw'
import { useCanvas } from '../useCanvas'
import { useRafCallback } from '../useRafCallback'
import type { Curve } from '../curve'
import type { Range } from '../range'
import type { Section } from '../timing'

type RangeStripProps = {
  envelope: Float32Array | null
  sections: Section[]
  duration: number
  curve: Curve
  range: Range
  position: number
  positionRef: RefObject<number>
  playing: boolean
  onSeek: (position: number) => void
}

export const STRIP_HEIGHT = 96

// The window the overview below marks out, drawn at its own scale with the
// beat grid on it, so the tempo can be read where the compiled view cannot
// show it: as audio laid out in time.
export default function RangeStrip({
  envelope,
  sections,
  duration,
  curve,
  range,
  position,
  positionRef,
  playing,
  onSeek,
}: RangeStripProps) {
  const theme = useTheme()
  const draggingRef = useRef(false)
  const applySeek = useRafCallback(onSeek)

  const positionAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width === 0) return range.start
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    return range.start + ratio * (range.end - range.start)
  }

  const begin = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return
    draggingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    onSeek(positionAt(event))
  }

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (draggingRef.current) applySeek(positionAt(event))
  }

  const end = (event: React.PointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  // the audio and the grid on one canvas, painted when the window changes;
  // the playhead on another over it, painted every frame while playing
  const stillRef = useCanvas(
    (context, width, height) => {
      if (!envelope) return

      const halves = drawEnvelopeAmplitude(
        context,
        envelope,
        range,
        width,
        height,
        theme.palette.primary.main,
        curve,
      )
      drawGrid(
        context,
        sections,
        duration,
        range,
        width,
        height,
        theme.palette.info.dark,
        theme.palette.info.dark,
        halves,
      )
    },
    false,
    `${range.start}|${range.end}|${envelope?.length}|${sectionSignature(sections)}|${curveSignature(curve)}`,
  )

  const canvasRef = useCanvas(
    (context, width, height) => {
      if (!envelope) return
      drawPlayhead(
        context,
        positionRef.current,
        range,
        width,
        height,
        theme.palette.error.main,
        true,
      )
    },
    playing,
    `${range.start}|${range.end}|${position}|${envelope?.length}`,
  )

  return (
    <Box sx={{ position: 'relative', height: STRIP_HEIGHT, flex: '0 0 auto' }}>
      <Box
        component="canvas"
        ref={stillRef}
        data-trace="RangeStrip"
        sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
      <Box
        component="canvas"
        ref={canvasRef}
        data-trace="RangeStrip playhead"
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        sx={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          touchAction: 'none',
          cursor: 'ew-resize',
        }}
      />
    </Box>
  )
}
