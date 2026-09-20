import { useRef, type RefObject } from 'react'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import { BLOCK_GAP, blockHeights, collectBars, drawColumnCursor, renderBarColumns } from '../draw'
import { useCanvas } from '../useCanvas'
import { sectionSpans, type Section } from '../timing'

type BarGridProps = {
  loudness: Float32Array | null
  onsets: Float32Array | null
  bands: Float32Array | null
  position: number
  sections: Section[]
  duration: number
  positionRef: RefObject<number>
  playing: boolean
}

export default function BarGrid({
  loudness,
  onsets,
  bands,
  position,
  sections,
  duration,
  positionRef,
  playing,
}: BarGridProps) {
  const theme = useTheme()
  const spans = sectionSpans(sections, duration)
  const active =
    spans.find((span) => position >= span.start && position <= span.end) ?? spans[0] ?? null
  const bars = active ? collectBars(active) : []

  const sources = { loudness, onsets, bands }
  const cacheRef = useRef<{ canvas: HTMLCanvasElement; key: string } | null>(null)

  const canvasRef = useCanvas((context, width, height) => {
    if (bars.length === 0) return

    const key = [
      Math.round(width),
      Math.round(height),
      bars.length,
      bars[0]?.start ?? 0,
      bars[0]?.end ?? 0,
      loudness?.length ?? 0,
      onsets?.length ?? 0,
      bands?.length ?? 0,
    ].join('|')

    let cache = cacheRef.current
    if (!cache || cache.key !== key) {
      const layer = cache?.canvas ?? document.createElement('canvas')
      layer.width = Math.max(1, Math.round(width))
      layer.height = Math.max(1, Math.round(height))
      const layerContext = layer.getContext('2d')
      if (!layerContext) return
      layerContext.putImageData(
        renderBarColumns(layerContext, sources, bars, layer.width, layer.height),
        0,
        0,
      )
      cache = { canvas: layer, key }
      cacheRef.current = cache
    }

    context.drawImage(cache.canvas, 0, 0, width, height)

    const tops: number[] = []
    let top = 0
    for (const blockHeight of blockHeights(height)) {
      tops.push(top)
      top += blockHeight + BLOCK_GAP
    }

    drawColumnCursor(
      context,
      bars,
      tops,
      blockHeights(height),
      positionRef.current,
      width,
      theme.palette.error.main,
    )
  }, playing)

  return (
    <Box
      component="canvas"
      ref={canvasRef}
      sx={{ display: 'block', width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  )
}
