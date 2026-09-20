import type { Range } from './range'
import { applyCurve, type Curve } from './curve'
import { sectionSpans, type Section, type SectionSpan } from './timing'
import { ENVELOPE_HOP, type PeakLevel, type Pyramid } from './audio'

export const WAVE_ALPHA = 1
export const BACKDROP_ALPHA = 0.2

export function drawBackdrop(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  if (!image.naturalWidth || !image.naturalHeight) return

  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const drawWidth = image.naturalWidth * scale
  const drawHeight = image.naturalHeight * scale

  context.globalAlpha = BACKDROP_ALPHA
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
  context.globalAlpha = 1
}

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

function verticalLine(
  context: CanvasRenderingContext2D,
  x: number,
  height: number,
  envelope: Float32Array | null,
  color: string,
) {
  const middle = height / 2
  const half = envelope ? (envelope[Math.floor(x)] ?? 0) : 0

  context.strokeStyle = color
  context.beginPath()
  context.moveTo(x, half > 0 ? 0 : 0)
  context.lineTo(x, half > 0 ? middle - half : height)
  context.stroke()

  if (half <= 0) return

  context.beginPath()
  context.moveTo(x, middle + half)
  context.lineTo(x, height)
  context.stroke()

  context.strokeStyle = invertColor(color)
  context.beginPath()
  context.moveTo(x, middle - half)
  context.lineTo(x, middle + half)
  context.stroke()
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

  for (const item of sectionSpans(sections, duration)) {
    if (item.end < range.start || item.start > range.end) continue
    if (item.beat <= 0) continue

    const visible = Math.min(span, item.end - item.start) / item.beat
    if (visible <= width / 4) {
      const from = Math.max(range.start, item.start)
      const to = Math.min(range.end, item.end)
      const firstIndex = Math.max(0, Math.ceil((from - item.start) / item.beat))
      const lastIndex = Math.floor((to - item.start) / item.beat)

      context.lineWidth = BEAT_LINE_WIDTH
      context.globalAlpha = 0.4

      for (let index = firstIndex; index <= lastIndex; index += 1) {
        const x = Math.round(((item.start + index * item.beat - range.start) / span) * width) + 0.5
        verticalLine(context, x, height, envelope, color)
      }

      context.globalAlpha = 1
    }

    if (item.start >= range.start && item.start <= range.end) {
      const x = Math.round(((item.start - range.start) / span) * width) + 0.5
      context.lineWidth = BEAT_LINE_WIDTH * 2
      verticalLine(context, x, height, envelope, accent)
    }
  }
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
    const half = applyCurve(amplitude, curve) * middle
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
) {
  const spans = sectionSpans(sections, duration)
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = font

  spans.forEach((item, index) => {
    const left = item.start * width
    const right = item.end * width
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
    if (box > context.measureText(label).width + 10) {
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

  for (let y = 0; y < rows; y += 1) {
    const at = position + ((lineY - y) / height) * span
    const index = at * total
    if (index < 0 || index >= total) continue

    const bin = Math.min(envelope.length - 1, Math.max(0, index / ENVELOPE_HOP - 0.5))
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

export const BEATS_PER_BAR = 4

export type Bar = {
  start: number
  end: number
}

export function collectBars(span: SectionSpan, limit = 2000): Bar[] {
  const bars: Bar[] = []
  const length = span.beat * BEATS_PER_BAR
  if (length <= 0) return bars

  for (let at = span.start; at + length <= span.end + 1e-9 && bars.length < limit; at += length) {
    bars.push({ start: at, end: at + length })
  }

  return bars
}

export const BLOCK_GAP = 8
const BLOCK_WEIGHTS = [0.3, 0.2, 0.18, 0.32]

export type BarSources = {
  envelope: Float32Array | null
  loudness: Float32Array | null
  onsets: Float32Array | null
  bands: Float32Array | null
}

function sampleAt(values: Float32Array, at: number, stride = 1): number {
  const frames = values.length / stride
  const index = Math.min(frames - 1, Math.max(0, Math.floor(at * frames)))
  let value = 0
  for (let offset = 0; offset < stride; offset += 1) {
    value = Math.max(value, values[index * stride + offset])
  }
  return Math.min(1, value)
}

export function blockHeights(height: number): number[] {
  const usable = Math.max(0, height - BLOCK_GAP * (BLOCK_WEIGHTS.length - 1))
  return BLOCK_WEIGHTS.map((weight) => Math.floor(usable * weight))
}

function parseHex(color: string): [number, number, number] {
  const value = Number.parseInt(color.replace('#', ''), 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

const LEVEL_RGB = LEVEL_ZONES.map((zone) => ({ limit: zone.limit, rgb: parseHex(zone.color) }))
const HEAT_RGB = HEAT_STOPS.map(parseHex)
const WAVE_RGB = ['#123a8f', '#2a9df4', '#f7c948', '#d7263d'].map(parseHex)
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

function waveRgb(value: number) {
  return rampRgb(WAVE_RGB, value)
}

export function renderBarColumns(
  context: CanvasRenderingContext2D,
  sources: BarSources,
  bars: Bar[],
  width: number,
  height: number,
  curve: Curve,
): ImageData {
  const image = context.createImageData(Math.max(1, width), Math.max(1, height))
  const pixels = image.data
  pixels.fill(255)

  if (bars.length === 0) return image

  const heights = blockHeights(height)
  const column = width / bars.length
  const put = (x: number, y: number, rgb: [number, number, number]) => {
    const offset = (y * width + x) * 4
    pixels[offset] = rgb[0]
    pixels[offset + 1] = rgb[1]
    pixels[offset + 2] = rgb[2]
  }

  let top = 0
  for (let block = 0; block < heights.length; block += 1) {
    const blockHeight = heights[block]

    for (let index = 0; index < bars.length; index += 1) {
      const bar = bars[index]
      const span = bar.end - bar.start
      const left = Math.round(index * column)
      const right = Math.max(left + 1, Math.round((index + 1) * column))

      for (let row = 0; row < blockHeight; row += 1) {
        const y = top + row
        if (y >= height) break
        const at = bar.start + (row / blockHeight) * span

        if (block === 0 && sources.envelope) {
          const rgb = waveRgb(applyCurve(sampleAt(sources.envelope, at), curve))
          for (let x = left; x < right && x < width; x += 1) put(x, y, rgb)
        } else if (block === 1 && sources.loudness) {
          const rgb = levelRgb(applyCurve(sampleAt(sources.loudness, at), curve))
          for (let x = left; x < right && x < width; x += 1) put(x, y, rgb)
        } else if (block === 2 && sources.onsets) {
          const rgb = heatRgb(applyCurve(sampleAt(sources.onsets, at), curve))
          for (let x = left; x < right && x < width; x += 1) put(x, y, rgb)
        } else if (block === 3 && sources.bands) {
          const frames = sources.bands.length / 3
          const frame = Math.min(frames - 1, Math.max(0, Math.floor(at * frames)))
          const stripe = (right - left) / 3

          for (let band = 0; band < 3; band += 1) {
            const value = applyCurve(Math.min(1, sources.bands[frame * 3 + band]), curve)
            const rgb = BAND_RGB[2 - band]
            const mixed: [number, number, number] = [
              255 + (rgb[0] - 255) * value,
              255 + (rgb[1] - 255) * value,
              255 + (rgb[2] - 255) * value,
            ]
            const from = Math.round(left + band * stripe)
            const to = Math.round(left + (band + 1) * stripe)
            for (let x = from; x < to && x < width; x += 1) put(x, y, mixed)
          }
        }
      }
    }

    top += blockHeight + BLOCK_GAP
  }

  return image
}

export const CURSOR_WIDTH = 3

export function drawColumnCursor(
  context: CanvasRenderingContext2D,
  bars: Bar[],
  tops: number[],
  heights: number[],
  position: number,
  width: number,
  color: string,
) {
  const index = bars.findIndex((bar) => position >= bar.start && position < bar.end)
  if (index < 0) return

  const bar = bars[index]
  const column = width / bars.length
  const left = index * column
  const ratio = (position - bar.start) / (bar.end - bar.start)

  context.strokeStyle = color
  context.fillStyle = color

  tops.forEach((top, block) => {
    const y = Math.round(top + ratio * heights[block])
    context.lineWidth = 1
    context.strokeRect(left + 0.5, top + 0.5, column - 1, heights[block] - 1)
    context.fillRect(left, y - CURSOR_WIDTH / 2, column, CURSOR_WIDTH)
  })
}
