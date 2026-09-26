import { useEffect, useRef, type RefObject } from 'react'
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
import { tick } from '../trace'
import { useLiveRangeEdit } from '../liveRange'
import { clampRange } from '../range'
import { useLiveSectionsValue } from '../liveSections'

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
  // the drag's start and end, so the app can treat its frames as a scrub
  onScrubStart?: () => void
  onScrubEnd?: () => void
  onRangeChange: (range: Range) => void
}

export const STRIP_HEIGHT = 96
// a wheel tick scales the window by this much per unit of delta, and a
// gesture is over when this long passes without one
const ZOOM_RATE = 0.002
const GESTURE_END_MS = 140

// The window the overview below marks out, drawn at its own scale with the
// beat grid on it, so the tempo can be read where the compiled view cannot
// show it: as audio laid out in time.
export default function RangeStrip({
  envelope,
  sections: givenSections,
  duration,
  curve,
  range: givenRange,
  position,
  positionRef,
  playing,
  onSeek,
  onScrubStart,
  onScrubEnd,
  onRangeChange,
}: RangeStripProps) {
  const sections = useLiveSectionsValue(givenSections)
  // the window moves through the live store while it is zoomed, and reaches
  // the app once the gesture is over
  const [range, editRange, settleRange] = useLiveRangeEdit(givenRange, onRangeChange)
  const settleTimer = useRef(0)
  const zoomRef = useRef({ range, editRange, settleRange })
  useEffect(() => {
    zoomRef.current = { range, editRange, settleRange }
  })
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
    onScrubStart?.()
    onSeek(positionAt(event))
  }

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (draggingRef.current) {
      tick('drag RangeStrip scrub')
      applySeek(positionAt(event))
    }
  }

  const end = (event: React.PointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
    onScrubEnd?.()
  }

  // the wheel zooms the window about the moment under the pointer, the way
  // it does over the compiled view, so the strip is not a picture of a zoom
  // made elsewhere but a place to make one
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (event: WheelEvent) => {
      const { range: current, editRange: edit } = zoomRef.current
      const bounds = canvas.getBoundingClientRect()
      if (bounds.width === 0) return
      event.preventDefault()
      const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
      const span = current.end - current.start
      const anchor = current.start + ratio * span
      const next = Math.min(1, span * Math.exp(event.deltaY * ZOOM_RATE))
      edit(clampRange({ start: anchor - ratio * next, end: anchor + (1 - ratio) * next }))
      window.clearTimeout(settleTimer.current)
      settleTimer.current = window.setTimeout(() => zoomRef.current.settleRange(), GESTURE_END_MS)
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // the audio and the grid on one canvas, painted when the window changes;
  // the playhead on another over it, painted every frame while playing
  const stillRef = useCanvas(
    (context, width, height) => {
      if (!envelope) return

      drawEnvelopeAmplitude(
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
