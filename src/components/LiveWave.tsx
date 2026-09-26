import { useEffect, useRef, type RefObject } from 'react'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import { curveSignature, sectionSignature } from '../draw'
import { applyCurve, type Curve } from '../curve'
import { useCanvasControl } from '../useCanvas'
import { sectionSpans, type Section } from '../timing'
import { useLiveSectionsValue } from '../liveSections'
import { currentTones } from '../theme'

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
  // beats per column in the compiled view: the stretch a bar here means
  slice: number | 'auto'
  // how many bars or beats are laid over one another
  depth: number
  // whether the traces are read between the quietest and loudest point any
  // of them reaches, so what differs between the bars fills the height
  normalise: boolean
  // whether the traces morph from one bar's shapes to the next rather than
  // cutting, and the normalised range glides with them
  motion: boolean
}

export type StructureScope = 'bar' | 'beat'

// An oscilloscope triggered on the bar. The last so many bars of the envelope
// are laid over one bar's width, faint and additive so they build where they
// agree, with
// the beats ruled behind them. A grid that sits on the music stacks the
// traces and puts their peaks on the beat lines. An offset that is wrong
// keeps them stacked but slides every peak off its line by the same amount,
// and the direction says which way to move. A tempo that is wrong fans them:
// each older bar's peaks slide a little further from the newest bar's, in
// the direction the tempo is out, and every bar back adds its share of the
// per bar error to see.
const TALL = 84
const EDGE = 4
const MOST_BEATS = 8

// Every trace the same weight and faint, laid down with an additive blend:
// where traces cross or lie together the mint builds towards white, so the
// stacked bars burn as one bright line and a fan reads as many pale ones.
// The fainter the more there are, so the stack burns about as bright at any
// depth rather than saturating at thirty two
const TRACE_WIDTH = 1.4
function traceAlpha(depth: number): number {
  return Math.min(0.5, Math.max(0.03, 2.2 / depth))
}
// the bar the playhead is in, drawn in blue over the mint of the ones before
// it and at full strength, so the newest trace can be told from the stack it
// either joins or leaves
const NEWEST = '#5aa8ff'
const NEWEST_ALPHA = 0.9
// how long a bar takes to roll into the past, in milliseconds
const ROLL_MS = 160

