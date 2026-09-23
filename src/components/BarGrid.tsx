import { useEffect, useRef, useState, type RefObject } from 'react'
import Box from '@mui/material/Box'
import { useTheme, type Theme } from '@mui/material/styles'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import {
  ALL_BLOCKS,
  autoSliceBeats,
  curveSignature,
  collectBars,
  columnLayout,
  columnProfile,
  drawColumnCursor,
  drawProjection,
  drawSectionBounds,
  drawSectionHighlight,
  drawSliceGuides,
  buildWaveImage,
  buildWaveShape,
  blockPanels,
  colorChannels,
  laneLutBytes,
  peakBetween,
  addContribution,
  barContribution,
  blockHeights,
  finishProjections,
  takeContribution,
  BAND_ORDER,
  BLOCK_GAP,
  CURSOR_HUE,
  CURSOR_OUTLINE,
  CURSOR_WIDTH,
  type Bar,
  type BarSources,
  type Contribution,
  type CursorTint,
  type ProjectionLayer,
  type WaveStyle,
  renderBarLayers,
  PROJECTION_WIDTH,
  sectionSignature,
} from '../draw'
import { useCanvasControl } from '../useCanvas'
import {
  createSection,
  MAX_BPM,
  MIN_BPM,
  sectionSpans,
  sortSections,
  type Section,
  type SectionSpan,
} from '../timing'
import { clampRange } from '../range'
import { useLiveSectionsEdit } from '../liveSections'
import { useRafCallback } from '../useRafCallback'
import {
  canRenderLanesGl,
  releaseLanesGl,
  renderLanesGl,
  type LaneCursor,
  type LanePanel,
} from '../laneGl'
import { applyCurve, type Curve } from '../curve'
import type { Range } from '../range'
import { measure, stopwatch, tick } from '../trace'
import { useLiveRangeEdit } from '../liveRange'

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
  cursorMode: GlobalCompositeOperation
  cursorTint: CursorTint
  waveStyle: WaveStyle
  // keep the playhead's column at a fixed place across the plot and move the
  // window under it, rather than the playhead across a still window
  follow: boolean
}

const GUIDE_COLOR = '#ffffff'
const ZOOM_RATE = 0.002
const HOVER_COLOR = '#ffffff'
const HOVER_WIDTH = 3
const GESTURE_END_MS = 140
const AXIS_SLOP = 4
// BPM a pixel of a shift drag moves, and with ctrl held as well: a hundredth
// a pixel was still too quick to land a tempo on, so the plain drag is now the
// hundredth and ctrl goes down to the thousandth
const COARSE_BPM = 0.01
const FINE_BPM = 0.001
// plain drag covers several slices per screen; ctrl drops to one slice per
// block, which is the resolution the columns are drawn at
const OFFSET_GAIN = 2

// A panel either side holds the projections, so the bars are drawn into what is
// left between them. Every reading of a pointer position goes through this too, or the
// column under the cursor stops being the column under the cursor.
function plotWidth(full: number): number {
  return Math.max(1, full - PROJECTION_WIDTH * 2)
}

// The wave lane painted on the CPU, for a browser without WebGL2: sampled at
// the source's resolution and drawn as a pixel fill.
function paintWave(
  context: CanvasRenderingContext2D,
  envelope: Float32Array,
  bars: Bar[],
  height: number,
  width: number,
  curve: Curve,
  colormap: number,
  style: WaveStyle,
  theme: Theme,
): HTMLCanvasElement | null {
  const ratio = window.devicePixelRatio || 1
  const widest = bars.reduce((most, bar) => Math.max(most, bar.end - bar.start), 0)
  const rows = Math.max(
    1,
    Math.min(Math.round(height * ratio), Math.ceil(widest * envelope.length)),
  )
  const shape = buildWaveShape(envelope, bars, rows, curve, style !== 'colour')
  if (!shape) return null

  const image = buildWaveImage(
    context,
    shape,
    width,
    colormap,
    theme.palette.background.paper,
    style,
    theme.palette.primary.main,
  )
  if (!image) return null

  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  canvas.getContext('2d')?.putImageData(image, 0, 0)
  return canvas
}

// A stable name for a source array, so a contribution read from one file is
// never mistaken for the same slice of another of the same length.
const SOURCE_IDS = new WeakMap<Float32Array, number>()
let nextSourceId = 1

