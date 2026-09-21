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
// how far a polish may move from the tempo it was given: wide enough for a
// played performance drifting, far short of the half or double that fits well
const DRIFT_BAND = 0.06
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
    // The envelope reads a window either side of each sample, so it starts
    // climbing before the hit that causes it, and the climb peaks about a
    // radius early. An offset names the hit, so a radius comes off it to reach
    // the climb the hit made. Without this the grid the app carries always
    // scored worse than one searched fresh, and the sweep cut a section every
    // time it tried to chase the difference.
    const centre = Math.round((fit.offsetMs + beat * beatMs) * perMs) - ENVELOPE_RADIUS
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
    // where the climb this beat made should sit, a radius ahead of the hit
    const centre = Math.round((fit.offsetMs + beat * beatMs) * perMs) - ENVELOPE_RADIUS
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
// How many rows the averaged bar is read at. The compiled view draws a bar as
// a column of pixels; this reads the same bar at a fixed resolution so tempos
// are compared against the same picture.
// divisible by every count a bar is likely to be cut into
const BAR_ROWS = 240
const PHASE_ROWS = 960
const BAR_PARTS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16]
// too few bars and the average is one bar, which agrees with itself
const MIN_BARS = 4

// The compiled view as a number. The view lays a bar out as a column and puts
// the next bar beside it, so a grid that sits on the music draws the same
// column over and over and the picture bands horizontally, while a grid a
// fraction out slides the pattern along and draws diagonals.
//
// This measures that directly: how much of everything the envelope does inside
// a bar is the part every bar agrees on. It reads every frame rather than the
// beats alone, so unlike a comb it cannot be won by a slow grid that samples
// little and samples it well. It is also unchanged by where the bar starts,
// which leaves it free to answer about tempo alone.
export function patternScore(
  envelope: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  bpm: number,
  meter: number,
): number {
  const perMs = sampleRate / 1000 / ENVELOPE_HOP
  const barMs = (60000 / bpm) * Math.max(1, meter)
  const bars = Math.floor((toMs - fromMs) / barMs)
  if (bars < MIN_BARS) return 0

  const rows = new Float64Array(BAR_ROWS)
  let all = 0
  let squares = 0
  let count = 0

  for (let bar = 0; bar < bars; bar += 1) {
    for (let row = 0; row < BAR_ROWS; row += 1) {
      const at = (fromMs + (bar + row / BAR_ROWS) * barMs) * perMs
      const low = Math.floor(at)
      if (low < 0 || low + 1 >= envelope.length) continue

      const value = envelope[low] + (envelope[low + 1] - envelope[low]) * (at - low)
      rows[row] += value
      all += value
      squares += value * value
      count += 1
    }
  }

  if (count === 0) return 0
  const mean = all / count
  const spread = squares / count - mean * mean
  if (spread <= 0) return 0

  let agreed = 0
  for (let row = 0; row < BAR_ROWS; row += 1) agreed += (rows[row] / bars - mean) ** 2
  return agreed / BAR_ROWS / spread
}

// Every bar of the stretch laid on top of one another.
function barProfile(
  envelope: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  barMs: number,
  rows: number,
): Float64Array | null {
  const perMs = sampleRate / 1000 / ENVELOPE_HOP
  const bars = Math.floor((toMs - fromMs) / barMs)
  if (bars < MIN_BARS) return null

  const totals = new Float64Array(rows)
  for (let bar = 0; bar < bars; bar += 1) {
    for (let row = 0; row < rows; row += 1) {
      const at = (fromMs + (bar + row / rows) * barMs) * perMs
      const low = Math.floor(at)
      if (low < 0 || low + 1 >= envelope.length) continue
      totals[row] += envelope[low] + (envelope[low + 1] - envelope[low]) * (at - low)
    }
  }
  return totals
}

