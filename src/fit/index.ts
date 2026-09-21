import { envelopeHop } from '../audio'
export type { Fit } from './types'
import type { Fit } from './types'
import { BAR_ROWS, MIN_BARS, barProfile } from './signal'
import {
  ENVELOPE_LAG_MS,
  SETTLE_BARS,
  bestPhase,
  flatnessOf,
  patternScore,
  scoreFit,
} from './score'


const COARSE_BPM_STEP = 0.5
// how far a polish may move from the tempo it was given: wide enough for a
// played performance drifting, far short of the half or double that fits well
const DRIFT_BAND = 0.06
const DENSER_KEEPS = 0.78
// how much of the pulse's own reading a denser count of it has to keep
const FOLD_KEEPS = 0.6

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

const FIT_STEPS = SCALES.length
// how many times the least-squares polish is repeated once the ladder is done
const POLISH_ROUNDS = 3




// The ladder gets close, then stalls: the envelope is smoothed, so a few
// milliseconds either way score the same. This measures instead of nudging —
// it finds the peak nearest each predicted beat and fits a line through them,
// which recovers the offset and the tempo together.
function polishFit(
  envelope: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  fit: Fit,
): Fit {
  const frames = envelope.length
  const perMs = sampleRate / 1000 / envelopeHop(sampleRate)
  const lag = Math.round(ENVELOPE_LAG_MS * perMs)
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
    const centre = Math.round((fit.offsetMs + beat * beatMs) * perMs) - lag
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
    const at = moment / peak + lag

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
function refineFit(
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


// The beat of a grid nearest a moment, never negative: where a section that
// takes over there should be anchored. Nearest rather than next, so refitting
// a section cannot walk its start forward a beat at a time.
function beatNear(fit: Fit, atMs: number): number {
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
const BAR_PARTS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16]



// How near the beat a count has to land before it is doubled, and how well the
// beats in between have to be played.
const DOUBLE_BELOW = 130
const DOUBLE_KEEPS = 0.9
const DOTTED_KEEPS = 0.95
// how many times a count may be promoted before it is taken as read
const COUNT_ROUNDS = 3

// Whether what came out of the fold is the pulse rather than the beat. A bar
// divides cleanly into the pulse that carries it and no further: where the beat
// is twice that pulse the bar is really two bars, and two bars are not alike
// enough for the fold to cut them into eight.
//
// So the audio is asked at the one place it can answer: are the beats in
// between actually played? If they are, and the count is slow enough that the
// music is unlikely to be counted there, the faster count is the beat. Both
// halves matter — a ride cymbal plays the beats in between all night without
// the tempo being twice what it is, and only the speed of the count says which
// of the two a listener would tap.
function counted(
  envelope: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  bpm: number,
): number {
  let count = bpm

  // Each promotion opens the next one: a pulse of 75 doubles to 150, and 150 is
  // then itself a count of 225 that nothing would otherwise ask about.
  for (let round = 0; round < COUNT_ROUNDS; round += 1) {
    const mine = bestPhase(envelope, sampleRate, fromMs, toMs, count).score
    if (mine <= 0) return count

    const plays = (faster: number, keeps: number) =>
      faster <= MAX_BPM_COUNT &&
      bestPhase(envelope, sampleRate, fromMs, toMs, faster).score >= mine * keeps

    // twice the count, where the count is slow enough that the music is
    // unlikely to be tapped there
    if (count < DOUBLE_BELOW && plays(count * 2, DOUBLE_KEEPS)) {
      count *= 2
      continue
    }

    // and three of the count against two of it, which is what is left when a
    // bar divides evenly into a tempo that is not the beat: a bar of four at
    // 150 is also six beats of 225, and only the audio says which is played.
    // Held to a stricter share than the doubling, because a count two thirds of
    // the beat lands on every other one of its beats and so keeps more of the
    // reading than half a tempo would.
    if (plays(count * 1.5, DOTTED_KEEPS)) {
      count *= 1.5
      continue
    }

    return count
  }

  return count
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
    if (beat < MIN_BPM_SEARCH || beat > MAX_BPM_COUNT) continue

    const size = BAR_ROWS / parts
    const folded = new Float64Array(size)
    for (let row = 0; row < BAR_ROWS; row += 1) folded[row % size] += rows[row] / parts

    let agreed = 0
    for (const value of folded) agreed += (value - mean) ** 2
    kept.push({ bpm: beat, share: (agreed * parts) / spread })
  }

  if (kept.length === 0) return bpm
  const best = Math.max(...kept.map((part) => part.share))
  const found = kept.filter((part) => part.share >= best * DENSER_KEEPS).pop()!.bpm
  if (found === bpm) return bpm

  // A denser count always reads a little worse than the pulse it divides, and
  // that is expected. Reading far worse is not: it means the bar was cut into a
  // number of parts it is not made of, and the count that came out is not a
  // tempo the song has.
  const mine = patternScore(envelope, sampleRate, fromMs, toMs, found, meter)
  const given = patternScore(envelope, sampleRate, fromMs, toMs, bpm, meter)
  const held = mine >= given * FOLD_KEEPS ? found : bpm
  return counted(envelope, sampleRate, fromMs, toMs, held)
}




const MIN_BPM_SEARCH = 60
const MAX_BPM_SEARCH = 200
// How fast a count of the pulse may be. The sweep looks for the pulse, which
// sits in the ordinary range whatever the music is doing, but the beat a chart
// is written against can be a good deal faster than the pulse that carries it,
// and a count the search cannot name is a tempo the fitting can never report.
const MAX_BPM_COUNT = 300
// how far apart two readings have to be before they are two tempos
// how far apart, as a share of the tempo, two readings have to be before they
// are two tempos rather than two readings of one
const SAME_TEMPO = 0.01
const COUNTED_BAND = 0.04
// how near three-against-two a reading has to be to be that rather than a tempo
const DOTTED_BAND = 0.015

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

// Three of one against two of the other: the same pulse read in dotted notes,
// which a shuffle or a passage in three invites. Kept apart from runsAlready
// because it only holds between a section and the one it came from — a track
// whose best reading over its whole length is three against two of what the
// windows voted for is a track being counted wrongly, not one in dotted notes.
//
// The band is narrow because a real change of tempo can land near two thirds
// and mean it: a song dropping from 140 to 96 sits at 0.686, and two thirds is
// 0.667.
function readsAsDotted(bpm: number, against: number): boolean {
  // only the slower reading. Two thirds of the tempo it was handed is a stretch
  // counted in dotted notes; three halves of it is a stretch correcting a count
  // that was already dotted, and that has to be allowed through or a section
  // can never recover from a parent that was wrong.
  return Math.abs(bpm * 3 - against * 2) < against * 2 * DOTTED_BAND
}

// How long a stretch each vote is cast over. Long enough that a bar or two of
// something else does not decide it, short enough that a song with two tempos
// still votes for both.
const VOTE_WINDOW_MS = 60000

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

// How many tempos are scored before the fit offers the frame back. A window
// holds 281 of them and takes about eighty milliseconds, which is five frames
// spent at once; in chunks it is a few milliseconds at a time.
const COUNT_CHUNK = 24

// Counting a stretch: every tempo scored over each window, each window's own
// best called one vote, and the votes added up. Normalising per window is the
// point — a loud chorus and a quiet verse then count the same, and no stretch
// decides the track by being louder than the rest of it.
function* counting(
  envelope: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  meter: number,
  pattern: boolean,
): Generator<null, Vote, void> {
  const bpms = votedBpms()
  const totals = new Float64Array(bpms.length)
  const scores = new Float64Array(bpms.length)

  // A stretch judged at a boundary is shorter than a window and still has to be
  // counted; one too short to hold a few bars scores nothing at every tempo and
  // falls out below.
  for (let at = fromMs; at < toMs; at += VOTE_WINDOW_MS) {
    const until = Math.min(toMs, at + VOTE_WINDOW_MS)
    let top = 0

    for (let index = 0; index < bpms.length; index += 1) {
      const score = pattern
        ? patternScore(envelope, sampleRate, at, until, bpms[index], meter)
        : bestPhase(envelope, sampleRate, at, until, bpms[index]).score
      scores[index] = score
      if (score > top) top = score
      if (index % COUNT_CHUNK === COUNT_CHUNK - 1) yield null
    }

    if (top <= 0) continue
    for (let index = 0; index < bpms.length; index += 1) totals[index] += scores[index] / top
    yield null
  }

  return { fromMs: toMs, totals, done: true, meter, pattern }
}

function* voteTempo(
  envelope: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  meter: number,
): Generator<null, { bpm: number | null; vote: Vote }, void> {
  const vote = yield* counting(envelope, sampleRate, fromMs, toMs, meter, false)
  return { bpm: pickTempo(vote), vote }
}

// How well one tempo polled. Tempos are compared by this rather than by their
// score, because a score is read off however many beats that tempo has and a
// slow grid is asked about fewer of them; a vote is taken against the same
// field of candidates every time.
// How well a tempo polled, counted its own way or as any of the counts it
// shares a pulse with. A stretch that plays every other beat polls for half the
// tempo, and that is a vote for the same pulse, not against it.
function polledAs(vote: Vote, bpm: number): number {
  let best = voteFor(vote, bpm)
  for (const times of [2, 3, 4]) {
    best = Math.max(best, voteFor(vote, bpm / times), voteFor(vote, bpm * times))
  }
  return best
}

function topVote(vote: Vote): number {
  let top = 0
  for (const total of vote.totals) if (total > top) top = total
  return top
}

function voteFor(vote: Vote, bpm: number): number {
  const index = Math.round((bpm - MIN_BPM_SEARCH) / COARSE_BPM_STEP)
  return index >= 0 && index < vote.totals.length ? vote.totals[index] : 0
}

// What a count came out at. A pattern vote answers about the bar, and which
// count inside it is the beat is settled by beatWithin against the audio; a
// comb vote answers about the beat already, but the count that wins outright is
// often half or a third of it, so the denser reading is preferred here where it
// holds up.
// How much better a tempo has to read over the whole track before it overrules
// what the windows voted for.
const OVERRULES = 1.2

// What the track is, settled between the two ways of counting it. The vote asks
// each window separately and adds up what they say, which follows a song that
// changes tempo but can be led astray on a short track with few windows to ask.
// The pattern read over the whole track at once cannot follow a change, but it
// is the more certain answer where there is one tempo. Where they disagree and
// the whole track reads decidedly better, the whole track wins.
function* bestTempo(
  envelope: Float32Array,
  sampleRate: number,
  durationMs: number,
  vote: Vote,
): Generator<null, number | null, void> {
  const picked = pickTempo(vote)
  if (picked === null) return null

  const meter = vote.meter
  const voted = beatWithin(envelope, sampleRate, 0, durationMs, picked, meter)

  let swept = 0
  let best = 0
  const bpms = votedBpms()
  for (let index = 0; index < bpms.length; index += 1) {
    const score = patternScore(envelope, sampleRate, 0, durationMs, bpms[index], meter)
    if (score > best) {
      best = score
      swept = bpms[index]
    }
    if (index % COUNT_CHUNK === COUNT_CHUNK - 1) yield null
  }
  if (swept === 0) return voted

  const found = beatWithin(envelope, sampleRate, 0, durationMs, swept, meter)
  if (found === voted || runsAlready(found, voted)) return voted

  const mine = patternScore(envelope, sampleRate, 0, durationMs, found, meter)
  const theirs = patternScore(envelope, sampleRate, 0, durationMs, voted, meter)
  return mine > theirs * OVERRULES ? found : voted
}

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








// A span shorter than this is not split again: two of them is the least a
// section can be asked to cover.
// A span shorter than this is not split again. It is not what stops the
// cutting on a long track — straightness is judged over eight bars and needs
// two of them, so a stretch of about half a minute is the shortest that can be
// read at all — but lowering it from twelve seconds to eight let the last
// couple of cuts through on a live recording.
const MIN_SPAN_MS = 8000
// how straight a section has to run before it is left alone
const FLAT_OK_MS = 8
const MAX_DEPTH = 6
// how much better a span has to read at its own tempo to leave its parent's
const TAKES_OVER = 1.15
// how well a tempo has to have polled over the whole track to be allowed to
// take a span, against the best anything polled
const POLLED_ENOUGH = 0.4
// how far from the tempo it was given a span may land. A song changes tempo by
// a few bpm, or drops to two thirds for a half-time passage; past that it is
// not a change of tempo but the same pulse counted some other way.
const NEAREST = 0.65

// What a span reads as on its own. A short span has few bars to count and reads
// as all sorts of things, so the tempo it was given stands unless what it found
// draws a decidedly better picture, and a count of that tempo is never a reason
// to leave it: over a few bars the sparser count always looks better.
function* tempoOf(
  envelope: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  given: number,
  meter: number,
  track: Vote,
): Generator<null, number, void> {
  const local = yield* voteTempo(envelope, sampleRate, fromMs, toMs, meter)
  if (local.bpm === null) return given

  const found = beatWithin(envelope, sampleRate, fromMs, toMs, local.bpm, meter)
  if (found === given || runsAlready(found, given) || readsAsDotted(found, given)) return given

  // and it has to be a tempo the track plays. A stretch of a few bars reads as
  // any number of things, most of which the song never goes near, and the count
  // of the whole track is the only place that is known.
  if (polledAs(track, found) < topVote(track) * POLLED_ENOUGH) return given
  if (found < given * NEAREST || found > given / NEAREST) return given

  const mine = patternScore(envelope, sampleRate, fromMs, toMs, found, meter)
  const theirs = patternScore(envelope, sampleRate, fromMs, toMs, given, meter)
  return mine > theirs * TAKES_OVER ? found : given
}

// How finely the averaged beat is read when the offset is placed, and where on
// the climb onto it the beat is taken to be.
const BEAT_ROWS = 512
const CLIMB_SHARE = 0.55

// Where the beat sits, read off every beat of the section at once.
//
// A fit lands on whatever the scoring liked, and on real instruments that is
// late: the envelope averages a window either side of each sample, so a soft
// attack reaches its loudest well after the note began, and a grid placed there
// sits behind the music. What a player hears as the beat, and what a charter
// marks, is the climb onto the note rather than the top of it. So every beat of
// the section is averaged into one, the strongest climb in it is found, and the
// offset is moved to partway up that climb.
function anchorBeat(
  envelope: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  fit: Fit,
): Fit {
  const perMs = sampleRate / 1000 / envelopeHop(sampleRate)
  const beatMs = 60000 / fit.bpm
  const beats = Math.floor((toMs - fromMs) / beatMs)
  if (beats < MIN_BARS) return fit

  const rows = new Float64Array(BEAT_ROWS)
  for (let beat = 0; beat < beats; beat += 1) {
    for (let row = 0; row < BEAT_ROWS; row += 1) {
      const at = (fit.offsetMs + (beat + row / BEAT_ROWS) * beatMs) * perMs
      const low = Math.floor(at)
      if (low < 1 || low + 1 >= envelope.length) continue

      const part = at - low
      const here = envelope[low] + (envelope[low + 1] - envelope[low]) * part
      const behind = envelope[low - 1] + (envelope[low] - envelope[low - 1]) * part
      if (here > behind) rows[row] += here - behind
    }
  }

  let peak = 0
  for (let row = 0; row < BEAT_ROWS; row += 1) if (rows[row] > rows[peak]) peak = row
  if (rows[peak] <= 0) return fit

  let start = peak
  while (start > 0 && rows[start] > rows[peak] * CLIMB_SHARE) start -= 1

  // a climb found late in the averaged beat belongs to the beat after it
  const moved = (start / BEAT_ROWS) * beatMs
  const shift = moved > beatMs / 2 ? moved - beatMs : moved
  return { bpm: fit.bpm, offsetMs: Math.max(0, fit.offsetMs + shift) }
}

export type Part = {
  fromMs: number
  toMs: number
  fit: Fit
  flat: number
}

// What a caller sees between steps: the sections settled so far, and the grid
// currently being moved onto the music.
export type Progress = {
  parts: Part[]
  working: Fit
}

// Settling one span, a rung at a time. The ladder moves both knobs a step each
// way and keeps whichever reads better, then the polish regresses the landmarks
// it can see; yielding after each leaves the grid visible while it walks onto
// the music.
function* settle(
  envelope: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  given: number,
  meter: number,
  track: Vote,
  parts: Part[],
  asked: boolean,
): Generator<Progress | null, Part, void> {
  // The whole track has already been counted, so the span that covers it is
  // given that answer rather than made to count itself again: the second count
  // reads the same audio, returns the same tempo, and is the slowest single
  // thing the fitting does.
  const bpm = asked ? given : yield* tempoOf(envelope, sampleRate, fromMs, toMs, given, meter, track)
  let fit = bestPhase(envelope, sampleRate, fromMs, toMs, bpm).fit

  const low = bpm * (1 - DRIFT_BAND)
  const high = bpm * (1 + DRIFT_BAND)
  const inBand = (candidate: Fit) => candidate.bpm >= low && candidate.bpm <= high

  for (let step = 0; step < FIT_STEPS; ) {
    const moved = refineFit(envelope, sampleRate, fromMs, toMs, fit, step)
    if (moved.moved && inBand(moved.fit)) fit = moved.fit
    else step += 1
    yield { parts, working: fit }
  }

  for (let round = 0; round < POLISH_ROUNDS; round += 1) {
    const polished = polishFit(envelope, sampleRate, fromMs, toMs, fit)
    if (!inBand(polished)) break
    fit = polished
    yield { parts, working: fit }
  }

  // the grid on the beat, and the bar on a downbeat
  const anchored = { bpm: fit.bpm, offsetMs: beatNear(fit, fromMs) }
  const barred = alignDownbeat(envelope, sampleRate, fromMs, toMs, anchored, meter)
  const placed = anchorBeat(envelope, sampleRate, fromMs, toMs, barred)

  return {
    fromMs,
    toMs,
    fit: placed,
    flat: flatnessOf(envelope, sampleRate, fromMs, toMs, placed, meter),
  }
}

// The track is taken whole, then halved wherever one grid cannot stay on the
// beat across it, and each half asked the same question again. Splitting
// downwards rather than sweeping forwards means every answer is read off as
// much audio as it can be, and a section appears only where the song actually
// stops agreeing with the one before it.
//
// A span is left alone when it runs straight and both of its halves read as the
// tempo it settled on. Both tests are needed: a half playing a different tempo
// is somewhere else rather than drifting, and its own picture can be as
// straight as any other.
function* solve(
  envelope: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  given: number,
  meter: number,
  track: Vote,
  depth: number,
  parts: Part[],
): Generator<Progress | null, void, void> {
  const whole = yield* settle(
    envelope,
    sampleRate,
    fromMs,
    toMs,
    given,
    meter,
    track,
    parts,
    depth === 0,
  )

  const keep = () => {
    parts.push(whole)
    parts.sort((one, other) => one.fromMs - other.fromMs)
  }

  if (toMs - fromMs < MIN_SPAN_MS * 2 || depth >= MAX_DEPTH) return keep()

  const barMs = (60000 / whole.fit.bpm) * Math.max(1, meter)
  const bars = Math.floor((toMs - fromMs) / barMs)
  if (bars < SETTLE_BARS) return keep()

  const middle = fromMs + Math.floor(bars / 2) * barMs
  const left = yield* tempoOf(envelope, sampleRate, fromMs, middle, whole.fit.bpm, meter, track)
  const right = yield* tempoOf(envelope, sampleRate, middle, toMs, whole.fit.bpm, meter, track)
  const agreed = left === whole.fit.bpm && right === whole.fit.bpm
  if (agreed && whole.flat <= FLAT_OK_MS) return keep()

  yield* solve(envelope, sampleRate, fromMs, middle, left, meter, track, depth + 1, parts)
  yield* solve(envelope, sampleRate, middle, toMs, right, meter, track, depth + 1, parts)
}

// The whole of it: count the track, then split it. Driven one `next()` a frame,
// so the sections appear along the track as they are found and the compiled
// view straightens while it works.
export function* fitTrack(
  envelope: Float32Array,
  sampleRate: number,
  durationMs: number,
  meter: number,
): Generator<Progress | null, Part[], void> {
  if (durationMs <= 0) return []

  const vote = yield* counting(envelope, sampleRate, 0, durationMs, meter, true)
  const bpm = yield* bestTempo(envelope, sampleRate, durationMs, vote)
  if (bpm === null) return []

  const parts: Part[] = []
  yield* solve(envelope, sampleRate, 0, durationMs, bpm, meter, vote, 0, parts)
  return parts
}

// Which beat of the bar is the downbeat. A fit lands on the beat, but a section
// wants to start a bar: with the offset on a downbeat, a column of four beats
// is a bar, and the compiled view at that density shows bars rather than an
// arbitrary window of four.
function alignDownbeat(
  envelope: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
  fit: Fit,
  meter: number,
): Fit {
  const bar = Math.max(1, Math.round(meter))
  if (bar < 2) return fit

  const perMs = sampleRate / 1000 / envelopeHop(sampleRate)
  const lag = Math.round(ENVELOPE_LAG_MS * perMs)
  const beatMs = 60000 / fit.bpm
  const first = Math.ceil((fromMs - fit.offsetMs) / beatMs)
  const last = Math.floor((toMs - fit.offsetMs) / beatMs)

  const totals = new Float64Array(bar)
  const counts = new Float64Array(bar)

  for (let beat = first; beat <= last; beat += 1) {
    // where the climb this beat made should sit, a radius ahead of the hit
    const centre = Math.round((fit.offsetMs + beat * beatMs) * perMs) - lag
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
