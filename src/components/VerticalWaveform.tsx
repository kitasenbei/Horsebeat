import { useEffect, useRef, type RefObject } from 'react'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import {
  drawGridVertical,
  drawSamplesVertical,
  drawSectionColumn,
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
import { clampFall, FALL_SETTLE_MS, secondsOf, useLiveFallEdit } from '../liveFall'
import { BLOCK_HEIGHT, LIVE_COLOR } from './SectionBlocks'

type VerticalWaveformProps = {
  samples: Float32Array | null
  envelope: Float32Array | null
  sections: Section[]
  position: number
  positionRef: RefObject<number>
  playing: boolean
  duration: number
  // how close the view stands, as the app last heard it; the wheel turns it
  // through the live store and the app hears once the wheel is still
  fallSpeed: number
  onFallSpeedChange: (fallSpeed: number) => void
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
  fallSpeed,
  onFallSpeedChange,
  onSeek,
}: VerticalWaveformProps) {
  const sections = useLiveSectionsValue(givenSections)
  const [live, editFall, settleFall] = useLiveFallEdit(fallSpeed, onFallSpeedChange)
  const theme = useTheme()
  const seconds = secondsOf(live)
  const span = duration > 0 ? Math.min(1, seconds / duration) : 0
  const settleTimer = useRef(0)
  const fallRef = useRef({ live, editFall, settleFall })
  useEffect(() => {
    fallRef.current = { live, editFall, settleFall }
  })

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

  const canvasRef = useCanvas((context, full, height) => {
    if (!samples || !envelope || span <= 0) return
    // the sections down the left edge, the audio in what is left
    drawSectionColumn(
      context,
      sections,
      duration,
      positionRef.current,
      span,
      BLOCK_HEIGHT,
      height,
      {
        idle: theme.palette.info.main,
        alt: theme.palette.info.dark,
        live: LIVE_COLOR,
        hover: theme.palette.info.light,
        text: theme.palette.common.white,
      },
      `600 10px ${theme.typography.fontFamily}`,
    )
    context.save()
    context.translate(BLOCK_HEIGHT, 0)
    const width = full - BLOCK_HEIGHT
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
    )
    drawVerticalPlayhead(context, width, height, theme.palette.error.main)
    context.restore()
  }, playing, `${span}|${position}|${envelope?.length}|${sectionSignature(sections)}`)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // a turn of the wheel is half a second of view, up for closer
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const { live: held, editFall: edit, settleFall: settle } = fallRef.current
      edit(clampFall(held - (event.deltaY / 100) * 0.5))
      window.clearTimeout(settleTimer.current)
      settleTimer.current = window.setTimeout(settle, FALL_SETTLE_MS)
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      canvas.removeEventListener('wheel', onWheel)
      window.clearTimeout(settleTimer.current)
    }
  }, [canvasRef])

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
      }}
    />
  )
}
