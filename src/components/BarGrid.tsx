import { useEffect, useRef, useState, type RefObject } from 'react'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import Paper from '@mui/material/Paper'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import {
  autoSliceBeats,
  collectBars,
  drawColumnCursor,
  drawSliceGuides,
  renderBarLayers,
  SLICE_STEPS,
} from '../draw'
import { useCanvas } from '../useCanvas'
import { MAX_BPM, MIN_BPM, sectionSpans, sortSections, type Section } from '../timing'
import { clampRange } from '../range'
import { useRafCallback } from '../useRafCallback'
import type { Curve } from '../curve'
import type { Range } from '../range'

type BarGridProps = {
  envelope: Float32Array | null
  loudness: Float32Array | null
  onsets: Float32Array | null
  bands: Float32Array | null
  position: number
  sections: Section[]
  duration: number
  positionRef: RefObject<number>
  playing: boolean
  curve: Curve
  range: Range
  onRangeChange: (range: Range) => void
  onSectionsChange: (sections: Section[]) => void
  slice: number | 'auto'
  onSliceChange: (slice: number | 'auto') => void
}

const GUIDE_COLOR = '#ffffff'
const ZOOM_RATE = 0.002
const AXIS_SLOP = 4
const COARSE_BPM = 0.02
const FINE_BPM = 0.002

