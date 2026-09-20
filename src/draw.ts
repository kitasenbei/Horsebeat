import type { Range } from './range'
import { applyCurve, type Curve } from './curve'
import { sectionSpans, type Section } from './timing'

export const WAVE_ALPHA = 0.55

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
) {
  const span = range.end - range.start
  if (span <= 0 || position < range.start || position > range.end) return

  const x = Math.round(((position - range.start) / span) * width)
  const top = height - HANDLE_HEIGHT

  context.fillStyle = color
  context.beginPath()
  context.moveTo(x - HANDLE_WIDTH / 2, top)
  context.lineTo(x + HANDLE_WIDTH / 2, top)
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
) {
  const middle = height / 2
  const first = range.start * samples.length
  const span = (range.end - range.start) * samples.length
  const perPixel = span / width

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
    const start = Math.max(0, Math.floor(first + x * perPixel))
    const end = Math.min(samples.length, Math.max(start + 1, Math.floor(first + (x + 1) * perPixel)))
    let min = 0
    let max = 0
    for (let index = start; index < end; index += 1) {
      const value = samples[index]
      if (value < min) min = value
      if (value > max) max = value
    }
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

export function drawGrid(
  context: CanvasRenderingContext2D,
  sections: Section[],
  duration: number,
  range: Range,
  width: number,
  height: number,
  color: string,
  accent: string,
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

      context.strokeStyle = color
      context.lineWidth = 1
      context.globalAlpha = 0.4

      for (let index = firstIndex; index <= lastIndex; index += 1) {
        const x = Math.round(((item.start + index * item.beat - range.start) / span) * width) + 0.5
        context.beginPath()
        context.moveTo(x, 0)
        context.lineTo(x, height)
        context.stroke()
      }

      context.globalAlpha = 1
    }

    if (item.start >= range.start && item.start <= range.end) {
      const x = Math.round(((item.start - range.start) / span) * width) + 0.5
      context.strokeStyle = accent
      context.lineWidth = 2
      context.beginPath()
      context.moveTo(x, 0)
      context.lineTo(x, height)
      context.stroke()
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

export function drawSamplesAmplitude(
  context: CanvasRenderingContext2D,
  samples: Float32Array,
  range: Range,
  width: number,
  height: number,
  color: string,
  curve: Curve,
) {
  const middle = height / 2
  const first = range.start * samples.length
  const span = (range.end - range.start) * samples.length
  const perPixel = span / width
  context.fillStyle = color
  context.globalAlpha = WAVE_ALPHA

  for (let x = 0; x < width; x += 1) {
    const start = Math.max(0, Math.floor(first + x * perPixel))
    const end = Math.min(samples.length, Math.max(start + 1, Math.floor(first + (x + 1) * perPixel)))
    let amplitude = 0
    for (let index = start; index < end; index += 1) {
      amplitude = Math.max(amplitude, Math.abs(samples[index]))
    }
    const half = applyCurve(amplitude, curve) * middle
    context.fillRect(x, middle - half, 1, Math.max(1, half * 2))
  }

  context.globalAlpha = 1
}
