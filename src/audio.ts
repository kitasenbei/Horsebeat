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

const HOP = 512
const FLOOR_DB = -60

export function computeRms(samples: Float32Array): Float32Array {
  const frames = Math.max(1, Math.floor(samples.length / HOP))
  const energy = new Float32Array(frames)

  for (let frame = 0; frame < frames; frame += 1) {
    const start = frame * HOP
    const end = Math.min(samples.length, start + HOP)
    let sum = 0
    for (let index = start; index < end; index += 1) sum += samples[index] * samples[index]
    energy[frame] = Math.sqrt(sum / Math.max(1, end - start))
  }

  return energy
}

export function computeLoudness(samples: Float32Array): Float32Array {
  const energy = computeRms(samples)
  const loudness = new Float32Array(energy.length)

  for (let frame = 0; frame < energy.length; frame += 1) {
    const db = 20 * Math.log10(Math.max(1e-6, energy[frame]))
    loudness[frame] = Math.min(1, Math.max(0, (db - FLOOR_DB) / -FLOOR_DB))
  }

  return loudness
}

export function computeOnsets(samples: Float32Array): Float32Array {
  const energy = computeRms(samples)
  const frames = energy.length

  const onsets = new Float32Array(frames)
  let peak = 0
  for (let frame = 1; frame < frames; frame += 1) {
    const rise = Math.max(0, energy[frame] - energy[frame - 1])
    onsets[frame] = rise
    if (rise > peak) peak = rise
  }

  if (peak > 0) {
    for (let frame = 0; frame < frames; frame += 1) onsets[frame] /= peak
  }

  return onsets
}

const LOW_HZ = 200
const HIGH_HZ = 3000

function coefficient(cutoff: number, sampleRate: number) {
  return 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate)
}

export function computeBands(samples: Float32Array, sampleRate: number): Float32Array {
  const frames = Math.max(1, Math.floor(samples.length / HOP))
  const bands = new Float32Array(frames * 3)
  const lowA = coefficient(LOW_HZ, sampleRate)
  const highA = coefficient(HIGH_HZ, sampleRate)

  let low = 0
  let mid = 0
  const peaks = [0, 0, 0]

  for (let frame = 0; frame < frames; frame += 1) {
    const start = frame * HOP
    const end = Math.min(samples.length, start + HOP)
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

export const ENVELOPE_HOP = 64
const ENVELOPE_RADIUS = 8
const ENVELOPE_GAIN = 1.4

export function computeEnvelope(samples: Float32Array): Float32Array {
  const bins = Math.max(1, Math.floor(samples.length / ENVELOPE_HOP))
  const energy = new Float32Array(bins)

  for (let bin = 0; bin < bins; bin += 1) {
    const start = bin * ENVELOPE_HOP
    const end = Math.min(samples.length, start + ENVELOPE_HOP)
    let sum = 0
    for (let index = start; index < end; index += 1) sum += samples[index] * samples[index]
    energy[bin] = sum / Math.max(1, end - start)
  }

  const envelope = new Float32Array(bins)
  let window = 0
  for (let bin = 0; bin <= ENVELOPE_RADIUS && bin < bins; bin += 1) window += energy[bin]

  for (let bin = 0; bin < bins; bin += 1) {
    const leaving = bin - ENVELOPE_RADIUS - 1
    const entering = bin + ENVELOPE_RADIUS
    if (leaving >= 0) window -= energy[leaving]
    if (entering < bins && bin > 0) window += energy[entering]

    const from = Math.max(0, bin - ENVELOPE_RADIUS)
    const to = Math.min(bins - 1, bin + ENVELOPE_RADIUS)
    envelope[bin] = Math.min(1, Math.sqrt(window / (to - from + 1)) * ENVELOPE_GAIN)
  }

  return envelope
}
