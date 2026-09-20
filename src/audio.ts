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
