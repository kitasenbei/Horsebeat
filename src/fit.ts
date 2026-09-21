import { ENVELOPE_HOP, ENVELOPE_RADIUS } from './audio'

export type Fit = {
  bpm: number
  offsetMs: number
}

// How wide the ladder starts and how fine it ends. The last rung is the
// resolution the app displays, so fitting can reach a value you can read.
const COARSE_BPM_STEP = 0.5
const COARSE_PHASES = 24
const BOUNDARY_STEP_MS = 250
const BOUNDARY_DROP = 0.6
const DENSER_KEEPS = 0.9

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

// Fit a window from a seed, running the whole ladder and polish at once. Used
// by the scan, where a window is a frame's worth of work rather than a gesture
// to watch.
export function fitWindow(
  envelope: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  seed: Fit,
): Fit {
  let fit = seed

  for (let step = 0; step < FIT_STEPS; ) {
    const result = refineFit(envelope, sampleRate, fromMs, toMs, fit, step)
    if (result.moved) fit = result.fit
    else step += 1
  }

  for (let round = 0; round < 3; round += 1) {
    fit = polishFit(envelope, sampleRate, fromMs, toMs, fit)
  }

  return fit
}

// The beat of a grid nearest a moment, never negative: where a section that
// takes over there should be anchored. Nearest rather than next, so refitting
// a section cannot walk its start forward a beat at a time.
export function beatNear(fit: Fit, atMs: number): number {
  const beatMs = 60000 / fit.bpm
  let beats = Math.round((atMs - fit.offsetMs) / beatMs)
  let anchor = fit.offsetMs + beats * beatMs

  while (anchor < 0) {
    beats += 1
    anchor = fit.offsetMs + beats * beatMs
  }

  return anchor
}

// A wide sweep for the tempo of a window, with no seed to bias it. The ladder
// can only walk a beat or two from where it starts, so anything that is not a
// small correction has to begin here or it lands on a harmonic: at 96 bpm a
// grid at 144 hits two beats in three and scores well enough to look right.
export function searchTempo(
  envelope: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  minBpm: number,
  maxBpm: number,
): Fit {
  let best: Fit = { bpm: minBpm, offsetMs: fromMs }
  let bestScore = 0

  for (let bpm = minBpm; bpm <= maxBpm; bpm += COARSE_BPM_STEP) {
    const beatMs = 60000 / bpm

    for (let phase = 0; phase < COARSE_PHASES; phase += 1) {
      const candidate = { bpm, offsetMs: fromMs + (phase / COARSE_PHASES) * beatMs }
      const score = scoreFit(envelope, sampleRate, fromMs, toMs, candidate)
      if (score > bestScore) {
        bestScore = score
        best = candidate
      }
    }
  }

  // A grid at half the tempo hits every other beat, and every one of those is
  // a real hit, so it scores as well as the truth or better. Whenever a denser
  // grid holds up nearly as well, it is the honest answer.
  for (const multiple of [2, 3, 2]) {
    const faster = best.bpm * multiple
    if (faster > maxBpm) continue

    const beatMs = 60000 / faster
    let bestPhase = best
    let phaseScore = 0

    for (let phase = 0; phase < COARSE_PHASES; phase += 1) {
      const candidate = { bpm: faster, offsetMs: fromMs + (phase / COARSE_PHASES) * beatMs }
      const score = scoreFit(envelope, sampleRate, fromMs, toMs, candidate)
      if (score > phaseScore) {
        phaseScore = score
        bestPhase = candidate
      }
    }

    if (phaseScore >= bestScore * DENSER_KEEPS) {
      best = bestPhase
      bestScore = phaseScore
    }
  }

  return best
}

// Where a grid stops describing the audio: the first moment its score over a
// short window collapses. Used to place a section at the tempo change rather
// than at the edge of whichever block noticed it.
export function findBoundary(
  envelope: Float32Array,
  sampleRate: number,
  fit: Fit,
  fromMs: number,
  toMs: number,
): number {
  const probe = Math.max(1500, (60000 / fit.bpm) * 4)
  let held = 0
  let count = 0

  for (let at = fromMs; at + probe <= toMs; at += BOUNDARY_STEP_MS) {
    const score = scoreFit(envelope, sampleRate, at, at + probe, fit)

    if (count > 0 && score < (held / count) * BOUNDARY_DROP) return at
    held += score
    count += 1
  }

  return toMs
}

export const BLOCK_MS = 6000
const MIN_BPM_SEARCH = 60
const MAX_BPM_SEARCH = 200
const SAME_TEMPO = 0.2
const HOLDS_UP = 2
// how much better a local refit has to be before the tempo is called changed
const CARRY_RATIO = 0.9
// below this a block has too little to say, so the grid carries on
const WORTH_SPLITTING = 1.6

