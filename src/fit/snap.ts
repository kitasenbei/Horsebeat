import type { Fit } from './types'
import { scoreFit } from './score'

// One section snapped to the music it covers. The song-level fit searches the
// whole track for a grid; this asks the same score of one stretch, starting
// from the tempo and offset already set and looking only a little way around
// them, so it settles the grid onto the nearest beats rather than wandering
// to a double or half tempo. Two passes: a coarse sweep, then a fine one
// about the best it found.

// how far the tempo may move, as a share of itself, and the offset, as a
// share of a beat either way
const TEMPO_REACH = 0.04
const OFFSET_REACH = 0.5

const COARSE_TEMPO_STEP = 0.1
const COARSE_OFFSET_MS = 2
const FINE_TEMPO_STEP = 0.005
const FINE_OFFSET_MS = 0.25
// the fine pass counts a hit only this close to its beat, so the tempo that
// lands every beat on its hit wins over one that lands them all within reach
const FINE_REACH_MS = 1.5

// fewer beats than this and the score has nothing to hold on to
const MIN_BEATS = 4

function search(
  envelope: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  about: Fit,
  tempoReach: number,
  tempoStep: number,
  offsetReach: number,
  offsetStep: number,
  reachMs?: number,
): Fit {
  let best = about
  let bestScore = scoreFit(envelope, sampleRate, fromMs, toMs, about, reachMs)

  const tempos = Math.max(1, Math.round(tempoReach / tempoStep))
  const offsets = Math.max(1, Math.round(offsetReach / offsetStep))
  for (let t = -tempos; t <= tempos; t += 1) {
    const bpm = about.bpm + t * tempoStep
    if (bpm <= 0) continue
    for (let o = -offsets; o <= offsets; o += 1) {
      const fit = { bpm, offsetMs: about.offsetMs + o * offsetStep }
      const score = scoreFit(envelope, sampleRate, fromMs, toMs, fit, reachMs)
      if (score > bestScore) {
        bestScore = score
        best = fit
      }
    }
  }
  return best
}

export function snapSection(
  envelope: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  given: Fit,
): Fit | null {
  const beatMs = 60000 / given.bpm
  if ((toMs - fromMs) / beatMs < MIN_BEATS) return null

  const coarse = search(
    envelope,
    sampleRate,
    fromMs,
    toMs,
    given,
    given.bpm * TEMPO_REACH,
    COARSE_TEMPO_STEP,
    beatMs * OFFSET_REACH,
    COARSE_OFFSET_MS,
  )
  const fine = search(
    envelope,
    sampleRate,
    fromMs,
    toMs,
    coarse,
    COARSE_TEMPO_STEP,
    FINE_TEMPO_STEP,
    COARSE_OFFSET_MS,
    FINE_OFFSET_MS,
    FINE_REACH_MS,
  )
  return {
    bpm: Math.round(fine.bpm * 1000) / 1000,
    offsetMs: Math.max(0, Math.round(fine.offsetMs * 10) / 10),
  }
}
