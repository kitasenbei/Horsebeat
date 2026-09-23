import { envelopeHop } from '../audio'
import {
  BAR_ROWS,
  MIN_BARS,
  SETTLE_ROWS,
  barProfile,
  centred,
  riseOf,
  runningTotal,
  shiftRows,
} from './signal'
import type { Fit } from './types'

// What a grid is worth. Four readings, none of which settles what a beat is on
// its own: how high the climbs stand where a grid says they should, how alike
// the bars come out under it, the best it can manage at any phase, and whether
// it holds its place from one stretch to the next.

// A hit is an edge rather than a single sample, so a beat is read over a little
// either side of itself. In milliseconds, not frames: a frame is however long
// the hop lasts at whatever rate the file decoded to, and the fitting has to
// mean the same thing whether that was 44.1 or 48 kHz.
const BEAT_REACH_MS = 4.4

// How far ahead of the hit the envelope's climb peaks. The envelope averages a
// window either side of each sample, and the climb peaks about half that window
// ahead of the hit.
export const ENVELOPE_LAG_MS = 11.6

const COARSE_PHASES = 64

// how many bars a stretch covers when two of them are compared for straightness
export const SETTLE_BARS = 8

export function scoreFit(
  levels: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  fit: Fit,
  // how far either side of a beat a hit still counts: narrower reads finer,
  // once a grid is nearly right
  reachMs = BEAT_REACH_MS,
): number {
  const envelope = riseOf(levels)
  const frames = envelope.length
  if (frames === 0 || fit.bpm <= 0 || toMs <= fromMs) return 0

  const perMs = sampleRate / 1000 / envelopeHop(sampleRate)
  const reach = Math.max(1, Math.round(reachMs * perMs))
  const lag = Math.round(ENVELOPE_LAG_MS * perMs)
  const beatMs = 60000 / fit.bpm
  const first = Math.ceil((fromMs - fit.offsetMs) / beatMs)
  const last = Math.floor((toMs - fit.offsetMs) / beatMs)
  if (last <= first) return 0

  let total = 0
  let count = 0

  for (let beat = first; beat <= last; beat += 1) {
    // The envelope reads a window either side of each sample, so it starts
    // climbing before the hit that causes it. An offset names the hit, so the
    // lag comes off it to reach the climb that hit made. Without this the grid
    // the app carries always scored worse than one searched fresh, and the fit
    // cut a section every time it tried to chase the difference.
    const centre = Math.round((fit.offsetMs + beat * beatMs) * perMs) - lag
    if (centre < 0 || centre >= frames) continue

    // the sharpest climb within a few milliseconds, because a hit is an edge
    // with a soft start rather than a single sample
    let peak = 0
    for (let at = centre - reach; at <= centre + reach; at += 1) {
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
  const perMs = sampleRate / 1000 / envelopeHop(sampleRate)
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
  // Measured a bar at a time, not a beat at a time. A denser column shows a
  // tempo error more plainly — the same slide is a bigger share of a shorter
  // column, which is why a grid that looks straight at 69 draws a diagonal at
  // 276 — but it is worse to measure from: every beat looks like every other,
  // so there is no shape for the reading to lock onto. Bars differ from each
  // other, and that is what makes them readable.
  const count = Math.max(1, meter)
  const barMs = (60000 / fit.bpm) * count
  const stretch = SETTLE_BARS * barMs
  const windows = Math.floor((toMs - fromMs) / stretch)
  if (windows < 2) return 0

  // Each stretch against the one before it, not against the average of the
  // whole section. A section that is drifting has no average worth the name —
  // its bars land all over each other and come out a smear, which every stretch
  // then matches equally badly at no offset at all, and the section reads as
  // perfectly straight at the moment it is least straight. Neighbours do not
  // have that problem: whatever the grid is doing, two stretches side by side
  // are doing nearly the same thing, and how far apart they sit is how fast it
  // is slipping.
  const slides: number[] = []
  let last: Float64Array | null = null

  for (let index = 0; index < windows; index += 1) {
    const at = fromMs + index * stretch
    const rows = barProfile(envelope, sampleRate, at, at + stretch, barMs, SETTLE_ROWS)
    if (!rows) continue

    const here = centred(rows)
    if (last) {
      // Only the readings that mean something. Where two stretches line up
      // nearly as well a beat apart as in place, the winner is decided by a
      // fraction and says nothing about whether the grid moved; counting it as
      // a small movement is how a section that visibly slopes comes back
      // measured as straight.
      const slide = shiftRows(last, here, count)
      if (slide.sure) slides.push(Math.abs((slide.rows / SETTLE_ROWS) * barMs))
    }
    last = here
  }

  // nothing readable is not the same as nothing moving: a stretch the readings
  // cannot speak for is left to the rest of the fitting to judge
  if (slides.length === 0) return 0

  // the middle one, not the average: a fill or a break throws one stretch a
  // whole beat out, and an average lets that one stretch call a straight
  // section crooked
  slides.sort((one, other) => one - other)
  return slides[slides.length >> 1]
}