// Which of the counts inside a bar is the beat. The pattern score answers about
// the bar, and any whole number of beats makes a bar that repeats just as well,
// so the count that wins is often two bars, or three beats. Folding the
// averaged bar into equal parts and asking how much of it survives says how
// many parts it is really made of: the most parts it still divides into
// cleanly is the beat, which is the same argument as preferring the denser
// grid, asked of the picture instead of a comb.
export function beatWithin(
  envelope: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  bpm: number,
  meter: number,
): number {
  const barMs = (60000 / bpm) * Math.max(1, meter)
  const rows = barProfile(envelope, sampleRate, fromMs, toMs, barMs, BAR_ROWS)
  if (!rows) return bpm

  let mean = 0
  for (const value of rows) mean += value
  mean /= BAR_ROWS

  let spread = 0
  for (const value of rows) spread += (value - mean) ** 2
  if (spread <= 0) return bpm

  const kept: { bpm: number; share: number }[] = []
  for (const parts of BAR_PARTS) {
    if (BAR_ROWS % parts !== 0) continue
    const beat = 60000 / (barMs / parts)
    if (beat < MIN_BPM_SEARCH || beat > MAX_BPM_SEARCH) continue

    const size = BAR_ROWS / parts
    const folded = new Float64Array(size)
    for (let row = 0; row < BAR_ROWS; row += 1) folded[row % size] += rows[row] / parts

    let agreed = 0
    for (const value of folded) agreed += (value - mean) ** 2
    kept.push({ bpm: beat, share: (agreed * parts) / spread })
  }

  if (kept.length === 0) return bpm
  const best = Math.max(...kept.map((part) => part.share))
  return kept.filter((part) => part.share >= best * DENSER_KEEPS).pop()!.bpm
}

// Where the bar starts, read off the bars laid on top of one another. Averaging
// every bar of a section puts far more evidence behind the answer than any one
// of them carries, and the loudest place in that average is the downbeat.
export function phaseOf(
  envelope: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  bpm: number,
  meter: number,
): number {
  const perMs = sampleRate / 1000 / ENVELOPE_HOP
  const barMs = (60000 / bpm) * Math.max(1, meter)
  const rows = barProfile(envelope, sampleRate, fromMs, toMs, barMs, PHASE_ROWS)
  if (!rows) return fromMs

  let peak = 0
  for (let row = 0; row < PHASE_ROWS; row += 1) if (rows[row] > rows[peak]) peak = row

  // the averaged bar is built from the envelope, which climbs a radius before
  // the hit that made it
  return fromMs + (peak / PHASE_ROWS) * barMs + ENVELOPE_RADIUS / perMs
}

// The best this tempo can do on this stretch, over every phase of one beat.
export function bestPhase(
  envelope: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  bpm: number,
): { fit: Fit; score: number } {
  const beatMs = 60000 / bpm
  let best: Fit = { bpm, offsetMs: fromMs }
  let bestScore = 0

  for (let phase = 0; phase < COARSE_PHASES; phase += 1) {
    const candidate = { bpm, offsetMs: fromMs + (phase / COARSE_PHASES) * beatMs }
    const score = scoreFit(envelope, sampleRate, fromMs, toMs, candidate)
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }

  return { fit: best, score: bestScore }
}


const MIN_BPM_SEARCH = 60
const MAX_BPM_SEARCH = 200
// how far apart two readings have to be before they are two tempos
// how far apart, as a share of the tempo, two readings have to be before they
// are two tempos rather than two readings of one
const SAME_TEMPO = 0.01
const COUNTED_BAND = 0.04

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

// How long a stretch each vote is cast over. Long enough that a bar or two of
// something else does not decide it, short enough that a song with two tempos
// still votes for both.
export const VOTE_WINDOW_MS = 60000

export type Vote = {
  fromMs: number
  totals: Float64Array
  done: boolean
  meter: number
  // Counted as the compiled view draws it, or with a comb. The picture wants
  // whole bars and several of them, which the track has and a stretch being
  // judged at a boundary often has not.
  pattern: boolean
}

function votedBpms(): number[] {
  const bpms: number[] = []
  for (let bpm = MIN_BPM_SEARCH; bpm <= MAX_BPM_SEARCH; bpm += COARSE_BPM_STEP) bpms.push(bpm)
  return bpms
}

export function newVote(meter: number): Vote {
  return { fromMs: 0, totals: new Float64Array(votedBpms().length), done: false, meter, pattern: true }
}

