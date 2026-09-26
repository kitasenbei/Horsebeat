import { useEffect, useRef, type RefObject } from 'react'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import { curveSignature, sectionSignature } from '../draw'
import { applyCurve, type Curve } from '../curve'
import { useCanvas } from '../useCanvas'
import { sectionSpans, type Section } from '../timing'
import { useLiveSectionsValue } from '../liveSections'
import { MINT } from '../theme'

type LiveWaveProps = {
  envelope: Float32Array | null
  curve: Curve
  sections: Section[]
  duration: number
  position: number
  positionRef: RefObject<number>
  playing: boolean
  // whether the columns start half a division early, so this strip's bar
  // starts where the compiled view's columns do
  centred: boolean
  divisions: number
  // the stretch laid over itself: a bar ruled by its beats, or one beat ruled
  // by the sub-grid
  scope: StructureScope
  subdivisions: number
}

export type StructureScope = 'bar' | 'beat'

// An oscilloscope triggered on the bar. The last few bars of the envelope
// are laid over one bar's width, the newest bright and the older fading, with
// the beats ruled behind them. A grid that sits on the music stacks the
// traces and puts their peaks on the beat lines. An offset that is wrong
// keeps them stacked but slides every peak off its line by the same amount,
// and the direction says which way to move. A tempo that is wrong fans them:
// each older bar's peaks slide a little further from the newest bar's, in
// the direction the tempo is out, and four bars give four times the per bar
// error to see.
const TALL = 84
const BARS_BACK = 4
const EDGE = 4
const MOST_BEATS = 8

// the traces from newest to oldest, in the shell's mint fading to the grey
// of the panel's ink
const TRACE_ALPHA = [1, 0.62, 0.38, 0.22]

// The amplitude curve as a table of the same size the compiled view uses, so
// a moment here is read through exactly the steps its pixels are painted
// through.
const LEVELS = 256

function shapeLut(curve: Curve): Float32Array {
  const lut = new Float32Array(LEVELS)
  for (let step = 0; step < LEVELS; step += 1) lut[step] = applyCurve(step / (LEVELS - 1), curve)
  return lut
}

export default function LiveWave({
  envelope,
  curve,
  sections: givenSections,
  duration,
  position,
  positionRef,
  playing,
  centred,
  divisions,
  scope,
  subdivisions,
}: LiveWaveProps) {
  const sections = useLiveSectionsValue(givenSections)
  const theme = useTheme()
  const lutRef = useRef({ signature: '', lut: shapeLut(curve) })
  useEffect(() => {
    const signature = curveSignature(curve)
    if (lutRef.current.signature !== signature) lutRef.current = { signature, lut: shapeLut(curve) }
  }, [curve])

  const canvasRef = useCanvas(
    (context, width, height) => {
      if (!envelope || envelope.length === 0) return
      const lut = lutRef.current.lut
      const at = positionRef.current
      const spans = sectionSpans(sections, duration)
      const span = spans.find((item) => at >= item.start && at <= item.end) ?? spans[0]
      if (!span || span.beat <= 0) return

      // the stretch and its cells: a bar in beats, or a beat in the sub-grid.
      // Either is started early by the same stretch of time the columns are,
      // half a division of a column, so a beat sits against the lines here
      // exactly as it does there; a shift longer than the stretch wraps
      const meter = Math.min(MOST_BEATS, Math.max(1, span.section.meter))
      const cells = scope === 'bar' ? meter : Math.max(1, subdivisions)
      const bar = scope === 'bar' ? span.beat * meter : span.beat
      const shift = centred ? (span.beat * meter) / (2 * Math.max(1, divisions)) : 0
      const early = shift % bar
      const index = Math.floor((at - span.start + early) / bar)
      const start = span.start - early + index * bar
      const floor = height - EDGE
      const reach = height - 2 * EDGE

      const phase = Math.min(1, Math.max(0, (at - start) / bar))

      // the cells ruled behind, moved by the same shift as the window so the
      // beats stay on the lines as they do in the columns; the line at a
      // beat is a little stronger than one within it
      context.lineWidth = 1
      const offset = early / bar
      for (let line = -1; line <= cells; line += 1) {
        const share = line / cells + offset
        if (share < 0 || share > 1) continue
        const x = Math.round(share * width) + 0.5
        context.strokeStyle = theme.palette.text.secondary
        context.globalAlpha = ((line % cells) + cells) % cells === 0 ? 0.5 : 0.25
        context.beginPath()
        context.moveTo(x, 0)
        context.lineTo(x, height)
        context.stroke()
      }
      context.globalAlpha = 1

      // a trace per bar, oldest first so the newest lies on top: each pixel
      // column the level at that place in that bar, read through the curve
      const frames = envelope.length
      for (let back = BARS_BACK - 1; back >= 0; back -= 1) {
        const from = start - bar * back
        // before the section began there is no bar to compare with
        if (from + bar <= span.start) continue
        context.strokeStyle = MINT
        context.globalAlpha = TRACE_ALPHA[back] ?? 0.2
        context.lineWidth = back === 0 ? 1.6 : 1.2
        context.beginPath()
        let drawn = false
        for (let x = 0; x <= width; x += 1) {
          const moment = from + (x / width) * bar
          if (moment < span.start || moment < 0) continue
          const frame = Math.min(frames - 1, Math.max(0, (moment * frames) | 0))
          const value = envelope[frame]
          const level = Number.isFinite(value) ? lut[((value < 1 ? Math.max(0, value) : 1) * (LEVELS - 1) + 0.5) | 0] : 0
          const y = floor - level * reach
          if (!drawn) {
            context.moveTo(x, y)
            drawn = true
          } else context.lineTo(x, y)
        }
        context.stroke()
      }
      context.globalAlpha = 1

      // where the playhead stands in the stretch
      const x = Math.round(phase * width) + 0.5
      context.strokeStyle = theme.palette.error.main
      context.lineWidth = 1.5
      context.beginPath()
      context.moveTo(x, 0)
      context.lineTo(x, height)
      context.stroke()
    },
    playing,
    `${position}|${envelope?.length}|${curveSignature(curve)}|${sectionSignature(sections)}|${centred}|${divisions}|${scope}|${subdivisions}`,
  )

  return (
    <Box
      component="canvas"
      ref={canvasRef}
      data-trace="LiveWave"
      title={`The last four ${scope === 'bar' ? 'bars' : 'beats'} laid over one another: stacked when the grid sits on the music, fanned when the tempo is out, slid off the lines when the offset is`}
      sx={{ display: 'block', width: '100%', height: TALL, flex: '0 0 auto' }}
    />
  )
}
