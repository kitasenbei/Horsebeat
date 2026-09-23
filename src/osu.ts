import { unzipSync, zipSync } from 'fflate'
import { createSection, MAX_BPM, MIN_BPM, sortSections, type Section } from './timing'

// The archive a beatmap came in and the chart read from it, kept so an
// export can give the same archive back with only its timing changed
export type BeatmapSource = {
  archive: Uint8Array
  chartName: string
  chartText: string
}

export type Beatmap = {
  audio: File
  sections: Section[]
  title: string
  background: Blob | null
  source: BeatmapSource
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

// Timing points from a whole beatmap, its [TimingPoints] block, or bare
// lines pasted from one: without the header the text is taken as the block
export function readTimingPoints(text: string): Section[] {
  const parts = text.split(/^\[TimingPoints\]\s*$/m)
  const block = parts.length > 1 ? parts[1] : text
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
    const meter = Number(parts[2])
    const uninherited = parts.length > 6 ? parts[6].trim() !== '0' : beatLength > 0
    if (!uninherited || !Number.isFinite(time) || !Number.isFinite(beatLength)) continue
    if (beatLength <= 0) continue

    const bpm = 60000 / beatLength
    if (bpm < MIN_BPM || bpm > MAX_BPM) continue

    const previous = sections[sections.length - 1]
    if (previous && Math.abs(previous.offsetMs - time) < 1) continue

    sections.push(
      createSection(Math.max(0, time), bpm, Number.isFinite(meter) && meter > 0 ? meter : undefined),
    )
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
    source: { archive, chartName: names[0], chartText: text },
  }
}

export function writeTimingPoints(sections: Section[]): string {
  return sortSections(sections)
    .map((section) => {
      const beatLength = 60000 / section.bpm
      return `${Math.round(section.offsetMs)},${beatLength},${section.meter},2,0,60,1,0`
    })
    .join('\n')
}

// The chart's timing block written afresh: the sections as its red lines,
// and the green lines it had, the slider velocities, kept in their places
function replaceTimingPoints(chartText: string, sections: Section[]): string {
  const parts = chartText.split(/^\[TimingPoints\]\s*$/m)
  if (parts.length < 2) return `${chartText.trimEnd()}\n\n[TimingPoints]\n${writeTimingPoints(sections)}\n`

  const rest = parts.slice(1).join('[TimingPoints]')
  const next = rest.search(/^\[/m)
  const block = next >= 0 ? rest.slice(0, next) : rest
  const after = next >= 0 ? rest.slice(next) : ''

  const inherited = block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      const fields = line.split(',')
      return fields.length > 6 && fields[6].trim() === '0'
    })
  const lines = [...writeTimingPoints(sections).split('\n'), ...inherited].sort(
    (left, right) => Number(left.split(',')[0]) - Number(right.split(',')[0]),
  )
  return `${parts[0]}[TimingPoints]\n${lines.join('\n')}\n\n${after}`
}

// A chart from nothing but the audio and the sections: enough for the editor
// to open it and show the grid, with no objects placed
function newChart(audioName: string, title: string, sections: Section[]): string {
  return [
    'osu file format v14',
    '',
    '[General]',
    `AudioFilename: ${audioName}`,
    'AudioLeadIn: 0',
    'PreviewTime: -1',
    'Countdown: 0',
    'SampleSet: Normal',
    'StackLeniency: 0.7',
    'Mode: 0',
    'LetterboxInBreaks: 0',
    'WidescreenStoryboard: 0',
    '',
    '[Editor]',
    'DistanceSpacing: 1',
    'BeatDivisor: 4',
    'GridSize: 32',
    'TimelineZoom: 1',
    '',
    '[Metadata]',
    `Title:${title}`,
    `TitleUnicode:${title}`,
    'Artist:',
    'ArtistUnicode:',
    'Creator:Horsebeat',
    'Version:Timing',
    'Source:',
    'Tags:',
    'BeatmapID:0',
    'BeatmapSetID:-1',
    '',
    '[Difficulty]',
    'HPDrainRate:5',
    'CircleSize:4',
    'OverallDifficulty:5',
    'ApproachRate:5',
    'SliderMultiplier:1.4',
    'SliderTickRate:1',
    '',
    '[Events]',
    '',
    '[TimingPoints]',
    writeTimingPoints(sections),
    '',
    '[HitObjects]',
    '',
  ].join('\n')
}

// The song and its sections as an osz: the archive it came from with the
// chart's timing rewritten, or a new archive of the audio and a bare chart
export async function writeOsz(
  audio: File,
  sections: Section[],
  title: string,
  source: BeatmapSource | null,
): Promise<Uint8Array> {
  const encode = (text: string) => new TextEncoder().encode(text)
  if (source) {
    const entries = unzipSync(source.archive)
    entries[source.chartName] = encode(replaceTimingPoints(source.chartText, sections))
    return zipSync(entries, { level: 6 })
  }

  const chart = newChart(audio.name, title, sections)
  const chartName = `${title.replace(/[\\/:*?"<>|]/g, '_')} (Horsebeat) [Timing].osu`
  return zipSync(
    {
      [chartName]: encode(chart),
      [audio.name]: new Uint8Array(await audio.arrayBuffer()),
    },
    { level: 6 },
  )
}