// One window's vote on what the whole track is. Every tempo is scored over the
// window and the window's own best is called one vote, so a loud chorus and a
// quiet verse count the same and no stretch decides the track by being louder
// than the rest of it.
export function voteStep(
  envelope: Float32Array,
  sampleRate: number,
  durationMs: number,
  vote: Vote,
): Vote {
  const fromMs = vote.fromMs
  const toMs = Math.min(durationMs, fromMs + VOTE_WINDOW_MS)
  // No length test here: a stretch judged at a boundary is shorter than a
  // window and still has to be counted, and a stretch too short to hold a few
  // bars scores nothing at every tempo and drops out below.
  const next = { ...vote, fromMs: toMs, done: toMs >= durationMs }

  const bpms = votedBpms()
  const scores = bpms.map((bpm) =>
    vote.pattern
      ? patternScore(envelope, sampleRate, fromMs, toMs, bpm, vote.meter)
      : bestPhase(envelope, sampleRate, fromMs, toMs, bpm).score,
  )
  const top = Math.max(...scores)
  if (top <= 0) return next

  const totals = vote.totals.slice()
  for (let index = 0; index < bpms.length; index += 1) totals[index] += scores[index] / top
  return { ...next, totals }
}

// What the track reads as. The count that wins outright is often half or a
// third of the tempo, because a sparser grid is asked about fewer beats and
// they are the ones certain to be played; where the denser count holds up
// nearly as well over the whole track, that is the tempo.
// What a stretch reads as, counted the same way the whole track is counted.
// A single window's best is not enough to open a section on: where the music
// thins out, one loose slow grid wins one window and the next window picks
// something else again, while a vote asks several and keeps what they agree on.
export function voteTempo(
  envelope: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  meter: number,
): { bpm: number | null; vote: Vote } {
  let vote: Vote = { fromMs, totals: new Float64Array(votedBpms().length), done: false, meter, pattern: false }
  while (!vote.done && vote.fromMs < toMs) vote = voteStep(envelope, sampleRate, toMs, vote)
  return { bpm: pickTempo(vote), vote }
}

// How well one tempo polled. Tempos are compared by this rather than by their
// score, because a score is read off however many beats that tempo has and a
// slow grid is asked about fewer of them; a vote is taken against the same
// field of candidates every time.
// How well a tempo polled, counted its own way or as any of the counts it
// shares a pulse with. A stretch that plays every other beat polls for half the
// tempo, and that is a vote for the same pulse, not against it.
export function polledAs(vote: Vote, bpm: number): number {
  let best = voteFor(vote, bpm)
  for (const times of [2, 3, 4]) {
    best = Math.max(best, voteFor(vote, bpm / times), voteFor(vote, bpm * times))
  }
  return best
}

export function topVote(vote: Vote): number {
  let top = 0
  for (const total of vote.totals) if (total > top) top = total
  return top
}

export function voteFor(vote: Vote, bpm: number): number {
  const index = Math.round((bpm - MIN_BPM_SEARCH) / COARSE_BPM_STEP)
  return index >= 0 && index < vote.totals.length ? vote.totals[index] : 0
}

// What a count came out at. A pattern vote answers about the bar, and which
// count inside it is the beat is settled by beatWithin against the audio; a
// comb vote answers about the beat already, but the count that wins outright is
// often half or a third of it, so the denser reading is preferred here where it
// holds up.
export function pickTempo(vote: Vote): number | null {
  const bpms = votedBpms()
  const voteOf = (bpm: number) => voteFor(vote, bpm)

  let top = 0
  for (const bpm of bpms) if (voteOf(bpm) > voteOf(top)) top = bpm
  if (voteOf(top) <= 0) return null
  if (vote.pattern) return top

  let picked = top
  for (const times of [2, 3, 4]) {
    if (voteOf(top * times) >= voteOf(top) * DENSER_KEEPS) picked = top * times
  }
  return picked
}


// Once the spans are known, fit each one over its own audio rather than over
// the block that happened to notice it.
const SETTLE_ROWS = 256
const SETTLE_BARS = 8
const SETTLE_ROUNDS = 3

function centred(rows: Float64Array): Float64Array {
  let mean = 0
  for (const value of rows) mean += value
  mean /= rows.length

  const out = new Float64Array(rows.length)
  for (let row = 0; row < rows.length; row += 1) out[row] = rows[row] - mean
  return out
}

// How far one bar sits from another, in rows. The search stops at half a beat
// because bars look alike at beat level, and a wider one answers with a whole
// beat of slide that never happened.
function shiftRows(one: Float64Array, other: Float64Array, meter: number): number {
  const size = one.length
  const reach = Math.max(1, Math.round(size / (2 * Math.max(1, meter))))
  let best = 0
  let bestScore = -Infinity

  for (let shift = -reach; shift <= reach; shift += 1) {
    let sum = 0
    for (let row = 0; row < size; row += 1) sum += one[row] * other[(row + shift + size) % size]
    if (sum > bestScore) {
      bestScore = sum
      best = shift
    }
  }

  return best
}

