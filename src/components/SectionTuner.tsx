import type { RefObject } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import RulerSlider from './RulerSlider'
import { useLivePosition } from '../useLivePosition'
import { MAX_BPM, MIN_BPM, sectionSpans, sortSections, type Section } from '../timing'

type SectionTunerProps = {
  sections: Section[]
  duration: number
  position: number
  positionRef: RefObject<number>
  playing: boolean
  onSectionsChange: (sections: Section[]) => void
}

const PILL = {
  width: 200,
  borderRadius: 999,
  overflow: 'hidden',
  border: 1,
  borderColor: 'divider',
}

// The three rulers that tune the section under the playhead. They follow the
// playhead on their own while the song plays, so the app is not rendered to
// keep them current.
export default function SectionTuner({
  sections,
  duration,
  position,
  positionRef,
  playing,
  onSectionsChange,
}: SectionTunerProps) {
  const at = useLivePosition(position, positionRef, playing)
  const live =
    sectionSpans(sections, duration).find((item) => at >= item.start && at <= item.end)?.section ??
    null
  const fraction = Math.round(((live?.bpm ?? 120) % 1) * 100)

  const tune = (patch: Partial<Section>) => {
    if (!live) return
    onSectionsChange(
      sortSections(
        sections.map((section) => (section.id === live.id ? { ...section, ...patch } : section)),
      ),
    )
  }

  return (
    <Box sx={{ display: 'flex', gap: 1 }}>
      <Paper elevation={0} sx={PILL}>
        <RulerSlider
          value={Math.floor(live?.bpm ?? 120)}
          disabled={!live}
          min={Math.floor(MIN_BPM)}
          max={Math.floor(MAX_BPM)}
          step={1}
          pixelsPerStep={10}
          majorEvery={5}
          format={(value) => `${Math.round(value)} BPM`}
          onChange={(whole) => tune({ bpm: whole + fraction / 100 })}
        />
      </Paper>
      <Paper elevation={0} sx={PILL}>
        <RulerSlider
          value={fraction}
          disabled={!live}
          min={0}
          max={99}
          step={1}
          pixelsPerStep={6}
          majorEvery={5}
          format={(value) => `.${String(Math.round(value)).padStart(2, '0')}`}
          onChange={(part) => tune({ bpm: Math.floor(live?.bpm ?? 120) + part / 100 })}
        />
      </Paper>
      <Paper elevation={0} sx={PILL}>
        <RulerSlider
          value={Math.round(live?.offsetMs ?? 0)}
          disabled={!live}
          min={0}
          max={Math.max(1, Math.round(duration * 1000))}
          step={1}
          pixelsPerStep={4}
          majorEvery={10}
          format={(value) => `${Math.round(value)} ms`}
          onChange={(offsetMs) => tune({ offsetMs })}
        />
      </Paper>
    </Box>
  )
}
