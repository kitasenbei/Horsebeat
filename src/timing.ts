export type Section = {
  id: string
  offsetMs: number
  bpm: number
}

export const MIN_BPM = 20
export const MAX_BPM = 400

export function createSection(offsetMs: number, bpm: number): Section {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    offsetMs: Math.max(0, offsetMs),
    bpm: Math.min(MAX_BPM, Math.max(MIN_BPM, bpm)),
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

export function sectionSpans(sections: Section[], duration: number): SectionSpan[] {
  if (duration <= 0) return []

  const sorted = sortSections(sections)
  return sorted.map((section, index) => {
    const next = sorted[index + 1]
    return {
      section,
      start: section.offsetMs / 1000 / duration,
      end: next ? next.offsetMs / 1000 / duration : 1,
      beat: 60 / section.bpm / duration,
    }
  })
}
