export type Section = {
  id: string
  offsetMs: number
  bpm: number
  // beats in a bar: 4 unless the chart says otherwise, which is the one place
  // a time signature enters the app
  meter: number
}

export const MIN_BPM = 1
export const MAX_BPM = 1200

export const DEFAULT_METER = 4

export function createSection(offsetMs: number, bpm: number, meter = DEFAULT_METER): Section {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    offsetMs: Math.max(0, offsetMs),
    bpm: Math.min(MAX_BPM, Math.max(MIN_BPM, bpm)),
    meter: Math.min(16, Math.max(1, Math.round(meter))),
  }
}

export function sortSections(sections: Section[]): Section[] {
  return [...sections].sort((left, right) => left.offsetMs - right.offsetMs)
}

export type SectionSpan = {
  section: Section
  start: number
  end: number
  beat: number
}

// Every canvas and every draw asks for these, so they are cached against the
// array they came from: the list only changes when an edit replaces it.
const spanCache = new WeakMap<Section[], { duration: number; spans: SectionSpan[] }>()

export function sectionSpans(sections: Section[], duration: number): SectionSpan[] {
  if (duration <= 0) return []

  const cached = spanCache.get(sections)
  if (cached && cached.duration === duration) return cached.spans

  const sorted = sortSections(sections)
  const spans = sorted.map((section, index) => {
    const next = sorted[index + 1]
    return {
      section,
      start: section.offsetMs / 1000 / duration,
      end: next ? next.offsetMs / 1000 / duration : 1,
      beat: 60 / section.bpm / duration,
    }
  })

  spanCache.set(sections, { duration, spans })
  return spans
}
