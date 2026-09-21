import { ENVELOPE_HOP, ENVELOPE_RADIUS } from './audio'

export type Fit = {
  bpm: number
  offsetMs: number
}

// How wide the ladder starts and how fine it ends. The last rung is the
// resolution the app displays, so fitting can reach a value you can read.
const SCALES = [
  { bpm: 1, ms: 40 },
  { bpm: 0.5, ms: 20 },
  { bpm: 0.2, ms: 10 },
  { bpm: 0.1, ms: 5 },
  { bpm: 0.05, ms: 2 },
  { bpm: 0.02, ms: 1 },
  { bpm: 0.01, ms: 0.5 },
  { bpm: 0.005, ms: 0.25 },
  { bpm: 0.002, ms: 0.1 },
]

export const FIT_STEPS = SCALES.length

// The score a grid earns on this audio: the average envelope height at the
// beats it predicts, against the average everywhere. One means the beats are
// no louder than the gaps; higher means the grid is landing on the music.
export function scoreFit(
  envelope: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  fit: Fit,
): number {
  const frames = envelope.length
  if (frames === 0 || fit.bpm <= 0 || toMs <= fromMs) return 0

  const perMs = sampleRate / 1000 / ENVELOPE_HOP
  const beatMs = 60000 / fit.bpm
  const first = Math.ceil((fromMs - fit.offsetMs) / beatMs)
  const last = Math.floor((toMs - fit.offsetMs) / beatMs)
  if (last <= first) return 0

  let total = 0
  let count = 0

  for (let beat = first; beat <= last; beat += 1) {
    const centre = Math.round((fit.offsetMs + beat * beatMs) * perMs)
    if (centre < 0 || centre >= frames) continue

    // the loudest frame within a millisecond or so, because a hit is an edge
    // rather than a single sample
    let peak = 0
    for (let at = centre - 1; at <= centre + 1; at += 1) {
      if (at >= 0 && at < frames && envelope[at] > peak) peak = envelope[at]
    }

    total += peak
    count += 1
  }

  if (count === 0) return 0

  let background = 0
  const from = Math.max(0, Math.round(fromMs * perMs))
  const to = Math.min(frames, Math.round(toMs * perMs))
  for (let at = from; at < to; at += 1) background += envelope[at]

  const mean = background / Math.max(1, to - from)
  return mean > 0 ? total / count / mean : 0
}

// The ladder gets close, then stalls: the envelope is smoothed, so a few
// milliseconds either way score the same. This measures instead of nudging —
// it finds the peak nearest each predicted beat and fits a line through them,
// which recovers the offset and the tempo together.
export function polishFit(
  envelope: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  fit: Fit,
): Fit {
  const frames = envelope.length
  const perMs = sampleRate / 1000 / ENVELOPE_HOP
  const beatMs = 60000 / fit.bpm
  const reach = Math.max(1, Math.round((beatMs / 6) * perMs))

  const first = Math.ceil((fromMs - fit.offsetMs) / beatMs)
  const last = Math.floor((toMs - fit.offsetMs) / beatMs)

  let weight = 0
  let sumK = 0
  let sumT = 0
  let sumKK = 0
  let sumKT = 0

  for (let beat = first; beat <= last; beat += 1) {
    const centre = Math.round((fit.offsetMs + beat * beatMs) * perMs)
    if (centre - reach < 0 || centre + reach >= frames) continue

    // The middle of the climb. Smoothing turns an attack into a ramp, so the
    // summit lands late, the shoulder early and the steepest frame anywhere
    // along it; the centre of the rise is the one landmark that stays put.
    let peak = 0
    let moment = 0
    for (let frame = centre - reach; frame <= centre + reach; frame += 1) {
      const rise = envelope[frame] - envelope[frame - 1]
      if (rise <= 0) continue
      peak += rise
      moment += rise * frame
    }

    if (peak <= 0) continue

    // a rise at one bin reports the energy that entered the smoothing window,
    // which sits half a window ahead of it
    const at = moment / peak + ENVELOPE_RADIUS

    // loud beats are better evidence of where the grid belongs than quiet ones
    const ms = at / perMs
    weight += peak
    sumK += peak * beat
    sumT += peak * ms
    sumKK += peak * beat * beat
    sumKT += peak * beat * ms
  }

  if (weight <= 0) return fit

  const denominator = weight * sumKK - sumK * sumK
  if (Math.abs(denominator) < 1e-9) return fit

  const slope = (weight * sumKT - sumK * sumT) / denominator
  const intercept = (sumT - slope * sumK) / weight
  if (slope <= 0) return fit

  return { bpm: 60000 / slope, offsetMs: Math.max(0, intercept) }
}

// One rung of the ladder: try the neighbours at this scale and keep the best.
// Called a step at a time so the tuning can be watched rather than waited for.
export function refineFit(
  envelope: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  fit: Fit,
  step: number,
): { fit: Fit; score: number; moved: boolean } {
  const scale = SCALES[Math.min(SCALES.length - 1, Math.max(0, step))]
  let best = fit
  let bestScore = scoreFit(envelope, sampleRate, fromMs, toMs, fit)
  let moved = false

  const candidates: Fit[] = []
  for (const bpm of [-scale.bpm, 0, scale.bpm]) {
    for (const ms of [-scale.ms, 0, scale.ms]) {
      if (bpm === 0 && ms === 0) continue
      candidates.push({ bpm: fit.bpm + bpm, offsetMs: Math.max(0, fit.offsetMs + ms) })
    }
  }

  for (const candidate of candidates) {
    const score = scoreFit(envelope, sampleRate, fromMs, toMs, candidate)
    if (score > bestScore) {
      bestScore = score
      best = candidate
      moved = true
    }
  }

  return { fit: best, score: bestScore, moved }
}