// How straight the compiled view runs under this grid: the average distance
// between a stretch's bar and the section's bar. Zero is the picture banding
// horizontally; anything else is the streak sliding, which is the drift you can
// see in it.
export function flatnessOf(
  envelope: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  fit: Fit,
  meter: number,
): number {
  const barMs = (60000 / fit.bpm) * Math.max(1, meter)
  const whole = barProfile(envelope, sampleRate, fromMs, toMs, barMs, SETTLE_ROWS)
  if (!whole) return 0

  const reference = centred(whole)
  const stretch = SETTLE_BARS * barMs
  const windows = Math.floor((toMs - fromMs) / stretch)
  if (windows < 2) return 0

  const slides: number[] = []
  for (let index = 0; index < windows; index += 1) {
    const at = fromMs + index * stretch
    const rows = barProfile(envelope, sampleRate, at, at + stretch, barMs, SETTLE_ROWS)
    if (!rows) continue
    slides.push(Math.abs((shiftRows(reference, centred(rows), meter) / SETTLE_ROWS) * barMs))
  }

  if (slides.length === 0) return 0

  // the middle one, not the average: a fill or a break throws one stretch a
  // whole beat out, and an average lets that one stretch call a straight
  // section crooked
  slides.sort((one, other) => one - other)
  return slides[slides.length >> 1]
}

// The tempo that stops the picture sliding, solved rather than searched. The
// first half of a span and the second half are each averaged into one bar; how
// far those two sit apart is how far the grid slid between them, and dividing
// that by the time between them gives the error in the tempo directly. One
// round of it takes a tempo a fifth of a beat per minute out to within a
// two-hundredth.
//
// A correction is only kept if the picture really did come out flatter, because
// on a stretch with little to say the two bars can sit apart for reasons that
// have nothing to do with tempo.
export function settleFit(
  envelope: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  fit: Fit,
  meter: number,
): Fit {
  let best = fit
  let bestFlat = flatnessOf(envelope, sampleRate, fromMs, toMs, fit, meter)

  for (let round = 0; round < SETTLE_ROUNDS; round += 1) {
    const barMs = (60000 / best.bpm) * Math.max(1, meter)
    const bars = Math.floor((toMs - fromMs) / barMs)
    if (bars < SETTLE_BARS) break

    // both halves start a whole number of bars from the same place, or the
    // second is read half a bar out and that is what the shift measures
    const middle = fromMs + Math.floor(bars / 2) * barMs
    const first = barProfile(envelope, sampleRate, fromMs, middle, barMs, SETTLE_ROWS)
    const second = barProfile(envelope, sampleRate, middle, fromMs + bars * barMs, barMs, SETTLE_ROWS)
    if (!first || !second) break

    const slid = (shiftRows(centred(first), centred(second), meter) / SETTLE_ROWS) * barMs
    const apart = middle - fromMs
    if (apart <= 0 || slid === 0) break

    const candidate = { bpm: best.bpm * (1 - slid / apart), offsetMs: best.offsetMs }
    if (candidate.bpm < MIN_BPM_SEARCH / 2 || candidate.bpm > MAX_BPM_SEARCH * 2) break

    const flat = flatnessOf(envelope, sampleRate, fromMs, toMs, candidate, meter)
    if (flat >= bestFlat) break

    best = candidate
    bestFlat = flat
  }

  return best
}



// A span shorter than this is not split again: two of them is the least a
// section can be asked to cover.
const MIN_SPAN_MS = 12000
// how straight a section has to run before it is left alone
const FLAT_OK_MS = 8
// how much straighter a split has to come out to be worth its sections
const SPLIT_KEEPS = 0.9
const MAX_DEPTH = 6
// how much better a span has to read at its own tempo to leave its parent's
const TAKES_OVER = 1.15

// What a span reads as on its own. A short span has few bars to count and reads
// as all sorts of things, so the tempo it was given stands unless what it found
// draws a decidedly better picture, and a count of that tempo is never a reason
// to leave it: over a few bars the sparser count always looks better.
function tempoOf(
  envelope: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  given: number,
  meter: number,
): number {
  const local = voteTempo(envelope, sampleRate, fromMs, toMs, meter)
  if (local.bpm === null) return given

  const found = beatWithin(envelope, sampleRate, fromMs, toMs, local.bpm, meter)
  if (found === given || runsAlready(found, given)) return given

  const mine = patternScore(envelope, sampleRate, fromMs, toMs, found, meter)
  const theirs = patternScore(envelope, sampleRate, fromMs, toMs, given, meter)
  return mine > theirs * TAKES_OVER ? found : given
}