function sourceId(source: Float32Array): number {
  let id = SOURCE_IDS.get(source)
  if (id === undefined) {
    id = nextSourceId
    nextSourceId += 1
    SOURCE_IDS.set(source, id)
  }
  return id
}

// The running total of a block's projections and the sections in it. A plan
// moves the total by the sections that left and the ones that arrived, so a
// drag costs the dragged section and its neighbour rather than the song.
// Summing floats in and out drifts by the last few digits, so the total is
// summed afresh every so many moves.
type Running = {
  total: Contribution
  members: Map<string, Contribution>
  moves: number
}

const RESUM_EVERY = 256

// The panels the GPU draws: one per block, or three side by side for the
// bands, each reading its own source through the one shader. Built once per
// window and handed to the renderer every frame after that.
function planPanels(
  layers: ProjectionLayer[],
  sources: BarSources,
  bars: Bar[],
  width: number,
  curve: Curve,
  colormap: number,
  waveStyle: WaveStyle,
): LanePanel[] {
  const panels: LanePanel[] = []

  for (const layer of layers) {
    const source = layer.block === 3 ? sources.bands : [sources.envelope, sources.loudness, sources.onsets][layer.block]
    if (!source) continue

    const count = blockPanels(layer.block)
    const stride = layer.block === 3 ? 3 : 1
    // the wave and the loud lanes are the two whose source is a level, which
    // is what a width can say; the hits and the bands stay colour
    const style = layer.block === 0 || layer.block === 1 ? waveStyle : 'colour'

    // a shape is read against the loudest frame in view, curved the way the
    // levels are, so the loudest column fills its width and the rest are
    // drawn in proportion
    let scale = 1
    if (style !== 'colour') {
      const frames = source.length
      const peak = peakBetween(source, 1, 0, bars[0].start * frames, bars[bars.length - 1].end * frames)
      const curved = applyCurve(Math.min(1, peak), curve)
      scale = curved > 0 ? 1 / curved : 1
    }

    for (let panel = 0; panel < count; panel += 1) {
      panels.push({
        source,
        stride,
        channel: layer.block === 3 ? BAND_ORDER[panel] : 0,
        lut: laneLutBytes(layer.block, panel, curve, colormap),
        left: (panel * width) / count,
        top: layer.top,
        width: width / count,
        height: layer.height,
        style,
        scale,
        tinted: style !== 'silhouette',
      })
    }
  }

  return panels
}

// every section the window touches contributes its own slices, so the view is
// continuous across tempo changes rather than one section at a time
function viewBars(spans: SectionSpan[], range: Range, slice: number | 'auto', width: number): Bar[] {
  const visible = spans.filter((span) => span.end > range.start && span.start < range.end)

  return (visible.length > 0 ? visible : spans.slice(0, 1))
    .flatMap((span) => {
      // the automatic slice is settled on the whole song, not on the window:
      // zooming in then widens the columns and leaves what each one holds
      // alone, where re-slicing per window would halve a column's phrase the
      // moment there was room to, and change the picture under the pointer
      const beats =
        slice === 'auto'
          ? autoSliceBeats(span, Math.max(120, plotWidth(width) * (span.end - span.start)))
          : slice
      return collectBars(span, beats)
    })
    .filter((bar) => bar.end > range.start && bar.start < range.end)
    .sort((left, right) => left.start - right.start)
}

// Where a moment sits across the columns, as a fraction of the plot: the
// columns are equal in width whatever they last, so this is not where it sits
// in time.
function acrossColumns(bars: Bar[], moment: number, range: Range): number | null {
  const at = bars.findIndex((bar) => moment >= bar.start && moment < bar.end)
  if (at < 0) return null
  const bar = bars[at]
  const { head, shown } = columnLayout(bars, range)
  return (at + (moment - bar.start) / Math.max(1e-12, bar.end - bar.start) - head) / shown
}

