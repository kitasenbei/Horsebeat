import type { Range } from './range'
import { applyCurve, curveFor, curveSignature, type Curve, type CurveSet } from './curve'
export { curveSignature }
import { levelOf } from './audio'
import { sectionSpans, type Section, type SectionSpan } from './timing'
import { type PeakLevel, type Pyramid } from './audio'

export const WAVE_ALPHA = 1

function pickLevel(pyramid: Pyramid | null, perPixel: number): PeakLevel | null {
  if (!pyramid) return null
  let chosen: PeakLevel | null = null
  for (const level of pyramid) {
    if (level.hop <= perPixel / 2) chosen = level
  }
  return chosen
}

function spanMinMax(
  samples: Float32Array,
  level: PeakLevel | null,
  from: number,
  to: number,
): [number, number] {
  let min = 0
  let max = 0

  if (level) {
    const bins = level.data.length / 2
    const start = Math.max(0, Math.floor(from / level.hop))
    const end = Math.min(bins, Math.max(start + 1, Math.ceil(to / level.hop)))
    for (let bin = start; bin < end; bin += 1) {
      min = Math.min(min, level.data[bin * 2])
      max = Math.max(max, level.data[bin * 2 + 1])
    }
    return [min, max]
  }

  const start = Math.max(0, Math.floor(from))
  const end = Math.min(samples.length, Math.max(start + 1, Math.floor(to)))
  for (let index = start; index < end; index += 1) {
    const value = samples[index]
    if (value < min) min = value
    if (value > max) max = value
  }
  return [min, max]
}

export function drawPeaks(
  context: CanvasRenderingContext2D,
  peaks: Float32Array,
  range: Range,
  width: number,
  height: number,
  color: string,
) {
  const middle = height / 2
  const bins = peaks.length / 2
  const first = range.start * bins
  const span = (range.end - range.start) * bins
  context.fillStyle = color
  context.globalAlpha = WAVE_ALPHA

  for (let x = 0; x < width; x += 1) {
    const start = Math.floor(first + (x / width) * span)
    const end = Math.max(start + 1, Math.floor(first + ((x + 1) / width) * span))
    let min = 0
    let max = 0
    for (let bin = start; bin < Math.min(end, bins); bin += 1) {
      min = Math.min(min, peaks[bin * 2])
      max = Math.max(max, peaks[bin * 2 + 1])
    }
    const top = middle - max * middle
    const bottom = middle - min * middle
    context.fillRect(x, top, 1, Math.max(1, bottom - top))
  }

  context.globalAlpha = 1
}

export function drawWindow(
  context: CanvasRenderingContext2D,
  range: Range,
  width: number,
  height: number,
  color: string,
) {
  const lineWidth = 2
  const left = range.start * width
  const right = range.end * width
  context.lineWidth = lineWidth
  context.strokeStyle = color
  context.strokeRect(
    left + lineWidth / 2,
    lineWidth / 2,
    Math.max(lineWidth, right - left - lineWidth),
    height - lineWidth,
  )
}

export const HANDLE_WIDTH = 12
export const HANDLE_HEIGHT = 8

export const TAIL_WIDTH = 24

export function drawPlayhead(
  context: CanvasRenderingContext2D,
  position: number,
  range: Range,
  width: number,
  height: number,
  color: string,
  tail = false,
) {
  const span = range.end - range.start
  if (position < range.start || position > range.end || span <= 0) return

  const x = Math.round(((position - range.start) / span) * width) + 0.5

  if (tail) {
    const gradient = context.createLinearGradient(x - TAIL_WIDTH, 0, x, 0)
    gradient.addColorStop(0, 'transparent')
    gradient.addColorStop(1, color)
    context.fillStyle = gradient
    context.globalAlpha = 0.3
    context.fillRect(x - TAIL_WIDTH, 0, TAIL_WIDTH, height)
    context.globalAlpha = 1
  }
  context.lineWidth = 1
  context.strokeStyle = color
  context.beginPath()
  context.moveTo(x, 0)
  context.lineTo(x, height)
  context.stroke()
}

export function drawPlayheadHandle(
  context: CanvasRenderingContext2D,
  position: number,
  range: Range,
  width: number,
  height: number,
  color: string,
  scale = 1,
) {
  const span = range.end - range.start
  if (span <= 0 || position < range.start || position > range.end) return

  const x = Math.round(((position - range.start) / span) * width)
  const top = height - HANDLE_HEIGHT
  const half = (HANDLE_WIDTH * scale) / 2

  context.fillStyle = color
  context.beginPath()
  context.moveTo(x - half, top)
  context.lineTo(x + half, top)
  context.lineTo(x, height)
  context.closePath()
  context.fill()
}

export function drawPeaksOutline(
  context: CanvasRenderingContext2D,
  peaks: Float32Array,
  range: Range,
  width: number,
  height: number,
  color: string,
) {
  const middle = height / 2
  const bins = peaks.length / 2
  const first = range.start * bins
  const span = (range.end - range.start) * bins
  const tops: number[] = []
  const bottoms: number[] = []

  for (let x = 0; x < width; x += 1) {
    const start = Math.floor(first + (x / width) * span)
    const end = Math.max(start + 1, Math.floor(first + ((x + 1) / width) * span))
    let min = 0
    let max = 0
    for (let bin = start; bin < Math.min(end, bins); bin += 1) {
      min = Math.min(min, peaks[bin * 2])
      max = Math.max(max, peaks[bin * 2 + 1])
    }
    tops.push(middle - max * middle)
    bottoms.push(middle - min * middle)
  }

  context.beginPath()
  context.moveTo(0, tops[0] ?? middle)
  for (let x = 1; x < tops.length; x += 1) context.lineTo(x, tops[x])
  for (let x = bottoms.length - 1; x >= 0; x -= 1) context.lineTo(x, bottoms[x])
  context.closePath()

  context.fillStyle = color
  context.globalAlpha = WAVE_ALPHA * 0.35
  context.fill()
  context.globalAlpha = WAVE_ALPHA
  context.lineWidth = 1
  context.strokeStyle = color
  context.stroke()
  context.globalAlpha = 1
}

export function drawSamples(
  context: CanvasRenderingContext2D,
  samples: Float32Array,
  range: Range,
  width: number,
  height: number,
  color: string,
  outline: boolean,
  pyramid: Pyramid | null = null,
) {
  const middle = height / 2
  const first = range.start * samples.length
  const span = (range.end - range.start) * samples.length
  const perPixel = span / width
  const level = pickLevel(pyramid, perPixel)

  context.strokeStyle = color
  context.fillStyle = color
  context.lineWidth = 1
  context.globalAlpha = WAVE_ALPHA

  if (perPixel < 2) {
    context.beginPath()
    const start = Math.max(0, Math.floor(first) - 1)
    const end = Math.min(samples.length, Math.ceil(first + span) + 1)
    for (let index = start; index < end; index += 1) {
      const x = ((index - first) / span) * width
      const y = middle - samples[index] * middle
      if (index === start) context.moveTo(x, y)
      else context.lineTo(x, y)
    }
    context.stroke()
    context.globalAlpha = 1
    return
  }

  const tops: number[] = []
  const bottoms: number[] = []

  for (let x = 0; x < width; x += 1) {
    const [min, max] = spanMinMax(samples, level, first + x * perPixel, first + (x + 1) * perPixel)
    tops.push(middle - max * middle)
    bottoms.push(middle - min * middle)
  }

  if (!outline) {
    for (let x = 0; x < tops.length; x += 1) {
      context.fillRect(x, tops[x], 1, Math.max(1, bottoms[x] - tops[x]))
    }
    context.globalAlpha = 1
    return
  }

  context.beginPath()
  context.moveTo(0, tops[0] ?? middle)
  for (let x = 1; x < tops.length; x += 1) context.lineTo(x, tops[x])
  for (let x = bottoms.length - 1; x >= 0; x -= 1) context.lineTo(x, bottoms[x])
  context.closePath()
  context.globalAlpha = WAVE_ALPHA * 0.35
  context.fill()
  context.globalAlpha = WAVE_ALPHA
  context.stroke()
  context.globalAlpha = 1
}

