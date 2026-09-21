import { useEffect, useRef, useState, type RefObject } from 'react'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import {
  ALL_BLOCKS,
  autoSliceBeats,
  curveSignature,
  collectBars,
  drawColumnCursor,
  drawProjection,
  drawSectionBounds,
  drawSliceGuides,
  renderBarLayers,
  PROJECTION_WIDTH,
  sectionSignature,
} from '../draw'
import { useCanvas } from '../useCanvas'
import {
  createSection,
  MAX_BPM,
  MIN_BPM,
  sectionSpans,
  sortSections,
  type Section,
} from '../timing'
import { clampRange } from '../range'
import { useLiveEdit } from '../useLiveEdit'
import { useRafCallback } from '../useRafCallback'
import type { Curve } from '../curve'
import type { Range } from '../range'

type BarGridProps = {
  envelope: Float32Array | null
  loudness: Float32Array | null
  onsets: Float32Array | null
  bands: Float32Array | null
  sections: Section[]
  duration: number
  position: number
  positionRef: RefObject<number>
  playing: boolean
  curve: Curve
  range: Range
  onRangeChange: (range: Range) => void
  onSectionsChange: (sections: Section[]) => void
  onSeek: (position: number) => void
  slice: number | 'auto'
  lane: number | 'all'
  divisions: number
  colormap: number
}

const GUIDE_COLOR = '#ffffff'
const ZOOM_RATE = 0.002
const HOVER_COLOR = '#ffffff'
const HOVER_WIDTH = 3
const GESTURE_END_MS = 140
const AXIS_SLOP = 4
const COARSE_BPM = 0.1
const FINE_BPM = 0.01
// plain drag covers several slices per screen; ctrl drops to one slice per
// block, which is the resolution the columns are drawn at
const OFFSET_GAIN = 2

