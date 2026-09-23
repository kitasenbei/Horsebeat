// A curve maps a level to how much of it is drawn. Its x is a level in
// decibels, nought at the floor and one at full scale, the same scale the
// loudness lane is on; its y is the share drawn, nought to one. The presets
// are placed on that scale: most music sits between a half and nine tenths.
export type CurvePoint = {
  x: number
  y: number
  // how wide the point's bump is, as a share of the way to each neighbour, one
  // by default. Narrower than one, the curve holds the straight line between
  // the neighbours until that close to the point, then rises to it and falls
  // back, so the point is a peak that leaves the rest of the curve alone
  spread?: number
}

export type Curve = {
  points: CurvePoint[]
}

export const DEFAULT_CURVE: Curve = {
  points: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ],
}

// One curve for each source the compiled view draws: the wave, the loudness,
// the hits and the three bands. A lane reads its own.
export const CURVE_KEYS = ['wave', 'loud', 'hits', 'low', 'mid', 'high'] as const
export type CurveKey = (typeof CURVE_KEYS)[number]
export type CurveSet = Record<CurveKey, Curve>

export const DEFAULT_CURVES: CurveSet = {
  wave: DEFAULT_CURVE,
  loud: DEFAULT_CURVE,
  hits: DEFAULT_CURVE,
  low: DEFAULT_CURVE,
  mid: DEFAULT_CURVE,
  high: DEFAULT_CURVE,
}

const BAND_KEYS: CurveKey[] = ['low', 'mid', 'high']

// the curve a block's panel is drawn through: blocks are the wave, the
// loudness, the hits and the bands, and a band block's panels are its bands
export function curveFor(curves: CurveSet, block: number, panel = 0): Curve {
  if (block === 0) return curves.wave
  if (block === 1) return curves.loud
  if (block === 2) return curves.hits
  return curves[BAND_KEYS[panel] ?? 'low']
}

export function curveSignature(curve: Curve): string {
  return curve.points.map((point) => `${point.x}:${point.y}:${point.spread ?? 1}`).join(',')
}

export function curvesSignature(curves: CurveSet): string {
  return CURVE_KEYS.map((key) => curveSignature(curves[key])).join(';')
}

export const MIN_GAP = 0.02
export const MAX_POINTS = 10
export const MIN_SPREAD = 0.02

type Knots = {
  points: CurvePoint[]
  slopes: number[]
}

const knotCache = new WeakMap<Curve, Knots>()

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

export function sortPoints(points: CurvePoint[]): CurvePoint[] {
  return [...points].sort((left, right) => left.x - right.x)
}

// The points the spline runs through: every point of the curve, and for an
// inner point narrower than full, a knot each side on the chord between its
// neighbours where its bump begins and ends
function expand(points: CurvePoint[]): CurvePoint[] {
  const knots: CurvePoint[] = []
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    const spread = point.spread ?? 1
    if (index === 0 || index === points.length - 1 || spread >= 1) {
      knots.push(point)
      continue
    }
    const before = points[index - 1]
    const after = points[index + 1]
    const chord = (x: number) => before.y + ((after.y - before.y) * (x - before.x)) / (after.x - before.x)
    const left = point.x - spread * (point.x - before.x)
    const right = point.x + spread * (after.x - point.x)
    knots.push({ x: left, y: chord(left) }, point, { x: right, y: chord(right) })
  }
  return sortPoints(knots)
}

function tangents(points: CurvePoint[]): number[] {
  const slopes: number[] = []
  for (let index = 0; index < points.length - 1; index += 1) {
    const run = points[index + 1].x - points[index].x
    slopes.push(run === 0 ? 0 : (points[index + 1].y - points[index].y) / run)
  }

  const result: number[] = []
  for (let index = 0; index < points.length; index += 1) {
    if (index === 0) result.push(slopes[0] ?? 0)
    else if (index === points.length - 1) result.push(slopes[slopes.length - 1] ?? 0)
    else if (slopes[index - 1] * slopes[index] <= 0) result.push(0)
    else result.push((slopes[index - 1] + slopes[index]) / 2)
  }

  for (let index = 0; index < slopes.length; index += 1) {
    if (slopes[index] === 0) {
      result[index] = 0
      result[index + 1] = 0
      continue
    }
    const alpha = result[index] / slopes[index]
    const beta = result[index + 1] / slopes[index]
    const scale = Math.hypot(alpha, beta)
    if (scale > 3) {
      result[index] = ((3 / scale) * alpha) * slopes[index]
      result[index + 1] = ((3 / scale) * beta) * slopes[index]
    }
  }

  return result
}

function knotsOf(curve: Curve): Knots {
  const cached = knotCache.get(curve)
  if (cached) return cached
  const points = expand(curve.points)
  const knots = { points, slopes: tangents(points) }
  knotCache.set(curve, knots)
  return knots
}