export function drawMarkers(
  context: CanvasRenderingContext2D,
  markers: number[],
  range: Range,
  width: number,
  height: number,
  color: string,
) {
  const span = range.end - range.start
  if (span <= 0) return

  context.strokeStyle = color
  context.lineWidth = 1

  for (const marker of markers) {
    if (marker < range.start || marker > range.end) continue
    const x = Math.round(((marker - range.start) / span) * width) + 0.5
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, height)
    context.stroke()
  }
}

export const BEAT_LINE_WIDTH = 2

export function invertColor(color: string): string {
  const hex = color.replace('#', '')
  if (hex.length !== 6) return color
  const value = Number.parseInt(hex, 16)
  const inverted = 0xffffff - value
  return `#${inverted.toString(16).padStart(6, '0')}`
}

// Vertical lines through the waveform, all of them in three strokes: one path
// for the parts above and below the wave, one for the parts across it in the
// inverted colour. A stroke is what a line costs, and a grid of a thousand
// beats stroked one at a time was the strip's whole frame.
function verticalLines(
  context: CanvasRenderingContext2D,
  xs: number[],
  height: number,
  envelope: Float32Array | null,
  color: string,
  lineWidth: number,
  alpha: number,
) {
  if (xs.length === 0) return

  const middle = height / 2
  const outside = new Path2D()
  const across = new Path2D()
  let crossed = false

  for (const x of xs) {
    const half = envelope ? (envelope[Math.floor(x)] ?? 0) : 0
    if (half > 0) {
      outside.moveTo(x, 0)
      outside.lineTo(x, middle - half)
      outside.moveTo(x, middle + half)
      outside.lineTo(x, height)
      across.moveTo(x, middle - half)
      across.lineTo(x, middle + half)
      crossed = true
    } else {
      outside.moveTo(x, 0)
      outside.lineTo(x, height)
    }
  }

  context.lineWidth = lineWidth
  context.globalAlpha = alpha
  context.strokeStyle = color
  context.stroke(outside)
  if (crossed) {
    context.strokeStyle = invertColor(color)
    context.stroke(across)
  }
  context.globalAlpha = 1
}

export function drawGrid(
  context: CanvasRenderingContext2D,
  sections: Section[],
  duration: number,
  range: Range,
  width: number,
  height: number,
  color: string,
  accent: string,
  envelope: Float32Array | null = null,
) {
  const span = range.end - range.start
  if (span <= 0 || duration <= 0) return

  const beats: number[] = []
  const starts: number[] = []

  for (const item of sectionSpans(sections, duration)) {
    if (item.end < range.start || item.start > range.end) continue
    if (item.beat <= 0) continue

    const visible = Math.min(span, item.end - item.start) / item.beat
    if (visible <= width / 4) {
      const from = Math.max(range.start, item.start)
      const to = Math.min(range.end, item.end)
      const firstIndex = Math.max(0, Math.ceil((from - item.start) / item.beat))
      const lastIndex = Math.floor((to - item.start) / item.beat)

      for (let index = firstIndex; index <= lastIndex; index += 1) {
        beats.push(Math.round(((item.start + index * item.beat - range.start) / span) * width) + 0.5)
      }
    }

    if (item.start >= range.start && item.start <= range.end) {
      starts.push(Math.round(((item.start - range.start) / span) * width) + 0.5)
    }
  }

  verticalLines(context, beats, height, envelope, color, BEAT_LINE_WIDTH, 0.4)
  verticalLines(context, starts, height, envelope, accent, BEAT_LINE_WIDTH * 2, 1)
}

export function drawPeaksAmplitude(
  context: CanvasRenderingContext2D,
  peaks: Float32Array,
  range: Range,
  width: number,
  height: number,
  color: string,
  curve: Curve,
) {
  const middle = height / 2
  const bins = peaks.length / 2
  const first = range.start * bins
  const span = (range.end - range.start) * bins
  context.fillStyle = color
  context.globalAlpha = WAVE_ALPHA

  for (let x = 0; x < width; x += 1) {
    const start = Math.floor(first + (x / width) * span)
    const end = Math.max(start + 1, Math.floor(first + ((x + 1) / width) * span))
    let amplitude = 0
    for (let bin = start; bin < Math.min(end, bins); bin += 1) {
      amplitude = Math.max(amplitude, Math.abs(peaks[bin * 2]), Math.abs(peaks[bin * 2 + 1]))
    }
    const half = applyCurve(levelOf(amplitude), curve) * middle
    context.fillRect(x, middle - half, 1, Math.max(1, half * 2))
  }

  context.globalAlpha = 1
}

export function drawEnvelopeAmplitude(
  context: CanvasRenderingContext2D,
  envelope: Float32Array,
  range: Range,
  width: number,
  height: number,
  color: string,
  curve: Curve,
): Float32Array {
  const middle = height / 2
  const span = range.end - range.start
  const columns = Math.max(0, Math.ceil(width))
  const halves = new Float32Array(columns)
  if (span <= 0 || envelope.length === 0) return halves

  for (let x = 0; x < columns; x += 1) {
    const bin = Math.min(
      envelope.length - 1,
      Math.max(0, (range.start + (x / width) * span) * envelope.length),
    )
    const low = Math.floor(bin)
    const high = Math.min(envelope.length - 1, low + 1)
    const fraction = bin - low
    const value = envelope[low] * (1 - fraction) + envelope[high] * fraction
    halves[x] = applyCurve(value, curve) * middle
  }

  context.fillStyle = color
  context.globalAlpha = WAVE_ALPHA
  context.beginPath()

  for (let x = 0; x < columns; x += 1) {
    if (x === 0) context.moveTo(x, middle - halves[x])
    else context.lineTo(x, middle - halves[x])
  }
  for (let x = columns - 1; x >= 0; x -= 1) {
    context.lineTo(x, middle + halves[x])
  }

  context.closePath()
  context.fill()
  context.globalAlpha = 1

  return halves
}

export type BlockPalette = {
  idle: string
  alt: string
  live: string
  hover: string
  text: string
}

// A label's width per font, measured the first time it is asked for: a song
// has a handful of distinct tempos, and measureText is among the slowest calls
// a canvas takes.
const LABEL_WIDTHS = new Map<string, number>()

function labelWidth(context: CanvasRenderingContext2D, font: string, label: string): number {
  const key = `${font}|${label}`
  const held = LABEL_WIDTHS.get(key)
  if (held !== undefined) return held
  const measured = context.measureText(label).width
  LABEL_WIDTHS.set(key, measured)
  return measured
}

export function drawSectionBlocks(
  context: CanvasRenderingContext2D,
  sections: Section[],
  duration: number,
  position: number,
  width: number,
  height: number,
  palette: BlockPalette,
  hovered: string | null,
  font: string,
  range: Range = { start: 0, end: 1 },
) {
  const spans = sectionSpans(sections, duration)
  const span = Math.max(1e-9, range.end - range.start)
  const project = (at: number) => ((at - range.start) / span) * width
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = font

  spans.forEach((item, index) => {
    if (item.end < range.start || item.start > range.end) return

    const left = Math.max(-4, project(item.start))
    const right = Math.min(width + 4, project(item.end))
    const box = Math.max(2, right - left - 2)
    const live = position >= item.start && position <= item.end

    context.fillStyle = hovered === item.section.id
      ? palette.hover
      : live
        ? palette.live
        : index % 2 === 0
          ? palette.idle
          : palette.alt

    context.beginPath()
    if (context.roundRect) context.roundRect(left + 1, 1, box, height - 2, 3)
    else context.rect(left + 1, 1, box, height - 2)
    context.fill()

    const label = `${item.section.bpm.toFixed(1)}`
    if (box > labelWidth(context, font, label) + 10) {
      context.fillStyle = palette.text
      context.fillText(label, left + 1 + box / 2, height / 2 + 0.5)
    }
  })
}

