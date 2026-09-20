import { useRef, useState } from 'react'
import Box from '@mui/material/Box'
import TopBar from './components/TopBar'
import StatusBar from './components/StatusBar'
import Transport from './components/Transport'
import Volume from './components/Volume'
import Waveform from './components/Waveform'
import Overview from './components/Overview'
import PlayheadRail from './components/PlayheadRail'
import MarkerRail from './components/MarkerRail'
import ResolveBpm from './components/ResolveBpm'
import SectionBar from './components/SectionBar'
import CurvePanel from './components/CurvePanel'
import TimingPanel from './components/TimingPanel'
import { computePeaks, toMono } from './audio'
import { useAudio } from './useAudio'
import type { Range } from './range'
import type { ViewMode } from './view'
import { resolveTempo } from './bpm'
import { createSection, sortSections, type Section } from './timing'
import type { EditMode } from './mode'
import { DEFAULT_CURVE, type Curve } from './curve'

const INITIAL_RANGE: Range = { start: 0, end: 0.25 }

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [peaks, setPeaks] = useState<Float32Array | null>(null)
  const [samples, setSamples] = useState<Float32Array | null>(null)
  const [range, setRange] = useState<Range>(INITIAL_RANGE)
  const [loadingName, setLoadingName] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('amplitude')
  const [mode, setMode] = useState<EditMode>('none')
  const [markers, setMarkers] = useState<number[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [timingOpen, setTimingOpen] = useState(false)
  const [ghost, setGhost] = useState<number | null>(null)
  const [curve, setCurve] = useState<Curve>(DEFAULT_CURVE)
  const [curveOpen, setCurveOpen] = useState(false)
  const { playing, position, duration, volume, muted, toggle, seek, reset, setVolume, setMuted } =
    useAudio(file)

  const anchorSection = (at: number) => {
    const offsetMs = at * duration * 1000
    setSections((current) =>
      current.some((section) => Math.abs(section.offsetMs - offsetMs) < 1)
        ? current
        : sortSections([
            ...current,
            createSection(offsetMs, current[current.length - 1]?.bpm ?? 120),
          ]),
    )
  }

  const load = async (next: File) => {
    setLoadingName(next.name)
    const context = new AudioContext()
    try {
      const buffer = await context.decodeAudioData(await next.arrayBuffer())
      const mono = toMono(buffer)
      setSamples(mono)
      setPeaks(computePeaks(mono))
      setRange(INITIAL_RANGE)
      setMarkers([])
      setSections([])
      setFile(next)
    } finally {
      await context.close()
      setLoadingName(null)
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TopBar
        view={view}
        mode={mode}
        curveOpen={curveOpen}
        onOpen={() => inputRef.current?.click()}
        onViewChange={setView}
        onModeChange={(next) => {
          setMode(next)
          setGhost(null)
          if (next === 'section') setTimingOpen(true)
        }}
        onClearMarkers={() => setMarkers([])}
        timingOpen={timingOpen}
        onTimingOpenChange={setTimingOpen}
        onCurveOpenChange={setCurveOpen}
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
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <MarkerRail
            markers={markers}
            range={range}
            enabled={Boolean(samples)}
            ghost={mode === 'marker' ? ghost : null}
            onMarkersChange={setMarkers}
          />
          <PlayheadRail
            position={position}
            range={range}
            enabled={Boolean(samples)}
            onSeek={seek}
          />
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <Waveform
              samples={samples}
              position={position}
              markers={markers}
              sections={sections}
              duration={duration}
              view={view}
              curve={curve}
              range={range}
              placing={mode === 'none' ? null : mode}
              ghost={mode === 'none' ? null : ghost}
              onRangeChange={setRange}
              onGhostChange={setGhost}
              onPlace={(at) => {
                if (mode === 'marker') {
                  setMarkers((current) => {
                    if (current.length === 0) anchorSection(at)
                    return [...current, at]
                  })
                  return
                }
                if (mode === 'section') {
                  setSections((current) =>
                    sortSections([
                      ...current,
                      createSection(at * duration * 1000, current[current.length - 1]?.bpm ?? 120),
                    ]),
                  )
                }
              }}
            />
          </Box>
        </Box>
        <Transport
          playing={playing}
          disabled={!file}
          onToggle={toggle}
          onReset={reset}
          above={
            mode === 'section' ? (
              <SectionBar
                count={sections.length}
                onOpenPanel={() => setTimingOpen(true)}
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
          <PlayheadRail position={position} enabled={Boolean(peaks)} onSeek={seek} />
          <Box sx={{ height: 96 }}>
            <Overview
              peaks={peaks}
              position={position}
              view={view}
              curve={curve}
              range={range}
              onRangeChange={setRange}
            />
          </Box>
        </Box>
      </Box>
      {timingOpen ? (
        <TimingPanel
          sections={sections}
          positionMs={position * duration * 1000}
          onSectionsChange={setSections}
          onClose={() => setTimingOpen(false)}
        />
      ) : null}
      {curveOpen ? (
        <CurvePanel curve={curve} onCurveChange={setCurve} onClose={() => setCurveOpen(false)} />
      ) : null}
      <StatusBar fileName={file?.name ?? null} loadingName={loadingName} />
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
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
