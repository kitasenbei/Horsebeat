import { useEffect, useRef, useState } from 'react'
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
import RulerSlider from './components/RulerSlider'
import AnalysisLanes from './components/AnalysisLanes'
import ResolveBpm from './components/ResolveBpm'
import SectionBar from './components/SectionBar'
import CurvePanel from './components/CurvePanel'
import TimingPanel from './components/TimingPanel'
import BarGrid from './components/BarGrid'
import BarGridControls from './components/BarGridControls'
import {
  computeBands,
  computeLoudness,
  computeEnvelope,
  computeOnsets,
  computePeaks,
  toMono,
} from './audio'
import { useAudio } from './useAudio'
import { clampRange, type Range } from './range'
import { resolveTempo } from './bpm'
import { readOsz } from './osu'
import { mergeStep, refineScan, scanBlock, type Fit, type Scan } from './fit'
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
import { DEFAULT_CURVE, type Curve } from './curve'
import { useHistory } from './useHistory'

const INITIAL_RANGE: Range = { start: 0, end: 0.25 }
const FALL_RANGE = 10.5
type Doc = {
  markers: number[]
  sections: Section[]
  curve: Curve
}

const FOLLOW_EDGE = 0.8
const FOLLOW_LEAD = 0.2
const FOLLOW_GRACE = 2000
const DEFAULT_BPM = 120

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [peaks, setPeaks] = useState<Float32Array | null>(null)
  const [samples, setSamples] = useState<Float32Array | null>(null)
  const [envelope, setEnvelope] = useState<Float32Array | null>(null)
  const [sampleRate, setSampleRate] = useState(44100)
  const [onsets, setOnsets] = useState<Float32Array | null>(null)
  const [loudness, setLoudness] = useState<Float32Array | null>(null)
  const [bands, setBands] = useState<Float32Array | null>(null)
  const [range, setRange] = useState<Range>(INITIAL_RANGE)
  const [loadingName, setLoadingName] = useState<string | null>(null)
  const [mode, setMode] = useState<EditMode>('none')
  const [doc, setDoc, history] = useHistory<Doc>({
    markers: [],
    sections: [],
    curve: DEFAULT_CURVE,
  })
  const { markers, sections, curve } = doc

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

  const setCurve = (next: Curve) => setDoc((current) => ({ ...current, curve: next }))

  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [anchorId, setAnchorId] = useState<string | null>(null)
  const [ghost, setGhost] = useState<number | null>(null)
  const [fallSpeed, setFallSpeed] = useState(FALL_RANGE - 0.5)
  const [barGrid, setBarGrid] = useState(true)
  const [slice, setSlice] = useState<number | 'auto'>('auto')
  const [lane, setLane] = useState<number | 'all'>(0)
  const [divisions, setDivisions] = useState(4)
  const [colormap, setColormap] = useState(0)
  const [fitting, setFitting] = useState(false)
  const fitRef = useRef({ meter: DEFAULT_METER })
  const [follow, setFollow] = useState(false)
  const touchedRef = useRef(0)

  const changeRange = (next: Range | ((current: Range) => Range)) => {
    touchedRef.current = performance.now()
    setRange(next)
  }
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

  const liveSection =
    sectionSpans(sections, duration).find((item) => position >= item.start && position <= item.end)
      ?.section ?? null

  const bpmFraction = Math.round(((liveSection?.bpm ?? 120) % 1) * 100)

  const tuneSection = (patch: Partial<Section>) => {
    if (!liveSection) return
    setSections((current) =>
      sortSections(
        current.map((section) =>
          section.id === liveSection.id ? { ...section, ...patch } : section,
        ),
      ),
    )
  }

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
    if (!follow || !playing) return

    let frame = requestAnimationFrame(function tick() {
      const at = positionRef.current
      if (performance.now() - touchedRef.current < FOLLOW_GRACE) {
        frame = requestAnimationFrame(tick)
        return
      }

      setRange((current) => {
        const span = current.end - current.start
        const lead = current.start + span * FOLLOW_EDGE
        if (at < current.start || at > lead) {
          return clampRange({ start: at - span * FOLLOW_LEAD, end: at + span * (1 - FOLLOW_LEAD) })
        }
        return current
      })
      frame = requestAnimationFrame(tick)
    })

    return () => cancelAnimationFrame(frame)
  }, [follow, playing, positionRef])

  useEffect(() => {
    fitRef.current.meter = sections[0]?.meter ?? DEFAULT_METER
  })

  // The scan runs a block per frame rather than solving in one go, so the
  // sections appear along the track as they are found and the compiled view
  // straightens while it works.
  useEffect(() => {
    if (!fitting || !envelope || duration <= 0) return

    const durationMs = duration * 1000
    let scan: Scan = { fromMs: 0, found: [], done: false }
    let polish = 0

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

    let frame = requestAnimationFrame(function tick() {
      if (!scan.done) {
        scan = scanBlock(envelope, sampleRate, durationMs, scan)
        publish(scan.found)
      } else if (polish < scan.found.length) {
        const found = [...scan.found]
        found[polish] = refineScan(envelope, sampleRate, durationMs, found, polish, fitRef.current.meter)
        scan = { ...scan, found }
        polish += 1
        publish(found)
      } else {
        // a quiet passage or a fill can make the scan split one section in two,
        // so neighbours that a single grid covers are put back together, and
        // whatever comes out of a merge is re-fitted over its new span
        const result = mergeStep(envelope, sampleRate, durationMs, scan.found)
        if (!result.merged) {
          setFitting(false)
          return
        }

        const found = result.found.map((_, index) =>
          refineScan(envelope, sampleRate, durationMs, result.found, index, fitRef.current.meter),
        )
        scan = { ...scan, found }
        publish(found)
      }

      frame = requestAnimationFrame(tick)
    })

    return () => cancelAnimationFrame(frame)
  }, [fitting, envelope, duration, sampleRate])

  const load = async (source: File) => {
    setLoadingName(source.name)
    const context = new AudioContext()
    try {
      const beatmap = source.name.toLowerCase().endsWith('.osz') ? await readOsz(source) : null
      const next = beatmap ? beatmap.audio : source
      const buffer = await context.decodeAudioData(await next.arrayBuffer())
      const mono = toMono(buffer)
      setSamples(mono)
      setEnvelope(computeEnvelope(mono))
      setPeaks(computePeaks(mono))
      setOnsets(computeOnsets(mono))
      setLoudness(computeLoudness(mono))
      setBands(computeBands(mono, buffer.sampleRate))
      setSampleRate(buffer.sampleRate)
      setRange(INITIAL_RANGE)
      setDoc((current) => ({
        markers: [],
        // a plain audio file arrives with no timing at all, so it opens on a
        // grid that can be dragged into place rather than on an empty view
        sections: beatmap ? beatmap.sections : [createSection(0, DEFAULT_BPM)],
        curve: current.curve,
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
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TopBar
        mode={mode}
        sections={sections}
        duration={duration}
        positionRef={positionRef}
        playing={playing}
        onOpen={() => inputRef.current?.click()}
        onModeChange={(next) => {
          setMode(next)
          setGhost(null)
        }}
        onClearMarkers={() => {
          setMarkers([])
          setAnchorId(null)
        }}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={history.undo}
        onRedo={history.redo}
        follow={follow}
        onFollowChange={setFollow}
        compiled={barGrid}
        onCompiledChange={setBarGrid}
        fitting={fitting}
        onFittingChange={setFitting}
        canFit={Boolean(envelope) && sections.length > 0}
      />
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
                positionMs={position * duration * 1000}
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
            <Box sx={{ flex: '0 0 auto' }}>
              <CurvePanel embedded curve={curve} onCurveChange={setCurve} />
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
                envelope={envelope}
                position={position}
                positionRef={positionRef}
                playing={playing}
                markers={markers}
                focus={focus}
                sections={sections}
                duration={duration}
                curve={curve}
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
                    envelope={envelope}
                    loudness={loudness}
                    onsets={onsets}
                    bands={bands}
                    sections={sections}
                    duration={duration}
                    position={position}
                    positionRef={positionRef}
                    playing={playing}
                    curve={curve}
                    range={range}
                    onRangeChange={changeRange}
                    onSectionsChange={setSections}
                    onSeek={seek}
                    slice={slice}
                    lane={lane}
                    divisions={divisions}
                    colormap={colormap}
                  />
                </Box>
                <BarGridControls
                  lane={lane}
                  slice={slice}
                  divisions={divisions}
                  colormap={colormap}
                  onLaneChange={setLane}
                  onSliceChange={setSlice}
                  onDivisionsChange={setDivisions}
                  onColormapChange={setColormap}
                />
              </>
            ) : null}
            <AnalysisLanes loudness={loudness} onsets={onsets} bands={bands} range={range} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0, position: 'relative' }}>
            <VerticalWaveform
              samples={samples}
              envelope={envelope}
              sections={sections}
              position={position}
              positionRef={positionRef}
              playing={playing}
              duration={duration}
              seconds={FALL_RANGE - fallSpeed}
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
        <Transport
          playing={playing}
          disabled={!file}
          onToggle={toggle}
          onReset={reset}
          rate={rate}
          onRateChange={setRate}
          left={
            file ? (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Paper
                  elevation={0}
                  sx={{
                    width: 200,
                    borderRadius: 999,
                    overflow: 'hidden',
                    border: 1,
                    borderColor: 'divider',
                  }}
                >
                  <RulerSlider
                    value={Math.floor(liveSection?.bpm ?? 120)}
                    disabled={!liveSection}
                    min={Math.floor(MIN_BPM)}
                    max={Math.floor(MAX_BPM)}
                    step={1}
                    pixelsPerStep={10}
                    majorEvery={5}
                    format={(value) => `${Math.round(value)} BPM`}
                    onChange={(whole) => tuneSection({ bpm: whole + bpmFraction / 100 })}
                  />
                </Paper>
                <Paper
                  elevation={0}
                  sx={{
                    width: 200,
                    borderRadius: 999,
                    overflow: 'hidden',
                    border: 1,
                    borderColor: 'divider',
                  }}
                >
                  <RulerSlider
                    value={bpmFraction}
                    disabled={!liveSection}
                    min={0}
                    max={99}
                    step={1}
                    pixelsPerStep={6}
                    majorEvery={5}
                    format={(value) => `.${String(Math.round(value)).padStart(2, '0')}`}
                    onChange={(fraction) =>
                      tuneSection({ bpm: Math.floor(liveSection?.bpm ?? 120) + fraction / 100 })
                    }
                  />
                </Paper>
                <Paper
                  elevation={0}
                  sx={{
                    width: 200,
                    borderRadius: 999,
                    overflow: 'hidden',
                    border: 1,
                    borderColor: 'divider',
                  }}
                >
                  <RulerSlider
                    value={Math.round(liveSection?.offsetMs ?? 0)}
                    disabled={!liveSection}
                    min={0}
                    max={Math.max(1, Math.round(duration * 1000))}
                    step={1}
                    pixelsPerStep={4}
                    majorEvery={10}
                    format={(value) => `${Math.round(value)} ms`}
                    onChange={(offsetMs) => tuneSection({ offsetMs })}
                  />
                </Paper>
              </Box>
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
            envelope={envelope}
            sections={sections}
            duration={duration}
            curve={curve}
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
              curve={curve}
              range={range}
              onRangeChange={changeRange}
            />
          </Box>
        </Box>
      </Box>
      <StatusBar fileName={file?.name ?? null} loadingName={loadingName} />
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
  )
}
