import { useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import TopBar from './components/TopBar'
import StatusBar from './components/StatusBar'
import Transport from './components/Transport'
import Volume from './components/Volume'
import Waveform from './components/Waveform'
import Overview from './components/Overview'
import PlayheadRail from './components/PlayheadRail'
import MarkerRail from './components/MarkerRail'
import SectionRail from './components/SectionRail'
import SectionBlocks from './components/SectionBlocks'
import RangeStrip from './components/RangeStrip'
import VerticalWaveform from './components/VerticalWaveform'
import LiveWave from './components/LiveWave'
import RulerSlider from './components/RulerSlider'
import ResolveBpm from './components/ResolveBpm'
import SectionBar from './components/SectionBar'
import CurvePanel from './components/CurvePanel'
import type { WaveStyle } from './draw'
import BeatFrames from './components/BeatFrames'
import FloatingWindow from './components/FloatingWindow'
import TracePanel from './components/TracePanel'
import SectionTuner from './components/SectionTuner'
import TimingPanel from './components/TimingPanel'
import BarGrid from './components/BarGrid'
import {
  computeBands,
  computeLoudness,
  computeEnvelope,
  computeOnsets,
  levelOf,
  levelsOf,
  computePeaks,
  toMono,
} from './audio'
import { useAudio } from './useAudio'
import { clampRange, type Range } from './range'
import { resolveTempo } from './bpm'
import { readOsz } from './osu'
import { fitTrack, type Fit, type Progress } from './fit'
import {
  createSection,
  DEFAULT_METER,
  MAX_BPM,
  MIN_BPM,
  sectionSpans,
  sortSections,
  type Section,
} from './timing'
import type { EditMode } from './mode'
import { DEFAULT_CURVES, applyCurve, type Curve, type CurveKey, type CurveSet } from './curve'
import { useHistory } from './useHistory'
import { tick, TRACING } from './trace'

const INITIAL_RANGE: Range = { start: 0, end: 0.25 }
// a beatmap arrives already timed, so it opens on the whole song: there is
// nothing to drag into place, and the point is to see the timing it brought
const WHOLE_RANGE: Range = { start: 0, end: 1 }
const FRAMES_WIDTH = 420
const FALL_RANGE = 10.5
type Doc = {
  markers: number[]
  sections: Section[]
  curves: CurveSet
}

// The envelope read through the curve, as a level first because the curve is drawn
// over nought to one and a loud master runs past it.
function throughCurve(envelope: Float32Array, curve: Curve): Float32Array {
  const out = new Float32Array(envelope.length)
  for (let at = 0; at < envelope.length; at += 1) {
    out[at] = applyCurve(levelOf(envelope[at]), curve)
  }
  return out
}

// How long a frame may spend stepping the fit. Chosen by measurement: at eight
// the fit takes 10.4 seconds and holds a median frame of 10ms, at fourteen it
// takes 6.2 but spends half its frames over budget. Eleven keeps the median
// inside a frame and finishes in 7.8.
const FIT_BUDGET_MS = 11
const DEFAULT_BPM = 120

export default function App() {
  tick('App render')
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [peaks, setPeaks] = useState<Float32Array | null>(null)
  const [samples, setSamples] = useState<Float32Array | null>(null)
  const [envelope, setEnvelope] = useState<Float32Array | null>(null)
  const [sampleRate, setSampleRate] = useState(44100)
  const [onsets, setOnsets] = useState<Float32Array | null>(null)
  const [loudness, setLoudness] = useState<Float32Array | null>(null)
  const [bands, setBands] = useState<Float32Array | null>(null)
  // what is drawn: the amplitudes as levels in decibels, the scale the curve is
  // on and the loudness lane already uses. The fitting reads the envelope as it is
  const levels = useMemo(() => (envelope ? levelsOf(envelope) : null), [envelope])
  const bandLevels = useMemo(() => (bands ? levelsOf(bands) : null), [bands])
  const [range, setRange] = useState<Range>(INITIAL_RANGE)
  const [loadingName, setLoadingName] = useState<string | null>(null)
  const [mode, setMode] = useState<EditMode>('none')
  const [doc, setDoc, history] = useHistory<Doc>({
    markers: [],
    sections: [],
    curves: DEFAULT_CURVES,
  })
  const { markers, sections, curves } = doc

  const setMarkers = (next: number[] | ((current: number[]) => number[])) =>
    setDoc((current) => ({
      ...current,
      markers: typeof next === 'function' ? next(current.markers) : next,
    }))

  const setSections = (next: Section[] | ((current: Section[]) => Section[])) =>
    setDoc((current) => ({
      ...current,
      sections: typeof next === 'function' ? next(current.sections) : next,
    }))

  const setCurve = (key: CurveKey, next: Curve) =>
    setDoc((current) => ({ ...current, curves: { ...current.curves, [key]: next } }))

  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [anchorId, setAnchorId] = useState<string | null>(null)
  const [ghost, setGhost] = useState<number | null>(null)
  const [fallSpeed, setFallSpeed] = useState(FALL_RANGE - 0.5)
  const [barGrid, setBarGrid] = useState(true)
  const [slice, setSlice] = useState<number | 'auto'>(16)
  const [lane, setLane] = useState<number | 'all'>(0)
  const [cursorMode, setCursorMode] = useState<GlobalCompositeOperation>('difference')
  const [curveOpen, setCurveOpen] = useState(false)
  const [framesOpen, setFramesOpen] = useState(false)
  const [waveStyle, setWaveStyle] = useState<WaveStyle>('colour')
  const [traceOpen, setTraceOpen] = useState(false)
  const [follow, setFollow] = useState(false)
  const [divisions, setDivisions] = useState(4)
  const [colormap, setColormap] = useState(0)
  const [fitting, setFitting] = useState(false)
  // whether the next fit reads the envelope through the amplitude curve
  const [curved, setCurved] = useState(false)
  const fitRef = useRef({ meter: DEFAULT_METER })
  const changeRange = (next: Range | ((current: Range) => Range)) => setRange(next)
  const {
    playing,
    position,
    positionRef,
    duration,
    volume,
    muted,
    rate,
    toggle,
    seek,
    playFrom,
    reset,
    setVolume,
    setMuted,
    setRate,
  } = useAudio(file)

  const focus = editingSection
    ? (sectionSpans(sections, duration).find((item) => item.section.id === editingSection) ?? null)
    : null

  const anchorSection = (at: number) => {
    const offsetMs = at * duration * 1000
    const existing = sections.find((section) => Math.abs(section.offsetMs - offsetMs) < 1)
    if (existing) {
      setAnchorId(existing.id)
      return
    }

    const previous = sections[sections.length - 1]
    const created = createSection(offsetMs, previous?.bpm ?? 120, previous?.meter)
    setAnchorId(created.id)
    setSections((current) => sortSections([...current, created]))
  }

  const syncTempo = (next: number[]) => {
    if (!anchorId) return
    const resolved = resolveTempo(next, duration)
    const anchor = resolved ? resolved.anchor : Math.min(...next)
    if (!Number.isFinite(anchor)) return

    setSections((current) =>
      sortSections(
        current.map((section) =>
          section.id === anchorId
            ? {
                ...section,
                offsetMs: anchor * duration * 1000,
                bpm: resolved ? resolved.bpm : section.bpm,
              }
            : section,
        ),
      ),
    )
  }

  const changeMarkers = (next: number[]) => {
    setMarkers(next)
    syncTempo(next)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
      }

      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase()

        if (key === 'z') {
          event.preventDefault()
          if (event.shiftKey) history.redo()
          else history.undo()
          return
        }

        if (key === 'y') {
          event.preventDefault()
          history.redo()
          return
        }
      }

      if (event.code !== 'Space' || event.repeat) return

      event.preventDefault()
      toggle()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggle, history])

  useEffect(() => {
    fitRef.current.meter = sections[0]?.meter ?? DEFAULT_METER
  })

  // The fit runs a step per frame rather than solving in one go, so the
  // sections appear along the track as they are found and the compiled view
  // straightens while it works.
  useEffect(() => {
    if (!fitting || !envelope || duration <= 0) return

    const durationMs = duration * 1000
    // the meter the counting is done under; publish re-reads it so a change
    // mid-fit still reaches the sections
    // The amplitude curve shapes what the fitting reads, the same way it shapes
    // what the compiled view draws. Measured on four tracks it costs accuracy —
    // a steady song goes from one section to eight, and a live take from 12.1 ms
    // to 38.7 — because the curve flattens both ends and the ends carry what
    // tells one grid from another. It is here to be tried on material where
    // that is wrong.
    const read = curved ? throughCurve(envelope, curves.wave) : envelope
    const run = fitTrack(read, sampleRate, durationMs, fitRef.current.meter)

    const publish = (found: Fit[]) => {
      const meter = fitRef.current.meter
      setSections(
        sortSections(
          found.map((fit) =>
            createSection(fit.offsetMs, Math.min(MAX_BPM, Math.max(MIN_BPM, fit.bpm)), meter),
          ),
        ),
      )
    }

    // As many steps as fit in a frame, rather than one. A rung of the ladder
    // takes a fortieth of a millisecond and a frame is sixteen, so stepping once
    // a frame spends the whole fit waiting: the run took nine seconds of wall
    // clock for seven of work. Counting a window takes longer than a frame on
    // its own, which no budget can help, so the budget is spent rather than
    // guarded — a step already begun runs to its end.
    let frame = requestAnimationFrame(function tick() {
      const until = performance.now() + FIT_BUDGET_MS
      let last: Progress | null = null

      do {
        const step = run.next()

        if (step.done) {
          publish(step.value.map((part) => part.fit))
          setFitting(false)
          return
        }

        if (step.value) last = step.value
      } while (performance.now() < until)

      if (last) publish([...last.parts.map((part) => part.fit), last.working])

      frame = requestAnimationFrame(tick)
    })

    return () => cancelAnimationFrame(frame)
  }, [fitting, envelope, duration, sampleRate, curved, curves.wave])

  const load = async (source: File) => {
    setLoadingName(source.name)
    const context = new AudioContext()
    try {
      const beatmap = source.name.toLowerCase().endsWith('.osz') ? await readOsz(source) : null
      const next = beatmap ? beatmap.audio : source
      const buffer = await context.decodeAudioData(await next.arrayBuffer())
      const mono = toMono(buffer)
      setSamples(mono)
      setEnvelope(computeEnvelope(mono, buffer.sampleRate))
      setPeaks(computePeaks(mono))
      setOnsets(computeOnsets(mono))
      setLoudness(computeLoudness(mono))
      setBands(computeBands(mono, buffer.sampleRate))
      setSampleRate(buffer.sampleRate)
      setRange(beatmap ? WHOLE_RANGE : INITIAL_RANGE)
      setDoc((current) => ({
        markers: [],
        // a plain audio file arrives with no timing at all, so it opens on a
        // grid that can be dragged into place rather than on an empty view
        sections: beatmap ? beatmap.sections : [createSection(0, DEFAULT_BPM)],
        curves: current.curves,
      }))
      history.reset()
      setAnchorId(null)
      setFile(next)
    } finally {
      await context.close()
      setLoadingName(null)
    }
  }

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', flex: 1, minWidth: 0 }}>
      <TopBar
        sections={sections}
        duration={duration}
        positionRef={positionRef}
        playing={playing}
        onOpen={() => inputRef.current?.click()}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={history.undo}
        onRedo={history.redo}
        compiled={barGrid}
        onCompiledChange={setBarGrid}
        fitting={fitting}
        onFittingChange={setFitting}
        canFit={Boolean(envelope) && sections.length > 0}
        curved={curved}
        onCurvedChange={setCurved}
        lane={lane}
        onLaneChange={setLane}
        slice={slice}
        onSliceChange={setSlice}
        divisions={divisions}
        onDivisionsChange={setDivisions}
        colormap={colormap}
        onColormapChange={setColormap}
        cursorMode={cursorMode}
        onCursorModeChange={setCursorMode}
        curveOpen={curveOpen}
        onCurveOpenChange={setCurveOpen}
        framesOpen={framesOpen}
        onFramesOpenChange={setFramesOpen}
        waveStyle={waveStyle}
        onWaveStyleChange={setWaveStyle}
        traceOpen={traceOpen}
        onTraceOpenChange={setTraceOpen}
        follow={follow}
        onFollowChange={setFollow}
      />
      {curveOpen ? (
        <CurvePanel
          curves={curves}
          sources={{ envelope: levels, loudness, onsets, bands: bandLevels }}
          onCurveChange={setCurve}
          onClose={() => setCurveOpen(false)}
        />
      ) : null}
      {framesOpen ? (
        <FloatingWindow
          title="Beat frames"
          width={FRAMES_WIDTH}
          left={320}
          onClose={() => setFramesOpen(false)}
        >
          <BeatFrames
            envelope={levels}
            loudness={loudness}
            onsets={onsets}
            bands={bandLevels}
            sections={sections}
            duration={duration}
            position={position}
            positionRef={positionRef}
            playing={playing}
            onSectionsChange={setSections}
          />
        </FloatingWindow>
      ) : null}
      <Box
        component="main"
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          px: 2,
          py: 1.5,
        }}
      >
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', gap: 1 }}>
          <Box
            sx={{
              width: 260,
              flex: '0 0 auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              minHeight: 0,
            }}
          >
            <Box sx={{ flex: 1, minHeight: 0 }}>
              <TimingPanel
                embedded
                sections={sections}
                position={position}
                positionRef={positionRef}
                playing={playing}
                durationMs={duration * 1000}
                onJump={(fromMs, toMs) => {
                  if (duration <= 0) return
                  setRange(
                    clampRange({ start: fromMs / 1000 / duration, end: toMs / 1000 / duration }),
                  )
                }}
                onSeekMs={(ms) => {
                  if (duration > 0) playFrom(ms / 1000 / duration)
                }}
                onSectionsChange={setSections}
                onEditingChange={setEditingSection}
              />
            </Box>
          </Box>
          <Box
            sx={{
              flex: 4,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {barGrid ? null : (
              <>
                <SectionRail
                  sections={sections}
                  range={range}
                  duration={duration}
                  onSectionsChange={setSections}
                />
                <MarkerRail
                  markers={markers}
                  range={range}
                  enabled={Boolean(samples)}
                  focus={focus}
                  ghost={mode === 'marker' ? ghost : null}
                  onMarkersChange={changeMarkers}
                />
                <PlayheadRail
                  position={position}
                  positionRef={positionRef}
                  playing={playing}
                  range={range}
                  enabled={Boolean(samples)}
                  onSeek={seek}
                />
              </>
            )}
            <Box sx={{ flex: 1, minHeight: 0, display: barGrid ? 'none' : 'block' }}>
              <Waveform
                samples={samples}
                envelope={levels}
                position={position}
                positionRef={positionRef}
                playing={playing}
                markers={markers}
                focus={focus}
                sections={sections}
                duration={duration}
                curve={curves.wave}
                range={range}
                placing={mode === 'none' ? null : mode}
                ghost={mode === 'none' ? null : ghost}
                onRangeChange={changeRange}
                onGhostChange={setGhost}
                onPlace={(at) => {
                  if (mode === 'marker') {
                    const next = [...markers, at]
                    if (markers.length === 0) anchorSection(at)
                    else syncTempo(next)
                    setMarkers(next)
                    return
                  }
                  if (mode === 'section') {
                    setSections((current) =>
                      sortSections([
                        ...current,
                        createSection(
                          at * duration * 1000,
                          current[current.length - 1]?.bpm ?? 120,
                        ),
                      ]),
                    )
                  }
                }}
              />
            </Box>
            {barGrid ? (
              <>
                <Box sx={{ flex: 1, minHeight: 0 }}>
                  <BarGrid
                    envelope={levels}
                    loudness={loudness}
                    onsets={onsets}
                    bands={bandLevels}
                    sections={sections}
                    duration={duration}
                    position={position}
                    positionRef={positionRef}
                    playing={playing}
                    curves={curves}
                    range={range}
                    onRangeChange={changeRange}
                    onSectionsChange={setSections}
                    onSeek={seek}
                    slice={slice}
                    lane={lane}
                    divisions={divisions}
                    colormap={colormap}
                    cursorMode={cursorMode}
                    waveStyle={waveStyle}
                    follow={follow}
                  />
                </Box>
              </>
            ) : null}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <LiveWave
              envelope={levels}
              curve={curves.wave}
              colormap={colormap}
              sections={sections}
              duration={duration}
              position={position}
              positionRef={positionRef}
              playing={playing}
            />
            <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
              <VerticalWaveform
                samples={samples}
                envelope={levels}
                sections={sections}
                position={position}
                positionRef={positionRef}
                playing={playing}
                duration={duration}
                seconds={FALL_RANGE - fallSpeed}
                onSeek={seek}
              />
              <Paper
                elevation={4}
                sx={{
                  position: 'absolute',
                  left: '50%',
                  bottom: 8,
                  width: '60%',
                  transform: 'translateX(-50%)',
                  borderRadius: 999,
                  overflow: 'hidden',
                }}
              >
                <RulerSlider
                  value={fallSpeed}
                  min={0.5}
                  max={10}
                  step={0.1}
                  pixelsPerStep={6}
                  majorEvery={10}
                  format={(value) => `${(FALL_RANGE - value).toFixed(1)}s`}
                  onChange={setFallSpeed}
                />
              </Paper>
            </Box>
          </Box>
        </Box>
        <Transport
          playing={playing}
          disabled={!file}
          onToggle={toggle}
          onReset={reset}
          rate={rate}
          onRateChange={setRate}
          left={
            file ? (
              <SectionTuner
                sections={sections}
                duration={duration}
                position={position}
                positionRef={positionRef}
                playing={playing}
                onSectionsChange={setSections}
              />
            ) : null
          }
          above={
            mode === 'section' ? (
              <SectionBar
                count={sections.length}
                onExit={() => {
                  setMode('none')
                  setGhost(null)
                }}
              />
            ) : mode === 'marker' && markers.length >= 2 ? (
              <ResolveBpm
                latest={sections[sections.length - 1] ?? null}
                onResolve={() => {
                  const resolved = resolveTempo(markers, duration)
                  if (!resolved) return
                  const offsetMs = resolved.anchor * duration * 1000
                  setSections((current) => {
                    const index = current.findIndex(
                      (section) => Math.abs(section.offsetMs - offsetMs) < 1,
                    )
                    if (index >= 0) {
                      return current.map((section, at) =>
                        at === index ? { ...section, bpm: resolved.bpm } : section,
                      )
                    }
                    return sortSections([...current, createSection(offsetMs, resolved.bpm)])
                  })

                  const next = sortSections(sections).find(
                    (section) => section.offsetMs > offsetMs + 1,
                  )
                  const end = next ? next.offsetMs / 1000 / duration : 1
                  setMarkers((current) =>
                    current.filter((marker) => marker < resolved.anchor || marker > end),
                  )
                  setAnchorId(null)
                  setMode('none')
                  setGhost(null)
                }}
                onExit={() => {
                  setMode('none')
                  setGhost(null)
                }}
              />
            ) : null
          }
          right={
            <Volume
              volume={volume}
              muted={muted}
              disabled={!file}
              onVolumeChange={setVolume}
              onMutedChange={setMuted}
            />
          }
        />
        <Box sx={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column' }}>
          <SectionBlocks
            sections={sections}
            duration={duration}
            range={range}
            position={position}
            positionRef={positionRef}
            playing={playing}
            onRangeChange={changeRange}
            onSeek={seek}
          />
          <PlayheadRail
            position={position}
            positionRef={positionRef}
            playing={playing}
            range={range}
            enabled={Boolean(samples)}
            onSeek={seek}
          />
          <RangeStrip
            envelope={levels}
            sections={sections}
            duration={duration}
            curve={curves.wave}
            range={range}
            position={position}
            positionRef={positionRef}
            playing={playing}
            onSeek={seek}
          />
          <PlayheadRail
            position={position}
            positionRef={positionRef}
            playing={playing}
            enabled={Boolean(peaks)}
            onSeek={seek}
          />
          <Box sx={{ height: 64 }}>
            <Overview
              peaks={peaks}
              position={position}
              positionRef={positionRef}
              playing={playing}
              curve={curves.wave}
              range={range}
              onRangeChange={changeRange}
            />
          </Box>
        </Box>
      </Box>
      <StatusBar
        fileName={file?.name ?? null}
        loadingName={loadingName}
        positionRef={positionRef}
        position={position}
        duration={duration}
        playing={playing}
      />
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.osz"
        hidden
        onChange={(event) => {
          const next = event.target.files?.[0]
          event.target.value = ''
          if (next) void load(next)
        }}
      />
    </Box>
    {TRACING && traceOpen ? <TracePanel /> : null}
    </Box>
  )
}
