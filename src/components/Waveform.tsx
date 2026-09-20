import { useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import {
  drawGrid,
  drawMarkers,
  drawPlayhead,
  drawSamples,
  drawSamplesAmplitude,
} from '../draw'
import { useCanvas } from '../useCanvas'
import { clampRange, type Range } from '../range'
import type { ViewMode } from '../view'
import type { Section } from '../timing'
import { DEFAULT_CURVE, type Curve } from '../curve'

type WaveformProps = {
  samples: Float32Array | null
  position: number
  markers: number[]
  sections: Section[]
  duration: number
  view?: ViewMode
  curve?: Curve
  range?: Range
  placing?: Placing
  ghost?: number | null
  onRangeChange?: (range: Range) => void
  onGhostChange?: (position: number | null) => void
  onPlace?: (position: number) => void
}

type Placing = 'marker' | 'section' | null

type Pan = {
  clientX: number
  start: number
  span: number
}

const FULL: Range = { start: 0, end: 1 }
const ZOOM_RATE = 0.002
const CLICK_SLOP = 4

export default function Waveform({
  samples,
  position,
  markers,
  sections,
  duration,
  view = 'amplitude',
  curve = DEFAULT_CURVE,
  range = FULL,
  placing = null,
  ghost = null,
  onRangeChange,
  onGhostChange,
  onPlace,
}: WaveformProps) {
  const theme = useTheme()
  const panRef = useRef<Pan | null>(null)
  const canvasRef = useCanvas((context, width, height) => {
    if (!samples) return
    if (view === 'amplitude') {
      drawSamplesAmplitude(context, samples, range, width, height, theme.palette.primary.main, curve)
    } else {
      drawSamples(
        context,
        samples,
        range,
        width,
        height,
        theme.palette.primary.main,
        view === 'outline',
      )
    }
    drawGrid(
      context,
      sections,
      duration,
      range,
      width,
      height,
      theme.palette.secondary.main,
      theme.palette.primary.dark,
    )
    drawMarkers(context, markers, range, width, height, theme.palette.secondary.main)
    if (ghost !== null) {
      context.globalAlpha = 0.4
      drawMarkers(
        context,
        [ghost],
        range,
        width,
        height,
        placing === 'section' ? theme.palette.primary.dark : theme.palette.secondary.main,
      )
      context.globalAlpha = 1
    }
    drawPlayhead(context, position, range, width, height, theme.palette.error.main, true)
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !onRangeChange || !samples) return

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()

      const bounds = canvas.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
      const span = range.end - range.start
      const anchor = range.start + ratio * span
      const nextSpan = Math.min(1, span * Math.exp(event.deltaY * ZOOM_RATE))

      onRangeChange(clampRange({ start: anchor - ratio * nextSpan, end: anchor + (1 - ratio) * nextSpan }))
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [canvasRef, onRangeChange, samples, range.start, range.end])

  const interactive = Boolean(samples && onRangeChange)

  const positionAt = (clientX: number, element: HTMLCanvasElement) => {
    const bounds = element.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width))
    return range.start + ratio * (range.end - range.start)
  }

  const begin = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactive) return
    panRef.current = { clientX: event.clientX, start: range.start, span: range.end - range.start }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (placing && samples) onGhostChange?.(positionAt(event.clientX, event.currentTarget))

    const pan = panRef.current
    if (!pan || !onRangeChange) return

    const width = event.currentTarget.clientWidth
    if (width === 0) return

    const shift = ((event.clientX - pan.clientX) / width) * pan.span
    onRangeChange(clampRange({ start: pan.start - shift, end: pan.start - shift + pan.span }))
  }

  const end = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const pan = panRef.current
    panRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)

    if (!placing || !samples || !pan) return
    if (Math.abs(event.clientX - pan.clientX) > CLICK_SLOP) return
    onPlace?.(positionAt(event.clientX, event.currentTarget))
  }

  return (
    <Box
      component="canvas"
      ref={canvasRef}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={() => onGhostChange?.(null)}
      sx={{
        display: 'block',
        width: '100%',
        height: '100%',
        touchAction: 'none',
        cursor: placing && samples ? 'crosshair' : interactive ? 'grab' : 'default',
        '&:active': interactive && !placing ? { cursor: 'grabbing' } : undefined,
      }}
    />
  )
}