export function applyCurve(value: number, curve: Curve): number {
  if (curve.points.length < 2) return clamp01(value)
  const { points, slopes } = knotsOf(curve)

  const x = clamp01(value)
  if (x <= points[0].x) return clamp01(points[0].y)
  if (x >= points[points.length - 1].x) return clamp01(points[points.length - 1].y)

  let index = 0
  while (index < points.length - 2 && x > points[index + 1].x) index += 1

  const left = points[index]
  const right = points[index + 1]
  const run = right.x - left.x
  if (run === 0) return clamp01(right.y)

  const t = (x - left.x) / run
  const t2 = t * t
  const t3 = t2 * t

  const h00 = 2 * t3 - 3 * t2 + 1
  const h10 = t3 - 2 * t2 + t
  const h01 = -2 * t3 + 3 * t2
  const h11 = t3 - t2

  return clamp01(
    h00 * left.y + h10 * run * slopes[index] + h01 * right.y + h11 * run * slopes[index + 1],
  )
}

export const CURVE_PRESETS = {
  linear: DEFAULT_CURVE,
  lift: {
    points: [
      { x: 0, y: 0 },
      { x: 0.45, y: 0.5 },
      { x: 0.75, y: 0.85 },
      { x: 1, y: 1 },
    ],
  },
  contrast: {
    points: [
      { x: 0, y: 0 },
      { x: 0.55, y: 0.18 },
      { x: 0.8, y: 0.86 },
      { x: 1, y: 1 },
    ],
  },
  tame: {
    points: [
      { x: 0, y: 0 },
      { x: 0.6, y: 0.3 },
      { x: 0.85, y: 0.6 },
      { x: 1, y: 0.9 },
    ],
  },
  gate: {
    points: [
      { x: 0, y: 0 },
      { x: 0.55, y: 0.02 },
      { x: 0.7, y: 0.5 },
      { x: 1, y: 1 },
    ],
  },
  peaks: {
    points: [
      { x: 0, y: 0 },
      { x: 0.75, y: 0.04 },
      { x: 0.9, y: 0.55 },
      { x: 1, y: 1 },
    ],
  },
  flatten: {
    points: [
      { x: 0, y: 0 },
      { x: 0.4, y: 0.45 },
      { x: 0.7, y: 0.78 },
      { x: 1, y: 1 },
    ],
  },
  hard: {
    points: [
      { x: 0, y: 0 },
      { x: 0.65, y: 0.04 },
      { x: 0.72, y: 0.96 },
      { x: 1, y: 1 },
    ],
  },
  // nothing drawn at any level: the lanes go quiet and only the grid is left
  flat: {
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ],
  },
} satisfies Record<string, Curve>

// the level a given share of the track sits below, read off sorted levels
function quantile(sorted: Float32Array, share: number): number {
  if (sorted.length === 0) return share
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(share * (sorted.length - 1))))]
}

// the points pushed apart to the least gap the editor keeps, so a curve built
// from a track whose levels crowd together is still one the editor can hold
function spaced(points: CurvePoint[]): CurvePoint[] {
  const out = points.map((point) => ({ ...point }))
  for (let index = 1; index < out.length; index += 1) {
    out[index].x = Math.max(out[index].x, out[index - 1].x + MIN_GAP)
  }
  for (let index = out.length - 2; index >= 0; index -= 1) {
    out[index].x = Math.min(out[index].x, out[index + 1].x - MIN_GAP)
  }
  out[0].x = Math.max(0, out[0].x)
  out[out.length - 1].x = Math.min(1, out[out.length - 1].x)
  return out
}

// Curves shaped by where a track's levels lie, rather than by fixed places on
// the axis: each is a reading of the same sorted levels the editor draws as
// the mountain behind the curve.
export function trackCurves(levels: Float32Array): Record<'stretch' | 'equalise' | 'median' | 'loudest', Curve> {
  const sorted = Float32Array.from(levels).sort()
  const at = (share: number) => quantile(sorted, share)

  // the loudest and the quietest of the track to the two ends of the range
  const stretch = spaced([
    { x: 0, y: 0 },
    { x: at(0.02), y: 0 },
    { x: at(0.98), y: 1 },
    { x: 1, y: 1 },
  ])

  // every share of the drawn range gets the same share of the track's time
  const equalise = spaced([
    { x: 0, y: 0 },
    ...Array.from({ length: 8 }, (_, step) => ({ x: at((step + 1) / 9), y: (step + 1) / 9 })),
    { x: 1, y: 1 },
  ])

  // the middle of the track's time drawn at the middle of the range
  const median = spaced([
    { x: 0, y: 0 },
    { x: at(0.5), y: 0.5 },
    { x: 1, y: 1 },
  ])

  // only the loudest tenth of the track drawn, the rest held at the floor
  const loudest = spaced([
    { x: 0, y: 0 },
    { x: at(0.9), y: 0.04 },
    { x: at(0.99), y: 1 },
    { x: 1, y: 1 },
  ])

  return { stretch: { points: stretch }, equalise: { points: equalise }, median: { points: median }, loudest: { points: loudest } }
}
