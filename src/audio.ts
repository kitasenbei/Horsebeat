const BIN_COUNT = 4096

export function toMono(buffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(buffer.length)

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let index = 0; index < data.length; index += 1) mono[index] += data[index]
  }

  if (buffer.numberOfChannels > 1) {
    for (let index = 0; index < mono.length; index += 1) mono[index] /= buffer.numberOfChannels
  }

  return mono
}

export function computePeaks(samples: Float32Array): Float32Array {
  const bins = Math.min(BIN_COUNT, samples.length)
  const peaks = new Float32Array(bins * 2)
  const samplesPerBin = samples.length / bins

  for (let bin = 0; bin < bins; bin += 1) {
    const start = Math.floor(bin * samplesPerBin)
    const end = Math.min(samples.length, Math.floor((bin + 1) * samplesPerBin))
    let min = 0
    let max = 0
    for (let index = start; index < end; index += 1) {
      const value = samples[index]
      if (value < min) min = value
      if (value > max) max = value
    }
    peaks[bin * 2] = min
    peaks[bin * 2 + 1] = max
  }

  return peaks
}

// Onsets are a difference between consecutive frames, so they want frames of
// several milliseconds: at a finer hop the difference is mostly noise. Loudness
// and the bands are levels rather than differences, so they can be measured as
// finely as the envelope and stop looking stepped beside it.
const ONSET_HOP = 512
const LEVEL_HOP = 64
// The quietest an amplitude is told from silence. Everything the amplitude
// curve reads is a level on this scale, nought at the floor and one at full
// scale, so a point at the middle of the curve is thirty decibels down rather
// than half of full scale, which is six down and above most of any song.
export const FLOOR_DB = -60

export function levelOf(amplitude: number): number {
  const db = 20 * Math.log10(Math.max(1e-6, amplitude))
  return Math.min(1, Math.max(0, (db - FLOOR_DB) / -FLOOR_DB))
}

export function levelsOf(amplitudes: Float32Array): Float32Array {
  const levels = new Float32Array(amplitudes.length)
  for (let at = 0; at < amplitudes.length; at += 1) levels[at] = levelOf(amplitudes[at])
  return levels
}

export function computeRms(samples: Float32Array, hop = ONSET_HOP): Float32Array {
  const frames = Math.max(1, Math.floor(samples.length / hop))
  const energy = new Float32Array(frames)

  for (let frame = 0; frame < frames; frame += 1) {
    const start = frame * hop
    const end = Math.min(samples.length, start + hop)
    let sum = 0
    for (let index = start; index < end; index += 1) sum += samples[index] * samples[index]
    energy[frame] = Math.sqrt(sum / Math.max(1, end - start))
  }

  return energy
}

export function computeLoudness(samples: Float32Array): Float32Array {
  const energy = computeRms(samples, LEVEL_HOP)
  const loudness = new Float32Array(energy.length)

  for (let frame = 0; frame < energy.length; frame += 1) loudness[frame] = levelOf(energy[frame])

  return loudness
}

const ONSET_PERCENTILE = 0.98

function percentile(values: Float32Array, ratio: number): number {
  const positive = Array.from(values).filter((value) => value > 0)
  if (positive.length === 0) return 0
  positive.sort((left, right) => left - right)
  const index = Math.min(positive.length - 1, Math.floor(positive.length * ratio))
  return positive[index]
}

export function computeOnsets(samples: Float32Array): Float32Array {
  const energy = computeRms(samples)
  const frames = energy.length

  const onsets = new Float32Array(frames)
  for (let frame = 1; frame < frames; frame += 1) {
    onsets[frame] = Math.max(0, energy[frame] - energy[frame - 1])
  }

  const reference = percentile(onsets, ONSET_PERCENTILE)
  if (reference > 0) {
    for (let frame = 0; frame < frames; frame += 1) {
      onsets[frame] = Math.min(1, onsets[frame] / reference)
    }
  }

  return onsets
}

const LOW_HZ = 200
const HIGH_HZ = 3000

function coefficient(cutoff: number, sampleRate: number) {
  return 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate)
}

