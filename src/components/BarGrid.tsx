import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import Box from '@mui/material/Box'
import { useTheme, type Theme } from '@mui/material/styles'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import {
  ALL_BLOCKS,
  autoSliceBeats,
  collectBars,
  barUntil,
  columnAt,
  type ColumnLayout,
  columnProfile,
  drawColumnCursor,
  drawSectionRuns,
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
  emptyContribution,
  blockHeights,
  blockIsLevel,
  blockSource,
  finishProjections,
  takeContribution,
  BAND_ORDER,
  BLOCK_GAP,
  CURSOR_OUTLINE,
  CURSOR_WIDTH,
  type Bar,
  type BarSources,
  type Contribution,
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
import { useLiveSectionsEdit } from '../liveSections'
import { useRafCallback } from '../useRafCallback'
import {
  canRenderLanesGl,
  releaseLanesGl,
  renderLanesGl,
  type LaneCursor,
  type LanePanel,
} from '../laneGl'
import { applyCurve, curveSignature, type Curve } from '../curve'
import type { Range } from '../range'
import { measure, stopwatch, tick } from '../trace'
import { useLiveRangeEdit } from '../liveRange'
import { BLOCK_HEIGHT, LIVE_COLOR } from './SectionBlocks'

type BarGridProps = {
  envelope: Float32Array | null
  loudness: Float32Array | null
  onsets: Float32Array | null
  bands: Float32Array | null
  tone: Float32Array | null
  noise: Float32Array | null
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
  subdivisions: number
  // start every column half a division early and move the guides down by the
  // same, so the beats keep their guides but sit away from the column seams
  centred: boolean
  colormap: number
  cursorMode: GlobalCompositeOperation
  waveStyle: WaveStyle
  // keep the playhead's column at a fixed place across the plot and move the
  // window under it, rather than the playhead across a still window
  follow: boolean
}

const GUIDE_COLOR = '#000000'
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
    const { source, stride } = blockSource(sources, layer.block)
    if (!source) continue

    const count = blockPanels(layer.block)
    const style = blockIsLevel(layer.block) ? waveStyle : 'colour'

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
      })
    }
  }

  return panels
}

// every section contributes its own slices, so the picture is continuous
// across tempo changes rather than one section at a time. The whole song is
// sliced; the window is a stretch of these columns
function sliceBars(spans: SectionSpan[], slice: number | 'auto', width: number, early: number): Bar[] {
  const runs = spans.map((span) => {
    // the automatic slice is settled on the whole song, not on the window:
    // zooming in then widens the columns and leaves what each one holds
    // alone, where re-slicing per window would halve a column's phrase the
    // moment there was room to, and change the picture under the pointer
    const beats =
      slice === 'auto'
        ? autoSliceBeats(span, Math.max(120, plotWidth(width) * (span.end - span.start)))
        : slice
    return collectBars(span, beats, early)
  })

  // Started early, a section's first column opens on the last of the section
  // before. That stretch is drawn in the first column, so it is the first
  // column's time as well: the marker enters at the top of the column, and
  // the column before ends where the next begins. Only the song's own first
  // column keeps a lead, the black before the song
  for (let index = 1; index < runs.length; index += 1) {
    const before = runs[index - 1]
    const after = runs[index]
    if (before.length === 0 || after.length === 0) continue
    const last = before[before.length - 1]
    const first = after[0]
    before[before.length - 1] = {
      ...last,
      filled: Math.min(last.filled, (first.start - last.start) / (last.end - last.start)),
    }
    after[0] = { ...first, lead: 0 }
  }

  // a column the next section's early start swallows whole has no time left
  return runs.flat().filter((bar) => bar.filled > 1e-9)
}

// The window across the columns: where it starts, in columns and the fraction
// of one, and how many columns it shows. The columns are the axis the picture
// is drawn on, and the one the window is held on. Time is what the rest of the
// app shares, and the two do not map one to one: a section's last column runs
// on black past the section's end, and that stretch of the picture is no time
// at all, since the time under it belongs to the next section's first column.
// Held in time, a window whose edge sat on that black would have nowhere to
// be; held in columns, it simply is there
type Span = {
  head: number
  shown: number
}

const MIN_SHOWN = 0.05

// where a moment sits across the song's columns, by the time each truly holds
function columnPos(bars: Bar[], moment: number): number {
  if (bars.length === 0) return 0
  const at = columnAt(bars, moment)
  if (at >= 0) {
    const bar = bars[at]
    return at + (moment - bar.start) / Math.max(1e-12, bar.end - bar.start)
  }
  const last = bars[bars.length - 1]
  return moment >= barUntil(last) ? bars.length - 1 + last.filled : 0
}