export const VERTICAL_LINE_RATIO = 0.75
export const VERTICAL_LINE_WIDTH = 2

export function drawSamplesVertical(
  context: CanvasRenderingContext2D,
  envelope: Float32Array,
  position: number,
  span: number,
  width: number,
  height: number,
  color: string,
  curve: Curve,
  total: number,
) {
  const center = width / 2
  const lineY = height * VERTICAL_LINE_RATIO
  if (height <= 0 || total <= 0 || envelope.length === 0) return

  const rows = Math.ceil(height)
  const widths = new Float32Array(rows)
  // however many samples a bin covers, taken from the two lengths rather than
  // assumed, so the drawing follows whatever rate the file decoded at
  const hop = total / envelope.length

  for (let y = 0; y < rows; y += 1) {
    const at = position + ((lineY - y) / height) * span
    const index = at * total
    if (index < 0 || index >= total) continue

    const bin = Math.min(envelope.length - 1, Math.max(0, index / hop - 0.5))
    const low = Math.floor(bin)
    const high = Math.min(envelope.length - 1, low + 1)
    const fraction = bin - low
    const value = envelope[low] * (1 - fraction) + envelope[high] * fraction

    widths[y] = applyCurve(value, curve) * center
  }

  context.fillStyle = color
  context.globalAlpha = WAVE_ALPHA
  context.beginPath()

  for (let y = 0; y < rows; y += 1) {
    if (y === 0) context.moveTo(center + widths[y], y)
    else context.lineTo(center + widths[y], y)
  }

  for (let y = rows - 1; y >= 0; y -= 1) {
    context.lineTo(center - widths[y], y)
  }

  context.closePath()
  context.fill()
  context.globalAlpha = 1
}

export function drawVerticalPlayhead(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string,
) {
  const y = Math.round(height * VERTICAL_LINE_RATIO) + 0.5
  context.strokeStyle = color
  context.lineWidth = VERTICAL_LINE_WIDTH
  context.beginPath()
  context.moveTo(0, y)
  context.lineTo(width, y)
  context.stroke()
}

const HEAT_STOPS = ['#f5f5f5', '#12897c', '#ffd400', '#d32f2f']