export default function BarGrid({
  envelope,
  loudness,
  onsets,
  bands,
  sections,
  duration,
  position,
  positionRef,
  playing,
  curve,
  range: givenRange,
  onRangeChange,
  onSectionsChange,
  onSeek,
  slice,
  lane,
  divisions,
  colormap,
}: BarGridProps) {
  const theme = useTheme()

  const [live, editSections, settleSections] = useLiveEdit(sections, onSectionsChange)
  // the wheel fires faster than the app can usefully re-render, so the window
  // is kept here during a gesture and handed over once it stops
  const [range, editRange, settleRange] = useLiveEdit(givenRange, onRangeChange)
  const settleTimer = useRef(0)
  const blocks = lane === 'all' ? ALL_BLOCKS : [lane]
  const spans = sectionSpans(live, duration)
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

  // every section the window touches contributes its own slices, so the view is
  // continuous across tempo changes rather than one section at a time
  const visible = spans.filter((span) => span.end > range.start && span.start < range.end)
  const windowSpan = Math.max(1e-9, range.end - range.start)

  const bars = (visible.length > 0 ? visible : spans.slice(0, 1))
    .flatMap((span) => {
      const share = (Math.min(span.end, range.end) - Math.max(span.start, range.start)) / windowSpan
      const beats =
        slice === 'auto' ? autoSliceBeats(span, Math.max(120, plotWidth(width) * share)) : slice
      return collectBars(span, beats)
    })
    .filter((bar) => bar.end > range.start && bar.start < range.end)
    .sort((left, right) => left.start - right.start)

  const sources = { envelope, loudness, onsets, bands }
  // The panel on the right holds the projection, so the bars are drawn into
  // what is left. Every reading of a pointer position goes through this too, or
  // the column under the cursor stops being the column under the cursor.
  const plotWidth = (full: number) => Math.max(1, full - PROJECTION_WIDTH)

  const cacheRef = useRef<{
    canvases: { canvas: HTMLCanvasElement; top: number; height: number; profile: Float32Array }[]
    key: string
  } | null>(null)

  const applyRange = useRafCallback(editRange)
  const sliceHeightRef = useRef(1)
  const [menu, setMenu] = useState<{ x: number; y: number; at: number; id: string } | null>(null)
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const layoutRef = useRef<{ tops: number[]; heights: number[] }>({ tops: [], heights: [] })
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
  const zoomRef = useRef({ range, applyRange, settle: settleRange })
  useEffect(() => {
    zoomRef.current = { range, applyRange, settle: settleRange }
  })

  const canvasRef = useCanvas((context, full, height) => {
    if (bars.length === 0) return

    // the bars keep the canvas minus the panel on the right, and everything
    // that maps a position to a column measures against this rather than the
    // whole canvas
    const width = plotWidth(full)

    const key = [
      Math.round(width),
      Math.round(height),
      bars.length,
      // every bar, not just the ends: dragging a section in the middle leaves
      // the first and last exactly where they were
      sectionSignature(live),
      bars[0]?.start ?? 0,
      bars[bars.length - 1]?.end ?? 0,
      envelope?.length ?? 0,
      loudness?.length ?? 0,
      onsets?.length ?? 0,
      bands?.length ?? 0,
      blocks.join(','),
      colormap,
      curve.points.map((point) => `${point.x}:${point.y}`).join(','),
    ].join('|')

    let cache = cacheRef.current
    if (!cache || cache.key !== key) {
      const layers = renderBarLayers(context, sources, bars, height, curve, blocks, colormap)

      cache = {
        key,
        canvases: layers.map((layer) => {
          const canvas = document.createElement('canvas')
          canvas.width = layer.image.width
          canvas.height = layer.image.height
          canvas.getContext('2d')?.putImageData(layer.image, 0, 0)
          return { canvas, top: layer.top, height: layer.height, profile: layer.profile }
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
    sliceHeightRef.current = Math.max(1, heights[0] ?? 1)
    layoutRef.current = { tops, heights }

    tops.forEach((top, index) =>
      drawSliceGuides(context, top, heights[index], width, GUIDE_COLOR, divisions),
    )

    // the section under the pointer is the one a drag would edit, so it is
    // tinted: the hover position already says which column
    const column = width / bars.length
    const under =
      hover && bars.length > 0
        ? (bars[Math.min(bars.length - 1, Math.max(0, Math.floor(hover.x / column)))]?.section ??
          null)
        : null

    drawSectionBounds(
      context,
      bars,
      width,
      height,
      theme.palette.info.dark,
      under,
      theme.palette.info.main,
    )

    // only across the column under the pointer, so it reads as a position in
    // that slice rather than as a rule over the whole picture
    if (hover && bars.length > 0) {
      const index = Math.min(bars.length - 1, Math.max(0, Math.floor(hover.x / column)))
      context.fillStyle = HOVER_COLOR
      context.fillRect(index * column, hover.y - HOVER_WIDTH / 2, column, HOVER_WIDTH)
    }

    drawColumnCursor(
      context,
      bars,
      tops,
      heights,
      positionRef.current,
      width,
      theme.palette.error.main,
    )

    for (const layer of cache.canvases) {
      drawProjection(
        context,
        layer.profile,
        width,
        layer.top,
        full - width,
        layer.height,
        theme.palette.text.primary,
      )
    }

  }, playing, `${bars.length}|${sectionSignature(live)}|${bars[0]?.start ?? 0}|${bars[bars.length - 1]?.end ?? 0}|${position}|${hover?.x}:${hover?.y}|${blocks.join(',')}|${divisions}|${colormap}|${curveSignature(curve)}`)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const onWheel = (event: WheelEvent) => {
      const bounds = canvas.getBoundingClientRect()
      if (bounds.width === 0) return
      event.preventDefault()

      const { range: current, applyRange: apply } = zoomRef.current
      const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / plotWidth(bounds.width)))
      const span = current.end - current.start
      const anchor = current.start + ratio * span
      const next = Math.min(1, span * Math.exp(event.deltaY * ZOOM_RATE))

      apply(clampRange({ start: anchor - ratio * next, end: anchor + (1 - ratio) * next }))

      window.clearTimeout(settleTimer.current)
      settleTimer.current = window.setTimeout(() => zoomRef.current.settle(), GESTURE_END_MS)
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [canvasRef])

  // one block is one slice tall, so a pixel of drag is a known number of
  // milliseconds: the same gesture means the same thing at any zoom or density
  const sectionAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width === 0 || bars.length === 0) return null

    const ratio = Math.min(0.999, Math.max(0, (event.clientX - bounds.left) / plotWidth(bounds.width)))
    const bar = bars[Math.floor(ratio * bars.length)]
    const span = spans.find((item) => item.section.id === bar.section)
    return span ? { span, bar } : null
  }

  // a column is one slice and its rows are that slice's time, so the pointer
  // lands on an exact moment rather than on a bar boundary
  const timeAt = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const target = sectionAt(event as React.PointerEvent<HTMLCanvasElement>)
    if (!target) return null

    const bounds = event.currentTarget.getBoundingClientRect()
    const y = event.clientY - bounds.top
    const { tops, heights } = layoutRef.current

    let block = tops.findIndex((top, index) => y >= top && y < top + heights[index])
    if (block < 0) block = 0

    const fraction = Math.min(
      1,
      Math.max(0, (y - (tops[block] ?? 0)) / Math.max(1, heights[block] ?? 1)),
    )
    const at = target.bar.start + fraction * (target.bar.end - target.bar.start)
    return { at, id: target.span.section.id, bpm: target.span.section.bpm }
  }

  const openMenu = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    const spot = timeAt(event)
    if (!spot) return

    // right click places a section; ctrl brings up the menu for the rarer edits
    if (!event.ctrlKey && !event.metaKey) {
      addAt(spot.at, spot.id)
      return
    }

    setMenu({ x: event.clientX, y: event.clientY, at: spot.at, id: spot.id })
  }

  const addSection = () => {
    if (!menu) return
    addAt(menu.at, menu.id)
    setMenu(null)
  }

  const addAt = (at: number, id: string) => {
    const from = live.find((section) => section.id === id)
    onSectionsChange(
      sortSections([
        ...live,
        createSection(at * duration * 1000, from?.bpm ?? 120, from?.meter),
      ]),
    )
  }

  const removeSection = () => {
    if (!menu) return
    onSectionsChange(live.filter((section) => section.id !== menu.id))
    setMenu(null)
  }

  const begin = (event: React.PointerEvent<HTMLCanvasElement>) => {
    // pointerdown fires for every button, and a right click that also started a
    // drag edited the section on its way to opening the menu
    if (event.button !== 0) return

    // whichever section is under the pointer is the one the drag edits
    const target = sectionAt(event)
    if (!target) return
    const active = target.span

    dragRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      offsetMs: active.section.offsetMs,
      perPixel: ((target.bar.end - target.bar.start) * duration * 1000) / sliceHeightRef.current,
      id: active.section.id,
      bpm: active.section.bpm,
      // held at the press, not read while moving: picking up a modifier
      // mid-drag would jump the value by everything moved so far
      tempo: event.shiftKey,
      fine: event.ctrlKey || event.metaKey,
      start: range.start,
      span: range.end - range.start,
      axis: 'none',
    }
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current

    if (!drag) {
      const bounds = event.currentTarget.getBoundingClientRect()
      const x = Math.round(event.clientX - bounds.left)
      const y = Math.round(event.clientY - bounds.top)
      setHover((current) => (current?.x === x && current?.y === y ? current : { x, y }))
      return
    }

    const dx = event.clientX - drag.clientX
    const dy = event.clientY - drag.clientY

    // holding shift means tempo, so it edits from the first pixel: waiting for
    // an axis to win made a sideways wobble pan instead, and the edit only
    // started once the drag had already moved
    if (drag.tempo) drag.axis = 'vertical'

    // otherwise the axis is decided once, so a sideways drag cannot nudge the
    // offset on the way past and a vertical one cannot slide the window
    if (drag.axis === 'none') {
      if (Math.abs(dx) < AXIS_SLOP && Math.abs(dy) < AXIS_SLOP) return
      drag.axis = Math.abs(dx) > Math.abs(dy) ? 'pan' : 'vertical'
    }

    if (drag.axis === 'pan') {
      const width = plotWidth(event.currentTarget.clientWidth)
      if (width <= 1) return
      const shift = (dx / width) * drag.span
      applyRange(clampRange({ start: drag.start - shift, end: drag.start - shift + drag.span }))
      return
    }

    // dragging down raises the tempo, matching the offset gesture: the hand
    // pushes the grid the way the audio moves in the column
    const patch: Partial<Section> = drag.tempo
      ? {
          bpm: Math.min(
            MAX_BPM,
            Math.max(MIN_BPM, drag.bpm + dy * (drag.fine ? FINE_BPM : COARSE_BPM)),
          ),
        }
      : {
          offsetMs: Math.max(
            0,
            drag.offsetMs - dy * drag.perPixel * (drag.fine ? 1 : OFFSET_GAIN),
          ),
        }

    const next = sortSections(
      live.map((section) => (section.id === drag.id ? { ...section, ...patch } : section)),
    )
    editSections(next)
  }

  const end = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    setDragging(false)
    event.currentTarget.releasePointerCapture(event.pointerId)
    settleSections()
    settleRange()

    // a press that never moved far enough to pick an axis was a click, and a
    // click moves the playhead to the moment under the pointer
    if (!drag || drag.axis !== 'none' || drag.tempo) return
    const spot = timeAt(event)
    if (spot) onSeek(spot.at)
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
        onPointerLeave={() => setHover(null)}
        onContextMenu={openMenu}
        sx={{
          display: 'block',
          width: '100%',
          height: '100%',
          touchAction: 'none',
          cursor: dragging ? 'move' : 'default',
        }}
      />
      {menu ? (
      <Menu
        open
        onClose={() => setMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={{ top: menu.y, left: menu.x }}
      >
        <MenuItem
          dense
          onClick={() => {
            if (menu) onSeek(menu.at)
            setMenu(null)
          }}
        >
          Move playhead here
        </MenuItem>
        <MenuItem dense onClick={addSection}>
          Add tempo section here
        </MenuItem>
        <MenuItem dense disabled={sections.length <= 1} onClick={removeSection}>
          Remove this section
        </MenuItem>
      </Menu>
      ) : null}
    </Box>
  )
}