export type Part = {
  fromMs: number
  toMs: number
  fit: Fit
  flat: number
}

function settleSpan(
  envelope: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  given: number,
  meter: number,
): Part {
  const bpm = tempoOf(envelope, sampleRate, fromMs, toMs, given, meter)
  const phased = bestPhase(envelope, sampleRate, fromMs, toMs, bpm)
  const polished = fitWindow(envelope, sampleRate, fromMs, toMs, phased.fit)
  const settled = settleFit(envelope, sampleRate, fromMs, toMs, polished, meter)
  const anchored = { bpm: settled.bpm, offsetMs: beatNear(settled, fromMs) }
  const fit = alignDownbeat(envelope, sampleRate, fromMs, toMs, anchored, meter)
  return { fromMs, toMs, fit, flat: flatnessOf(envelope, sampleRate, fromMs, toMs, fit, meter) }
}

type Span = { fromMs: number; toMs: number; bpm: number; depth: number }

export type Split = {
  parts: Part[]
  pending: Span[]
  meter: number
  done: boolean
}

export function newSplit(durationMs: number, bpm: number, meter: number): Split {
  return {
    parts: [],
    pending: [{ fromMs: 0, toMs: durationMs, bpm, depth: 0 }],
    meter,
    done: durationMs <= 0,
  }
}

// One span of the split. The track is taken whole, then halved wherever one
// grid cannot stay on the beat across it, and each half asked the same question
// again. Splitting downwards rather than sweeping forwards means every answer
// is read off as much audio as it can be, and a section appears only where the
// song actually stops agreeing with the one before it.
//
// A span is left alone when it runs straight and both of its halves read as the
// tempo it settled on. Straightness on its own is not enough: a half playing a
// different tempo is not drifting, it is somewhere else, and its own picture
// can be as straight as any other.
export function splitStep(
  envelope: Float32Array,
  sampleRate: number,
  split: Split,
): Split {
  const span = split.pending[0]
  if (!span) return { ...split, done: true }

  const pending = split.pending.slice(1)
  const meter = split.meter
  const keep = (parts: Part[]) => ({
    ...split,
    parts: [...split.parts, ...parts].sort((one, other) => one.fromMs - other.fromMs),
    pending,
    done: pending.length === 0,
  })

  const whole = settleSpan(envelope, sampleRate, span.fromMs, span.toMs, span.bpm, meter)
  if (span.toMs - span.fromMs < MIN_SPAN_MS * 2 || span.depth >= MAX_DEPTH) return keep([whole])

  const barMs = (60000 / whole.fit.bpm) * Math.max(1, meter)
  const bars = Math.floor((span.toMs - span.fromMs) / barMs)
  if (bars < SETTLE_BARS) return keep([whole])

  const middle = span.fromMs + Math.floor(bars / 2) * barMs
  const left = tempoOf(envelope, sampleRate, span.fromMs, middle, whole.fit.bpm, meter)
  const right = tempoOf(envelope, sampleRate, middle, span.toMs, whole.fit.bpm, meter)
  const agreed = left === whole.fit.bpm && right === whole.fit.bpm
  if (agreed && whole.flat <= FLAT_OK_MS) return keep([whole])

  if (agreed) {
    // drifting rather than changing: worth halving only if it comes out
    // straighter, which a section that is already as straight as the audio
    // allows will not
    const under = [
      settleSpan(envelope, sampleRate, span.fromMs, middle, left, meter),
      settleSpan(envelope, sampleRate, middle, span.toMs, right, meter),
    ]
    let weighted = 0
    for (const part of under) weighted += part.flat * (part.toMs - part.fromMs)
    if (weighted / (span.toMs - span.fromMs) >= whole.flat * SPLIT_KEEPS) return keep([whole])
  }

  return {
    ...split,
    pending: [
      { fromMs: span.fromMs, toMs: middle, bpm: left, depth: span.depth + 1 },
      { fromMs: middle, toMs: span.toMs, bpm: right, depth: span.depth + 1 },
      ...pending,
    ],
    done: false,
  }
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
    // where the climb this beat made should sit, a radius ahead of the hit
    const centre = Math.round((fit.offsetMs + beat * beatMs) * perMs) - ENVELOPE_RADIUS
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
