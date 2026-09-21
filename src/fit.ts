import { ENVELOPE_HOP, ENVELOPE_RADIUS } from './audio'

export type Fit = {
  bpm: number
  offsetMs: number
}

// How wide the ladder starts and how fine it ends. The last rung is the
// resolution the app displays, so fitting can reach a value you can read.
const RISE_SPREAD = 0.25
const BEAT_FRAMES = 3
const COARSE_BPM_STEP = 0.5
const COARSE_PHASES = 64
const BOUNDARY_STEP_MS = 250
const BOUNDARY_DROP = 0.6
const DENSER_KEEPS = 0.78

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
const rises = new WeakMap<Float32Array, Float32Array>()

// What the fitting actually reads: how fast the envelope is climbing, not how
// high it stands. A loud master holds the envelope near its ceiling for most of
// a song, so levels barely differ between a beat and the gap after it, while
// the climb onto each beat stays sharp.
function riseOf(envelope: Float32Array): Float32Array {
  const cached = rises.get(envelope)
  if (cached) return cached

  const raw = new Float32Array(envelope.length)
  for (let at = 1; at < envelope.length; at += 1) {
    const step = envelope[at] - envelope[at - 1]
    raw[at] = step > 0 ? step : 0
  }

  // A hit can climb over two or three frames, and a raw difference then splits
  // it between them, so whether a grid scores depends on which frame it landed
  // in. Leaning each frame on its neighbours puts the whole climb under any of
  // them.
  const rise = new Float32Array(envelope.length)
  for (let at = 1; at < envelope.length - 1; at += 1) {
    rise[at] = raw[at] + (raw[at - 1] + raw[at + 1]) * RISE_SPREAD
  }

  rises.set(envelope, rise)
  return rise
}

const totals = new WeakMap<Float32Array, Float64Array>()

function runningTotal(envelope: Float32Array): Float64Array {
  const cached = totals.get(envelope)
  if (cached) return cached

  const sums = new Float64Array(envelope.length + 1)
  for (let at = 0; at < envelope.length; at += 1) sums[at + 1] = sums[at] + envelope[at]
  totals.set(envelope, sums)
  return sums
}

export function scoreFit(
  levels: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  fit: Fit,
): number {
  const envelope = riseOf(levels)
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
    // Sampled at the beat itself and interpolated between frames, so a grid is
    // judged by where it falls rather than by which side of a frame boundary it
    // landed on. A window of whole frames makes the score jump as the offset
    // crosses one, which the search then chases.
    const centre = Math.round((fit.offsetMs + beat * beatMs) * perMs)
    if (centre < 0 || centre >= frames) continue

    // the sharpest climb within a few milliseconds, because a hit is an edge
    // with a soft start rather than a single sample
    let peak = 0
    for (let at = centre - BEAT_FRAMES; at <= centre + BEAT_FRAMES; at += 1) {
      if (at >= 0 && at < frames && envelope[at] > peak) peak = envelope[at]
    }

    total += peak
    count += 1
  }

  if (count === 0) return 0

  const from = Math.max(0, Math.round(fromMs * perMs))
  const to = Math.min(frames, Math.round(toMs * perMs))
  const sums = runningTotal(envelope)
  const mean = (sums[to] - sums[from]) / Math.max(1, to - from)
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

  // The ladder repeats a rung while it keeps improving, so left alone it can
  // walk a beat at a time from the tempo all the way down to half of it: a
  // sparser grid keeps only the strong beats and scores better for it. This is
  // a correction, not a search, so it stays within a few per cent of the seed
  // and anything further has to come from searchTempo.
  const low = seed.bpm * (1 - DRIFT_BAND)
  const high = seed.bpm * (1 + DRIFT_BAND)
  const inBand = (candidate: Fit) => candidate.bpm >= low && candidate.bpm <= high

  for (let step = 0; step < FIT_STEPS; ) {
    const result = refineFit(envelope, sampleRate, fromMs, toMs, fit, step)
    if (result.moved && inBand(result.fit)) fit = result.fit
    else step += 1
  }

  for (let round = 0; round < 3; round += 1) {
    const polished = polishFit(envelope, sampleRate, fromMs, toMs, fit)
    if (!inBand(polished)) break
    fit = polished
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
): { fit: Fit; score: number } {
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

  return { fit: best, score: bestScore }
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
// how far apart two readings have to be before they are two tempos
// how far apart, as a share of the tempo, two readings have to be before they
// are two tempos rather than two readings of one
const SAME_TEMPO = 0.01
const COUNTED_BAND = 0.04
const HOLDS_UP = 2
// how much of its own best refit a running grid has to still be worth
const CARRY_RATIO = 0.7
// below this a block has too little to say, so the grid carries on
const WORTH_SPLITTING = 1.6

// Whether a tempo is the one already running: the same number, or that number
// counted against two, three or four of its beats. Half a tempo lands on every
// other beat and scores well wherever the music plays every other beat, which a
// quiet passage does, and that is the same tempo read slowly rather than a new
// one.
function runsAlready(bpm: number, against: number): boolean {
  if (Math.abs(bpm - against) < against * SAME_TEMPO) return true

  // A count of the same tempo is read off fewer beats and over a stretch that
  // is playing fewer of them, so it lands further from the arithmetic than a
  // reading of the tempo itself does.
  for (const times of [2, 3, 4]) {
    if (Math.abs(bpm - against * times) < against * times * COUNTED_BAND) return true
    if (Math.abs(bpm * times - against) < against * COUNTED_BAND) return true
  }
  return false
}

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

    // The only question asked of a block is whether the grid already running
    // still lands on it. Played music wanders, and a refit of any six seconds
    // finds a slightly better bpm than the one before it, so comparing the two
    // numbers cuts a section every block and calls a steady song eight tempos.
    if (held > HOLDS_UP && held >= nudgedScore * CARRY_RATIO) return next

    // a fade, a break or a spoken passage is not a tempo change
    if (nudgedScore < WORTH_SPLITTING) return next
  }

  const boundary = previous ? findBoundary(envelope, sampleRate, previous, fromMs, toMs) : fromMs
  const until = Math.min(durationMs, boundary + BLOCK_MS * 2)
  const coarse = searchTempo(envelope, sampleRate, boundary, until, MIN_BPM_SEARCH, MAX_BPM_SEARCH)

  // An outro, a fade or a held chord gives the search nothing to lock onto, and
  // every candidate scores alike: the winner is then whatever the sweep started
  // at. Carrying the grid on is the honest answer, not a section at 60 bpm.
  if (coarse.score < WORTH_SPLITTING) return next

  const local = fitWindow(envelope, sampleRate, boundary, until, coarse.fit)
  if (previous && scoreFit(envelope, sampleRate, boundary, until, previous) >= coarse.score) {
    return next
  }

  // A refit of any stretch of a played song comes back a fraction of a beat
  // from the one before it. Opening a section for that reading turns one tempo
  // into a list of readings of it, so a section is only worth cutting for a
  // tempo the grid does not already carry.
  if (previous && runsAlready(local.bpm, previous.bpm)) return next

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
  meter: number,
): Fit {
  const fromMs = found[index].offsetMs
  const toMs = index + 1 < found.length ? found[index + 1].offsetMs : durationMs
  if (toMs - fromMs < 3000) return found[index]

  const refined = fitWindow(envelope, sampleRate, fromMs, toMs, found[index])
  const anchored = { bpm: refined.bpm, offsetMs: beatNear(refined, fromMs) }
  return alignDownbeat(envelope, sampleRate, fromMs, toMs, anchored, meter)
}

