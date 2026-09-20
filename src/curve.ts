export type CurvePoint = {
  x: number
  y: number
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

export const MIN_GAP = 0.02
export const MAX_POINTS = 10

const tangentCache = new WeakMap<Curve, number[]>()

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

export function sortPoints(points: CurvePoint[]): CurvePoint[] {
  return [...points].sort((left, right) => left.x - right.x)
}

function tangents(curve: Curve): number[] {
  const cached = tangentCache.get(curve)
  if (cached) return cached

  const points = curve.points
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

  tangentCache.set(curve, result)
  return result
}

export function applyCurve(value: number, curve: Curve): number {
  const points = curve.points
  if (points.length < 2) return clamp01(value)

  const x = clamp01(value)
  if (x <= points[0].x) return clamp01(points[0].y)
  if (x >= points[points.length - 1].x) return clamp01(points[points.length - 1].y)

  let index = 0
  while (index < points.length - 2 && x > points[index + 1].x) index += 1

  const left = points[index]
  const right = points[index + 1]
  const run = right.x - left.x
  if (run === 0) return clamp01(right.y)

  const slopes = tangents(curve)
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
      { x: 0.25, y: 0.55 },
      { x: 0.6, y: 0.85 },
      { x: 1, y: 1 },
    ],
  },
  contrast: {
    points: [
      { x: 0, y: 0 },
      { x: 0.35, y: 0.16 },
      { x: 0.7, y: 0.86 },
      { x: 1, y: 1 },
    ],
  },
  tame: {
    points: [
      { x: 0, y: 0 },
      { x: 0.45, y: 0.12 },
      { x: 0.8, y: 0.5 },
      { x: 1, y: 0.9 },
    ],
  },
  gate: {
    points: [
      { x: 0, y: 0 },
      { x: 0.35, y: 0.02 },
      { x: 0.55, y: 0.5 },
      { x: 1, y: 1 },
    ],
  },
  peaks: {
    points: [
      { x: 0, y: 0 },
      { x: 0.6, y: 0.04 },
      { x: 0.85, y: 0.55 },
      { x: 1, y: 1 },
    ],
  },
  flatten: {
    points: [
      { x: 0, y: 0 },
      { x: 0.15, y: 0.45 },
      { x: 0.5, y: 0.78 },
      { x: 1, y: 1 },
    ],
  },
  hard: {
    points: [
      { x: 0, y: 0 },
      { x: 0.45, y: 0.04 },
      { x: 0.55, y: 0.96 },
      { x: 1, y: 1 },
    ],
  },
} satisfies Record<string, Curve>