export default function BarGrid({
  envelope,
  loudness,
  onsets,
  bands,
  position,
  sections,
  duration,
  positionRef,
  playing,
  curve,
  range,
  onRangeChange,
  onSectionsChange,
  slice,
  onSliceChange,
}: BarGridProps) {
  const theme = useTheme()
  const spans = sectionSpans(sections, duration)
  const active =
    spans.find((span) => position >= span.start && position <= span.end) ?? spans[0] ?? null
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    const observer = new ResizeObserver(() => setWidth(wrap.clientWidth))
    observer.observe(wrap)
    setWidth(wrap.clientWidth)
    return () => observer.disconnect()
  }, [])

  const beats = active
    ? slice === 'auto'
      ? autoSliceBeats(active, width)
      : slice
    : 4
  // the bars stay anchored to the section, so the window only decides how many
  // of them are on screen: narrow it and the columns get wider
  const all = active ? collectBars(active, beats) : []
  const inside = all.filter((bar) => bar.end > range.start && bar.start < range.end)
  const bars = inside.length > 0 ? inside : all

  const sources = { envelope, loudness, onsets, bands }
  const cacheRef = useRef<{
    canvases: { canvas: HTMLCanvasElement; top: number; height: number }[]
    key: string
  } | null>(null)

  const applyRange = useRafCallback(onRangeChange)
  const applySections = useRafCallback(onSectionsChange)
  const sliceHeightRef = useRef(1)
  const dragRef = useRef<{
    clientX: number
    clientY: number
    offsetMs: number
    perPixel: number
    id: string
    bpm: number
    tempo: boolean
    fine: boolean
    start: number
    span: number
    axis: 'none' | 'vertical' | 'pan'
  } | null>(null)
  const zoomRef = useRef({ range, applyRange })
  useEffect(() => {
    zoomRef.current = { range, applyRange }
  })

  const canvasRef = useCanvas((context, width, height) => {
    if (bars.length === 0) return

    const key = [
      Math.round(width),
      Math.round(height),
      bars.length,
      beats,
      bars[0]?.start ?? 0,
      bars[bars.length - 1]?.end ?? 0,
      envelope?.length ?? 0,
      loudness?.length ?? 0,
      onsets?.length ?? 0,
      bands?.length ?? 0,
      curve.points.map((point) => `${point.x}:${point.y}`).join(','),
    ].join('|')

    let cache = cacheRef.current
    if (!cache || cache.key !== key) {
      const layers = renderBarLayers(context, sources, bars, height, curve)

      cache = {
        key,
        canvases: layers.map((layer) => {
          const canvas = document.createElement('canvas')
          canvas.width = layer.image.width
          canvas.height = layer.image.height
          canvas.getContext('2d')?.putImageData(layer.image, 0, 0)
          return { canvas, top: layer.top, height: layer.height }
        }),
      }
      cacheRef.current = cache
    }

    context.imageSmoothingEnabled = false
    for (const layer of cache.canvases) {
      context.drawImage(layer.canvas, 0, layer.top, width, layer.height)
    }

    const heights = cache.canvases.map((layer) => layer.height)
    sliceHeightRef.current = Math.max(1, heights[0] ?? 1)
    const tops = cache.canvases.map((layer) => layer.top)

    if (tops.length > 0) drawSliceGuides(context, tops[0], heights[0], width, GUIDE_COLOR)
    if (tops.length > 3) drawSliceGuides(context, tops[3], heights[3], width, GUIDE_COLOR)

    drawColumnCursor(
      context,
      bars,
      tops,
      heights,
      positionRef.current,
      width,
      theme.palette.error.main,
    )
  }, playing)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const onWheel = (event: WheelEvent) => {
      const bounds = canvas.getBoundingClientRect()
      if (bounds.width === 0) return
      event.preventDefault()

      const { range: current, applyRange: apply } = zoomRef.current
      const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
      const span = current.end - current.start
      const anchor = current.start + ratio * span
      const next = Math.min(1, span * Math.exp(event.deltaY * ZOOM_RATE))

      apply(clampRange({ start: anchor - ratio * next, end: anchor + (1 - ratio) * next }))
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [canvasRef])

  // one block is one slice tall, so a pixel of drag is a known number of
  // milliseconds: the same gesture means the same thing at any zoom or density
  const begin = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!active) return

    dragRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      offsetMs: active.section.offsetMs,
      perPixel: ((60000 / active.section.bpm) * beats) / sliceHeightRef.current,
      id: active.section.id,
      bpm: active.section.bpm,
      // held at the press, not read while moving: picking up a modifier
      // mid-drag would jump the value by everything moved so far
      tempo: event.shiftKey,
      fine: event.shiftKey && (event.ctrlKey || event.metaKey),
      start: range.start,
      span: range.end - range.start,
      axis: 'none',
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (!drag) return

    const dx = event.clientX - drag.clientX
    const dy = event.clientY - drag.clientY

    // the axis is decided once, so a sideways drag cannot nudge the offset on
    // the way past and a vertical one cannot slide the window
    if (drag.axis === 'none') {
      if (Math.abs(dx) < AXIS_SLOP && Math.abs(dy) < AXIS_SLOP) return
      drag.axis = Math.abs(dx) > Math.abs(dy) ? 'pan' : 'vertical'
    }

    if (drag.axis === 'pan') {
      const width = event.currentTarget.clientWidth
      if (width === 0) return
      const shift = (dx / width) * drag.span
      applyRange(clampRange({ start: drag.start - shift, end: drag.start - shift + drag.span }))
      return
    }

    // up raises the tempo, and dragging down pulls the audio down the column,
    // which is an earlier offset
    const patch: Partial<Section> = drag.tempo
      ? {
          bpm: Math.min(
            MAX_BPM,
            Math.max(MIN_BPM, drag.bpm - dy * (drag.fine ? FINE_BPM : COARSE_BPM)),
          ),
        }
      : { offsetMs: Math.max(0, drag.offsetMs - dy * drag.perPixel) }

    applySections(
      sortSections(
        sections.map((section) => (section.id === drag.id ? { ...section, ...patch } : section)),
      ),
    )
  }

  const end = (event: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <Box ref={wrapRef} sx={{ position: 'relative', height: '100%' }}>
      <Box
        component="canvas"
      ref={canvasRef}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        sx={{
          display: 'block',
          width: '100%',
          height: '100%',
          touchAction: 'none',
          cursor: 'move',
        }}
      />
      <Paper
        elevation={3}
        sx={{
          position: 'absolute',
          top: 6,
          right: 6,
          borderRadius: 999,
          overflow: 'hidden',
        }}
      >
        <ToggleButtonGroup
          size="small"
          exclusive
          value={slice}
          onChange={(_, next) => {
            if (next !== null) onSliceChange(next as number | 'auto')
          }}
          sx={{ '& .MuiToggleButton-root': { px: 0.75, py: 0.25, border: 0, fontSize: 11 } }}
        >
          <ToggleButton value="auto" aria-label="Automatic slice length">
            auto
          </ToggleButton>
          {SLICE_STEPS.map((entry) => (
            <ToggleButton key={entry} value={entry} aria-label={`${entry} beats per column`}>
              {entry}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Paper>
    </Box>
  )
}