export function computeBands(samples: Float32Array, sampleRate: number): Float32Array {
  const frames = Math.max(1, Math.floor(samples.length / LEVEL_HOP))
  const bands = new Float32Array(frames * 3)
  const lowA = coefficient(LOW_HZ, sampleRate)
  const highA = coefficient(HIGH_HZ, sampleRate)

  let low = 0
  let mid = 0
  const peaks = [0, 0, 0]

  for (let frame = 0; frame < frames; frame += 1) {
    const start = frame * LEVEL_HOP
    const end = Math.min(samples.length, start + LEVEL_HOP)
    const sums = [0, 0, 0]

    for (let index = start; index < end; index += 1) {
      const sample = samples[index]
      low += lowA * (sample - low)
      mid += highA * (sample - mid)
      const high = sample - mid
      const band = mid - low

      sums[0] += low * low
      sums[1] += band * band
      sums[2] += high * high
    }

    const count = Math.max(1, end - start)
    for (let band = 0; band < 3; band += 1) {
      const rms = Math.sqrt(sums[band] / count)
      bands[frame * 3 + band] = rms
      if (rms > peaks[band]) peaks[band] = rms
    }
  }

  for (let frame = 0; frame < frames; frame += 1) {
    for (let band = 0; band < 3; band += 1) {
      const peak = peaks[band]
      if (peak > 0) bands[frame * 3 + band] /= peak
    }
  }

  return bands
}

export type PeakLevel = {
  hop: number
  data: Float32Array
}

export type Pyramid = PeakLevel[]

const PYRAMID_HOPS = [64, 256, 4096, 65536]

export function buildPyramid(samples: Float32Array): Pyramid {
  const levels: Pyramid = []
  let previous: PeakLevel | null = null

  for (const hop of PYRAMID_HOPS) {
    const bins = Math.max(1, Math.floor(samples.length / hop))
    const data = new Float32Array(bins * 2)

    for (let bin = 0; bin < bins; bin += 1) {
      let min = 0
      let max = 0

      if (previous) {
        const factor = hop / previous.hop
        const start = bin * factor
        const end = Math.min(previous.data.length / 2, start + factor)
        for (let index = start; index < end; index += 1) {
          min = Math.min(min, previous.data[index * 2])
          max = Math.max(max, previous.data[index * 2 + 1])
        }
      } else {
        const start = bin * hop
        const end = Math.min(samples.length, start + hop)
        for (let index = start; index < end; index += 1) {
          const value = samples[index]
          if (value < min) min = value
          if (value > max) max = value
        }
      }

      data[bin * 2] = min
      data[bin * 2 + 1] = max
    }

    const level = { hop, data }
    levels.push(level)
    previous = level
  }

  return levels
}

// A frame of the envelope is a length of time, not a count of samples. The
// browser decodes to whatever its audio clock runs at, usually 48 kHz but 44.1
// on some machines, and a hop fixed in samples makes the same song a different
// signal on each. Everything that reads the envelope is written in
// milliseconds, so the hop is chosen to keep a frame the same length of time.
const ENVELOPE_FRAMES_A_SECOND = 44100 / 64
export const ENVELOPE_RADIUS = 8
const ENVELOPE_GAIN = 1.4

export function envelopeHop(sampleRate: number): number {
  return Math.max(1, Math.round(sampleRate / ENVELOPE_FRAMES_A_SECOND))
}

export function computeEnvelope(samples: Float32Array, sampleRate: number): Float32Array {
  const hop = envelopeHop(sampleRate)
  const bins = Math.max(1, Math.floor(samples.length / hop))
  const energy = new Float32Array(bins)

  for (let bin = 0; bin < bins; bin += 1) {
    const start = bin * hop
    const end = Math.min(samples.length, start + hop)
    let sum = 0
    for (let index = start; index < end; index += 1) sum += samples[index] * samples[index]
    energy[bin] = sum / Math.max(1, end - start)
  }

  // Summed up front and read as differences rather than carried along as a
  // running total. A running total adds and subtracts its way across the track,
  // and over a long one the rounding piles up until a quiet stretch takes it
  // below zero; the square root of that is not a number, and one of those makes
  // the whole envelope, and everything read from it, not a number either.
  const totals = new Float64Array(bins + 1)
  for (let bin = 0; bin < bins; bin += 1) totals[bin + 1] = totals[bin] + energy[bin]

  const envelope = new Float32Array(bins)
  for (let bin = 0; bin < bins; bin += 1) {
    const from = Math.max(0, bin - ENVELOPE_RADIUS)
    const to = Math.min(bins - 1, bin + ENVELOPE_RADIUS)
    const window = totals[to + 1] - totals[from]
    // deliberately not clamped: a loud master would saturate and lose the
    // shape the fitting reads. Drawing clamps through the amplitude curve.
    envelope[bin] = Math.sqrt(window / (to - from + 1)) * ENVELOPE_GAIN
  }

  return envelope
}