// an ease out, cubic: the roll leaves the mark at once and slows into its
// new shape, never past it
function eased(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

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
  slice,
  depth,
  normalise,
  motion,
}: LiveWaveProps) {
  // the bar last drawn and when it changed, with the range it was drawn on,
  // so the next draw can ease from it; and a frame asked for while a roll
  // is under way and the song is not playing
  const rollRef = useRef<{
    key: string
    at: number
    low: number
    scale: number
    fromLow: number
    fromScale: number
    // each slot's shape as last drawn settled, and as it was before the roll,
    // so a slot's trace can morph from the one shape into the other
    shapes: Map<number, Float32Array>
    fromShapes: Map<number, Float32Array>
  }>({
    key: '',
    at: 0,
    low: 0,
    scale: 1,
    fromLow: 0,
    fromScale: 1,
    shapes: new Map(),
    fromShapes: new Map(),
  })
  const frameRef = useRef(0)
  const repaintRef = useRef<() => void>(() => undefined)
  const sections = useLiveSectionsValue(givenSections)
  const theme = useTheme()
  const lutRef = useRef({ signature: '', lut: shapeLut(curve) })
  useEffect(() => {
    const signature = curveSignature(curve)
    if (lutRef.current.signature !== signature) lutRef.current = { signature, lut: shapeLut(curve) }
  }, [curve])
  useEffect(() => () => cancelAnimationFrame(frameRef.current), [])

  const { canvasRef, repaint } = useCanvasControl(
    (context, width, height) => {
      if (!envelope || envelope.length === 0) return
      const lut = lutRef.current.lut
      const at = positionRef.current
      const spans = sectionSpans(sections, duration)
      const span = spans.find((item) => at >= item.start && at <= item.end) ?? spans[0]
      if (!span || span.beat <= 0) return

      // the stretch and its cells: a bar ruled by the grid setting, as a
      // column is, or a beat ruled by the sub-grid. With the beats between
      // the guides, each is started early by half of its own cell, the way a
      // column starts half a division early: the lines move with the window,
      // so the beat, or the sub-beat, stays on its line and the window's
      // edges fall between them
      // a bar here is a column there: the slice setting in beats, or the
      // meter when the slice is left to the view
      const meter = Math.min(MOST_BEATS, Math.max(1, span.section.meter))
      const column = slice === 'auto' ? meter : Math.max(1, slice)
      const cells = scope === 'bar' ? Math.max(1, divisions) : Math.max(1, subdivisions)
      const bar = scope === 'bar' ? span.beat * column : span.beat
      const early = centred ? bar / (2 * cells) : 0
      const index = Math.floor((at - span.start + early) / bar)
      const start = span.start - early + index * bar
      const floor = height - EDGE
      const reach = height - 2 * EDGE

      const phase = Math.min(1, Math.max(0, (at - start) / bar))

      // the cells ruled behind, moved by the same shift as the window so the
      // beats stay on the lines as they do in the columns, and the sub-grid
      // between them fainter, as under the columns: in bar mode a beat is
      // split by the sub-grid, in beat mode the cells already are the sub-grid
      context.lineWidth = 1
      const offset = early / bar
      const fine = scope === 'bar' ? Math.max(1, subdivisions) : 1
      const steps = cells * fine
      for (let line = -steps; line <= steps; line += 1) {
        const share = line / steps + offset
        if (share < 0 || share > 1) continue
        const x = Math.round(share * width) + 0.5
        const onCell = ((line % fine) + fine) % fine === 0
        const onBar = ((line % steps) + steps) % steps === 0
        context.strokeStyle = theme.palette.text.primary
        context.globalAlpha = onBar ? 0.7 : onCell ? 0.42 : 0.2
        context.beginPath()
        context.moveTo(x, 0)
        context.lineTo(x, height)
        context.stroke()
      }
      context.globalAlpha = 1

      // a trace per bar: each pixel column the level at that place in that
      // bar, read through the curve. A column before the section began holds
      // no level and is left out. Normalised, the traces are read between the
      // quietest and the loudest point any of them reaches, so a loud master
      // that hugs the top is spread over the height and the bars differ
      // where they differ
      const frames = envelope.length
      const traces: { levels: Float32Array; first: number; colour: string; alpha: number; slot: number }[] = []
      let least = Infinity
      let most = 0
      const gather = (from: number, colour: string, alpha: number, slot: number) => {
        const levels = new Float32Array(width + 1)
        let first = -1
        for (let x = 0; x <= width; x += 1) {
          const moment = from + (x / width) * bar
          if (moment < span.start || moment < 0) continue
          if (first < 0) first = x
          const frame = Math.min(frames - 1, Math.max(0, (moment * frames) | 0))
          const value = envelope[frame]
          const level = Number.isFinite(value) ? lut[((value < 1 ? Math.max(0, value) : 1) * (LEVELS - 1) + 0.5) | 0] : 0
          levels[x] = level
          if (level < least) least = level
          if (level > most) most = level
        }
        if (first >= 0) traces.push({ levels, first, colour, alpha, slot })
      }

      // where in a roll the picture is: nought as a new bar begins, one once
      // it has settled. Without motion it is always settled
      const now = performance.now()
      const roll = rollRef.current
      const key = `${scope}|${start.toFixed(9)}`
      if (roll.key !== key) {
        roll.fromLow = roll.low
        roll.fromScale = roll.scale
        roll.fromShapes = roll.shapes
        roll.shapes = new Map()
        roll.at = roll.key === '' || !motion ? 0 : now
        roll.key = key
      }
      const t = motion ? eased(Math.min(1, (now - roll.at) / ROLL_MS)) : 1

      const alpha = traceAlpha(depth)
      for (let back = depth; back >= 1; back -= 1) {
        const from = start - bar * back
        if (from + bar <= span.start) continue
        // only the shapes move during a roll: every slot keeps its own colour
        // and weight throughout, so the blue is always the bar the playhead
        // is in and the mint always the ones before
        if (back === depth) continue
        gather(from, currentTones().mint, alpha, back)
      }
      // the bar the playhead is in last, so it is drawn on top, in blue
      gather(start, NEWEST, NEWEST_ALPHA, 0)

      // each slot remembers its settled shape, and while a roll lasts is
      // drawn part way between the shape it held before and the one it
      // holds now: the traces shift into their new places rather than jump
      for (const held of traces) roll.shapes.set(held.slot, held.levels)
      const shapeOf = (held: { levels: Float32Array; slot: number }) => {
        if (t >= 1) return held.levels
        const was = roll.fromShapes.get(held.slot)
        if (!was || was.length !== held.levels.length) return held.levels
        const mixed = new Float32Array(held.levels.length)
        for (let x = 0; x < mixed.length; x += 1) mixed[x] = was[x] + (held.levels[x] - was[x]) * t
        return mixed
      }

      const settledLow = normalise && most > least ? least : 0
      const settledScale = normalise && most > least ? 1 / (most - least) : 1
      roll.low = settledLow
      roll.scale = settledScale
      const low = roll.fromLow + (settledLow - roll.fromLow) * t
      const scale = roll.fromScale + (settledScale - roll.fromScale) * t

      // a roll under way with the song still asks for the next frame itself
      if (t < 1 && !playing) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = requestAnimationFrame(() => repaintRef.current())
      }

      context.save()
      context.globalCompositeOperation = 'lighter'
      context.lineWidth = TRACE_WIDTH
      for (const held of traces) {
        const levels = shapeOf(held)
        context.strokeStyle = held.colour
        context.globalAlpha = held.alpha
        context.beginPath()
        for (let x = held.first; x <= width; x += 1) {
          const y = floor - Math.min(1, Math.max(0, (levels[x] - low) * scale)) * reach
          if (x === held.first) context.moveTo(x, y)
          else context.lineTo(x, y)
        }
        context.stroke()
      }
      context.restore()

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
    `${position}|${envelope?.length}|${curveSignature(curve)}|${sectionSignature(sections)}|${centred}|${divisions}|${scope}|${subdivisions}|${slice}|${depth}|${normalise}|${motion}`,
  )
  useEffect(() => {
    repaintRef.current = repaint
  }, [repaint])

  return (
    <Box
      component="canvas"
      ref={canvasRef}
      data-trace="LiveWave"
      title={`The last ${depth} ${scope === 'bar' ? 'bars' : 'beats'} laid over one another: stacked when the grid sits on the music, fanned when the tempo is out, slid off the lines when the offset is`}
      sx={{ display: 'block', width: '100%', height: TALL, flex: '0 0 auto' }}
    />
  )
}