// the moment at a place across the columns: a place on a column's black has
// no time of its own and reads as the section's end
function momentAt(bars: Bar[], place: number): number {
  if (bars.length === 0) return 0
  const index = Math.min(bars.length - 1, Math.max(0, Math.floor(place)))
  const bar = bars[index]
  const moment = bar.start + (place - index) * (bar.end - bar.start)
  return Math.min(1, Math.max(0, Math.min(barUntil(bar), moment)))
}

function toWindow(bars: Bar[], range: Range): Span {
  const head = columnPos(bars, range.start)
  const tail = columnPos(bars, range.end)
  return { head, shown: Math.max(MIN_SHOWN, tail - head) }
}

function toRange(bars: Bar[], window: Span): Range {
  return { start: momentAt(bars, window.head), end: momentAt(bars, window.head + window.shown) }
}

function clampWindow(bars: Bar[], window: Span): Span {
  const most = Math.max(MIN_SHOWN, bars.length)
  const shown = Math.min(most, Math.max(MIN_SHOWN, window.shown))
  const head = Math.min(most - shown, Math.max(0, window.head))
  return { head, shown }
}

function sameRange(left: Range, right: Range): boolean {
  return Math.abs(left.start - right.start) < 1e-9 && Math.abs(left.end - right.end) < 1e-9
}

// how long a division guide stays lit after the marker crosses it, in
// milliseconds, how wide it is drawn while lit, and its colour: a magenta no
// colourmap in the picker comes near, so it stands out on all of them
const FLASH_MS = 220
const FLASH_WIDTH = 4
const FLASH_COLOR = '#ff2bd6'

// where the playhead's column is held while the window follows it
const FOLLOW_AT = 0.4
// Following places the window exactly, frame by frame, except across a jump:
// where the marker leaves a part-filled column for the next section's first,
// the window would move most of a column in one frame. A jump is spread over
// about this many seconds instead, and playback's own steady drift is never
// behind
const FOLLOW_EASE = 0.18

