import { unzipSync } from 'fflate'
import { createSection, MAX_BPM, MIN_BPM, sortSections, type Section } from './timing'

export type Beatmap = {
  audio: File
  sections: Section[]
  title: string
  background: Blob | null
}

type Header = {
  audioFilename: string
  background: string
  title: string
}

function readHeader(text: string): Header {
  const audio = text.match(/^AudioFilename:\s*(.+)$/m)
  const title = text.match(/^Title:\s*(.+)$/m)
  const artist = text.match(/^Artist:\s*(.+)$/m)

  const background = text.match(/^0,0,"([^"]+)"/m)

  return {
    audioFilename: audio ? audio[1].trim() : '',
    background: background ? background[1].trim() : '',
    title: [artist?.[1].trim(), title?.[1].trim()].filter(Boolean).join(' - '),
  }
}

export function readTimingPoints(text: string): Section[] {
  const block = text.split(/^\[TimingPoints\]\s*$/m)[1]
  if (!block) return []

  const sections: Section[] = []

  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('[')) {
      if (trimmed.startsWith('[')) break
      continue
    }

    const parts = trimmed.split(',')
    if (parts.length < 2) continue

    const time = Number(parts[0])
    const beatLength = Number(parts[1])
    const uninherited = parts.length > 6 ? parts[6].trim() !== '0' : beatLength > 0
    if (!uninherited || !Number.isFinite(time) || !Number.isFinite(beatLength)) continue
    if (beatLength <= 0) continue

    const bpm = 60000 / beatLength
    if (bpm < MIN_BPM || bpm > MAX_BPM) continue

    const previous = sections[sections.length - 1]
    if (previous && Math.abs(previous.offsetMs - time) < 1) continue

    sections.push(createSection(Math.max(0, time), bpm))
  }

  return sortSections(sections)
}

function imageType(name: string) {
  const extension = name.split('.').pop()?.toLowerCase()
  if (extension === 'png') return 'image/png'
  if (extension === 'gif') return 'image/gif'
  return 'image/jpeg'
}

export async function readOsz(file: File): Promise<Beatmap> {
  const archive = new Uint8Array(await file.arrayBuffer())
  const charts = unzipSync(archive, { filter: (entry) => entry.name.toLowerCase().endsWith('.osu') })
  const names = Object.keys(charts).sort()
  if (names.length === 0) throw new Error('No .osu chart found in the archive')

  const text = new TextDecoder().decode(charts[names[0]])
  const header = readHeader(text)
  if (!header.audioFilename) throw new Error('The chart does not name an audio file')

  const wanted = header.audioFilename.toLowerCase()
  const audio = unzipSync(archive, {
    filter: (entry) => entry.name.toLowerCase() === wanted,
  })
  const data = audio[Object.keys(audio)[0]]
  if (!data) throw new Error(`The archive is missing ${header.audioFilename}`)

  let background: Blob | null = null
  if (header.background) {
    const wantedImage = header.background.toLowerCase()
    const images = unzipSync(archive, {
      filter: (entry) => entry.name.toLowerCase() === wantedImage,
    })
    const image = images[Object.keys(images)[0]]
    if (image) background = new Blob([image as BlobPart], { type: imageType(header.background) })
  }

  return {
    audio: new File([data as BlobPart], header.audioFilename),
    sections: readTimingPoints(text),
    title: header.title || file.name,
    background,
  }
}