export type Scan = {
  fromMs: number
  found: Fit[]
  done: boolean
}

// One block of the scan: carry the previous grid on if it still describes this
// stretch, otherwise find where it gave out and search wide for what replaced
// it. Called a block at a time so the sections appear as they are found.
export function scanBlock(
  envelope: Float32Array,
  sampleRate: number,
  durationMs: number,
  scan: Scan,
): Scan {
  const fromMs = scan.fromMs
  const toMs = Math.min(durationMs, fromMs + BLOCK_MS)
  if (toMs - fromMs < 2000) return { ...scan, done: true }

  const found = scan.found
  const previous = found[found.length - 1]
  const next = { fromMs: toMs, found, done: toMs >= durationMs }

  if (previous) {
    const held = scoreFit(envelope, sampleRate, fromMs, toMs, previous)
    const nudged = fitWindow(envelope, sampleRate, fromMs, toMs, previous)
    const nudgedScore = scoreFit(envelope, sampleRate, fromMs, toMs, nudged)

    // Played music wanders: a block refit moves by a fraction of a beat per
    // minute even when the tempo has not changed, so asking the refit to stay
    // put splits a section every block. What matters is whether the grid it
    // has still explains this stretch nearly as well as the best one would.
    const settled =
      Math.abs(nudged.bpm - previous.bpm) < SAME_TEMPO || held >= nudgedScore * CARRY_RATIO
    if (held > HOLDS_UP && settled) return next

    // a fade, a break or a spoken passage is not a tempo change
    if (nudgedScore < WORTH_SPLITTING) return next
  }

  const boundary = previous ? findBoundary(envelope, sampleRate, previous, fromMs, toMs) : fromMs
  const until = Math.min(durationMs, boundary + BLOCK_MS * 2)
  const coarse = searchTempo(envelope, sampleRate, boundary, until, MIN_BPM_SEARCH, MAX_BPM_SEARCH)
  const local = fitWindow(envelope, sampleRate, boundary, until, coarse)

  return { ...next, found: [...found, { bpm: local.bpm, offsetMs: beatNear(local, boundary) }] }
}

// Once the spans are known, fit each one over its own audio rather than over
// the block that happened to notice it.
export function refineScan(
  envelope: Float32Array,
  sampleRate: number,
  durationMs: number,
  found: Fit[],
  index: number,
): Fit {
  const fromMs = found[index].offsetMs
  const toMs = index + 1 < found.length ? found[index + 1].offsetMs : durationMs
  if (toMs - fromMs < 3000) return found[index]

  const refined = fitWindow(envelope, sampleRate, fromMs, toMs, found[index])
  return { bpm: refined.bpm, offsetMs: beatNear(refined, fromMs) }
}

const MERGE_KEEPS = 0.94

// One merge attempt: if a single grid covers two neighbouring sections about as
// well as the two cover themselves, they were one section that the scan split.
// A quiet passage or a fill is enough to make the scan hesitate, and this is
// what takes those back out.
export function mergeStep(
  envelope: Float32Array,
  sampleRate: number,
  durationMs: number,
  found: Fit[],
): { found: Fit[]; merged: boolean } {
  for (let index = 0; index + 1 < found.length; index += 1) {
    const startMs = found[index].offsetMs
    const middleMs = found[index + 1].offsetMs
    const endMs = index + 2 < found.length ? found[index + 2].offsetMs : durationMs
    if (endMs - startMs < 4000) continue

    const first = scoreFit(envelope, sampleRate, startMs, middleMs, found[index])
    const second = scoreFit(envelope, sampleRate, middleMs, endMs, found[index + 1])
    const apart =
      (first * (middleMs - startMs) + second * (endMs - middleMs)) / (endMs - startMs)

    // seeded from either neighbour, because whichever tempo is right for the
    // pair is usually right for one of them already
    let best = fitWindow(envelope, sampleRate, startMs, endMs, found[index])
    let bestScore = scoreFit(envelope, sampleRate, startMs, endMs, best)
    const other = fitWindow(envelope, sampleRate, startMs, endMs, found[index + 1])
    const otherScore = scoreFit(envelope, sampleRate, startMs, endMs, other)
    if (otherScore > bestScore) {
      best = other
      bestScore = otherScore
    }

    if (bestScore < apart * MERGE_KEEPS) continue

    const merged = [...found]
    merged.splice(index, 2, { bpm: best.bpm, offsetMs: beatNear(best, startMs) })
    return { found: merged, merged: true }
  }

  return { found, merged: false }
}
