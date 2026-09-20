import { useEffect, useRef, useState, type RefObject } from 'react'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import {
  drawBackdrop,
  drawEnvelopeAmplitude,
  drawGrid,
  drawMarkers,
  drawPlayhead,
} from '../draw'
import { useCanvas } from '../useCanvas'
import { useRafCallback } from '../useRafCallback'
import { clampRange, type Range } from '../range'
import type { Section } from '../timing'
import { DEFAULT_CURVE, type Curve } from '../curve'

type WaveformProps = {
  samples: Float32Array | null
  envelope: Float32Array | null
  backdrop?: string | null
  positionRef: RefObject<number>
  playing: boolean
  markers: number[]
  focus?: { start: number; end: number } | null
  sections: Section[]
  duration: number
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
  envelope,
  backdrop = null,
  positionRef,
  playing,
  markers,
  focus = null,
  sections,
  duration,
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
  const cacheRef = useRef<{ canvas: HTMLCanvasElement; key: string } | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [imageVersion, setImageVersion] = useState(0)

  useEffect(() => {
    if (!backdrop) {
      imageRef.current = null
      return
    }

    const image = new Image()
    image.onload = () => {
      imageRef.current = image
      setImageVersion((current) => current + 1)
    }
    image.src = backdrop

    return () => {
      image.onload = null
    }
  }, [backdrop])
  const applyRange = useRafCallback((next: Range) => onRangeChange?.(next))
  const applyGhost = useRafCallback((next: number | null) => onGhostChange?.(next))

  const paintStatic = (context: CanvasRenderingContext2D, width: number, height: number) => {
    if (!samples) return
    if (imageRef.current) drawBackdrop(context, imageRef.current, width, height)

    const halves = envelope
      ? drawEnvelopeAmplitude(
          context,
          envelope,
          range,
          width,
          height,
          theme.palette.primary.main,
          curve,
        )
      : null
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
    const shown = focus
      ? markers.filter((marker) => marker >= focus.start && marker <= focus.end)
      : markers
    drawMarkers(context, shown, range, width, height, theme.palette.secondary.main)
    if (ghost !== null) {
      context.globalAlpha = 0.4
      drawMarkers(
        context,
        [ghost],
        range,
        width,
        height,
        placing === 'section' ? theme.palette.info.main : theme.palette.secondary.main,
      )
      context.globalAlpha = 1
    }
  }

  const canvasRef = useCanvas((context, width, height) => {
    if (!samples) return

    const ratio = window.devicePixelRatio || 1
    const key = [
      width,
      height,
      ratio,
      range.start,
      range.end,
      samples.length,
      envelope?.length ?? 0,
      duration,
      backdrop ?? '',
      imageVersion,
      ghost,
      placing,
      focus ? `${focus.start}:${focus.end}` : '',
      markers.join(','),
      sections.map((section) => `${section.offsetMs}:${section.bpm}`).join(','),
      curve.points.map((point) => `${point.x}:${point.y}`).join(','),
    ].join('|')

    let cache = cacheRef.current
    if (!cache || cache.key !== key) {
      const layer = cache?.canvas ?? document.createElement('canvas')
      layer.width = Math.round(width * ratio)
      layer.height = Math.round(height * ratio)
      const layerContext = layer.getContext('2d')
      if (!layerContext) return
      layerContext.setTransform(ratio, 0, 0, ratio, 0, 0)
      layerContext.clearRect(0, 0, width, height)
      paintStatic(layerContext, width, height)
      cache = { canvas: layer, key }
      cacheRef.current = cache
    }

    context.drawImage(cache.canvas, 0, 0, width, height)
    drawPlayhead(context, positionRef.current, range, width, height, theme.palette.error.main, true)
  }, playing)

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
    if (placing && samples) applyGhost(positionAt(event.clientX, event.currentTarget))

    const pan = panRef.current
    if (!pan || !onRangeChange) return

    const width = event.currentTarget.clientWidth
    if (width === 0) return

    const shift = ((event.clientX - pan.clientX) / width) * pan.span
    applyRange(clampRange({ start: pan.start - shift, end: pan.start - shift + pan.span }))
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
      onPointerLeave={() => applyGhost(null)}
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