// Two readings of each moment's spectrum, from one transform of a short
// window. The tone is the spectral centre, the frequency the energy balances
// about, in hertz, placed on a log scale from the low end of the bass to the
// top of the presence range, since an octave is the same step wherever it
// lies. The noise is the spectral flatness, the geometric over the arithmetic
// mean of the spectrum: near one for hiss and a snare, near nought for a held
// note, whatever the loudness or the pitch. It is placed on a decibel scale
// like the levels are, since music lives in its lower decades. A frame is a
// stretch of samples like an onset frame, since a spectrum wants a window
const TONE_HOP = 512
const TONE_WINDOW = 2048
const TONE_LOW_HZ = 40
const TONE_HIGH_HZ = 8000
const NOISE_FLOOR_DB = -60

export type Spectra = {
  tone: Float32Array
  noise: Float32Array
}

// an in-place radix two transform of a power of two length
function fft(real: Float32Array, imag: Float32Array) {
  const n = real.length
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = real[i]
      real[i] = real[j]
      real[j] = tr
      const ti = imag[i]
      imag[i] = imag[j]
      imag[j] = ti
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = (-2 * Math.PI) / size
    const wr = Math.cos(angle)
    const wi = Math.sin(angle)
    for (let start = 0; start < n; start += size) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < size / 2; k += 1) {
        const a = start + k
        const b = a + size / 2
        const xr = real[b] * cr - imag[b] * ci
        const xi = real[b] * ci + imag[b] * cr
        real[b] = real[a] - xr
        imag[b] = imag[a] - xi
        real[a] += xr
        imag[a] += xi
        const nr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = nr
      }
    }
  }
}

export function computeSpectra(samples: Float32Array, sampleRate: number): Spectra {
  const frames = Math.max(1, Math.floor(samples.length / TONE_HOP))
  const tone = new Float32Array(frames)
  const noise = new Float32Array(frames)
  const real = new Float32Array(TONE_WINDOW)
  const imag = new Float32Array(TONE_WINDOW)
  const window = new Float32Array(TONE_WINDOW)
  for (let i = 0; i < TONE_WINDOW; i += 1) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / TONE_WINDOW)
  const bins = TONE_WINDOW / 2
  const binHz = sampleRate / TONE_WINDOW
  const low = Math.log2(TONE_LOW_HZ)
  const span = Math.log2(TONE_HIGH_HZ) - low

  for (let frame = 0; frame < frames; frame += 1) {
    // the window centred on the frame, so a tone is read about its moment
    const start = frame * TONE_HOP - TONE_WINDOW / 2
    for (let i = 0; i < TONE_WINDOW; i += 1) {
      const at = start + i
      real[i] = at >= 0 && at < samples.length ? samples[at] * window[i] : 0
      imag[i] = 0
    }
    fft(real, imag)

    let weighted = 0
    let total = 0
    let logs = 0
    for (let bin = 1; bin < bins; bin += 1) {
      const magnitude = Math.sqrt(real[bin] * real[bin] + imag[bin] * imag[bin])
      weighted += magnitude * bin * binHz
      total += magnitude
      logs += Math.log(magnitude + 1e-9)
    }
    // a near silent frame has no tone or texture to speak of and reads as the floor
    if (total < 1e-3) continue
    tone[frame] = Math.min(1, Math.max(0, (Math.log2(weighted / total) - low) / span))
    const flatness = Math.exp(logs / (bins - 1)) / (total / (bins - 1))
    const db = 10 * Math.log10(Math.max(1e-9, flatness))
    noise[frame] = Math.min(1, Math.max(0, (db - NOISE_FLOOR_DB) / -NOISE_FLOOR_DB))
  }

  return { tone, noise }
}