const MERGE_KEEPS = 0.94
// how far a refit may move from the tempo it was given: wide enough for a
// played performance drifting, far short of the half or double that scores well
const DRIFT_BAND = 0.06

// One merge attempt: if the grid of a section runs on through the next one
// still landing on its beats, the two were one section that the scan cut in
// half at a quiet passage or a fill.
//
// It deliberately does not ask whether some grid could cover both. Refit over a
// long enough window, one grid covers almost any pair well enough to look like
// an answer, and a song with three tempos comes back with one. The question is
// only whether the tempo already running kept its alignment.
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

    // two readings of the same tempo, or two tempos?
    if (Math.abs(found[index].bpm - found[index + 1].bpm) > found[index].bpm * SAME_TEMPO) continue

    // The same bpm starting on a different beat is still a cut worth keeping,
    // so this asks the earlier grid to explain the later stretch as well as
    // that stretch explains itself.
    const carried = scoreFit(envelope, sampleRate, middleMs, endMs, found[index])
    const own = scoreFit(envelope, sampleRate, middleMs, endMs, found[index + 1])
    if (carried < own * MERGE_KEEPS) continue

    const joined = fitWindow(envelope, sampleRate, startMs, endMs, found[index])
    const merged = [...found]
    merged.splice(index, 2, { bpm: joined.bpm, offsetMs: beatNear(joined, startMs) })
    return { found: merged, merged: true }
  }

  return { found, merged: false }
}

// Which beat of the bar is the downbeat. A fit lands on the beat, but a section
// wants to start a bar: with the offset on a downbeat, a column of four beats
// is a bar, and the compiled view at that density shows bars rather than an
// arbitrary window of four.
export function alignDownbeat(
  envelope: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  fit: Fit,
  meter: number,
): Fit {
  const bar = Math.max(1, Math.round(meter))
  if (bar < 2) return fit

  const perMs = sampleRate / 1000 / ENVELOPE_HOP
  const beatMs = 60000 / fit.bpm
  const first = Math.ceil((fromMs - fit.offsetMs) / beatMs)
  const last = Math.floor((toMs - fit.offsetMs) / beatMs)

  const totals = new Float64Array(bar)
  const counts = new Float64Array(bar)

  for (let beat = first; beat <= last; beat += 1) {
    const centre = Math.round((fit.offsetMs + beat * beatMs) * perMs)
    if (centre < 1 || centre >= envelope.length) continue

    let peak = 0
    for (let at = centre - 1; at <= centre + 1; at += 1) {
      if (at >= 0 && at < envelope.length && envelope[at] > peak) peak = envelope[at]
    }

    const phase = ((beat % bar) + bar) % bar
    totals[phase] += peak
    counts[phase] += 1
  }

  let best = 0
  let bestMean = -1
  for (let phase = 0; phase < bar; phase += 1) {
    if (counts[phase] === 0) continue
    const mean = totals[phase] / counts[phase]
    if (mean > bestMean) {
      bestMean = mean
      best = phase
    }
  }

  // the first downbeat at or after where the section already starts
  const shifted = { bpm: fit.bpm, offsetMs: fit.offsetMs + best * beatMs }
  const barMs = beatMs * bar
  const bars = Math.round((fromMs - shifted.offsetMs) / barMs)
  const anchor = shifted.offsetMs + bars * barMs

  return { bpm: fit.bpm, offsetMs: anchor >= 0 ? anchor : anchor + barMs }
}