export default function BarGrid({
  envelope,
  loudness,
  onsets,
  bands,
  tone,
  noise,
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
  subdivisions,
  centred,
  colormap,
  cursorMode,
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

  // kept by identity: the window below is re-read from time whenever the
  // columns are cut afresh, and cutting them on every render would do that
  // every frame
  // with the columns started early, the guides and the beat light move down
  // by the same half division, so the beats stay on the guides and only the
  // column's seams move away from them
  const guideOffset = centred ? 0.5 : 0
  const early = guideOffset / divisions
  const songBars = useMemo(
    () => measure('BarGrid bars', () => sliceBars(spans, slice, width, early)),
    [spans, slice, width, early],
  )
  // The window lives here in columns, and the time range the app holds is its
  // shadow: a change of the range from elsewhere, a drag on the strip say, is
  // taken up; one that is this window's own shadow is left alone, so a window
  // resting on a column's black is not pulled off it by its own reflection.
  // Cut afresh, the columns are read against the range again
  const windowRef = useRef<{ window: Span; published: Range | null; bars: Bar[] | null }>({
    window: { head: 0, shown: 1 },
    published: null,
    bars: null,
  })
  if (
    windowRef.current.bars !== songBars ||
    !windowRef.current.published ||
    !sameRange(windowRef.current.published, range)
  ) {
    windowRef.current = {
      window: clampWindow(songBars, toWindow(songBars, range)),
      published: range,
      bars: songBars,
    }
  }
  const span = windowRef.current.window
  const first = Math.min(songBars.length, Math.floor(span.head))
  const bars = songBars.slice(first, Math.min(songBars.length, Math.ceil(span.head + span.shown)))
  const layout: ColumnLayout = { head: span.head - first, shown: span.shown }

  // a change of window, through the live store while a gesture or the
  // following lasts, or to the app once it is done
  const placeWindow = (next: Span, apply: (range: Range) => void) => {
    const all = zoomRef.current.songBars
    const placed = clampWindow(all, next)
    const published = toRange(all, placed)
    windowRef.current = { window: placed, published, bars: all }
    apply(published)
  }

  const sources = { envelope, loudness, onsets, bands, tone, noise }
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
    head: number
    shown: number
    axis: 'none' | 'vertical' | 'pan'
  } | null>(null)
  const zoomRef = useRef({ applyRange, editRange, settle: settleRange, songBars })
  useEffect(() => {
    zoomRef.current = { applyRange, editRange, settle: settleRange, songBars }
  })

  // Following: every frame while the song plays the window is placed so the
  // playhead's column sits at FOLLOW_AT, through the live store like a drag,
  // and committed once when the song stops or the following does
  useEffect(() => {
    if (!follow || !playing) return

    let last = performance.now()
    // the column the playhead was in last frame, where following wanted the
    // window, and how much of a jump is still to be closed
    let column: number | null = null
    let wanted: number | null = null
    let pending = 0
    let frame = requestAnimationFrame(function tick(now: number) {
      const { songBars: all, editRange: edit } = zoomRef.current
      const seconds = Math.max(0, now - last) / 1000
      last = now

      const at = columnAt(all, positionRef.current)
      if (at >= 0) {
        const { shown } = windowRef.current.window
        const target = columnPos(all, positionRef.current) - FOLLOW_AT * shown
        // a change of column is where the window jumps: off a part-filled
        // column onto the next section's first, the picture moves by the
        // black that was skipped. Within a column the window only drifts
        if (wanted !== null && column !== null && all[at].start !== column) pending += target - wanted
        wanted = target
        column = all[at].start
        // the same share of what is left of the jump is closed each frame,
        // whatever the frame rate
        pending *= Math.exp(-seconds / FOLLOW_EASE)
        if (Math.abs(pending) < 1e-6) pending = 0

        const head = target - pending
        if (Math.abs(head - windowRef.current.window.head) > 1e-9) placeWindow({ head, shown }, edit)
      }
      frame = requestAnimationFrame(tick)
    })

    return () => {
      cancelAnimationFrame(frame)
      zoomRef.current.settle()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow, playing, positionRef])

  // paused, a seek is followed once, straight to the app
  useEffect(() => {
    if (!follow || playing) return
    const all = zoomRef.current.songBars
    if (columnAt(all, position) < 0) return
    const { shown } = windowRef.current.window
    const head = columnPos(all, position) - FOLLOW_AT * shown
    if (Math.abs(head - windowRef.current.window.head) > 1e-9) placeWindow({ head, shown }, onRangeChange)
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
      // nothing over the projection panels: the bar says where in a column
      // the pointer is, and there it is in none
      if (hover.x < PROJECTION_WIDTH || hover.x >= PROJECTION_WIDTH + width) return
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
      tone?.length ?? 0,
      noise?.length ?? 0,
      blocks.join(','),
      colormap,
      waveStyle,
      curveSignature(curve),
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
      tone?.length ?? 0,
      noise?.length ?? 0,
      blocks.join(','),
      curveSignature(curve),
    ].join('|')

    let plan = planRef.current
    if (!plan || plan.key !== planKey) {
      plan = measure('BarGrid plan', () => {
        const curveKey = curveSignature(curve)
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
          [envelope, loudness, onsets, bands, tone, noise].map((source) => (source ? sourceId(source) : 0)).join(','),
        ].join('|')
        const running = runningRef.current
        if (running.generation !== generation) {
          running.generation = generation
          running.blocks.clear()
        }

        blocks.forEach((block, slot) => {
          const blockHeight = Math.max(1, heights[slot])
          const { source, stride } = blockSource(sources, block)
          if (!source) {
            top += blockHeight + BLOCK_GAP
            return
          }

          const rows = Math.max(1, Math.round(blockHeight))
          const panels = blockPanels(block)

          let held = running.blocks.get(block)
          if (!held || held.total.profile.length !== rows || held.moves >= RESUM_EVERY) {
            held = {
              total: emptyContribution(rows),
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
          const { shape, steady, both } = finishProjections(total.profile, total.squares, total.counts, rows)
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

  const stillKey = `${bars.length}|${sectionSignature(live)}|${bars[0]?.start ?? 0}|${bars[bars.length - 1]?.end ?? 0}|${span.head}|${span.shown}|${blocks.join(',')}|${divisions}|${subdivisions}|${colormap}|${waveStyle}|${slice}|${curveSignature(curve)}`

  // What stays put between frames: the guides, the section bounds, the three
  // projection graphs, and on a browser without WebGL2 the lanes themselves.
  // Painted when the window or the song changes and left alone while playing
  const { canvasRef: stillRef } = useCanvasControl((context, full, height) => {
    if (bars.length === 0) return
    const { cache, width } = ensureCache(context, full, height)

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
      drawSliceGuides(context, top, heights[index], width, GUIDE_COLOR, divisions, subdivisions, guideOffset),
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
  // the division guide the marker last crossed, and when: it is lit for a
  // moment as the marker passes, so a beat is seen as well as heard
  const flashRef = useRef<{ column: number; step: number; at: number } | null>(null)

  const { canvasRef } = useCanvasControl((context, full, height) => {
    if (bars.length === 0) return
    const { key, cache, width } = ensureCache(context, full, height)

    const atColumn = columnAt(bars, positionRef.current)

    const gl = glRef.current
    if (cache.gpu && gl) {
      const bar = atColumn >= 0 ? bars[atColumn] : null
      const cursor: LaneCursor | null = bar
        ? {
            column: atColumn,
            row: (positionRef.current - bar.start) / Math.max(1e-12, bar.end - bar.start),
            mode: cursorMode === 'xor' ? 'cut' : cursorMode === 'source-over' ? 'solid' : 'inverse',
            solid: colorChannels(theme.palette.error.main),
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
        layout,
      )
      cursored()
      context.restore()
    }

    if (atColumn >= 0 && playing) {
      const bar = bars[atColumn]
      const row = (positionRef.current - bar.start) / Math.max(1e-12, bar.end - bar.start)
      // the guide last passed, counted on the moved set: below the first
      // there is none to light
      const step = Math.min(divisions - 1, Math.floor(row * divisions - guideOffset))
      const now = performance.now()
      const flash = flashRef.current
      const lit =
        flash && flash.column === bar.start && flash.step === step
          ? flash
          : { column: bar.start, step, at: now }
      flashRef.current = lit
      const left = lit.at + FLASH_MS - now
      if (left > 0 && lit.step >= 0) {
        // lit across the whole plot
        context.save()
        context.translate(PROJECTION_WIDTH, 0)
        context.beginPath()
        context.rect(0, 0, width, height)
        context.clip()
        context.strokeStyle = FLASH_COLOR
        context.lineWidth = FLASH_WIDTH
        context.globalAlpha = left / FLASH_MS
        context.beginPath()
        for (const layer of cache.layers) {
          const y = Math.round(layer.top + ((lit.step + guideOffset) / divisions) * layer.height)
          context.moveTo(0, y)
          context.lineTo(width, y)
        }
        context.stroke()
        context.restore()
      }
    } else if (!playing) {
      flashRef.current = null
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
  }, playing, `${stillKey}|${width}|${position}|${cursorMode}`)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const onWheel = (event: WheelEvent) => measure('BarGrid wheel', () => {
      const bounds = canvas.getBoundingClientRect()
      if (bounds.width === 0) return
      event.preventDefault()

      const { applyRange: apply } = zoomRef.current
      const ratio = Math.min(
        1,
        Math.max(0, (event.clientX - bounds.left - PROJECTION_WIDTH) / plotWidth(bounds.width)),
      )

      // the column under the pointer stays under it: the window is scaled
      // about that place across the columns, not about a moment in time
      const { head, shown } = windowRef.current.window
      const across = head + ratio * shown
      const next = shown * Math.exp(event.deltaY * ZOOM_RATE)
      placeWindow({ head: across - ratio * next, shown: next }, apply)

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
    // the projection panels either side are not the picture: a press on them
    // is no column's, so it neither seeks nor drags nor opens a menu
    const x = event.clientX - bounds.left
    if (x < PROJECTION_WIDTH || x >= PROJECTION_WIDTH + plotWidth(bounds.width)) return null

    const ratio = Math.min(
      0.999,
      Math.max(0, (event.clientX - bounds.left - PROJECTION_WIDTH) / plotWidth(bounds.width)),
    )
    const { head, shown } = layout
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

    // the black rows past the section's end are not this column's time, so a
    // press on them lands on the section's end
    const fraction = Math.min(
      target.bar.filled,
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
      head: windowRef.current.window.head,
      shown: windowRef.current.window.shown,
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
        const shift = (dx / width) * drag.shown
        placeWindow({ head: drag.head - shift, shown: drag.shown }, applyRange)
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

  // The sections along the bottom, one block per run of columns, as the strip
  // under the page shows them along time. Repainted with the playhead so the
  // live section keeps its colour
  const { canvasRef: runsRef } = useCanvasControl(
    (context, full, height) => {
      if (bars.length === 0) return
      const width = plotWidth(full)
      context.save()
      context.translate(PROJECTION_WIDTH, 0)
      context.beginPath()
      context.rect(0, 0, width, height)
      context.clip()
      drawSectionRuns(
        context,
        bars,
        spans,
        positionRef.current,
        width,
        height,
        {
          idle: theme.palette.info.main,
          alt: theme.palette.info.dark,
          live: LIVE_COLOR,
          hover: theme.palette.info.light,
          text: theme.palette.common.white,
        },
        null,
        `600 10px ${theme.typography.fontFamily}`,
        layout,
      )
      context.restore()
    },
    playing,
    `${stillKey}|${width}|${position}`,
  )

  return (
    <Box ref={wrapRef} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ position: 'relative', flex: 1, minHeight: 0 }}>
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
      </Box>
      <Box
        component="canvas"
        ref={runsRef}
        data-trace="BarGrid sections"
        sx={{ display: 'block', width: '100%', height: BLOCK_HEIGHT, flex: '0 0 auto' }}
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
