import { useRef, type RefObject } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'
import { drawBands, drawEnvelopeStrip, drawHeatmap, drawLevels, sectionSignature } from '../draw'
import { useCanvas } from '../useCanvas'
import { useRafCallback } from '../useRafCallback'
import { sortSections, sectionSpans, type Section } from '../timing'
import { useLiveSectionsValue } from '../liveSections'
import type { Range } from '../range'

type BeatFramesProps = {
  envelope: Float32Array | null
  loudness: Float32Array | null
  onsets: Float32Array | null
  bands: Float32Array | null
  sections: Section[]
  duration: number
  position: number
  positionRef: RefObject<number>
  playing: boolean
  onSectionsChange: (sections: Section[]) => void
}

const LANE_HEIGHT = 20
const WAVE_HEIGHT = LANE_HEIGHT
const LEVEL_HEIGHT = LANE_HEIGHT
const HEAT_HEIGHT = LANE_HEIGHT
const SPECTRUM_HEIGHT = LANE_HEIGHT
const LABEL_WIDTH = 0
const GAP = 6

const FRAME_HEIGHT = WAVE_HEIGHT + LEVEL_HEIGHT + HEAT_HEIGHT + SPECTRUM_HEIGHT
const PANEL_HEIGHT = 4 * FRAME_HEIGHT + 3 * GAP

export default function BeatFrames({
  envelope,
  loudness,
  onsets,
  bands,
  sections: givenSections,
  duration,
  position,
  positionRef,
  playing,
  onSectionsChange,
}: BeatFramesProps) {
  const sections = useLiveSectionsValue(givenSections)
  const theme = useTheme()
  const spans = sectionSpans(sections, duration)
  const dragRef = useRef<{ clientX: number; id: string; offsetMs: number; msPerBeat: number } | null>(
    null,
  )
  const applySections = useRafCallback(onSectionsChange)

  const activeSpan = () => {
    const position = positionRef.current
    return spans.find((item) => position >= item.start && position <= item.end) ?? spans[0] ?? null
  }

  const begin = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const active = activeSpan()
    if (!active || active.section.bpm <= 0 || event.button !== 0) return

    dragRef.current = {
      clientX: event.clientX,
      id: active.section.id,
      offsetMs: active.section.offsetMs,
      msPerBeat: 60000 / active.section.bpm,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (!drag) return

    const lane = event.currentTarget.clientWidth
    if (lane <= 0) return

    const shift = ((event.clientX - drag.clientX) / lane) * drag.msPerBeat
    applySections(
      sortSections(
        sections.map((section) =>
          section.id === drag.id
            ? { ...section, offsetMs: Math.max(0, drag.offsetMs - shift) }
            : section,
        ),
      ),
    )
  }

  const end = (event: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const canvasRef = useCanvas((context, width, height) => {
    const position = positionRef.current
    const active =
      spans.find((item) => position >= item.start && position <= item.end) ?? spans[0] ?? null
    if (!active || active.beat <= 0) return

    const elapsed = Math.floor((position - active.start) / active.beat)
    const current = active.start + elapsed * active.beat
    const lane = width - LABEL_WIDTH
    const frames = Math.max(1, Math.floor((height + GAP) / (FRAME_HEIGHT + GAP)))

    for (let frame = 0; frame < frames; frame += 1) {
      const top = frame * (FRAME_HEIGHT + GAP)
      if (top + FRAME_HEIGHT > height) break

      const range: Range = {
        start: current + frame * active.beat,
        end: current + (frame + 1) * active.beat,
      }

      context.save()
      context.translate(LABEL_WIDTH, top)
      context.beginPath()
      context.rect(0, 0, lane, FRAME_HEIGHT)
      context.clip()

      if (envelope) {
        drawEnvelopeStrip(
          context,
          envelope,
          range,
          lane,
          WAVE_HEIGHT,
          theme.palette.primary.main,
        )
      }

      context.translate(0, WAVE_HEIGHT)
      if (loudness) drawLevels(context, loudness, range, lane, LEVEL_HEIGHT)

      context.translate(0, LEVEL_HEIGHT)
      if (onsets) drawHeatmap(context, onsets, range, lane, HEAT_HEIGHT)

      context.translate(0, HEAT_HEIGHT)
      if (bands) drawBands(context, bands, range, lane, SPECTRUM_HEIGHT)

      context.restore()

      if (frame === 0) {
        const played = ((position - current) / active.beat) * lane
        context.strokeStyle = theme.palette.error.main
        context.lineWidth = 2
        context.beginPath()
        context.moveTo(LABEL_WIDTH + played, top)
        context.lineTo(LABEL_WIDTH + played, top + FRAME_HEIGHT)
        context.stroke()
      }
    }
  }, playing, `${position}|${duration}|${sectionSignature(sections)}`)

  return (
    <Paper
      elevation={0}
      sx={{
        width: '100%',
        height: 'auto',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: 0,
      }}
    >
      <Box sx={{ p: 1, flex: 1, minHeight: 0, display: 'flex' }}>
        {spans.length === 0 ? (
          <Typography variant="caption" color="text.secondary">
            No tempo section yet
          </Typography>
        ) : (
          <Box
            component="canvas"
            ref={canvasRef}
      data-trace="BeatFrames"
            onPointerDown={begin}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            sx={{
              display: 'block',
              width: '100%',
              height: PANEL_HEIGHT,
              touchAction: 'none',
              cursor: 'ew-resize',
            }}
          />
        )}
      </Box>
    </Paper>
  )
}