// The window that puts a moment at a fraction of the plot, keeping a given
// span. The first guess is made along the time axis; the window's own columns
// then put the moment wherever their lengths do, so it is slid until the
// moment lands where it was asked to, a column's length at a time.
function windowPlacing(
  spans: SectionSpan[],
  slice: number | 'auto',
  width: number,
  moment: number,
  ratio: number,
  span: number,
): Range {
  let target = clampRange({ start: moment - ratio * span, end: moment + (1 - ratio) * span })

  for (let pass = 0; pass < 4; pass += 1) {
    const after = viewBars(spans, target, slice, width)
    const landed = acrossColumns(after, moment, target)
    if (landed === null || Math.abs(landed - ratio) < 1e-4) break
    const seat = columnLayout(after, target)
    const at = Math.min(after.length - 1, Math.max(0, Math.floor(seat.head + landed * seat.shown)))
    const length = after[at].end - after[at].start
    const shift = (landed - ratio) * seat.shown * length
    const slid = clampRange({ start: target.start + shift, end: target.end + shift })
    if (slid.start === target.start) break
    target = slid
  }

  return target
}

// where the playhead's column is held while the window follows it
const FOLLOW_AT = 0.4

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
  cursorMode,
  cursorTint,
  waveStyle,
  follow,
}: BarGridProps) {
  tick('BarGrid render')
  const theme = useTheme()

  const [live, editSections, settleSections] = useLiveSectionsEdit(sections, onSectionsChange)
  // the wheel fires faster than the app can usefully re-render, so the window
  // is kept here during a gesture and handed over once it stops
  const [range, editRange, settleRange] = useLiveRangeEdit(givenRange, onRangeChange)
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

  const bars = measure('BarGrid bars', () => viewBars(spans, range, slice, width))

  const sources = { envelope, loudness, onsets, bands }
  // The projections are read over every bar of the song, whatever the window
  // shows: the typical bar is the song's, and the window only decides which
  // columns are on screen. They are kept apart from the picture so a pan or a
  // zoom never reads the lanes again
  const planRef = useRef<{ layers: ProjectionLayer[]; key: string } | null>(null)
  // the current column's trace, read when the playhead enters a column and
  // kept until it leaves: a column lasts many frames
  const traceRef = useRef<{ key: string; values: (Float32Array | null)[] } | null>(null)
  // what each section adds to each block's projections, kept by everything it
  // was read from: dragging one section re-reads that section and the one
  // before it, whose end moved, and sums the rest as they were
  const runningRef = useRef<{ generation: string; blocks: Map<number, Running> }>({
    generation: '',
    blocks: new Map(),
  })

  const cacheRef = useRef<{
    layers: {
      // the CPU's painting of the visible bars, for a browser without WebGL2
      canvas: HTMLCanvasElement | null
      top: number
      height: number
      block: number
      rows: number
      profile: Float32Array
      steady: Float32Array
      both: Float32Array
    }[]
    // what the GPU draws, or empty when the CPU painted the canvases above
    panels: LanePanel[]
    gpu: boolean
    wave: HTMLCanvasElement | null
    key: string
  } | null>(null)
  // the canvas the GPU draws the lanes on, shown as it is under the 2D ones
  const glRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = glRef.current
    return () => {
      if (canvas) releaseLanesGl(canvas)
    }
  }, [])

  const applyRange = useRafCallback(editRange)
  const sliceHeightRef = useRef(1)
  const [menu, setMenu] = useState<{ x: number; y: number; at: number; id: string } | null>(null)
  // the pointer lives in a ref, not in state: a move would otherwise render the
  // component, and the bars with it, while the playback loop is already
  // drawing every frame. Playing, the loop reads it next frame; paused, the move
  // asks for the one repaint itself
  const hoverRef = useRef<{ x: number; y: number } | null>(null)
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
  const zoomRef = useRef({ range, applyRange, editRange, settle: settleRange, spans, slice, width })
  useEffect(() => {
    zoomRef.current = { range, applyRange, editRange, settle: settleRange, spans, slice, width }
  })

  // Following: every frame while the song plays the window is placed so the
  // playhead's column sits at FOLLOW_AT, through the live store like a drag,
  // and committed once when the song stops or the following does
  useEffect(() => {
    if (!follow || !playing) return

    let frame = requestAnimationFrame(function tick() {
      const { range: current, editRange: edit, spans: held, slice: cut, width: full } = zoomRef.current
      const span = current.end - current.start
      const target = windowPlacing(held, cut, full, positionRef.current, FOLLOW_AT, span)
      if (Math.abs(target.start - current.start) > 1e-9) edit(target)
      frame = requestAnimationFrame(tick)
    })

    return () => {
      cancelAnimationFrame(frame)
      zoomRef.current.settle()
    }
  }, [follow, playing, positionRef])

  // paused, a seek is followed once, straight to the app
  useEffect(() => {
    if (!follow || playing) return
    const { range: current, spans: held, slice: cut, width: full } = zoomRef.current
    const span = current.end - current.start
    const target = windowPlacing(held, cut, full, position, FOLLOW_AT, span)
    if (Math.abs(target.start - current.start) > 1e-9) onRangeChange(target)
    // only a change of position or of following is a reason to move the window
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow, playing, position])

  // The hover bar on its own canvas over the base one: a pointer move repaints
  // this alone, a fill and nothing else, where the base carries the picture,
  // the guides, the cursor and the projections
  const { canvasRef: overlayRef, repaint: repaintOverlay } = useCanvasControl(
    (context, full, height) => {
      const hover = hoverRef.current
      if (!hover || bars.length === 0) return

      const width = plotWidth(full)
      const layout = columnLayout(bars, range)
      const column = width / layout.shown
      const offset = -layout.head * column
      const index = Math.min(
        bars.length - 1,
        Math.max(0, Math.floor((hover.x - PROJECTION_WIDTH - offset) / column)),
      )

      context.save()
      context.translate(PROJECTION_WIDTH, 0)
      context.beginPath()
      context.rect(0, 0, width, height)
      context.clip()

      // the section under the pointer is the one a drag would edit, so it is
      // boxed: the hover position already says which column
      const section = bars[index]?.section
      if (section) {
        drawSectionHighlight(context, bars, width, height, section, theme.palette.info.main, layout)
      }

      // only across the column under the pointer, so it reads as a position in
      // that slice rather than as a rule over the whole picture
      context.fillStyle = HOVER_COLOR
      context.fillRect(offset + index * column, hover.y - HOVER_WIDTH / 2, column, HOVER_WIDTH)
      context.restore()
    },
  )

  // The picture, the plan and the window cache are settled once per change
  // and shared by every canvas that draws from them
  const ensureCache = (context: CanvasRenderingContext2D, full: number, height: number) => {
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
      waveStyle,
      curve.points.map((point) => `${point.x}:${point.y}`).join(','),
    ].join('|')

    const planKey = [
      Math.round(width),
      Math.round(height),
      sectionSignature(live),
      slice,
      envelope?.length ?? 0,
      loudness?.length ?? 0,
      onsets?.length ?? 0,
      bands?.length ?? 0,
      blocks.join(','),
      curve.points.map((point) => `${point.x}:${point.y}`).join(','),
    ].join('|')

    let plan = planRef.current
    if (!plan || plan.key !== planKey) {
      plan = measure('BarGrid plan', () => {
        const curveKey = curve.points.map((point) => `${point.x}:${point.y}`).join(',')
        const heights = blockHeights(height, blocks)
        const layers: ProjectionLayer[] = []
        let top = 0

        // everything a contribution is read through besides the section: when
        // any of it changes, every total starts again
        const generation = [
          Math.round(width),
          Math.round(height),
          slice,
          blocks.join(','),
          curveKey,
          [envelope, loudness, onsets, bands].map((source) => (source ? sourceId(source) : 0)).join(','),
        ].join('|')
        const running = runningRef.current
        if (running.generation !== generation) {
          running.generation = generation
          running.blocks.clear()
        }

        blocks.forEach((block, slot) => {
          const blockHeight = Math.max(1, heights[slot])
          const source = block === 3 ? bands : [envelope, loudness, onsets][block]
          if (!source) {
            top += blockHeight + BLOCK_GAP
            return
          }

          const rows = Math.max(1, Math.round(blockHeight))
          const stride = block === 3 ? 3 : 1
          const panels = blockPanels(block)

          let held = running.blocks.get(block)
          if (!held || held.total.profile.length !== rows || held.moves >= RESUM_EVERY) {
            held = {
              total: { profile: new Float64Array(rows), squares: new Float64Array(rows), counted: 0 },
              members: new Map(),
              moves: 0,
            }
            running.blocks.set(block, held)
          }
          held.moves += 1

          // the sections as they are now, by what their columns are read from
          const wanted = new Map<string, { span: SectionSpan; panel: number; beats: number }>()
          for (let panel = 0; panel < panels; panel += 1) {
            for (const span of spans) {
              const beats =
                slice === 'auto'
                  ? autoSliceBeats(span, Math.max(120, plotWidth(width) * (span.end - span.start)))
                  : slice
              wanted.set(`${panel}|${beats}|${span.start}|${span.end}|${span.beat}`, { span, panel, beats })
            }
          }

          // out with the sections that are no longer there, in with the new
          for (const [name, part] of held.members) {
            if (wanted.has(name)) continue
            takeContribution(held.total, part)
            held.members.delete(name)
          }
          for (const [name, entry] of wanted) {
            if (held.members.has(name)) continue
            const channel = block === 3 ? BAND_ORDER[entry.panel] : 0
            const part = barContribution(
              source,
              stride,
              channel,
              collectBars(entry.span, entry.beats),
              rows,
              curve,
            )
            held.members.set(name, part)
            addContribution(held.total, part)
          }

          const { total } = held
          const { shape, steady, both } = finishProjections(total.profile, total.squares, total.counted, rows)
          layers.push({ block, rows, top, height: blockHeight, profile: shape, steady, both })
          top += blockHeight + BLOCK_GAP
        })

        const built = { key: planKey, layers }
        planRef.current = built
        return built
      })
    }

    let cache = cacheRef.current
    if (!cache || cache.key !== key) {
      const panels = measure('BarGrid picture', () =>
        planPanels(plan.layers, sources, bars, width, curve, colormap, waveStyle),
      )
      const gl = glRef.current
      const gpu = Boolean(gl && canRenderLanesGl(gl, bars, panels))

      // only a browser the GPU cannot serve reads the visible bars to paint them
      const painted = gpu
        ? null
        : renderBarLayers(context, sources, bars, height, curve, blocks, colormap, true)
      const waveLayer = plan.layers.find((layer) => layer.block === 0)

      cache = {
        key,
        gpu,
        panels: gpu ? panels : [],
        wave:
          painted && envelope && waveLayer
            ? paintWave(
                context,
                envelope,
                bars,
                waveLayer.height,
                width,
                curve,
                colormap,
                waveStyle,
                theme,
              )
            : null,
        layers: plan.layers.map((layer) => {
          const image = painted?.find((entry) => entry.block === layer.block)?.image
          let canvas: HTMLCanvasElement | null = null
          if (image) {
            canvas = document.createElement('canvas')
            canvas.width = image.width
            canvas.height = image.height
            canvas.getContext('2d')?.putImageData(image, 0, 0)
          }
          return {
            canvas,
            block: layer.block,
            rows: layer.rows,
            top: layer.top,
            height: layer.height,
            profile: layer.profile,
            steady: layer.steady,
            both: layer.both,
          }
        }),
      }
      cacheRef.current = cache
    }

    return { key, plan, cache, width }
  }

  const stillKey = `${bars.length}|${sectionSignature(live)}|${bars[0]?.start ?? 0}|${bars[bars.length - 1]?.end ?? 0}|${range.start}|${range.end}|${blocks.join(',')}|${divisions}|${colormap}|${waveStyle}|${slice}|${curveSignature(curve)}`

  // What stays put between frames: the guides, the section bounds, the three
  // projection graphs, and on a browser without WebGL2 the lanes themselves.
  // Painted when the window or the song changes and left alone while playing
  const { canvasRef: stillRef } = useCanvasControl((context, full, height) => {
    if (bars.length === 0) return
    const { cache, width } = ensureCache(context, full, height)

    const layout = columnLayout(bars, range)
    const column = width / layout.shown
    const offset = -layout.head * column

    // everything about the bars is drawn in the space between the panels, so
    // the whole of it moves across together rather than each piece carrying the
    // offset itself
    context.save()
    context.translate(PROJECTION_WIDTH, 0)

    // the straddling bars run past the plot on both sides, into the panels
    // the projections sit in, so the plot is clipped to its own width first
    context.beginPath()
    context.rect(0, 0, width, height)
    context.clip()

    if (!cache.gpu) {
      // the bars straddling the window's edges are drawn partly off it, so a
      // pan slides the picture by the fraction of a column it moved. Each panel
      // is placed on its own: three side by side each carry the whole offset
      context.imageSmoothingEnabled = false
      for (const layer of cache.layers) {
        const count = blockPanels(layer.block)
        const panelWidth = width / count
        const shownWidth = (bars.length / layout.shown) * panelWidth

        for (let panel = 0; panel < count; panel += 1) {
          const wave = layer.block === 0 && cache.wave ? cache.wave : null
          const picture = wave ?? layer.canvas
          if (!picture) continue
          const sourceWidth = wave ? wave.width : bars.length
          context.drawImage(
            picture,
            panel * sourceWidth,
            0,
            sourceWidth,
            picture.height,
            panel * panelWidth + offset / count,
            layer.top,
            shownWidth,
            layer.height,
          )
        }
      }
    }

    const heights = cache.layers.map((layer) => layer.height)
    const tops = cache.layers.map((layer) => layer.top)
    sliceHeightRef.current = Math.max(1, heights[0] ?? 1)
    layoutRef.current = { tops, heights }

    tops.forEach((top, index) =>
      drawSliceGuides(context, top, heights[index], width, GUIDE_COLOR, divisions),
    )
    drawSectionBounds(context, bars, width, height, theme.palette.info.dark, layout)

    context.restore()

    for (const layer of cache.layers) {
      // how alike the bars are at each row on the left, how much they add up
      // to on the right
      drawProjection(
        context,
        layer.steady,
        0,
        layer.top,
        PROJECTION_WIDTH,
        layer.height,
        theme.palette.success.main,
        true,
      )
      drawProjection(
        context,
        layer.profile,
        PROJECTION_WIDTH + width,
        layer.top,
        PROJECTION_WIDTH,
        layer.height,
        theme.palette.text.primary,
      )

      // over the sum, so the two are read against each other
      drawProjection(
        context,
        layer.both,
        PROJECTION_WIDTH + width,
        layer.top,
        PROJECTION_WIDTH,
        layer.height,
        theme.palette.primary.main,
      )
    }
  }, false, `${stillKey}|${width}`)

  // What moves with the playhead: the lanes with the cursor drawn into them
  // by the GPU, and the trace of the column the playhead is in
  const { canvasRef } = useCanvasControl((context, full, height) => {
    if (bars.length === 0) return
    const { key, cache, width } = ensureCache(context, full, height)

    const layout = columnLayout(bars, range)
    const atColumn = bars.findIndex(
      (bar) => positionRef.current >= bar.start && positionRef.current < bar.end,
    )

    const gl = glRef.current
    if (cache.gpu && gl) {
      const bar = atColumn >= 0 ? bars[atColumn] : null
      const cursor: LaneCursor | null = bar
        ? {
            column: atColumn,
            row: (positionRef.current - bar.start) / Math.max(1e-12, bar.end - bar.start),
            mode: cursorMode === 'xor' ? 'cut' : cursorMode === 'source-over' ? 'solid' : 'inverse',
            solid: colorChannels(theme.palette.error.main),
            tint: cursorTint,
            hue: colorChannels(CURSOR_HUE),
            outline: CURSOR_OUTLINE,
            bar: CURSOR_WIDTH,
          }
        : null

      const lanes = stopwatch('BarGrid lanes GL')
      renderLanesGl(
        gl,
        bars,
        cache.panels,
        layout,
        width,
        height,
        window.devicePixelRatio || 1,
        colorChannels(theme.palette.background.paper),
        colorChannels(theme.palette.primary.main),
        cursor,
        key,
      )
      lanes()
    } else {
      context.save()
      context.translate(PROJECTION_WIDTH, 0)
      context.beginPath()
      context.rect(0, 0, width, height)
      context.clip()
      const cursored = stopwatch('BarGrid cursor')
      drawColumnCursor(
        context,
        bars,
        cache.layers.map((layer) => layer.top),
        cache.layers.map((layer) => layer.height),
        positionRef.current,
        width,
        'source-over',
        theme.palette.error.main,
        cache.layers.map(() => false),
        layout,
      )
      cursored()
      context.restore()
    }

    // the one column the playhead is in, drawn as an outline over the rest:
    // the shape of this bar against the shape of all of them. Read when the
    // playhead enters the column and kept until it leaves
    if (atColumn >= 0) {
      const projected = stopwatch('BarGrid projections')
      const traceKey = `${key}|${atColumn}`
      let trace = traceRef.current
      if (!trace || trace.key !== traceKey) {
        trace = {
          key: traceKey,
          values: cache.layers.map((layer) =>
            columnProfile(sources, layer.block, bars[atColumn], layer.rows),
          ),
        }
        traceRef.current = trace
      }

      cache.layers.forEach((layer, index) => {
        const values = trace.values[index]
        if (!values) return

        drawProjection(
          context,
          values,
          PROJECTION_WIDTH + width,
          layer.top,
          PROJECTION_WIDTH,
          layer.height,
          theme.palette.error.main,
          false,
          false,
        )
      })
      projected()
    }
  }, playing, `${stillKey}|${width}|${position}|${cursorMode}|${cursorTint}`)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const onWheel = (event: WheelEvent) => measure('BarGrid wheel', () => {
      const bounds = canvas.getBoundingClientRect()
      if (bounds.width === 0) return
      event.preventDefault()

      const { range: current, applyRange: apply, spans: held, slice: cut, width: full } = zoomRef.current
      const ratio = Math.min(
        1,
        Math.max(0, (event.clientX - bounds.left - PROJECTION_WIDTH) / plotWidth(bounds.width)),
      )

      // the moment under the pointer is read off the column it is over, not
      // off the time axis: the columns are equal in width and unequal in
      // length, so the two agree only when every bar lasts the same
      const before = viewBars(held, current, cut, full)
      const placed = columnLayout(before, current)
      const across = placed.head + ratio * placed.shown
      const index = Math.min(before.length - 1, Math.max(0, Math.floor(across)))
      const bar = before[index]
      const anchor = bar
        ? bar.start + (across - index) * (bar.end - bar.start)
        : current.start + ratio * (current.end - current.start)

      const span = current.end - current.start
      const next = Math.min(1, span * Math.exp(event.deltaY * ZOOM_RATE))
      const target = windowPlacing(held, cut, full, anchor, ratio, next)

      apply(target)

      window.clearTimeout(settleTimer.current)
      settleTimer.current = window.setTimeout(() => zoomRef.current.settle(), GESTURE_END_MS)
    })

    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [canvasRef])

  // one block is one slice tall, so a pixel of drag is a known number of
  // milliseconds: the same gesture means the same thing at any zoom or density
  const sectionAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width === 0 || bars.length === 0) return null

    const ratio = Math.min(
      0.999,
      Math.max(0, (event.clientX - bounds.left - PROJECTION_WIDTH) / plotWidth(bounds.width)),
    )
    const { head, shown } = columnLayout(bars, range)
    const bar = bars[Math.min(bars.length - 1, Math.max(0, Math.floor(head + ratio * shown)))]
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
      const current = hoverRef.current
      if (current?.x === x && current?.y === y) return
      hoverRef.current = { x, y }
      repaintOverlay()
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
      measure('drag BarGrid pan', () => {
        const width = plotWidth(event.currentTarget.clientWidth)
        if (width <= 1) return
        const shift = (dx / width) * drag.span
        applyRange(clampRange({ start: drag.start - shift, end: drag.start - shift + drag.span }))
      })
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

    measure(drag.tempo ? 'drag BarGrid tempo' : 'drag BarGrid offset', () => {
      const next = sortSections(
        live.map((section) => (section.id === drag.id ? { ...section, ...patch } : section)),
      )
      editSections(next)
    })
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
        ref={glRef}
        sx={{
          position: 'absolute',
          top: 0,
          left: PROJECTION_WIDTH,
          width: `calc(100% - ${PROJECTION_WIDTH * 2}px)`,
          height: '100%',
          pointerEvents: 'none',
        }}
      />
      <Box
        component="canvas"
        ref={stillRef}
        data-trace="BarGrid still"
        sx={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />
      <Box
        component="canvas"
        ref={canvasRef}
        data-trace="BarGrid"
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={() => {
          hoverRef.current = null
          repaintOverlay()
        }}
        onContextMenu={openMenu}
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'block',
          width: '100%',
          height: '100%',
          touchAction: 'none',
          cursor: dragging ? 'move' : 'default',
        }}
      />
      <Box
        component="canvas"
        ref={overlayRef}
        data-trace="BarGrid overlay"
        sx={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
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