function mix(from: string, to: string, ratio: number): string {
  const left = Number.parseInt(from.slice(1), 16)
  const right = Number.parseInt(to.slice(1), 16)
  const channel = (shift: number) => {
    const a = (left >> shift) & 0xff
    const b = (right >> shift) & 0xff
    return Math.round(a + (b - a) * ratio)
  }
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`
}

export function heatColor(value: number): string {
  const clamped = Math.min(1, Math.max(0, value))
  const scaled = clamped * (HEAT_STOPS.length - 1)
  const index = Math.min(HEAT_STOPS.length - 2, Math.floor(scaled))
  return mix(HEAT_STOPS[index], HEAT_STOPS[index + 1], scaled - index)
}

export function drawHeatmap(
  context: CanvasRenderingContext2D,
  values: Float32Array,
  range: Range,
  width: number,
  height: number,
) {
  const span = range.end - range.start
  if (span <= 0 || values.length === 0) return

  const perPixel = (span * values.length) / width
  let runColor = ''
  let runStart = 0

  for (let x = 0; x < width; x += 1) {
    const start = Math.max(0, Math.floor((range.start + (x / width) * span) * values.length))
    const end = Math.min(values.length, Math.max(start + 1, Math.floor(start + perPixel)))
    let value = 0
    for (let index = start; index < end; index += 1) value = Math.max(value, values[index])

    const color = heatColor(value)
    if (color !== runColor) {
      if (runColor) {
        context.fillStyle = runColor
        context.fillRect(runStart, 0, x - runStart, height)
      }
      runColor = color
      runStart = x
    }
  }

  if (runColor) {
    context.fillStyle = runColor
    context.fillRect(runStart, 0, width - runStart, height)
  }
}

const LEVEL_ZONES = [
  { limit: 0.7, color: '#12897c' },
  { limit: 0.85, color: '#9ccc3c' },
  { limit: 0.93, color: '#ffc107' },
  { limit: 1, color: '#e53935' },
]

export function levelColor(value: number): string {
  const zone = LEVEL_ZONES.find((entry) => value <= entry.limit)
  return (zone ?? LEVEL_ZONES[LEVEL_ZONES.length - 1]).color
}

export function drawLevels(
  context: CanvasRenderingContext2D,
  values: Float32Array,
  range: Range,
  width: number,
  height: number,
) {
  const span = range.end - range.start
  if (span <= 0 || values.length === 0) return

  const perPixel = (span * values.length) / width

  for (let x = 0; x < width; x += 1) {
    const start = Math.max(0, Math.floor((range.start + (x / width) * span) * values.length))
    const end = Math.min(values.length, Math.max(start + 1, Math.floor(start + perPixel)))
    let value = 0
    for (let index = start; index < end; index += 1) value = Math.max(value, values[index])
    const bar = value * height
    context.fillStyle = levelColor(value)
    context.fillRect(x, height - bar, 1, Math.max(1, bar))
  }
}

export const BAND_COLORS = [
  { rgb: '230, 74, 25', label: 'Low' },
  { rgb: '0, 137, 123', label: 'Mid' },
  { rgb: '30, 136, 229', label: 'High' },
]

export function drawBands(
  context: CanvasRenderingContext2D,
  bands: Float32Array,
  range: Range,
  width: number,
  height: number,
) {
  const frames = bands.length / 3
  const span = range.end - range.start
  if (span <= 0 || frames === 0) return

  const perPixel = (span * frames) / width

  const row = height / 3

  for (let band = 0; band < 3; band += 1) {
    let runColor = ''
    let runStart = 0

    for (let x = 0; x < width; x += 1) {
      const start = Math.max(0, Math.floor((range.start + (x / width) * span) * frames))
      const end = Math.min(frames, Math.max(start + 1, Math.floor(start + perPixel)))
      let value = 0
      for (let frame = start; frame < end; frame += 1) {
        value = Math.max(value, bands[frame * 3 + band])
      }

      const color = `rgba(${BAND_COLORS[2 - band].rgb}, ${Math.min(1, value).toFixed(2)})`
      if (color !== runColor) {
        if (runColor) {
          context.fillStyle = runColor
          context.fillRect(runStart, band * row, x - runStart, row)
        }
        runColor = color
        runStart = x
      }
    }

    if (runColor) {
      context.fillStyle = runColor
      context.fillRect(runStart, band * row, width - runStart, row)
    }
  }
}

export function drawGridVertical(
  context: CanvasRenderingContext2D,
  sections: Section[],
  duration: number,
  position: number,
  span: number,
  width: number,
  height: number,
  color: string,
  accent: string,
) {
  if (span <= 0 || duration <= 0 || height <= 0) return

  const lineY = height * VERTICAL_LINE_RATIO
  const top = position + (lineY / height) * span
  const bottom = position - ((height - lineY) / height) * span
  const yOf = (at: number) => Math.round(lineY - ((at - position) / span) * height) + 0.5

  for (const item of sectionSpans(sections, duration)) {
    if (item.beat <= 0 || item.end < bottom || item.start > top) continue

    if (span / item.beat <= height / 4) {
      const from = Math.max(bottom, item.start)
      const to = Math.min(top, item.end)
      const firstIndex = Math.max(0, Math.ceil((from - item.start) / item.beat))
      const lastIndex = Math.floor((to - item.start) / item.beat)

      context.strokeStyle = color
      context.lineWidth = VERTICAL_LINE_WIDTH
      context.globalAlpha = 0.55

      for (let index = firstIndex; index <= lastIndex; index += 1) {
        const y = yOf(item.start + index * item.beat)
        context.beginPath()
        context.moveTo(0, y)
        context.lineTo(width, y)
        context.stroke()
      }

      context.globalAlpha = 1
    }

    if (item.start >= bottom && item.start <= top) {
      const y = yOf(item.start)
      context.strokeStyle = accent
      context.lineWidth = VERTICAL_LINE_WIDTH
      context.beginPath()
      context.moveTo(0, y)
      context.lineTo(width, y)
      context.stroke()
    }
  }
}

export function drawEnvelopeStrip(
  context: CanvasRenderingContext2D,
  envelope: Float32Array,
  range: Range,
  width: number,
  height: number,
  color: string,
) {
  const span = range.end - range.start
  if (span <= 0 || envelope.length === 0) return

  const middle = height / 2
  context.fillStyle = color
  context.globalAlpha = WAVE_ALPHA
  context.beginPath()

  const at = (x: number) => {
    const bin = Math.min(
      envelope.length - 1,
      Math.max(0, (range.start + (x / width) * span) * envelope.length),
    )
    const low = Math.floor(bin)
    const high = Math.min(envelope.length - 1, low + 1)
    return envelope[low] * (1 - (bin - low)) + envelope[high] * (bin - low)
  }

  for (let x = 0; x <= width; x += 1) {
    const half = at(x) * middle
    if (x === 0) context.moveTo(x, middle - half)
    else context.lineTo(x, middle - half)
  }
  for (let x = Math.floor(width); x >= 0; x -= 1) {
    context.lineTo(x, middle + at(x) * middle)
  }

  context.closePath()
  context.fill()
  context.globalAlpha = 1
}

export const SLICE_STEPS = [1, 2, 4, 8, 16]
export const MIN_COLUMN = 4
export const SLICE_SPAN = 1

// the steps follow the section's meter, so "one column per bar" stays true in
// three, five or seven as well as in four
export function sliceSteps(meter: number): number[] {
  const bar = Math.max(1, Math.round(meter))
  const steps = [1, 2, bar, bar * 2, bar * 4]
  return [...new Set(steps)].sort((left, right) => left - right)
}

export function autoSliceBeats(span: SectionSpan, width: number): number {
  const available = span.end - span.start
  const steps = sliceSteps(span.section.meter)
  if (span.beat <= 0 || available <= 0 || width <= 0) return span.section.meter

  return (
    steps.find((beats) => (available / (span.beat * beats)) * MIN_COLUMN <= width) ??
    steps[steps.length - 1]
  )
}

export type Bar = {
  start: number
  end: number
  section: string
}

export function collectBars(span: SectionSpan, beats: number, limit = 4000): Bar[] {
  const available = span.end - span.start
  if (span.beat <= 0 || available <= 0) return []

  const length = span.beat * beats
  if (length > available + 1e-9) {
    return [{ start: span.start, end: span.end, section: span.section.id }]
  }

  const bars: Bar[] = []
  for (let at = span.start; at + length <= span.end + 1e-9 && bars.length < limit; at += length) {
    bars.push({ start: at, end: Math.min(1, at + length * SLICE_SPAN), section: span.section.id })
  }

  return bars
}

export const BLOCK_GAP = 8
const BLOCK_WEIGHTS = [0.3, 0.16, 0.16, 0.38]
export const BAND_ORDER = [0, 1, 2]

export type BarSources = {
  envelope: Float32Array | null
  loudness: Float32Array | null
  onsets: Float32Array | null
  bands: Float32Array | null
}

export const BLOCK_LABELS = ['Wave', 'Loud', 'Hits', 'Band']
export const ALL_BLOCKS = [0, 1, 2, 3]

// the chosen blocks share the height in proportion to their weights, so one
// block on its own fills the view
export function blockHeights(height: number, blocks: number[] = ALL_BLOCKS): number[] {
  const weights = blocks.map((block) => BLOCK_WEIGHTS[block])
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1
  const usable = Math.max(0, height - BLOCK_GAP * (blocks.length - 1))
  return weights.map((weight) => Math.floor((usable * weight) / total))
}

export function blockPanels(block: number): number {
  return block === 3 ? 3 : 1
}

function parseHex(color: string): [number, number, number] {
  const text = color.trim()

  // the theme hands out both '#fff' and 'rgb(255 255 255)', and the short hex
  // read as six digits is a colour of its own rather than a wrong shade
  if (text.startsWith('rgb')) {
    const parts = text.match(/\d+(\.\d+)?/g) ?? []
    return [Number(parts[0]) | 0, Number(parts[1]) | 0, Number(parts[2]) | 0]
  }

  const digits = text.replace('#', '')
  const full =
    digits.length === 3 || digits.length === 4
      ? digits
          .slice(0, 3)
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : digits.slice(0, 6)
  const value = Number.parseInt(full, 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

const LEVEL_RGB = LEVEL_ZONES.map((zone) => ({ limit: zone.limit, rgb: parseHex(zone.color) }))
const HEAT_RGB = HEAT_STOPS.map(parseHex)
// Diverging maps have a pale middle, so a value reads as which side of the
// midpoint it sits on and how far, rather than as one climb from low to high.
// The midpoint is where the amplitude curve puts 0.5, which makes the curve
// the control for what counts as the middle.
export const COLORMAPS: { name: string; stops: string[] }[] = [
  { name: 'cool', stops: ['#3b4cc0', '#8db0fe', '#f2f2f2', '#f49a7b', '#b40426'] },
  { name: 'spectral', stops: ['#3288bd', '#99d594', '#ffffbf', '#fc8d59', '#d53e4f'] },
  { name: 'pink', stops: ['#c51b7d', '#e9a3c9', '#f7f7f7', '#a1d76a', '#4d9221'] },
  { name: 'earth', stops: ['#8c510a', '#d8b365', '#f5f5f5', '#5ab4ac', '#01665e'] },
  { name: 'heat', stops: ['#123a8f', '#2a9df4', '#f7c948', '#d7263d'] },
  { name: 'mono', stops: ['#111111', '#777777', '#dddddd', '#ffffff'] },
]

const COLORMAP_RGB = COLORMAPS.map((map) => map.stops.map(parseHex))
const BAND_RGB = BAND_COLORS.map((band) => band.rgb.split(',').map(Number) as [number, number, number])

function levelRgb(value: number) {
  const zone = LEVEL_RGB.find((entry) => value <= entry.limit)
  return (zone ?? LEVEL_RGB[LEVEL_RGB.length - 1]).rgb
}

function rampRgb(stops: [number, number, number][], value: number): [number, number, number] {
  const clamped = Math.min(1, Math.max(0, value))
  const scaled = clamped * (stops.length - 1)
  const index = Math.min(stops.length - 2, Math.floor(scaled))
  const ratio = scaled - index
  const from = stops[index]
  const to = stops[index + 1]
  return [
    from[0] + (to[0] - from[0]) * ratio,
    from[1] + (to[1] - from[1]) * ratio,
    from[2] + (to[2] - from[2]) * ratio,
  ]
}

function heatRgb(value: number) {
  return rampRgb(HEAT_RGB, value)
}

function waveRgb(value: number, colormap = 0) {
  return rampRgb(COLORMAP_RGB[colormap] ?? COLORMAP_RGB[0], value)
}

// The colour the compiled view paints a value, for anything drawn beside it
// that wants to say the same thing about the same number.
export function laneColor(value: number, colormap = 0): string {
  const [red, green, blue] = waveRgb(value, colormap)
  return `rgb(${red | 0} ${green | 0} ${blue | 0})`
}

const LUT_SIZE = 256

// The curve as a plain table, so the projections read the same shaped value the
// pixels beside them are painted from rather than the raw source.
function shapeLut(curve: Curve): Float32Array {
  const lut = new Float32Array(LUT_SIZE)
  for (let step = 0; step < LUT_SIZE; step += 1) lut[step] = applyCurve(step / (LUT_SIZE - 1), curve)
  return lut
}

function buildLut(curve: Curve, color: (value: number) => [number, number, number]): Uint32Array {
  const lut = new Uint32Array(LUT_SIZE)

  for (let step = 0; step < LUT_SIZE; step += 1) {
    const [red, green, blue] = color(applyCurve(step / (LUT_SIZE - 1), curve))
    lut[step] = (255 << 24) | (Math.round(blue) << 16) | (Math.round(green) << 8) | Math.round(red)
  }

  return lut
}

function bandRgb(rgb: [number, number, number]) {
  return (value: number): [number, number, number] => [
    255 + (rgb[0] - 255) * value,
    255 + (rgb[1] - 255) * value,
    255 + (rgb[2] - 255) * value,
  ]
}

function bandLut(curve: Curve, rgb: [number, number, number]): Uint32Array {
  return buildLut(curve, bandRgb(rgb))
}

// The colour a lane paints each level as the bytes of a 256 by 1 RGBA texture,
// with the curved level itself in the alpha: one table gives a colour lane its
// paint and a shape its width.
export function laneLutBytes(block: number, panel: number, curve: Curve, colormap: number): Uint8Array {
  const color =
    block === 0
      ? (value: number) => waveRgb(value, colormap)
      : block === 1
        ? levelRgb
        : block === 2
          ? heatRgb
          : bandRgb(BAND_RGB[BAND_ORDER[panel]])

  const bytes = new Uint8Array(LUT_SIZE * 4)
  for (let step = 0; step < LUT_SIZE; step += 1) {
    const curved = applyCurve(step / (LUT_SIZE - 1), curve)
    const [red, green, blue] = color(curved)
    bytes[step * 4] = Math.round(red)
    bytes[step * 4 + 1] = Math.round(green)
    bytes[step * 4 + 2] = Math.round(blue)
    bytes[step * 4 + 3] = Math.round(Math.min(1, Math.max(0, curved)) * 255)
  }
  return bytes
}

// The loudest frame between two points of a source, from a table of the
// loudest frame in each run of PEAK_RUN, so the question costs the runs
// between the points and the frames either side of them rather than every
// frame. Built once per channel, like the running totals.
const PEAK_RUN = 256
const PEAKS = new WeakMap<Float32Array, Float32Array[]>()

function peakRuns(source: Float32Array, stride: number, channel: number): Float32Array {
  let tables = PEAKS.get(source)
  if (!tables) {
    tables = []
    PEAKS.set(source, tables)
  }
  const held = tables[channel]
  if (held) return held

  const frames = source.length / stride
  const runs = new Float32Array(Math.ceil(frames / PEAK_RUN))
  for (let frame = 0; frame < frames; frame += 1) {
    const run = (frame / PEAK_RUN) | 0
    const value = source[frame * stride + channel]
    if (value > runs[run]) runs[run] = value
  }
  tables[channel] = runs
  return runs
}

export function peakBetween(
  source: Float32Array,
  stride: number,
  channel: number,
  from: number,
  until: number,
): number {
  const frames = source.length / stride
  const first = Math.max(0, Math.min(frames, from | 0))
  const last = Math.max(first, Math.min(frames, Math.ceil(until)))
  if (last <= first) return 0

  const runs = peakRuns(source, stride, channel)
  let most = 0

  const firstRun = Math.ceil(first / PEAK_RUN)
  const lastRun = Math.floor(last / PEAK_RUN)
  for (let run = firstRun; run < lastRun; run += 1) if (runs[run] > most) most = runs[run]

  const head = Math.min(last, firstRun * PEAK_RUN)
  for (let frame = first; frame < head; frame += 1) {
    const value = source[frame * stride + channel]
    if (value > most) most = value
  }
  for (let frame = Math.max(head, lastRun * PEAK_RUN); frame < last; frame += 1) {
    const value = source[frame * stride + channel]
    if (value > most) most = value
  }
  return most
}

// The picture projected onto its vertical axis: every column summed onto every
// other, so a row says how much happens at that place in the bar across the
// whole stretch. A grid on the music makes this a row of humps, one to a beat;
// a grid off it smears them into one another.
// A block's projections and where it sits, without a picture: what the GPU
// path keeps, since the pixels are its own.
export type ProjectionLayer = {
  block: number
  rows: number
  top: number
  height: number
  profile: Float32Array
  steady: Float32Array
  both: Float32Array
}

export type BlockLayer = {
  // which block this is, because a block with nothing to draw leaves no layer
  // and the two stop lining up by position
  block: number
  profile: Float32Array
  steady: Float32Array
  both: Float32Array
  image: ImageData
  // how many rows the block was sampled at, which the image no longer says
  // for a block whose picture is painted elsewhere
  rows: number
  top: number
  height: number
}

// Running totals of a source, one table per interleaved channel, so the mean
// over any run of frames is two reads and a divide however long the run is.
// Built the first time a source is read and kept for as long as the array
// lives: it is the same data structure a summed-area table is, not a copy of
// any picture.
const PREFIX_SUMS = new WeakMap<Float32Array, Float64Array[]>()

export function prefixSums(source: Float32Array, stride: number, channel: number): Float64Array {
  let tables = PREFIX_SUMS.get(source)
  if (!tables) {
    tables = []
    PREFIX_SUMS.set(source, tables)
  }
  const held = tables[channel]
  if (held) return held

  const frames = source.length / stride
  const sums = new Float64Array(frames + 1)
  for (let frame = 0; frame < frames; frame += 1) {
    sums[frame + 1] = sums[frame] + source[frame * stride + channel]
  }
  tables[channel] = sums
  return sums
}

// Where each column's rows start in the source and how many frames a row
// covers, worked out once per column rather than once per cell.
function columnSteps(bars: Bar[], frames: number, rows: number) {
  const starts = new Float64Array(bars.length)
  const steps = new Float64Array(bars.length)
  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index]
    starts[index] = bar.start * frames
    steps[index] = ((bar.end - bar.start) * frames) / rows
  }
  return { starts, steps }
}

// What one panel of bars adds to a block's projections: the curved value of
// every row summed over the bars, the squares of the same for the spread, and
// how many bars were counted. Additive across panels and across runs of bars,
// so a song's projections are the sum of its sections' and a change to one
// section costs that section alone.
export type Contribution = {
  profile: Float64Array
  squares: Float64Array
  counted: number
}

export function barContribution(
  source: Float32Array,
  stride: number,
  channel: number,
  bars: Bar[],
  rows: number,
  curve: Curve,
): Contribution {
  const profile = new Float64Array(rows)
  const squares = new Float64Array(rows)
  if (bars.length === 0 || rows <= 0) return { profile, squares, counted: 0 }

  const frames = source.length / stride
  const last = frames - 1
  const sums = prefixSums(source, stride, channel)
  const shaped = shapeLut(curve)
  const { starts, steps } = columnSteps(bars, frames, rows)
  const top255 = LUT_SIZE - 1

  for (let index = 0; index < bars.length; index += 1) {
    const start = starts[index]
    const step = steps[index]

    for (let row = 0; row < rows; row += 1) {
      const at = start + row * step
      let from = at | 0
      if (from > last) from = last
      let until = (at + step) | 0
      if (until <= from) until = from + 1
      if (until > frames) until = frames

      const value = (sums[until] - sums[from]) / (until - from)
      const curved = shaped[((value < 1 ? value : 1) * top255 + 0.5) | 0]
      profile[row] += curved
      squares[row] += curved * curved
    }
  }

  return { profile, squares, counted: bars.length }
}

export function addContribution(into: Contribution, part: Contribution) {
  for (let row = 0; row < into.profile.length; row += 1) {
    into.profile[row] += part.profile[row]
    into.squares[row] += part.squares[row]
  }
  into.counted += part.counted
}

export function takeContribution(from: Contribution, part: Contribution) {
  for (let row = 0; row < from.profile.length; row += 1) {
    from.profile[row] -= part.profile[row]
    from.squares[row] -= part.squares[row]
  }
  from.counted -= part.counted
}

// The three projection graphs from a block's summed contribution.
export function finishProjections(
  profile: Float64Array,
  squares: Float64Array,
  counted: number,
  rows: number,
) {
  // Read between its own quietest and loudest row rather than from nothing.
  // Music never falls silent between beats, so the quietest row still carries
  // most of what the loudest one does, and measuring from zero draws that
  // shared floor as a slab with the shape a sliver on top of it. What the
  // projection is for is the difference between the rows.
  let least = Infinity
  let most = -Infinity
  for (const value of profile) {
    if (value < least) least = value
    if (value > most) most = value
  }

  const shape = new Float32Array(rows)
  if (most > least) {
    for (let row = 0; row < rows; row += 1) shape[row] = (profile[row] - least) / (most - least)
  }

  // How alike the bars are at each row, rather than how much they add up to.
  // A row where every bar does the same thing is the grid holding; a row
  // where they differ is the grid landing somewhere new each time. Measured
  // against the row's own average, because a loud row varies by more than a
  // quiet one without being any less steady.
  let summed = 0
  for (const value of profile) summed += value
  const floor = (summed / Math.max(1, rows * counted)) * STEADY_FLOOR
  const spread = new Float64Array(rows)
  for (let row = 0; row < rows; row += 1) {
    const mean = profile[row] / Math.max(1, counted)
    const variance = Math.max(0, squares[row] / Math.max(1, counted) - mean * mean)
    spread[row] = Math.sqrt(variance) / Math.max(mean, floor)
  }

  let calmest = Infinity
  let wildest = -Infinity
  for (const value of spread) {
    if (value < calmest) calmest = value
    if (value > wildest) wildest = value
  }

  // inverted: the steadiest row reads highest
  const steady = new Float32Array(rows)
  if (wildest > calmest) {
    for (let row = 0; row < rows; row += 1) {
      steady[row] = (wildest - spread[row]) / (wildest - calmest)
    }
  }

  // The two read together: a row counts only where the bars both do a lot
  // there and do the same thing there. Deliberately not stretched to fill the
  // panel like the other two — left at its own size, it sits inside the sum
  // it is drawn over, and the gap between them is the part of the picture
  // that is loud without being repeated.
  const both = new Float32Array(rows)
  for (let row = 0; row < rows; row += 1) both[row] = shape[row] * steady[row]

  return { shape, steady, both }
}

export function renderBarLayers(
  context: CanvasRenderingContext2D,
  sources: BarSources,
  bars: Bar[],
  height: number,
  curves: CurveSet,
  blocks: number[] = ALL_BLOCKS,
  colormap = 0,
  // the wave block's picture can come from the GPU instead; its projections
  // are still read here, so only the pixels are left out
  paintWave = true,
): BlockLayer[] {
  if (bars.length === 0) return []

  const heights = blockHeights(height, blocks)
  const luts = [
    buildLut(curves.wave, (value) => waveRgb(value, colormap)),
    buildLut(curves.loud, levelRgb),
    buildLut(curves.hits, heatRgb),
    ...BAND_ORDER.map((band) => bandLut(curveFor(curves, 3, band), BAND_RGB[band])),
  ]
  const values = [sources.envelope, sources.loudness, sources.onsets]
  const layers: BlockLayer[] = []

  let top = 0
  for (let slot = 0; slot < blocks.length; slot += 1) {
    const block = blocks[slot]
    const blockHeight = Math.max(1, heights[slot])
    const panels = blockPanels(block)
    const columns = bars.length * panels
    const source = block === 3 ? sources.bands : values[block]

    if (!source) {
      top += blockHeight + BLOCK_GAP
      continue
    }

    // a slice usually spans fewer source frames than the block has pixel rows,
    // so render one row per frame and let the canvas scale it up
    const stride = block === 3 ? 3 : 1
    const frames = source.length / stride
    const slice = bars[0].end - bars[0].start
    const rows = Math.max(1, Math.min(blockHeight, Math.ceil(slice * frames)))

    const profile = new Float64Array(rows)
    const squares = new Float64Array(rows)
    let counted = 0
    const painted = paintWave || block !== 0
    const image = painted ? context.createImageData(columns, rows) : context.createImageData(1, 1)
    const pixels = painted ? new Uint32Array(image.data.buffer) : null

    const { starts, steps } = columnSteps(bars, frames, rows)
    const top255 = LUT_SIZE - 1
    const last = frames - 1

    for (let panel = 0; panel < panels; panel += 1) {
      const lut = block === 3 ? luts[3 + panel] : luts[block]
      const band = block === 3 ? BAND_ORDER[panel] : 0
      const shaped = shapeLut(curveFor(curves, block, band))
      const sums = prefixSums(source, stride, band)
      const offset = panel * bars.length
      counted += bars.length

      // columns outside, rows inside: a column's rows are consecutive runs of
      // frames, so the two totals a cell reads sit next to the two the cell
      // above it read, and the walk through the totals is one forward pass
      // per column rather than a jump per cell. The row accumulators are a few
      // hundred doubles and stay in cache whatever order they are hit in
      for (let index = 0; index < bars.length; index += 1) {
        const start = starts[index]
        const step = steps[index]
        const column = offset + index

        for (let row = 0; row < rows; row += 1) {
          // the mean of every frame the row covers: consecutive rows partition
          // the frames between them, so each frame counts once and once only
          const at = start + row * step
          let from = at | 0
          if (from > last) from = last
          let until = (at + step) | 0
          if (until <= from) until = from + 1
          if (until > frames) until = frames

          const value = (sums[until] - sums[from]) / (until - from)
          const level = ((value < 1 ? value : 1) * top255 + 0.5) | 0
          const curved = shaped[level]
          profile[row] += curved
          squares[row] += curved * curved
          if (pixels) pixels[row * columns + column] = lut[level]
        }
      }
    }

    const { shape, steady, both } = finishProjections(profile, squares, counted, rows)

    layers.push({ block, image, rows, top, height: blockHeight, profile: shape, steady, both })
    top += blockHeight + BLOCK_GAP
  }

  return layers
}

// How wide the projection panel is, and how far off its own edge it sits.
// How quiet a row has to be before its spread is read against the track's own
// level rather than against the row: division by something near nothing turns
// a silence into the wildest row there is.
const STEADY_FLOOR = 0.2

export const PROJECTION_WIDTH = 74
const PROJECTION_PAD = 6

// The projection drawn as a graph lying on its side, so its rows line up with
// the rows of the block it belongs to and a hump sits level with the beat that
// made it.
// The one column the playhead is in, read straight off the source at the rows
// the block is drawn at, so it can be laid over the average of them all.
export function columnProfile(
  sources: BarSources,
  block: number,
  bar: Bar,
  rows: number,
): Float32Array | null {
  const source = block === 3 ? sources.bands : [sources.envelope, sources.loudness, sources.onsets][block]
  if (!source || rows <= 0) return null

  const stride = block === 3 ? 3 : 1
  const frames = source.length / stride
  const base = bar.start * frames
  const step = ((bar.end - bar.start) * frames) / rows
  const last = frames - 1
  const sums = prefixSums(source, stride, 0)

  const values = new Float32Array(rows)
  let least = Infinity
  let most = -Infinity
  for (let row = 0; row < rows; row += 1) {
    // averaged over the row the same way the cells are, or the trace and the
    // picture it is read against disagree
    const at = base + row * step
    let from = at | 0
    if (from > last) from = last
    let until = (at + step) | 0
    if (until <= from) until = from + 1
    if (until > frames) until = frames

    const value = (sums[until] - sums[from]) / (until - from)
    values[row] = value
    if (value < least) least = value
    if (value > most) most = value
  }

  // read between its own ends, like the graphs it is drawn over, so the shape
  // of this one bar can be compared with the shape of all of them
  if (most > least) {
    for (let row = 0; row < rows; row += 1) values[row] = (values[row] - least) / (most - least)
  }
  return values
}

export function drawProjection(
  context: CanvasRenderingContext2D,
  profile: Float32Array,
  left: number,
  top: number,
  width: number,
  height: number,
  color: string,
  // which edge the graph stands on, so a pair of them lean away from the bars
  mirrored = false,
  // an outline only, for a graph laid over another
  filled = true,
) {
  if (profile.length === 0 || height <= 0) return

  const room = Math.max(1, width - PROJECTION_PAD * 2)
  const from = mirrored ? left + width - PROJECTION_PAD : left + PROJECTION_PAD
  const reach = mirrored ? -room : room

  context.save()
  context.beginPath()
  context.rect(left, top, width, height)
  context.clip()

  context.beginPath()
  context.moveTo(from, top)
  for (let row = 0; row < profile.length; row += 1) {
    // the middle of the row's band, so the graph sits where the colour does
    const y = top + ((row + 0.5) / profile.length) * height
    context.lineTo(from + profile[row] * reach, y)
  }
  if (filled) {
    context.lineTo(from, top + height)
    context.closePath()
    context.fillStyle = color
    context.globalAlpha = 0.22
    context.fill()
    context.globalAlpha = 1
  }

  context.strokeStyle = color
  context.lineWidth = filled ? 1 : 1.5
  context.stroke()
  context.restore()
}

// How the level lanes, wave and loud, are drawn: as the field of colour they
// have always been, as rows whose width is their value and whose colour is the
// one that value is painted everywhere else, or as the one filled silhouette
// the beat frames draw.
export const WAVE_STYLES = [
  { value: 'colour', label: 'Level colour' },
  { value: 'shape', label: 'Level shape' },
  { value: 'silhouette', label: 'Level silhouette' },
] as const

export type WaveStyle = (typeof WAVE_STYLES)[number]['value']

// A full value fills this much of its column, so the loudest row still leaves a
// gap to the column beside it rather than running edge to edge.
export const WAVE_FILL = 0.82

// The wave lane sampled once per column and row, curved, and read against the
// loudest row in view. Kept apart from the drawing because the sampling is the
// expensive half and it only changes when the bars, the window or the curve do,
// while the drawing runs on every frame the playhead moves.
export type WaveShape = {
  rows: number
  columns: number
  // row-major, one byte per cell on nought to 255: what the texture and the
  // pixel fill both take as they are
  levels: Uint8Array
}

export function buildWaveShape(
  source: Float32Array,
  bars: Bar[],
  rows: number,
  curve: Curve,
  // a shape is read against the loudest row in view; a colour is the value as
  // it is, the same number the other lanes and the projections paint
  normalise = true,
): WaveShape | null {
  if (bars.length === 0 || source.length === 0 || rows <= 0) return null

  const frames = source.length
  const last = frames - 1
  const columns = bars.length
  const sums = prefixSums(source, 1, 0)
  const shaped = shapeLut(curve)
  const { starts, steps } = columnSteps(bars, frames, rows)
  const top255 = LUT_SIZE - 1

  const values = new Float32Array(columns * rows)
  let most = 0

  for (let row = 0; row < rows; row += 1) {
    const line = row * columns
    for (let index = 0; index < columns; index += 1) {
      const at = starts[index] + row * steps[index]
      let from = at | 0
      if (from > last) from = last
      let until = (at + steps[index]) | 0
      if (until <= from) until = from + 1
      if (until > frames) until = frames

      const mean = (sums[until] - sums[from]) / (until - from)
      const value = shaped[((mean < 1 ? mean : 1) * top255 + 0.5) | 0]
      values[line + index] = value
      if (value > most) most = value
    }
  }

  // read against the loudest row rather than against one: a quiet passage would
  // otherwise draw as a sliver, and a loud one as a column of solid bars
  const scale = normalise && most > 0 ? 255 / most : 255
  const levels = new Uint8Array(values.length)
  for (let at = 0; at < values.length; at += 1) {
    const level = (values[at] * scale + 0.5) | 0
    levels[at] = level > 255 ? 255 : level
  }

  return { rows, columns, levels }
}

// Packed colours for the pixel fill. The shape is built the way the lanes are,
// a pixel at a time into an ImageData, because a path costs one point per row
// per column and the whole song can be thousands of columns wide, while this
// costs the size of the picture whatever the columns do.
const LANE_LUTS = new Map<number, Uint32Array>()

function laneLut(colormap: number): Uint32Array {
  const held = LANE_LUTS.get(colormap)
  if (held) return held

  const lut = new Uint32Array(LUT_SIZE)
  for (let step = 0; step < LUT_SIZE; step += 1) {
    const [red, green, blue] = waveRgb(step / (LUT_SIZE - 1), colormap)
    lut[step] = (255 << 24) | (Math.round(blue) << 16) | (Math.round(green) << 8) | Math.round(red)
  }
  LANE_LUTS.set(colormap, lut)
  return lut
}

// A theme colour as the three channels a shader takes, on nought to one.
export function colorChannels(color: string): [number, number, number] {
  const [red, green, blue] = parseHex(color)
  return [red / 255, green / 255, blue / 255]
}

// A colourmap as the bytes of a 256 by 1 RGBA texture.
export function colormapBytes(colormap: number): Uint8Array {
  const bytes = new Uint8Array(LUT_SIZE * 4)
  for (let step = 0; step < LUT_SIZE; step += 1) {
    const [red, green, blue] = waveRgb(step / (LUT_SIZE - 1), colormap)
    bytes[step * 4] = Math.round(red)
    bytes[step * 4 + 1] = Math.round(green)
    bytes[step * 4 + 2] = Math.round(blue)
    bytes[step * 4 + 3] = 255
  }
  return bytes
}

function packed(color: string): number {
  const [red, green, blue] = parseHex(color)
  return (255 << 24) | (blue << 16) | (green << 8) | red
}

export function buildWaveImage(
  context: CanvasRenderingContext2D,
  shape: WaveShape,
  width: number,
  colormap: number,
  background: string,
  style: WaveStyle,
  silhouette: string,
): ImageData | null {
  const { rows, columns, levels } = shape
  const span = Math.max(1, Math.round(width))
  if (columns === 0 || rows === 0) return null

  const image = context.createImageData(span, rows)
  const pixels = new Uint32Array(image.data.buffer)
  pixels.fill(packed(background))

  const column = span / columns
  const reach = (column * WAVE_FILL) / 2
  const flat = packed(silhouette)
  const lut = laneLut(colormap)

  for (let row = 0; row < rows; row += 1) {
    const line = row * span
    const cells = row * columns

    for (let index = 0; index < columns; index += 1) {
      const level = levels[cells + index]
      const middle = index * column + column / 2
      const half = style === 'colour' ? column / 2 : (level / 255) * reach
      const from = Math.max(0, Math.round(middle - half))
      const until = Math.min(span, Math.max(from + 1, Math.round(middle + half)))
      const paint = style === 'silhouette' ? flat : lut[level]

      for (let x = from; x < until; x += 1) pixels[line + x] = paint
    }
  }

  return image
}

export const CURSOR_WIDTH = 3
// a canvas stroke straddles its path, so the rect is grown by half the weight
// to put the whole outline outside the column and leave the column itself whole
export const CURSOR_OUTLINE = 2
// the hue the column under the playhead is repainted in: hue blending keeps the
// brightness and the saturation the lane drew, so the bar keeps its shape and
// only its colour says it is the current one
export const CURSOR_HUE = '#00e5ff'

// How the column under the playhead is recoloured in the compiled view. The
// turns keep every column apart from its neighbours whatever the map, the
// fixed hue is one colour that says "here" but is lost wherever the map
// comes near it.
export type CursorTint = 'opposite' | 'quarter' | 'fixed'
export const CURSOR_TINTS: { value: CursorTint; label: string }[] = [
  { value: 'opposite', label: 'Opposite' },
  { value: 'quarter', label: 'Quarter turn' },
  { value: 'fixed', label: 'Fixed hue' },
]

// How the column cursor is blended into the lanes under it. Every one of these
// keeps the cursor readable over a colourmap that owns any given hue; the plain
// paint is last because it is the only one a lane can hide.
export const CURSOR_MODES: { value: GlobalCompositeOperation; label: string }[] = [
  { value: 'difference', label: 'Inverse' },
  { value: 'xor', label: 'Cut out' },
  { value: 'source-over', label: 'Solid' },
]

export const GUIDE_WIDTH = 1


const SECTION_OUTLINE = 2

// How the columns sit against the window. The first and last bars usually
// straddle its edges, so the picture is `head` columns to the left of the plot
// and `shown` columns wide across it: that is what lets a pan slide the bars
// by a fraction of a column instead of stepping a whole one at a time.
export type ColumnLayout = {
  head: number
  shown: number
}

export function columnLayout(bars: Bar[], range: Range): ColumnLayout {
  if (bars.length === 0) return { head: 0, shown: 1 }

  const first = bars[0]
  const last = bars[bars.length - 1]
  const head = Math.min(
    1,
    Math.max(0, (range.start - first.start) / Math.max(1e-12, first.end - first.start)),
  )
  const tail = Math.min(
    1,
    Math.max(0, (last.end - range.end) / Math.max(1e-12, last.end - last.start)),
  )
  return { head, shown: Math.max(1e-6, bars.length - head - tail) }
}

export function drawSectionBounds(
  context: CanvasRenderingContext2D,
  bars: Bar[],
  width: number,
  height: number,
  color: string,
  layout: ColumnLayout = { head: 0, shown: bars.length },
) {
  if (bars.length === 0) return

  const column = width / layout.shown
  const { head } = layout

  // every boundary in one path and one stroke: a song of hundreds of sections
  // drew hundreds of strokes a frame for a row of identical lines
  context.strokeStyle = color
  context.lineWidth = 1
  context.globalAlpha = 0.8
  context.beginPath()
  for (let index = 1; index < bars.length; index += 1) {
    if (bars[index].section === bars[index - 1].section) continue
    const x = Math.round((index - head) * column) + 0.5
    context.moveTo(x, 0)
    context.lineTo(x, height)
  }
  context.stroke()
  context.globalAlpha = 1
}

// The section under the pointer, boxed. An outline rather than a tint so it
// can sit on a canvas of its own over the picture: a blend needs the pixels
// it blends with, and a pointer move then costs this box and nothing else.
export function drawSectionHighlight(
  context: CanvasRenderingContext2D,
  bars: Bar[],
  width: number,
  height: number,
  highlight: string,
  color: string,
  layout: ColumnLayout = { head: 0, shown: bars.length },
) {
  const first = bars.findIndex((bar) => bar.section === highlight)
  if (first < 0) return
  let last = first
  while (last + 1 < bars.length && bars[last + 1].section === highlight) last += 1

  const column = width / layout.shown
  const inset = SECTION_OUTLINE / 2
  context.save()
  context.strokeStyle = color
  context.lineWidth = SECTION_OUTLINE
  context.strokeRect(
    (first - layout.head) * column + inset,
    inset,
    (last - first + 1) * column - SECTION_OUTLINE,
    height - SECTION_OUTLINE,
  )
  context.restore()
}

export const DIVISION_STEPS = [2, 3, 4, 6, 8]

export function drawSliceGuides(
  context: CanvasRenderingContext2D,
  top: number,
  height: number,
  width: number,
  color: string,
  divisions = 4,
) {
  context.strokeStyle = color
  context.lineWidth = GUIDE_WIDTH
  context.globalAlpha = 0.7

  for (let step = 1; step < divisions; step += 1) {
    const y = Math.round(top + (step / divisions) * height) + 0.5
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(width, y)
    context.stroke()
  }

  context.globalAlpha = 1
}

export function drawColumnCursor(
  context: CanvasRenderingContext2D,
  bars: Bar[],
  tops: number[],
  heights: number[],
  position: number,
  width: number,
  mode: GlobalCompositeOperation,
  solid: string,
  // per block, whether the column under the playhead is recoloured or only
  // outlined: a silhouette is one flat colour and a hue on it says nothing
  tinted: boolean[],
  layout: ColumnLayout = { head: 0, shown: bars.length },
) {
  const index = bars.findIndex((bar) => position >= bar.start && position < bar.end)
  if (index < 0) return

  const bar = bars[index]
  const ratio = (position - bar.start) / (bar.end - bar.start)

  // the blend does the work of staying visible, so the paint is white for all
  // of them but the one that lays a colour down as it is
  const paint = mode === 'source-over' ? solid : '#ffffff'

  context.save()
  context.globalCompositeOperation = mode
  context.strokeStyle = paint
  context.fillStyle = paint
  context.lineWidth = CURSOR_OUTLINE

  const grow = CURSOR_OUTLINE / 2

  tops.forEach((top, block) => {
    const panels = blockPanels(block)
    const panelWidth = width / panels
    const column = panelWidth / layout.shown
    const y = Math.round(top + ratio * heights[block])

    for (let panel = 0; panel < panels; panel += 1) {
      const left = panel * panelWidth + (index - layout.head) * column

      if (tinted[block]) {
        context.save()
        context.globalCompositeOperation = 'hue'
        context.fillStyle = CURSOR_HUE
        context.fillRect(left, top, column, heights[block])
        context.restore()
      }

      context.strokeRect(
        left - grow,
        top - grow,
        column + CURSOR_OUTLINE,
        heights[block] + CURSOR_OUTLINE,
      )
      context.fillRect(left, y - CURSOR_WIDTH / 2, column, CURSOR_WIDTH)
    }
  })

  context.restore()
}

// Signatures for useCanvas. They have to cover everything a draw reads, or the
// canvas keeps a stale picture: cheap to build, and wrong only if incomplete.

const signatureCache = new WeakMap<Section[], string>()

export function sectionSignature(sections: Section[]): string {
  const cached = signatureCache.get(sections)
  if (cached !== undefined) return cached

  const signature = sections.map((section) => `${section.offsetMs}:${section.bpm}`).join(',')
  signatureCache.set(sections, signature)
  return signature
}
