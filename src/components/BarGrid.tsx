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
import { sectionSpans, type Section } from '../timing'
import type { Curve } from '../curve'

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
  slice: number | 'auto'
  onSliceChange: (slice: number | 'auto') => void
}

const GUIDE_COLOR = '#ffffff'

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
  const bars = active ? collectBars(active, beats) : []

  const sources = { envelope, loudness, onsets, bands }
  const cacheRef = useRef<{
    canvases: { canvas: HTMLCanvasElement; top: number; height: number }[]
    key: string
  } | null>(null)

  const canvasRef = useCanvas((context, width, height) => {
    if (bars.length === 0) return

    const key = [
      Math.round(width),
      Math.round(height),
      bars.length,
      beats,
      bars[0]?.start ?? 0,
      bars[0]?.end ?? 0,
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

  return (
    <Box ref={wrapRef} sx={{ position: 'relative', height: '100%' }}>
      <Box
        component="canvas"
      ref={canvasRef}
        sx={{ display: 'block', width: '100%', height: '100%', pointerEvents: 'none' }}
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
