import { envelopeHop } from '../audio'

// Reading the audio: the few small things every measurement in the fitting is
// built out of. Nothing here knows what a tempo is — it turns the envelope into
// a shape, stacks those shapes on top of one another, and says how far two of
// them sit apart.

// A hit climbs over two or three frames, and a raw difference splits it between
// them, so whether a grid scores depends on which frame it landed in. Leaning
// each frame on its neighbours puts the whole climb under any of them.
const RISE_SPREAD = 0.25

// How many rows a bar is read at, and the fewest bars worth averaging.
// Divisible by every count a bar is likely to be cut into, seven included: a
// bar of seven is rare, but a phrase of seven beats is not, and a count the
// rows cannot divide by is a tempo the fitting can never reach.
export const BAR_ROWS = 840
// too few bars and the average is one bar, which agrees with itself
export const MIN_BARS = 4
// the rows a stretch is read at when two of them are being compared
export const SETTLE_ROWS = 256

const rises = new WeakMap<Float32Array, Float32Array>()

// What the fitting actually reads: how fast the envelope is climbing, not how
// high it stands. A loud master holds the envelope near its ceiling for most of
// a song, so levels barely differ between a beat and the gap after it, while
// the climb onto each beat stays sharp.
export function riseOf(envelope: Float32Array): Float32Array {
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

export function runningTotal(envelope: Float32Array): Float64Array {
  const cached = totals.get(envelope)
  if (cached) return cached

  const sums = new Float64Array(envelope.length + 1)
  for (let at = 0; at < envelope.length; at += 1) sums[at + 1] = sums[at] + envelope[at]
  totals.set(envelope, sums)
  return sums
}

// Every bar of the stretch laid on top of one another.
export function barProfile(
  envelope: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  barMs: number,
  rows: number,
): Float64Array | null {
  const perMs = sampleRate / 1000 / envelopeHop(sampleRate)
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

export function centred(rows: Float64Array): Float64Array {
  let mean = 0
  for (const value of rows) mean += value
  mean /= rows.length

  const out = new Float64Array(rows.length)
  for (let row = 0; row < rows.length; row += 1) out[row] = rows[row] - mean
  return out
}

// How far one bar sits from another, in rows. The search stops at half a beat

// beat of slide that never happened.
// `beats` is how many beats a column covers, which is what sets how far the
// search may go: half a beat either way, whatever that is in rows. Columns look
// alike at beat level, so a wider search answers with a whole beat of slide
// that never happened.
// A reading and whether it means anything. Music repeats inside a bar as well
// as across one, so two profiles often line up nearly as well a beat apart as
// they do in place, and the winner is then decided by whichever was a fraction
// higher. Such a reading is not a small movement — it is no movement and no
// reading, and averaging it in with the rest is where a picture that visibly
// slopes comes back measured as straight.
export type Slide = {
  rows: number
  sure: boolean
}

// how much of the winner a rival some way off may reach before the two are
// called indistinguishable
const RIVAL_KEEPS = 0.85

export function shiftRows(one: Float64Array, other: Float64Array, beats: number): Slide {
  const size = one.length
  const reach = Math.max(1, Math.round(size / (2 * Math.max(1, beats))))

  const scores = new Float64Array(reach * 2 + 1)
  let best = 0
  let bestScore = -Infinity

  for (let shift = -reach; shift <= reach; shift += 1) {
    let sum = 0
    for (let row = 0; row < size; row += 1) sum += one[row] * other[(row + shift + size) % size]
    scores[shift + reach] = sum
    if (sum > bestScore) {
      bestScore = sum
      best = shift
    }
  }

  // the best of everything that is not simply the shoulder of the winner
  const apart = Math.max(1, Math.round(reach / 2))
  let rival = -Infinity
  for (let shift = -reach; shift <= reach; shift += 1) {
    if (Math.abs(shift - best) < apart) continue
    rival = Math.max(rival, scores[shift + reach])
  }

  return { rows: best, sure: bestScore > 0 && rival < bestScore * RIVAL_KEEPS }
}

// How straight the compiled view runs under this grid: the average distance
// between a stretch's bar and the section's bar. Zero is the picture banding
// horizontally; anything else is the streak sliding, which is the drift you can
// see in it.
