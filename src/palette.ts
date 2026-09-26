import type { Tones } from './theme'

// The shell's tones taken from a picture, the way a desktop takes its colours
// from its wallpaper. The picture is read small; its hue, weighted by how
// coloured each pixel is, tints the three tones of the shell, and its most
// present coloured hue that is neither the shell's nor washed out becomes the
// accent. Lightness and saturation are the shell's own, so the app keeps its
// depth and the picture only says which way it leans
const SAMPLE = 48
const BINS = 24

function hsl(r: number, g: number, b: number): [number, number, number] {
  const most = Math.max(r, g, b)
  const least = Math.min(r, g, b)
  const l = (most + least) / 2
  if (most === least) return [0, 0, l]
  const d = most - least
  const s = l > 0.5 ? d / (2 - most - least) : d / (most + least)
  let h: number
  if (most === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (most === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h / 6, s, l]
}

function hex(h: number, s: number, l: number): string {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    let c: number
    if (t < 1 / 6) c = p + (q - p) * 6 * t
    else if (t < 1 / 2) c = q
    else if (t < 2 / 3) c = p + (q - p) * (2 / 3 - t) * 6
    else c = p
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${channel(h + 1 / 3)}${channel(h)}${channel(h - 1 / 3)}`
}

export function tonesFromPixels(data: Uint8ClampedArray): Tones {
  // the hue the picture leans, as a vector sum so red and violet meet rather
  // than average to green; and how much of each hue there is with colour in it
  let x = 0
  let y = 0
  const bins = new Float64Array(BINS)
  const binL = new Float64Array(BINS)
  for (let i = 0; i < data.length; i += 4) {
    const [h, s, l] = hsl(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255)
    const weight = s * (1 - Math.abs(l - 0.5) * 1.6)
    if (weight <= 0) continue
    x += Math.cos(h * 2 * Math.PI) * weight
    y += Math.sin(h * 2 * Math.PI) * weight
    const bin = Math.min(BINS - 1, Math.floor(h * BINS))
    bins[bin] += weight
    binL[bin] += l * weight
  }
  const lean = ((Math.atan2(y, x) / (2 * Math.PI)) % 1 + 1) % 1

  // the accent: the fullest hue bin at least a sixth of the wheel from the
  // shell's lean, so it reads against the shell rather than into it
  let accentBin = -1
  let best = 0
  for (let bin = 0; bin < BINS; bin += 1) {
    const centre = (bin + 0.5) / BINS
    const apart = Math.abs(((centre - lean + 0.5) % 1 + 1) % 1 - 0.5)
    if (apart < 1 / 6) continue
    if (bins[bin] > best) {
      best = bins[bin]
      accentBin = bin
    }
  }
  const accentHue = accentBin >= 0 ? (accentBin + 0.5) / BINS : (lean + 0.5) % 1

  return {
    shell: hex(lean, 0.2, 0.08),
    panel: hex(lean, 0.18, 0.12),
    row: hex(lean, 0.15, 0.165),
    well: hex(lean, 0.22, 0.055),
    mint: hex(accentHue, 0.62, 0.62),
  }
}

export function extractTones(url: string): Promise<Tones> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = SAMPLE / Math.max(image.width, image.height)
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('No canvas to read the picture with'))
        return
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      resolve(tonesFromPixels(context.getImageData(0, 0, canvas.width, canvas.height).data))
    }
    image.onerror = () => reject(new Error('The picture could not be read'))
    image.src = url
  })
}
